"""Persistent approval storage and lifecycle management.

Handles owner approvals for high-value or sensitive actions.
Uses Redis as primary store with in-memory fallback.
"""

import json
import logging
from typing import Any

from runtime.audit import AuditLogger
from runtime import events as E
from runtime.memory import Memory

logger = logging.getLogger(__name__)

# Redis key prefix for persistent approval storage
_APPROVAL_PREFIX = "retailos:approvals:"


class ApprovalManager:
    """Manages pending approvals with Redis persistence and in-memory fallback."""

    def __init__(self, memory: Memory, audit: AuditLogger):
        self.memory = memory
        self.audit = audit
        self._fallback: dict[str, dict] = {}  # in-memory fallback

    async def save(self, approval_id: str, data: dict) -> None:
        """Persist an approval to Redis (falls back to in-memory)."""
        key = f"{_APPROVAL_PREFIX}{approval_id}"
        try:
            await self.memory.set(key, data, ttl=86400 * 7)  # 7 day TTL
        except Exception:
            self._fallback[approval_id] = data

    async def get(self, approval_id: str) -> dict | None:
        """Retrieve an approval from Redis (falls back to in-memory)."""
        key = f"{_APPROVAL_PREFIX}{approval_id}"
        try:
            result = await self.memory.get(key)
            if result:
                return result
        except Exception:
            pass
        return self._fallback.get(approval_id)

    async def delete(self, approval_id: str) -> None:
        """Remove an approval from persistent storage."""
        key = f"{_APPROVAL_PREFIX}{approval_id}"
        try:
            await self.memory.delete(key)
        except Exception:
            pass
        self._fallback.pop(approval_id, None)

    async def list_ids(self) -> list[str]:
        """List all pending approval IDs."""
        try:
            keys = await self.memory._scan_keys(f"{_APPROVAL_PREFIX}*")
            return [k.replace(_APPROVAL_PREFIX, "") for k in keys]
        except Exception:
            return list(self._fallback.keys())

    @property
    def pending_approvals(self) -> dict[str, dict]:
        """Backward-compatible property — returns in-memory fallback dict."""
        return self._fallback

    async def approve(self, approval_id: str, emit_event_fn) -> dict[str, Any]:
        """Owner approves a pending action."""
        approval = await self.get(approval_id)
        if not approval:
            return {"error": "Approval not found"}

        await self.delete(approval_id)

        from brain.decision_logger import log_decision
        details = approval["result"].get("approval_details", {})
        supplier_id, amount = _extract_supplier_amount(details)
        if supplier_id and amount is not None:
            log_decision(supplier_id, amount, "approved")

        await self.audit.log(
            skill=approval["skill"],
            event_type=E.OWNER_APPROVED,
            decision="Owner approved action",
            reasoning="Manual approval via dashboard",
            outcome=json.dumps(approval["result"].get("approval_details", {}), default=str),
            status="approved",
        )

        # Trigger any follow-up events
        follow_up = approval["result"].get("on_approval_event")
        follow_up_result = None
        if follow_up:
            follow_up_result = await emit_event_fn(follow_up)

        return {"status": "approved", "approval_id": approval_id, "follow_up_result": follow_up_result}

    async def reject(self, approval_id: str, reason: str = "", skills: dict | None = None) -> dict[str, Any]:
        """Owner rejects a pending action."""
        approval = await self.get(approval_id)
        if not approval:
            return {"error": "Approval not found"}

        await self.delete(approval_id)

        if approval["skill"] == "shelf_manager" and skills:
            shelf_skill = skills.get("shelf_manager")
            if shelf_skill and hasattr(shelf_skill, "clear_suggestions"):
                await shelf_skill.clear_suggestions()

        from brain.decision_logger import log_decision
        details = approval["result"].get("approval_details", {})
        supplier_id, amount = _extract_supplier_amount(details)
        if supplier_id and amount is not None:
            log_decision(supplier_id, amount, "rejected")

        await self.audit.log(
            skill=approval["skill"],
            event_type=E.OWNER_REJECTED,
            decision="Owner rejected action",
            reasoning=reason or "No reason provided",
            outcome="Action cancelled",
            status="rejected",
        )

        return {"status": "rejected", "approval_id": approval_id}

    async def get_pending(self) -> list[dict[str, Any]]:
        """List all pending approvals from Redis (with in-memory fallback)."""
        ids = await self.list_ids()
        results = []
        for aid in ids:
            data = await self.get(aid)
            if data:
                results.append({"id": aid, **data})
        return results


def _extract_supplier_amount(details: dict) -> tuple:
    """Extract supplier_id and amount from approval details."""
    supplier_id = details.get("supplier_id") or (
        details.get("top_supplier", {}).get("supplier_id")
        if details.get("top_supplier") else None
    )
    amount = (
        details.get("amount")
        or details.get("price")
        or details.get("total_cost")
        or (
            details.get("top_supplier", {}).get("price_per_unit", 0)
            * details.get("top_supplier", {}).get("min_order_qty", 1)
            if details.get("top_supplier") else None
        )
    )
    return supplier_id, amount
