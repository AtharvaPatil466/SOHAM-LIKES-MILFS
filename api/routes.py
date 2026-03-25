import json
import time
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from runtime.orchestrator import Orchestrator

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                pass

manager = ConnectionManager()


class EventPayload(BaseModel):
    type: str
    data: dict[str, Any] = {}


class StockUpdatePayload(BaseModel):
    sku: str
    quantity: int


class SupplierReplyPayload(BaseModel):
    negotiation_id: str
    supplier_id: str
    supplier_name: str
    message: str
    product_name: str = ""


class ApprovalPayload(BaseModel):
    approval_id: str
    reason: str = ""


def create_app(orchestrator: Orchestrator) -> FastAPI:
    app = FastAPI(title="RetailOS", description="Autonomous Agent Runtime for Retail Operations")

    @app.on_event("startup")
    async def startup_event():
        async def broadcast_log(entry):
            await manager.broadcast(json.dumps({
                "type": "audit_log",
                "data": entry
            }, default=str))
        orchestrator.audit.on_log = broadcast_log

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Real-time Events ────────────────────────────────────
    @app.websocket("/ws/events")
    async def websocket_endpoint(websocket: WebSocket):
        await manager.connect(websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            manager.disconnect(websocket)

    # ── Runtime Status ──────────────────────────────────────

    @app.get("/api/status")
    async def get_status():
        skills = orchestrator.skill_loader.list_skills()
        return {
            "runtime": "running" if orchestrator.running else "stopped",
            "skills": skills,
            "pending_approvals": len(orchestrator.pending_approvals),
            "timestamp": time.time(),
        }

    @app.get("/api/skills")
    async def list_skills():
        return orchestrator.skill_loader.list_skills()

    @app.post("/api/skills/{skill_name}/pause")
    async def pause_skill(skill_name: str):
        skill = orchestrator.skill_loader.get_skill(skill_name)
        if not skill:
            raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")
        await skill.pause()
        return {"status": "paused", "skill": skill_name}

    @app.post("/api/skills/{skill_name}/resume")
    async def resume_skill(skill_name: str):
        skill = orchestrator.skill_loader.get_skill(skill_name)
        if not skill:
            raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")
        await skill.resume()
        return {"status": "resumed", "skill": skill_name}

    # ── Events ──────────────────────────────────────────────

    @app.post("/api/events")
    async def emit_event(payload: EventPayload):
        await orchestrator.emit_event({"type": payload.type, "data": payload.data})
        return {"status": "event_queued", "type": payload.type}

    # ── Inventory ───────────────────────────────────────────

    @app.get("/api/inventory")
    async def get_inventory():
        skill = orchestrator.skill_loader.get_skill("inventory")
        if not skill:
            raise HTTPException(status_code=404, detail="Inventory skill not loaded")
        return await skill.get_full_inventory()

    @app.post("/api/inventory/update")
    async def update_stock(payload: StockUpdatePayload):
        """Manually update stock level — used for demo."""
        skill = orchestrator.skill_loader.get_skill("inventory")
        if not skill:
            raise HTTPException(status_code=404, detail="Inventory skill not loaded")

        result = await skill.update_stock(payload.sku, payload.quantity)
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])

        # Emit stock update event to trigger the full flow
        await orchestrator.emit_event({
            "type": "stock_update",
            "data": {"sku": payload.sku, "quantity": payload.quantity},
        })

        return result

    @app.post("/api/inventory/check")
    async def check_inventory():
        """Trigger a full inventory check."""
        await orchestrator.emit_event({"type": "inventory_check", "data": {}})
        return {"status": "inventory_check_queued"}

    # ── Supplier Reply Webhook ──────────────────────────────

    @app.post("/api/webhook/supplier-reply")
    async def supplier_reply_webhook(payload: SupplierReplyPayload):
        """WhatsApp webhook — receives supplier replies."""
        await orchestrator.emit_event({
            "type": "supplier_reply",
            "data": {
                "negotiation_id": payload.negotiation_id,
                "supplier_id": payload.supplier_id,
                "supplier_name": payload.supplier_name,
                "message": payload.message,
                "product_name": payload.product_name,
            },
        })
        return {"status": "reply_queued"}

    # Mock endpoint for demo — simulate supplier reply
    @app.post("/api/demo/supplier-reply")
    async def mock_supplier_reply(payload: SupplierReplyPayload):
        """Demo endpoint — simulate a supplier WhatsApp reply."""
        negotiation_skill = orchestrator.skill_loader.get_skill("negotiation")
        if not negotiation_skill:
            raise HTTPException(status_code=404, detail="Negotiation skill not loaded")

        result = await negotiation_skill._handle_reply({
            "negotiation_id": payload.negotiation_id,
            "supplier_id": payload.supplier_id,
            "supplier_name": payload.supplier_name,
            "message": payload.message,
            "product_name": payload.product_name,
        })

        # If deal is ready and needs approval, register with orchestrator
        if result.get("needs_approval"):
            approval_id = result["approval_id"]
            orchestrator.pending_approvals[approval_id] = {
                "skill": "negotiation",
                "result": result,
                "event": {"type": "supplier_reply"},
                "timestamp": time.time(),
            }

        return result

    # ── Approvals ───────────────────────────────────────────

    @app.get("/api/approvals")
    async def get_approvals():
        return orchestrator.get_pending_approvals()

    @app.post("/api/approvals/approve")
    async def approve_action(payload: ApprovalPayload):
        result = await orchestrator.approve(payload.approval_id)
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        return result

    @app.post("/api/approvals/reject")
    async def reject_action(payload: ApprovalPayload):
        result = await orchestrator.reject(payload.approval_id, payload.reason)
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        return result

    # ── Audit Log ───────────────────────────────────────────

    @app.get("/api/audit")
    async def get_audit_logs(skill: str | None = None, event_type: str | None = None, limit: int = 50, offset: int = 0):
        return await orchestrator.audit.get_logs(
            skill=skill, event_type=event_type, limit=limit, offset=offset
        )

    @app.get("/api/audit/count")
    async def get_audit_count():
        count = await orchestrator.audit.get_log_count()
        return {"count": count}

    # ── Negotiations ────────────────────────────────────────

    @app.get("/api/negotiations")
    async def get_negotiations():
        skill = orchestrator.skill_loader.get_skill("negotiation")
        if not skill:
            raise HTTPException(status_code=404, detail="Negotiation skill not loaded")
        return {
            "active": skill.active_negotiations,
            "message_log": skill.message_log[-50:],
        }

    # ── Analytics ───────────────────────────────────────────

    @app.post("/api/analytics/run")
    async def run_analytics():
        await orchestrator.emit_event({"type": "daily_analytics", "data": {}})
        return {"status": "analytics_queued"}

    @app.get("/api/analytics/summary")
    async def get_analytics_summary():
        if orchestrator.memory:
            summary = await orchestrator.memory.get("orchestrator:daily_summary")
            return summary or {"message": "No analytics summary available yet"}
        return {"message": "Memory not available"}

    # ── Demo Flow ───────────────────────────────────────────

    @app.post("/api/demo/trigger-flow")
    async def trigger_demo_flow():
        """Trigger the full ice cream demo flow."""
        # Drop ice cream stock to critical level
        skill = orchestrator.skill_loader.get_skill("inventory")
        if skill:
            await skill.update_stock("SKU-001", 5)

        # Emit stock update event
        await orchestrator.emit_event({
            "type": "stock_update",
            "data": {"sku": "SKU-001", "quantity": 5},
        })

        return {"status": "demo_flow_triggered", "message": "Ice cream stock dropped to 5 units"}

    return app
