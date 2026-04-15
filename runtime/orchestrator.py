"""Core orchestrator — the brain of RetailOS.

Takes events, fetches relevant memory, calls Gemini to decide
what to do, routes to skills, and logs everything.

Split into three modules:
- orchestrator.py (this file): Event loop, Gemini routing, skill execution
- approval_manager.py: Persistent approval storage and lifecycle
- context_builder.py: Event preprocessing and context enrichment
"""

import asyncio
import json
import logging
import time
import traceback
import uuid
from typing import Any

from runtime.llm_client import get_llm_client

logger = logging.getLogger(__name__)

from runtime.approval_manager import ApprovalManager, _extract_supplier_amount
from runtime import events as E
from runtime.utils import extract_json_from_llm, CircuitBreaker
from runtime.audit import AuditLogger
from runtime.context_builder import preprocess_event
from runtime.memory import Memory
from runtime.task_queue import TaskQueue
from skills.base_skill import BaseSkill, SkillState


ROUTING_SYSTEM_PROMPT = """You are the RetailOS orchestrator — an autonomous agent runtime for retail operations.

Your job: given an event and relevant memory context, decide which skill(s) to run and in what order.

Available skills:
- inventory: Monitors stock levels, calculates days-until-stockout
- procurement: Ranks suppliers using price, reliability, history
- negotiation: Handles the entire WhatsApp conversation, including sending outreach and parsing/evaluating supplier replies into deals
- customer: Segments customers and sends personalized offers
- analytics: Analyzes patterns in audit logs and purchase data
- scheduling: Manages staff shifts, reviews schedules, and optimizes staffing levels
- shelf_manager: Analyzes shelf placements and suggests optimizations based on sales velocity

You must respond with valid JSON only:
{
    "actions": [
        {
            "skill": "<skill_name>",
            "params": { ... },
            "reason": "<why this action, in plain English>"
        }
    ],
    "overall_reasoning": "<1-2 sentence summary of your decision>"
}

Consider memory context carefully. If we over-ordered a product recently, maybe hold off.
If a supplier has been unreliable, deprioritize them. Use the context — that's why it's there.

Be proactive: if an event indicates a potential problem (like low stock), don't just analyze it — trigger the necessary skills (e.g., both inventory and procurement) to solve it in parallel."""

# Timeout for Gemini API calls (seconds)
GEMINI_TIMEOUT = 30


class Orchestrator:
    """Core event loop — routes events to skills via Gemini."""

    def __init__(
        self,
        memory: Memory,
        audit: AuditLogger,
        skills: dict[str, BaseSkill],
        api_key: str = "",
    ):
        self.memory = memory
        self.audit = audit
        self.skills = skills
        self.llm = get_llm_client()
        self.event_queue: asyncio.Queue = asyncio.Queue()
        self.running = False
        self.max_retries = 3
        self.retry_delay = 2  # seconds
        self.task_queue = TaskQueue(memory=memory, max_workers=4)
        self.approvals = ApprovalManager(memory=memory, audit=audit)
        self._llm_breaker = CircuitBreaker(failure_threshold=3, cooldown_seconds=60)

    # Backward-compatible property
    @property
    def pending_approvals(self) -> dict[str, dict]:
        return self.approvals.pending_approvals

    async def start(self) -> None:
        """Start the orchestrator event loop."""
        self.running = True

        self.task_queue.register_handler("skill_execution", self._handle_skill_task)
        await self.task_queue.start()

        for skill in self.skills.values():
            skill.set_emit_callback(self.emit_event)

        await self.audit.log(
            skill="orchestrator",
            event_type=E.RUNTIME_START,
            decision="Starting RetailOS runtime",
            reasoning="System initialization",
            outcome="Runtime started successfully",
            status="success",
        )

        asyncio.create_task(self._event_loop())

    async def _handle_skill_task(self, payload: dict) -> dict:
        """Task queue handler — executes a skill in the background worker pool."""
        return await self._execute_skill(
            payload["skill_name"], payload["event"],
            payload.get("params", {}), payload.get("reason", "Background execution"),
        )

    async def stop(self) -> None:
        self.running = False
        await self.task_queue.stop()
        await self.audit.log(
            skill="orchestrator", event_type=E.RUNTIME_STOP,
            decision="Stopping RetailOS runtime", reasoning="Shutdown requested",
            outcome="Runtime stopped", status="success",
        )

    async def emit_event(self, event: dict[str, Any]) -> None:
        """Push an event into the orchestrator's queue."""
        await self.event_queue.put(event)

    async def _event_loop(self) -> None:
        """Main loop — processes events as they arrive."""
        while self.running:
            try:
                event = await asyncio.wait_for(self.event_queue.get(), timeout=1.0)
                await self._process_event(event)
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                await self.audit.log(
                    skill="orchestrator", event_type=E.EVENT_LOOP_ERROR,
                    decision="Error in event loop", reasoning=str(e),
                    outcome=traceback.format_exc(), status="error",
                )

    async def _process_event(self, event: dict[str, Any]) -> dict[str, Any]:
        """Process a single event: preprocess, fetch context, route via Gemini, execute."""
        if not isinstance(event, dict) or "type" not in event:
            await self.audit.log(
                skill="orchestrator", event_type=E.INVALID_EVENT,
                decision="Rejected malformed event",
                reasoning=f"Event missing 'type' field: {event!r}",
                outcome="Skipped", status="error",
            )
            return {"error": "Invalid event: missing 'type' field"}

        # Assign a flow_id for end-to-end tracing if not already present
        if "flow_id" not in event:
            event["flow_id"] = str(uuid.uuid4())
        flow_id = event["flow_id"]

        # Preprocess: intercept delivery/quality/daily_analytics events
        preprocessed = await preprocess_event(event, self.skills, self.emit_event)
        if preprocessed is None:
            return {"status": "success", "message": "Event handled by preprocessor", "flow_id": flow_id}

        # Fetch relevant memory
        event_type = event.get("type", "unknown")
        context = await self.memory.get_relevant(event_type, event.get("data", {}))

        # Ask Gemini to route
        routing_decision = await self._route_with_gemini(event, context)

        results = []
        for action in routing_decision.get("actions", []):
            result = await self._execute_skill(
                action["skill"], event,
                action.get("params", {}), action.get("reason", "No reason provided"),
            )
            results.append(result)

        return {"event": event, "flow_id": flow_id, "routing": routing_decision, "results": results}

    async def _route_with_gemini(self, event: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        """CALL 1 — Orchestrator routing. Gemini decides what to do."""
        prompt = f"""{ROUTING_SYSTEM_PROMPT}

Event received:
{json.dumps(event, indent=2, default=str)}

Relevant memory context:
{json.dumps(context, indent=2, default=str) if context else "No relevant memory found."}

Decide which skill(s) to run and why."""

        # Circuit breaker: skip Gemini entirely if it's been failing
        if not self._llm_breaker.allow():
            logger.info("Circuit breaker OPEN — skipping Gemini, using fallback routing")
            return self._fallback_route(event)

        for attempt in range(self.max_retries):
            try:
                text = await self.llm.generate(prompt, timeout=GEMINI_TIMEOUT)
                decision = extract_json_from_llm(text)

                self._llm_breaker.record_success()
                await self.audit.log(
                    skill="orchestrator", event_type=E.ROUTING_DECISION,
                    decision=json.dumps(decision.get("actions", []), default=str),
                    reasoning=decision.get("overall_reasoning", ""),
                    outcome="Route determined", status="success",
                    metadata={"flow_id": event.get("flow_id"), "event": event, "memory_keys": list(context.keys())},
                )
                return decision

            except Exception as e:
                self._llm_breaker.record_failure()
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (2 ** attempt))
                    continue
                await self.audit.log(
                    skill="orchestrator", event_type=E.GEMINI_API_ERROR,
                    decision="API error after retries",
                    reasoning=f"Gemini API failed {self.max_retries} times: {e}",
                    outcome="Falling back to rule-based routing", status="error",
                )
                return self._fallback_route(event)

        return self._fallback_route(event)

    def _fallback_route(self, event: dict[str, Any]) -> dict[str, Any]:
        """Rule-based fallback when Gemini API is unavailable."""
        event_type = event.get("type", "")
        actions = []

        routing_map = {
            E.START_PROCUREMENT: [("procurement", "Fallback: start procurement process")],
            E.PROCUREMENT_APPROVED: [("negotiation", "Fallback: procurement approved triggers negotiation")],
            E.SUPPLIER_REPLY: [("negotiation", "Fallback: supplier reply needs parsing")],
            E.DEAL_CONFIRMED: [("customer", "Fallback: deal confirmed triggers customer outreach")],
            E.CHURN_RISK: [("customer", "Fallback: churn risk detected, triggering re-engagement")],
            E.SHELF_OPTIMIZATION: [("shelf_manager", "Fallback: shelf optimization requested")],
            E.SHELF_PLACEMENT_APPROVED: [("shelf_manager", "Fallback: apply approved shelf changes")],
        }

        if event_type in routing_map:
            actions = [
                {"skill": skill, "params": event.get("data", {}), "reason": reason}
                for skill, reason in routing_map[event_type]
            ]
        elif event_type in (E.LOW_STOCK, E.STOCK_UPDATE, E.INVENTORY_CHECK):
            actions = [{"skill": "inventory", "params": event.get("data", {}), "reason": "Fallback: stock level change"}]
        elif event_type == E.SEASONAL_PREEMPT:
            actions = [{"skill": "procurement", "params": event.get("data", {}), "reason": "Fallback: seasonal pattern detected"}]
        elif event_type == E.EXPIRY_RISK:
            actions = [
                {"skill": "inventory", "params": event.get("data", {}), "reason": "Fallback: flag expiry risk"},
                {"skill": "customer", "params": {**event.get("data", {}), "discount": "20% off (Flash Sale!)"}, "reason": "Fallback: targeted promotion for expiring product"},
            ]

        return {"actions": actions, "overall_reasoning": "Fallback rule-based routing (Gemini unavailable)"}

    async def _execute_skill(
        self, skill_name: str, event: dict[str, Any], params: dict[str, Any], reason: str,
    ) -> dict[str, Any]:
        """Execute a skill with retry logic and failure handling."""
        skill = self.skills.get(skill_name)
        if not skill:
            await self.audit.log(
                skill=skill_name, event_type=E.SKILL_NOT_FOUND,
                decision=f"Cannot execute {skill_name}",
                reasoning=f"Skill '{skill_name}' not registered",
                outcome="Skipped", status="error",
            )
            return {"skill": skill_name, "status": "not_found"}

        if skill.state == SkillState.PAUSED:
            await self.audit.log(
                skill=skill_name, event_type=E.SKILL_PAUSED_SKIP,
                decision=f"Skipping {skill_name} — currently paused",
                reasoning=reason, outcome="Skipped", status="skipped",
            )
            return {"skill": skill_name, "status": "paused"}

        merged_event = {**event, "params": params}
        for attempt in range(self.max_retries):
            try:
                result = await skill._safe_run(merged_event)

                await self.audit.log(
                    skill=skill_name, event_type=E.SKILL_EXECUTED,
                    decision=reason, reasoning=f"Executed on attempt {attempt + 1}",
                    outcome=json.dumps(result, default=str)[:2000], status="success",
                    metadata={"flow_id": event.get("flow_id"), "attempt": attempt + 1, "params": params},
                )

                # Check if result needs owner approval
                if result.get("needs_approval"):
                    return await self._handle_approval(skill_name, result, event)

                return {"skill": skill_name, "status": "success", "result": result}

            except Exception as e:
                await self.audit.log(
                    skill=skill_name, event_type=E.SKILL_ERROR,
                    decision=f"Skill failed on attempt {attempt + 1}/{self.max_retries}",
                    reasoning=str(e), outcome=traceback.format_exc()[:1000],
                    status="error", metadata={"flow_id": event.get("flow_id"), "attempt": attempt + 1},
                )
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay)
                    continue

                await self.audit.log(
                    skill=skill_name, event_type=E.SKILL_ESCALATION,
                    decision=f"Escalating {skill_name} failure to owner",
                    reasoning=f"Failed after {self.max_retries} attempts: {e}",
                    outcome="Owner notification sent", status="escalated",
                )
                return {"skill": skill_name, "status": "failed", "error": str(e)}

        logger.warning("Skill %s: retry loop exited without return", skill_name)
        return {"skill": skill_name, "status": "failed"}

    async def _handle_approval(self, skill_name: str, result: dict, event: dict) -> dict:
        """Check auto-approval or queue for owner approval."""
        details = result.get("approval_details", {})
        supplier_id, amount = _extract_supplier_amount(details)

        if supplier_id and amount is not None:
            from brain.auto_approver import should_auto_approve
            from brain.decision_logger import log_decision

            if should_auto_approve(supplier_id, amount):
                log_decision(supplier_id, amount, "approved")
                follow_up = result.get("on_approval_event")
                if follow_up:
                    await self.emit_event(follow_up)
                await self.audit.log(
                    skill=skill_name, event_type=E.AUTO_APPROVED,
                    decision="Silently approved via Brain subsystem",
                    reasoning=f"Trust score high and amount {amount} below ceiling",
                    outcome="Triggered follow-up event", status="success",
                )
                return {"skill": skill_name, "status": "success", "result": result, "auto_approved": True}

        approval_id = result.get("approval_id", f"{skill_name}_{int(time.time())}")
        await self.approvals.save(approval_id, {
            "skill": skill_name, "result": result,
            "event": event, "timestamp": time.time(),
        })
        await self.audit.log(
            skill=skill_name, event_type=E.APPROVAL_REQUESTED,
            decision="Awaiting owner approval",
            reasoning=result.get("approval_reason", "Significant action requires approval"),
            outcome=json.dumps(details, default=str), status="pending",
        )
        return {"skill": skill_name, "status": "success", "result": result}

    # Delegate approval operations to ApprovalManager
    async def approve(self, approval_id: str) -> dict[str, Any]:
        return await self.approvals.approve(approval_id, self._process_event)

    async def reject(self, approval_id: str, reason: str = "") -> dict[str, Any]:
        return await self.approvals.reject(approval_id, reason, self.skills)

    async def get_pending_approvals(self) -> list[dict[str, Any]]:
        return await self.approvals.get_pending()
