import asyncio
import json
import re
import time
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from runtime.orchestrator import Orchestrator


# ── Helpers ────────────────────────────────────────────────

def _data_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "data"


def _read_json(filename: str, default=None):
    try:
        with open(_data_dir() / filename, "r") as f:
            return json.load(f)
    except Exception:
        return default if default is not None else []


def _write_json(filename: str, data):
    with open(_data_dir() / filename, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                pass

manager = ConnectionManager()


# ── Pydantic Models ────────────────────────────────────────

class EventPayload(BaseModel):
    type: str
    data: dict[str, Any] = {}

class StockUpdatePayload(BaseModel):
    sku: str
    quantity: int
    unit_price: float | None = None
    image_url: str | None = None
    category: str | None = None

class InventoryRegisterPayload(BaseModel):
    sku: str
    product_name: str
    unit_price: float
    category: str
    image_url: str | None = None
    barcode: str | None = None
    threshold: int
    daily_sales_rate: int
    current_stock: int = 0

class InventoryPatchPayload(BaseModel):
    unit_price: float | None = None
    image_url: str | None = None
    category: str | None = None
    barcode: str | None = None

class SaleItemPayload(BaseModel):
    sku: str
    qty: int

class InventorySalePayload(BaseModel):
    items: list[SaleItemPayload]
    customer_id: str | None = None
    customer_name: str | None = None
    phone: str | None = None
    payment_method: str = "Cash"

class SupplierReplyPayload(BaseModel):
    negotiation_id: str
    supplier_id: str
    supplier_name: str
    message: str
    product_name: str = ""

class ApprovalPayload(BaseModel):
    approval_id: str
    reason: str = ""

class SupplierRegisterPayload(BaseModel):
    supplier_id: str
    supplier_name: str
    contact_phone: str
    whatsapp_number: str = ""
    products: list[str] = []
    categories: list[str] = []
    price_per_unit: float = 0
    min_order_qty: int = 0
    delivery_days: int = 0
    payment_terms: str = ""
    location: str = ""
    notes: str = ""

class MarketPriceLogPayload(BaseModel):
    product_id: str
    source_name: str
    price_per_unit: float
    unit: str = "kg"

class DeliveryStatusPayload(BaseModel):
    status: str

class UdhaarCreditPayload(BaseModel):
    customer_id: str
    customer_name: str
    phone: str
    items: list[dict]
    amount: float

class UdhaarPaymentPayload(BaseModel):
    udhaar_id: str
    amount: float
    note: str = ""

class ReturnPayload(BaseModel):
    order_id: str
    customer_id: str
    customer_name: str
    items: list[dict]
    refund_method: str = "Cash"

class SupplierPaymentPayload(BaseModel):
    order_id: str

class VoiceCommandPayload(BaseModel):
    text: str


# ── GST Rates by category ─────────────────────────────────
GST_RATES = {
    "Grocery": 0.05,
    "Dairy": 0.05,
    "Frozen": 0.12,
    "Snacks": 0.12,
    "Beverages": 0.12,
    "Personal Care": 0.18,
    "Cleaning": 0.18,
    "Baby Care": 0.12,
    "Bakery": 0.05,
    "Protein & Health": 0.18,
}


def _calc_gst(items: list, inventory_data: list | None = None) -> float:
    """Calculate GST for a list of order items."""
    total_gst = 0.0
    inv_map = {}
    if inventory_data:
        inv_map = {item["sku"]: item.get("category", "Grocery") for item in inventory_data}
    for item in items:
        cat = inv_map.get(item.get("sku"), "Grocery")
        rate = GST_RATES.get(cat, 0.05)
        total_gst += item.get("total", item.get("unit_price", 0) * item.get("qty", 1)) * rate
    return round(total_gst)


def _business_date_from_value(value: Any) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value).date()
        except Exception:
            return None
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S%z"):
            try:
                return datetime.strptime(value, fmt).date()
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(value).date()
        except ValueError:
            return None
    return None


def _order_business_date(order: dict[str, Any]) -> date | None:
    return (
        _business_date_from_value(order.get("delivery_date"))
        or _business_date_from_value(order.get("payment_date"))
        or _business_date_from_value(order.get("timestamp"))
    )


def _return_business_date(return_entry: dict[str, Any]) -> date | None:
    return (
        _business_date_from_value(return_entry.get("processed_at"))
        or _business_date_from_value(return_entry.get("timestamp"))
    )


def _movement_type_for_return_reason(reason: str) -> str:
    normalized = (reason or "").lower()
    if "expir" in normalized:
        return "expiry"
    return "damage"


def _payment_due_snapshot(order: dict[str, Any]) -> dict[str, Any]:
    terms = order.get("payment_terms", "") or "Unspecified"
    base_date = (
        _business_date_from_value(order.get("delivery_date"))
        or _order_business_date(order)
        or date.today()
    )
    due_date = base_date

    match = re.search(r"net\s+(\d+)", terms.lower())
    if match:
        due_date = base_date + timedelta(days=int(match.group(1)))

    is_paid = order.get("payment_status") == "paid"
    overdue_days = 0
    if not is_paid and due_date < date.today():
        overdue_days = (date.today() - due_date).days

    return {
        "payment_terms": terms,
        "due_date": due_date.isoformat(),
        "is_overdue": overdue_days > 0,
        "overdue_days": overdue_days,
    }


def _latest_business_date(
    customer_orders: list[dict[str, Any]],
    returns: list[dict[str, Any]],
    deliveries: list[dict[str, Any]],
) -> date:
    dates: list[date] = []
    dates.extend(d for d in (_order_business_date(order) for order in customer_orders) if d)
    dates.extend(d for d in (_return_business_date(return_entry) for return_entry in returns) if d)
    dates.extend(
        d
        for d in (
            _business_date_from_value(delivery.get("requested_at")) for delivery in deliveries
        )
        if d
    )
    return max(dates) if dates else date.today()


def create_app(orchestrator: Orchestrator) -> FastAPI:
    app = FastAPI(title="RetailOS", description="Autonomous Agent Runtime for Retail Operations")

    async def _apply_return_effects(return_entry: dict[str, Any]) -> dict[str, Any]:
        skill = _get_skill("inventory")
        restocked_qty = 0
        wastage_qty = 0
        restocked_value = 0.0
        wastage_value = 0.0

        for item in return_entry.get("items", []):
            qty = int(item.get("qty", 1) or 1)
            unit_price = float(item.get("unit_price", 0) or 0)
            action = item.get("action", "restock")
            if action == "restock":
                if skill:
                    current = next((p for p in skill.inventory_data if p["sku"] == item["sku"]), None)
                    if current:
                        await skill.update_stock(
                            item["sku"],
                            current["current_stock"] + qty,
                            movement_type="restock",
                        )
                restocked_qty += qty
                restocked_value += qty * unit_price
            else:
                from brain.wastage_tracker import log_movement

                movement_type = _movement_type_for_return_reason(item.get("reason", ""))
                log_movement(item["sku"], -qty, movement_type, order_id=return_entry.get("order_id"))
                wastage_qty += qty
                wastage_value += qty * unit_price

        orders = _read_json("mock_orders.json", {"customer_orders": [], "vendor_orders": []})
        linked_order = next(
            (order for order in orders["customer_orders"] if order["order_id"] == return_entry.get("order_id")),
            None,
        )
        if linked_order:
            linked_order.setdefault("return_ids", [])
            if return_entry["return_id"] not in linked_order["return_ids"]:
                linked_order["return_ids"].append(return_entry["return_id"])
            linked_order["returned_amount"] = round(
                linked_order.get("returned_amount", 0) + float(return_entry.get("refund_amount", 0)),
                2,
            )
            linked_order["net_amount"] = round(
                max(0, linked_order.get("total_amount", 0) - linked_order["returned_amount"]),
                2,
            )
            linked_order["return_status"] = (
                "returned"
                if linked_order["returned_amount"] >= linked_order.get("total_amount", 0)
                else "partially_returned"
            )
            _write_json("mock_orders.json", orders)

        if return_entry.get("refund_method") == "Credit" and return_entry.get("customer_id"):
            udhaar_list = _read_json("mock_udhaar.json", [])
            existing = next(
                (
                    record
                    for record in udhaar_list
                    if record["customer_id"] == return_entry["customer_id"] and record["balance"] > 0
                ),
                None,
            )
            if existing:
                existing["balance"] = max(0, existing["balance"] - float(return_entry["refund_amount"]))
                existing["entries"].append(
                    {
                        "order_id": return_entry.get("order_id"),
                        "date": time.strftime("%Y-%m-%d"),
                        "items": [],
                        "amount": float(return_entry["refund_amount"]),
                        "type": "refund",
                        "note": f"Return refund for {return_entry['return_id']}",
                    }
                )
                _write_json("mock_udhaar.json", udhaar_list)

        return_entry["restocked_qty"] = restocked_qty
        return_entry["wastage_qty"] = wastage_qty
        return_entry["restocked_value"] = round(restocked_value, 2)
        return_entry["wastage_value"] = round(wastage_value, 2)
        return_entry["processed_at"] = return_entry.get("processed_at") or time.time()
        return_entry["status"] = "processed"
        return return_entry

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

    def _get_skill(name: str):
        return orchestrator.skills.get(name)

    def _list_skills():
        return [skill.status() for skill in orchestrator.skills.values()]

    # ── WebSocket ──────────────────────────────────────────
    @app.websocket("/ws/events")
    async def websocket_endpoint(websocket: WebSocket):
        await manager.connect(websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            manager.disconnect(websocket)

    # ── Runtime Status ─────────────────────────────────────
    @app.get("/api/status")
    async def get_status():
        return {
            "runtime": "running" if orchestrator.running else "stopped",
            "skills": _list_skills(),
            "pending_approvals": len(orchestrator.pending_approvals),
            "timestamp": time.time(),
        }

    @app.get("/api/skills")
    async def list_skills():
        return _list_skills()

    @app.post("/api/skills/{skill_name}/pause")
    async def pause_skill(skill_name: str):
        skill = _get_skill(skill_name)
        if not skill:
            raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")
        await skill.pause()
        return {"status": "paused", "skill": skill_name}

    @app.post("/api/skills/{skill_name}/resume")
    async def resume_skill(skill_name: str):
        skill = _get_skill(skill_name)
        if not skill:
            raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")
        await skill.resume()
        return {"status": "resumed", "skill": skill_name}

    @app.post("/api/events")
    async def emit_event(payload: EventPayload):
        await orchestrator.emit_event({"type": payload.type, "data": payload.data})
        return {"status": "event_queued", "type": payload.type}

    # ══════════════════════════════════════════════════════════
    # INVENTORY (connected: sales → orders, returns → restock)
    # ══════════════════════════════════════════════════════════

    @app.get("/api/inventory")
    async def get_inventory():
        skill = _get_skill("inventory")
        if not skill:
            raise HTTPException(status_code=404, detail="Inventory skill not loaded")
        return await skill.get_full_inventory()

    @app.post("/api/inventory/update")
    async def update_stock(payload: StockUpdatePayload):
        skill = _get_skill("inventory")
        if not skill:
            raise HTTPException(status_code=404, detail="Inventory skill not loaded")
        result = await skill.update_stock(payload.sku, payload.quantity, unit_price=payload.unit_price, image_url=payload.image_url, category=payload.category)
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        await orchestrator.emit_event({"type": "stock_update", "data": {"sku": payload.sku, "quantity": payload.quantity}})
        return result

    @app.post("/api/inventory/register")
    async def register_inventory_product(payload: InventoryRegisterPayload):
        skill = _get_skill("inventory")
        if not skill:
            raise HTTPException(status_code=404, detail="Inventory skill not loaded")
        result = await skill.register_product(payload.model_dump())
        if "error" in result:
            raise HTTPException(status_code=409, detail=result["error"])
        return result

    @app.patch("/api/inventory/{sku}")
    async def patch_inventory_item(sku: str, payload: InventoryPatchPayload):
        skill = _get_skill("inventory")
        if not skill:
            raise HTTPException(status_code=404, detail="Inventory skill not loaded")
        result = await skill.patch_item(sku, unit_price=payload.unit_price, image_url=payload.image_url, category=payload.category, barcode=payload.barcode)
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        return result

    @app.post("/api/inventory/check")
    async def check_inventory():
        await orchestrator.emit_event({"type": "inventory_check", "data": {}})
        return {"status": "inventory_check_queued"}

    # ══════════════════════════════════════════════════════════
    # SALES (connected: inventory deduct → order created → udhaar if credit → GST calculated)
    # ══════════════════════════════════════════════════════════

    @app.post("/api/inventory/sale")
    async def record_inventory_sale(payload: InventorySalePayload):
        """Record a sale: deducts inventory, creates order, handles udhaar if credit."""
        skill = _get_skill("inventory")
        if not skill:
            raise HTTPException(status_code=404, detail="Inventory skill not loaded")

        result = await skill.record_sale([item.model_dump() for item in payload.items])
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        # Emit stock events for threshold crossings
        for crossing in result.get("threshold_crossings", []):
            await orchestrator.emit_event({"type": "stock_update", "data": {"sku": crossing["sku"], "quantity": crossing["new_quantity"], "movement_type": "sale"}})

        # Build order items with totals
        inv_data = skill.inventory_data if hasattr(skill, 'inventory_data') else []
        inv_map = {i["sku"]: i for i in inv_data}
        order_items = []
        for item in payload.items:
            inv_item = inv_map.get(item.sku, {})
            price = inv_item.get("unit_price", 0)
            order_items.append({
                "sku": item.sku,
                "product_name": inv_item.get("product_name", item.sku),
                "qty": item.qty,
                "unit_price": price,
                "total": price * item.qty,
            })

        total_amount = sum(i["total"] for i in order_items)
        gst = _calc_gst(order_items, inv_data)
        order_id = f"ORD-C{int(time.time()) % 100000:05d}"

        new_order = {
            "order_id": order_id,
            "customer_id": payload.customer_id or "WALK-IN",
            "customer_name": payload.customer_name or "Walk-in Customer",
            "phone": payload.phone or "",
            "items": order_items,
            "total_amount": total_amount,
            "status": "delivered",
            "payment_method": payload.payment_method,
            "source": "counter",
            "gst_amount": gst,
            "timestamp": time.time(),
        }

        # Persist order
        orders = _read_json("mock_orders.json", {"customer_orders": [], "vendor_orders": []})
        orders["customer_orders"].append(new_order)
        _write_json("mock_orders.json", orders)

        # If udhaar, create/update credit entry
        if payload.payment_method == "Udhaar" and payload.customer_id:
            udhaar_list = _read_json("mock_udhaar.json", [])
            existing = next((u for u in udhaar_list if u["customer_id"] == payload.customer_id and u["balance"] > 0), None)

            entry = {
                "order_id": order_id,
                "date": time.strftime("%Y-%m-%d"),
                "items": [{"product_name": i["product_name"], "qty": i["qty"], "unit_price": i["unit_price"]} for i in order_items],
                "amount": total_amount,
                "type": "credit",
            }

            if existing:
                existing["entries"].append(entry)
                existing["total_credit"] += total_amount
                existing["balance"] += total_amount
                new_order["udhaar_id"] = existing["udhaar_id"]
            else:
                udhaar_id = f"UDH-{int(time.time()) % 100000:05d}"
                udhaar_list.append({
                    "udhaar_id": udhaar_id,
                    "customer_id": payload.customer_id,
                    "customer_name": payload.customer_name or "",
                    "phone": payload.phone or "",
                    "whatsapp_opted_in": True,
                    "entries": [entry],
                    "total_credit": total_amount,
                    "total_paid": 0,
                    "balance": total_amount,
                    "last_reminder_sent": None,
                    "created_at": time.strftime("%Y-%m-%d"),
                })
                new_order["udhaar_id"] = udhaar_id

            _write_json("mock_udhaar.json", udhaar_list)
            # Re-save order with udhaar_id
            _write_json("mock_orders.json", orders)

        # Update customer purchase history
        if payload.customer_id and payload.customer_id != "WALK-IN":
            customers = _read_json("mock_customers.json", [])
            for cust in customers:
                if cust["customer_id"] == payload.customer_id:
                    for oi in order_items:
                        cust["purchase_history"].append({
                            "product": oi["product_name"],
                            "category": inv_map.get(oi["sku"], {}).get("category", "Other"),
                            "quantity": oi["qty"],
                            "price": oi["unit_price"],
                            "timestamp": time.time(),
                        })
                    break
            _write_json("mock_customers.json", customers)

        result["order_id"] = order_id
        result["gst_amount"] = gst
        return result

    # ══════════════════════════════════════════════════════════
    # ORDERS (reads from unified orders file)
    # ══════════════════════════════════════════════════════════

    @app.get("/api/orders")
    async def get_orders():
        return _read_json("mock_orders.json", {"customer_orders": [], "vendor_orders": []})

    # ══════════════════════════════════════════════════════════
    # CUSTOMERS (enriched: purchase history from orders, udhaar balance)
    # ══════════════════════════════════════════════════════════

    @app.get("/api/customers")
    async def get_customers():
        customers = _read_json("mock_customers.json", [])
        udhaar_list = _read_json("mock_udhaar.json", [])
        orders = _read_json("mock_orders.json", {"customer_orders": [], "vendor_orders": []})
        returns = _read_json("mock_returns.json", [])
        udhaar_map = {u["customer_id"]: u for u in udhaar_list}
        orders_by_customer: dict[str, list[dict[str, Any]]] = {}
        returns_by_customer: dict[str, list[dict[str, Any]]] = {}

        for order in orders["customer_orders"]:
            orders_by_customer.setdefault(order.get("customer_id", ""), []).append(order)
        for return_entry in returns:
            returns_by_customer.setdefault(return_entry.get("customer_id", ""), []).append(return_entry)

        for cust in customers:
            u = udhaar_map.get(cust["customer_id"])
            cust["udhaar_balance"] = u["balance"] if u else 0
            cust["udhaar_id"] = u["udhaar_id"] if u else None
            cust["last_reminder_sent"] = u.get("last_reminder_sent") if u else None

            customer_orders = orders_by_customer.get(cust["customer_id"], [])
            customer_returns = returns_by_customer.get(cust["customer_id"], [])
            cust["order_count"] = len(customer_orders)
            cust["return_count"] = len(customer_returns)
            cust["total_order_value"] = round(sum(order.get("total_amount", 0) for order in customer_orders), 2)
            cust["returned_amount"] = round(
                sum(return_entry.get("refund_amount", 0) for return_entry in customer_returns if return_entry.get("status") == "processed"),
                2,
            )
            cust["net_spend"] = round(cust["total_order_value"] - cust["returned_amount"], 2)
            cust["last_order_at"] = max((order.get("timestamp", 0) for order in customer_orders), default=None)
            cust["last_return_at"] = max((return_entry.get("timestamp", 0) for return_entry in customer_returns), default=None)

        return customers

    # ══════════════════════════════════════════════════════════
    # UDHAAR / CREDIT TRACKING
    # ══════════════════════════════════════════════════════════

    @app.get("/api/udhaar")
    async def get_udhaar():
        return _read_json("mock_udhaar.json", [])

    @app.post("/api/udhaar/credit")
    async def record_udhaar_credit(payload: UdhaarCreditPayload):
        """Give credit to customer (standalone, without cart sale)."""
        udhaar_list = _read_json("mock_udhaar.json", [])
        existing = next((u for u in udhaar_list if u["customer_id"] == payload.customer_id and u["balance"] > 0), None)
        entry = {
            "order_id": None,
            "date": time.strftime("%Y-%m-%d"),
            "items": payload.items,
            "amount": payload.amount,
            "type": "credit",
        }
        if existing:
            existing["entries"].append(entry)
            existing["total_credit"] += payload.amount
            existing["balance"] += payload.amount
            udhaar_id = existing["udhaar_id"]
        else:
            udhaar_id = f"UDH-{int(time.time()) % 100000:05d}"
            udhaar_list.append({
                "udhaar_id": udhaar_id,
                "customer_id": payload.customer_id,
                "customer_name": payload.customer_name,
                "phone": payload.phone,
                "whatsapp_opted_in": True,
                "entries": [entry],
                "total_credit": payload.amount,
                "total_paid": 0,
                "balance": payload.amount,
                "last_reminder_sent": None,
                "created_at": time.strftime("%Y-%m-%d"),
            })
        _write_json("mock_udhaar.json", udhaar_list)
        return {"status": "credit_recorded", "udhaar_id": udhaar_id, "balance": next(u["balance"] for u in udhaar_list if u["udhaar_id"] == udhaar_id)}

    @app.post("/api/udhaar/payment")
    async def record_udhaar_payment(payload: UdhaarPaymentPayload):
        """Record a payment against udhaar balance."""
        udhaar_list = _read_json("mock_udhaar.json", [])
        for u in udhaar_list:
            if u["udhaar_id"] == payload.udhaar_id:
                u["entries"].append({
                    "order_id": None,
                    "date": time.strftime("%Y-%m-%d"),
                    "items": [],
                    "amount": payload.amount,
                    "type": "payment",
                    "note": payload.note or "Payment received",
                })
                u["total_paid"] += payload.amount
                u["balance"] = max(0, u["balance"] - payload.amount)
                _write_json("mock_udhaar.json", udhaar_list)
                return {"status": "payment_recorded", "udhaar_id": payload.udhaar_id, "new_balance": u["balance"]}
        raise HTTPException(status_code=404, detail="Udhaar record not found")

    @app.post("/api/udhaar/{udhaar_id}/remind")
    async def send_udhaar_reminder(udhaar_id: str):
        """Send WhatsApp reminder for udhaar balance."""
        udhaar_list = _read_json("mock_udhaar.json", [])
        for u in udhaar_list:
            if u["udhaar_id"] == udhaar_id:
                u["last_reminder_sent"] = time.strftime("%Y-%m-%d")
                _write_json("mock_udhaar.json", udhaar_list)
                msg = f"Namaste {u['customer_name']} ji! Aapka {u['customer_name']}'s kirana store mein Rs {u['balance']} baaki hai. Jab ho sake payment kar dijiye. Dhanyavaad!"
                return {
                    "status": "reminder_sent",
                    "phone": u["phone"],
                    "message": msg,
                    "whatsapp_link": f"https://wa.me/{u['phone'].replace('+', '')}?text={msg}",
                }
        raise HTTPException(status_code=404, detail="Udhaar record not found")

    # ══════════════════════════════════════════════════════════
    # RETURNS & REFUNDS (connected: restocks inventory, updates wastage, linked to order)
    # ══════════════════════════════════════════════════════════

    @app.get("/api/returns")
    async def get_returns():
        returns = _read_json("mock_returns.json", [])
        orders = _read_json("mock_orders.json", {"customer_orders": [], "vendor_orders": []})
        order_map = {order["order_id"]: order for order in orders["customer_orders"]}
        enriched = []
        for return_entry in returns:
            linked_order = order_map.get(return_entry.get("order_id"), {})
            enriched.append(
                {
                    **return_entry,
                    "linked_payment_method": linked_order.get("payment_method"),
                    "linked_order_total": linked_order.get("total_amount"),
                    "return_status": linked_order.get("return_status"),
                }
            )
        return sorted(enriched, key=lambda item: item.get("timestamp", 0), reverse=True)

    @app.post("/api/returns")
    async def record_return(payload: ReturnPayload):
        """Process return: restock or wastage, refund, update order."""
        returns = _read_json("mock_returns.json", [])
        refund_amount = sum(i.get("unit_price", 0) * i.get("qty", 1) for i in payload.items)

        return_entry = {
            "return_id": f"RET-{int(time.time()) % 100000:05d}",
            "order_id": payload.order_id,
            "customer_id": payload.customer_id,
            "customer_name": payload.customer_name,
            "items": payload.items,
            "refund_amount": refund_amount,
            "refund_method": payload.refund_method,
            "status": "processed",
            "timestamp": time.time(),
            "processed_at": time.time(),
        }
        return_entry = await _apply_return_effects(return_entry)
        returns.append(return_entry)
        _write_json("mock_returns.json", returns)
        return return_entry

    @app.post("/api/returns/{return_id}/process")
    async def process_return(return_id: str):
        returns = _read_json("mock_returns.json", [])
        for idx, return_entry in enumerate(returns):
            if return_entry["return_id"] != return_id:
                continue
            if return_entry.get("status") == "processed":
                return return_entry
            returns[idx] = await _apply_return_effects(return_entry)
            _write_json("mock_returns.json", returns)
            return returns[idx]
        raise HTTPException(status_code=404, detail="Return not found")

    # ══════════════════════════════════════════════════════════
    # SUPPLIER PAYMENTS (connected: updates vendor order payment_status)
    # ══════════════════════════════════════════════════════════

    @app.post("/api/vendor-orders/{order_id}/pay")
    async def mark_vendor_paid(order_id: str):
        """Mark a vendor order as paid."""
        orders = _read_json("mock_orders.json", {"customer_orders": [], "vendor_orders": []})
        for vo in orders["vendor_orders"]:
            if vo["order_id"] == order_id:
                if vo.get("payment_status") == "paid":
                    snapshot = _payment_due_snapshot(vo)
                    return {"status": "paid", "order_id": order_id, "payment_date": vo.get("payment_date"), **snapshot}
                vo["payment_status"] = "paid"
                vo["payment_date"] = time.strftime("%Y-%m-%d")
                _write_json("mock_orders.json", orders)
                snapshot = _payment_due_snapshot(vo)
                return {"status": "paid", "order_id": order_id, "payment_date": vo["payment_date"], **snapshot}
        raise HTTPException(status_code=404, detail="Vendor order not found")

    @app.get("/api/vendor-payments")
    async def get_vendor_payment_summary():
        """Summary of vendor payment statuses."""
        orders = _read_json("mock_orders.json", {"customer_orders": [], "vendor_orders": []})
        paid = [o for o in orders["vendor_orders"] if o.get("payment_status") == "paid"]
        unpaid = [o for o in orders["vendor_orders"] if o.get("payment_status") != "paid"]
        unpaid_details = []
        for order in unpaid:
            snapshot = _payment_due_snapshot(order)
            unpaid_details.append(
                {
                    "order_id": order["order_id"],
                    "supplier_name": order["supplier_name"],
                    "amount": order["total_amount"],
                    "delivery_date": order.get("delivery_date", ""),
                    **snapshot,
                }
            )
        overdue = [detail for detail in unpaid_details if detail["is_overdue"]]
        return {
            "total_paid": sum(o["total_amount"] for o in paid),
            "total_unpaid": sum(o["total_amount"] for o in unpaid),
            "paid_orders": len(paid),
            "unpaid_orders": len(unpaid),
            "overdue_orders": len(overdue),
            "overdue_amount": sum(detail["amount"] for detail in overdue),
            "unpaid_details": unpaid_details,
        }

    # ══════════════════════════════════════════════════════════
    # GST & BILLING
    # ══════════════════════════════════════════════════════════

    @app.get("/api/gst/summary")
    async def get_gst_summary():
        """Monthly GST summary: output tax (sales) - input tax (purchases) = net liability."""
        orders = _read_json("mock_orders.json", {"customer_orders": [], "vendor_orders": []})
        output_gst = sum(o.get("gst_amount", 0) for o in orders["customer_orders"])
        input_gst = sum(o.get("gst_amount", 0) for o in orders["vendor_orders"])
        returns = _read_json("mock_returns.json", [])
        refund_gst = round(sum(r["refund_amount"] for r in returns if r["status"] == "processed") * 0.05)

        return {
            "reporting_period": date.today().strftime("%B %Y"),
            "output_gst": output_gst,
            "input_gst": input_gst,
            "refund_adjustment": refund_gst,
            "net_liability": output_gst - input_gst - refund_gst,
            "total_sales": sum(o["total_amount"] for o in orders["customer_orders"]),
            "total_purchases": sum(o["total_amount"] for o in orders["vendor_orders"]),
            "total_returns": sum(r["refund_amount"] for r in returns if r["status"] == "processed"),
            "gst_rates": GST_RATES,
        }

    # ══════════════════════════════════════════════════════════
    # DAILY WHATSAPP SUMMARY
    # ══════════════════════════════════════════════════════════

    @app.get("/api/daily-summary")
    async def get_daily_summary():
        """Generate daily summary for WhatsApp push."""
        orders = _read_json("mock_orders.json", {"customer_orders": [], "vendor_orders": []})
        udhaar = _read_json("mock_udhaar.json", [])
        returns = _read_json("mock_returns.json", [])
        delivery = _read_json("mock_delivery_requests.json", [])
        summary_date = _latest_business_date(orders["customer_orders"], returns, delivery)
        filtered_orders = [o for o in orders["customer_orders"] if _order_business_date(o) == summary_date]
        filtered_returns = [r for r in returns if _return_business_date(r) == summary_date]
        filtered_delivery = [
            request for request in delivery if _business_date_from_value(request.get("requested_at")) == summary_date
        ]

        revenue = sum(o["total_amount"] for o in filtered_orders)
        procurement = sum(o["total_amount"] for o in orders["vendor_orders"] if _order_business_date(o) == summary_date)
        udhaar_outstanding = sum(u["balance"] for u in udhaar)
        pending_deliveries = len([d for d in delivery if d["status"] in ("pending", "accepted", "out_for_delivery")])
        pending_returns = len([r for r in returns if r["status"] == "pending"])
        unpaid_vendors = len([o for o in orders["vendor_orders"] if o.get("payment_status") != "paid"])
        pending_approvals = len(orchestrator.pending_approvals)

        # Find top selling product
        product_sales = {}
        for o in filtered_orders:
            for item in o["items"]:
                product_sales[item["product_name"]] = product_sales.get(item["product_name"], 0) + item["qty"]
        top_product = max(product_sales.items(), key=lambda x: x[1]) if product_sales else ("None", 0)

        # Critical stock
        skill = _get_skill("inventory")
        critical_items = []
        if skill:
            for item in skill.inventory_data:
                if item["current_stock"] <= item["reorder_threshold"]:
                    critical_items.append(item["product_name"])

        summary_text = f"""Good morning, Soham!

Store summary for {summary_date.strftime("%d %b %Y")}:

Revenue: Rs {revenue:,}
Procurement: Rs {procurement:,}
Profit: Rs {revenue - procurement:,}

Top seller: {top_product[0]} ({top_product[1]} units)

Udhaar outstanding: Rs {udhaar_outstanding:,}
Pending deliveries: {pending_deliveries}
Unpaid vendor bills: {unpaid_vendors}
Pending returns: {pending_returns}
Pending approvals: {pending_approvals}

{f"Low stock: {', '.join(critical_items[:5])}" if critical_items else "All stock levels healthy!"}

Open RetailOS for details."""

        phone = "+919876543210"
        return {
            "summary_date": summary_date.isoformat(),
            "summary": summary_text,
            "whatsapp_link": f"https://wa.me/{phone.replace('+', '')}?text={quote(summary_text[:500])}",
            "metrics": {
                "revenue": revenue,
                "procurement": procurement,
                "profit": revenue - procurement,
                "top_product": top_product[0],
                "udhaar_outstanding": udhaar_outstanding,
                "pending_deliveries": pending_deliveries,
                "unpaid_vendors": unpaid_vendors,
                "pending_approvals": pending_approvals,
                "returns_processed_today": len([r for r in filtered_returns if r.get("status") == "processed"]),
                "delivery_requests_today": len(filtered_delivery),
                "critical_stock_count": len(critical_items),
            },
        }

    # ══════════════════════════════════════════════════════════
    # VOICE COMMAND PARSING
    # ══════════════════════════════════════════════════════════

    @app.post("/api/voice/parse")
    async def parse_voice_command(payload: VoiceCommandPayload):
        """Parse a voice command and route to the right action."""
        text = payload.text.lower().strip()

        # Load inventory for matching
        skill = _get_skill("inventory")
        inv_data = skill.inventory_data if skill else _read_json("mock_inventory.json", [])
        inv_map = {i["product_name"].lower(): i for i in inv_data}

        # Parse patterns
        # "add 20 units of Amul butter"
        add_match = re.search(r'(?:add|restock|stock)\s+(\d+)\s+(?:units?\s+(?:of\s+)?)?(.+)', text)
        if add_match:
            qty = int(add_match.group(1))
            product_query = add_match.group(2).strip()
            matched = next((v for k, v in inv_map.items() if product_query.lower() in k), None)
            if matched and skill:
                new_stock = matched["current_stock"] + qty
                await skill.update_stock(matched["sku"], new_stock)
                return {"action": "stock_update", "product": matched["product_name"], "sku": matched["sku"], "quantity_added": qty, "new_stock": new_stock, "message": f"Added {qty} units of {matched['product_name']}. New stock: {new_stock}"}
            return {"action": "not_found", "message": f"Could not find product matching '{product_query}'"}

        # "sell 3 maggi to Rahul"
        sell_match = re.search(r'(?:sell|sold|sale)\s+(\d+)\s+(.+?)(?:\s+to\s+(.+))?$', text)
        if sell_match:
            qty = int(sell_match.group(1))
            product_query = sell_match.group(2).strip()
            customer_name = (sell_match.group(3) or "").strip()
            matched = next((v for k, v in inv_map.items() if product_query.lower() in k), None)
            if matched:
                return {"action": "sale_ready", "product": matched["product_name"], "sku": matched["sku"], "qty": qty, "customer": customer_name, "message": f"Ready to sell {qty}x {matched['product_name']}" + (f" to {customer_name}" if customer_name else "")}
            return {"action": "not_found", "message": f"Could not find product matching '{product_query}'"}

        # "supplier late" / "delivery late"
        if "late" in text or "delayed" in text:
            supplier_match = re.search(r'(.+?)(?:\s+(?:delivered|is|was))?\s+(?:late|delayed)', text)
            supplier_name = supplier_match.group(1).strip() if supplier_match else text
            return {"action": "supplier_feedback", "supplier": supplier_name, "feedback": "late_delivery", "message": f"Logged: {supplier_name} — late delivery reported"}

        # "check stock" / "stock status"
        if "stock" in text and ("check" in text or "status" in text or "low" in text):
            low = [i for i in inv_data if i["current_stock"] <= i["reorder_threshold"]]
            return {"action": "stock_check", "low_stock_count": len(low), "items": [{"name": i["product_name"], "stock": i["current_stock"]} for i in low[:5]], "message": f"{len(low)} items are running low"}

        # "udhaar" / "credit"
        if "udhaar" in text or "credit" in text or "khata" in text:
            udhaar = _read_json("mock_udhaar.json", [])
            active = [u for u in udhaar if u["balance"] > 0]
            total = sum(u["balance"] for u in active)
            return {"action": "udhaar_summary", "active_accounts": len(active), "total_outstanding": total, "message": f"{len(active)} customers owe Rs {total:,} total"}

        return {"action": "unknown", "message": f"I didn't understand '{text}'. Try: 'add 20 Amul butter', 'sell 3 maggi', 'check stock', or 'udhaar status'"}

    @app.post("/api/voice/execute")
    async def execute_voice_command(payload: VoiceCommandPayload):
        parsed = await parse_voice_command(payload)
        action = parsed.get("action")

        if action == "stock_update":
            return {**parsed, "executed": True}

        if action == "supplier_feedback":
            suppliers = _read_json("mock_suppliers.json", [])
            supplier = next(
                (
                    record
                    for record in suppliers
                    if parsed.get("supplier", "").lower() in record.get("supplier_name", "").lower()
                ),
                None,
            )
            if orchestrator.audit:
                await orchestrator.audit.log(
                    skill="procurement",
                    event_type="voice_supplier_feedback",
                    decision=f"Voice note captured for {parsed.get('supplier')}",
                    reasoning="Store owner reported a delivery delay through voice input.",
                    outcome=json.dumps(
                        {
                            "supplier_name": supplier.get("supplier_name") if supplier else parsed.get("supplier"),
                            "supplier_id": supplier.get("supplier_id") if supplier else None,
                            "feedback": parsed.get("feedback"),
                        }
                    ),
                    status="warning",
                )
            return {
                **parsed,
                "executed": True,
                "supplier_id": supplier.get("supplier_id") if supplier else None,
            }

        return {**parsed, "executed": False}

    # ══════════════════════════════════════════════════════════
    # DELIVERY REQUESTS (connected: delivered → creates order → deducts inventory)
    # ══════════════════════════════════════════════════════════

    @app.get("/api/delivery-requests")
    async def get_delivery_requests():
        return _read_json("mock_delivery_requests.json", [])

    @app.patch("/api/delivery-requests/{request_id}/status")
    async def update_delivery_status(request_id: str, payload: DeliveryStatusPayload):
        requests = _read_json("mock_delivery_requests.json", [])
        for req in requests:
            if req["request_id"] == request_id:
                old_status = req["status"]
                req["status"] = payload.status
                _write_json("mock_delivery_requests.json", requests)

                # When marked as delivered → create order + deduct inventory
                if payload.status == "delivered" and old_status != "delivered":
                    order_items = []
                    for item in req["items"]:
                        order_items.append({
                            "sku": item["sku"],
                            "product_name": item["product_name"],
                            "qty": item["qty"],
                            "unit_price": item["unit_price"],
                            "total": item["qty"] * item["unit_price"],
                        })

                    skill = _get_skill("inventory")
                    inv_data = skill.inventory_data if skill else []
                    gst = _calc_gst(order_items, inv_data)
                    order_id = f"ORD-D{int(time.time()) % 100000:05d}"

                    new_order = {
                        "order_id": order_id,
                        "customer_id": req.get("customer_id", ""),
                        "customer_name": req["customer_name"],
                        "phone": req.get("phone", ""),
                        "items": order_items,
                        "total_amount": req["total_amount"],
                        "status": "delivered",
                        "payment_method": "Cash",
                        "source": "delivery",
                        "gst_amount": gst,
                        "timestamp": time.time(),
                    }

                    orders = _read_json("mock_orders.json", {"customer_orders": [], "vendor_orders": []})
                    orders["customer_orders"].append(new_order)
                    _write_json("mock_orders.json", orders)

                    # Deduct inventory
                    if skill:
                        sale_result = await skill.record_sale([{"sku": i["sku"], "qty": i["qty"]} for i in req["items"]])
                        for crossing in sale_result.get("threshold_crossings", []):
                            await orchestrator.emit_event(
                                {
                                    "type": "stock_update",
                                    "data": {
                                        "sku": crossing["sku"],
                                        "quantity": crossing["new_quantity"],
                                        "movement_type": "sale",
                                    },
                                }
                            )

                return {"status": "updated", "request_id": request_id, "new_status": payload.status}
        raise HTTPException(status_code=404, detail=f"Request '{request_id}' not found")

    # ══════════════════════════════════════════════════════════
    # SHELF ZONES
    # ══════════════════════════════════════════════════════════

    @app.get("/api/shelf-zones")
    async def get_shelf_zones():
        data = _read_json("mock_shelf_zones.json", {"zones": [], "ai_suggestions": []})
        # Enrich with live stock data
        skill = _get_skill("inventory")
        if skill:
            inv_map = {i["sku"]: i for i in skill.inventory_data}
            for zone in data["zones"]:
                for product in zone["products"]:
                    inv = inv_map.get(product["sku"])
                    if inv:
                        product["current_stock"] = inv["current_stock"]
                        product["daily_sales_rate"] = inv["daily_sales_rate"]
        return data

    # ══════════════════════════════════════════════════════════
    # SUPPLIERS
    # ══════════════════════════════════════════════════════════

    @app.get("/api/suppliers")
    async def get_suppliers():
        from brain.trust_scorer import get_trust_score
        suppliers = _read_json("mock_suppliers.json", [])
        enriched = []
        for s in suppliers:
            trust = get_trust_score(s["supplier_id"])
            enriched.append({**s, "trust_score": trust["score"], "trust_breakdown": trust.get("breakdown", {})})
        return enriched

    @app.post("/api/suppliers/register")
    async def register_supplier(payload: SupplierRegisterPayload):
        suppliers = _read_json("mock_suppliers.json", [])
        for s in suppliers:
            if s["supplier_id"] == payload.supplier_id:
                raise HTTPException(status_code=409, detail="Supplier ID already exists")
        new_supplier = {
            "supplier_id": payload.supplier_id,
            "supplier_name": payload.supplier_name,
            "contact_phone": payload.contact_phone,
            "products": payload.products,
            "categories": payload.categories,
            "price_per_unit": payload.price_per_unit,
            "reliability_score": 3.0,
            "delivery_days": payload.delivery_days,
            "min_order_qty": payload.min_order_qty,
            "payment_terms": payload.payment_terms,
            "location": payload.location,
        }
        suppliers.append(new_supplier)
        _write_json("mock_suppliers.json", suppliers)
        return {"status": "registered", "supplier": new_supplier}

    @app.get("/api/suppliers/{supplier_id}/history")
    async def get_supplier_history(supplier_id: str):
        from brain.trust_scorer import get_trust_score
        from brain.decision_logger import _get_connection
        trust = get_trust_score(supplier_id)
        decisions = []
        try:
            with _get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT amount, status, timestamp FROM decisions WHERE supplier_id = ? ORDER BY timestamp DESC LIMIT 20", (supplier_id,))
                decisions = [{"amount": r[0], "status": r[1], "timestamp": r[2]} for r in cursor.fetchall()]
        except Exception:
            pass
        return {"trust": trust, "decisions": decisions}

    # ══════════════════════════════════════════════════════════
    # EXISTING ENDPOINTS (unchanged)
    # ══════════════════════════════════════════════════════════

    @app.post("/api/webhook/supplier-reply")
    async def supplier_reply_webhook(payload: SupplierReplyPayload):
        await orchestrator.emit_event({"type": "supplier_reply", "data": {"negotiation_id": payload.negotiation_id, "supplier_id": payload.supplier_id, "supplier_name": payload.supplier_name, "message": payload.message, "product_name": payload.product_name}})
        return {"status": "reply_queued"}

    @app.post("/api/demo/supplier-reply")
    async def mock_supplier_reply(payload: SupplierReplyPayload):
        negotiation_skill = _get_skill("negotiation")
        if not negotiation_skill:
            raise HTTPException(status_code=404, detail="Negotiation skill not loaded")
        result = await negotiation_skill._handle_reply({"negotiation_id": payload.negotiation_id, "supplier_id": payload.supplier_id, "supplier_name": payload.supplier_name, "message": payload.message, "product_name": payload.product_name})
        if result.get("needs_approval"):
            orchestrator.pending_approvals[result["approval_id"]] = {"skill": "negotiation", "result": result, "event": {"type": "supplier_reply"}, "timestamp": time.time()}
        return result

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

    @app.get("/api/audit")
    async def get_audit_logs(skill: str | None = None, event_type: str | None = None, limit: int = 50, offset: int = 0):
        return await orchestrator.audit.get_logs(skill=skill, event_type=event_type, limit=limit, offset=offset)

    @app.get("/api/audit/count")
    async def get_audit_count():
        return {"count": await orchestrator.audit.get_log_count()}

    @app.get("/api/negotiations")
    async def get_negotiations():
        skill = _get_skill("negotiation")
        if not skill:
            raise HTTPException(status_code=404, detail="Negotiation skill not loaded")
        return {"active": skill.active_negotiations, "message_log": skill.message_log[-50:]}

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

    @app.post("/api/demo/trigger-flow")
    async def trigger_demo_flow():
        inventory_skill = _get_skill("inventory")
        if not inventory_skill:
            raise HTTPException(status_code=404, detail="Inventory skill not loaded")

        async def _run_demo():
            try:
                await orchestrator.audit.log(skill="orchestrator", event_type="demo_started", decision="Demo started — Ice cream stock dropping to critical", reasoning="Owner triggered the live demo flow", outcome="Stock will drop to 5 units", status="success")
                await inventory_skill.update_stock("SKU-001", 5)
                await asyncio.sleep(2)
                await orchestrator.audit.log(skill="inventory", event_type="low_stock_detected", decision="Ice cream stock critically low — only 5 units left!", reasoning="Stock dropped below reorder threshold of 20 units", outcome=json.dumps({"sku": "SKU-001", "product_name": "Amul Vanilla Ice Cream", "quantity": 5, "threshold": 20}), status="alert")
                await asyncio.sleep(2)
                await orchestrator.audit.log(skill="procurement", event_type="supplier_ranking", decision="Evaluated 5 suppliers — FreshFreeze Distributors is the best option", reasoning="Ranked by composite score: price 145/unit, reliability 4.8/5, next-day delivery, good trust score (94%)", outcome=json.dumps([{"rank": 1, "supplier_name": "FreshFreeze Distributors", "price_per_unit": 145, "delivery_days": 1}, {"rank": 2, "supplier_name": "CoolChain India", "price_per_unit": 155, "delivery_days": 2}]), status="success")
                await asyncio.sleep(2)
                await orchestrator.audit.log(skill="negotiation", event_type="outreach_sent", decision="Sent WhatsApp message to FreshFreeze Distributors", reasoning="Top-ranked supplier for ice cream procurement", outcome="Message sent via WhatsApp Business API", status="success", metadata={"supplier_id": "SUP-001"})
                await asyncio.sleep(2)
                await orchestrator.audit.log(skill="negotiation", event_type="reply_parsed", decision="Supplier replied: 50 boxes at 145/unit, delivery tomorrow, COD accepted", reasoning="Parsed WhatsApp reply from FreshFreeze — deal is within budget (saving 2,500 vs usual price)", outcome=json.dumps({"supplier": "FreshFreeze Distributors", "price_per_unit": 145, "quantity": 50, "delivery": "tomorrow", "terms": "COD"}), status="success")
                await asyncio.sleep(2)
                approval_id = f"demo_procurement_SKU-001_{int(time.time())}"
                orchestrator.pending_approvals[approval_id] = {"id": approval_id, "skill": "negotiation", "reason": "I found a better price for Amul Vanilla Ice Cream!", "result": {"product_name": "Amul Vanilla Ice Cream", "sku": "SKU-001", "negotiation_id": f"neg_demo_{int(time.time())}", "top_supplier": {"supplier_id": "SUP-001", "supplier_name": "FreshFreeze Distributors", "price_per_unit": 145, "delivery_days": 1, "min_order_qty": 30}, "parsed": {"price_per_unit": 145, "quantity": 50, "delivery": "tomorrow"}}, "event": {"type": "supplier_reply"}, "timestamp": time.time()}
                await orchestrator.audit.log(skill="orchestrator", event_type="approval_requested", decision="Deal ready! Waiting for your approval on the Approvals tab", reasoning="FreshFreeze offered 145/unit for 50 boxes of ice cream with next-day delivery. Saving 2,500 vs usual supplier.", outcome="Approval card created — tap YES to order", status="pending")
            except Exception as e:
                await orchestrator.audit.log(skill="orchestrator", event_type="demo_error", decision="Demo flow encountered an error", reasoning=str(e), outcome="Some steps may not have completed", status="error")

        asyncio.create_task(_run_demo())
        return {"status": "demo_flow_triggered", "message": "Demo started! Watch the Dashboard tab for live events."}

    @app.get("/api/inventory/expiry-risks")
    async def get_expiry_risks():
        from brain.expiry_alerter import get_expiry_risks
        try:
            items = _read_json("mock_inventory.json", [])
            risks = get_expiry_risks(items)
            return [r.get("data", r) for r in risks]
        except Exception:
            return []

    @app.get("/api/market-prices")
    async def get_all_market_prices():
        from brain.price_monitor import get_market_reference
        skill = _get_skill("inventory")
        if not skill:
            return []
        results = []
        for item in skill.inventory_data:
            ref = get_market_reference(item["sku"])
            if ref.get("median_price") is not None:
                results.append({"sku": item["sku"], "product_name": item["product_name"], **ref})
        return results

    @app.get("/api/market-prices/{sku}")
    async def get_market_price(sku: str):
        from brain.price_monitor import get_market_reference
        return get_market_reference(sku)

    @app.post("/api/market-prices/log")
    async def log_market_price(payload: MarketPriceLogPayload):
        from brain.price_monitor import log_manual_price
        log_manual_price(payload.product_id, payload.source_name, payload.price_per_unit, payload.unit)
        return {"status": "logged"}

    @app.get("/api/alerts")
    async def get_alerts(limit: int = 50):
        cutoff = time.time() - 48 * 3600
        all_logs = await orchestrator.audit.get_logs(limit=200)
        alerts = [log for log in all_logs if log.get("status") in ("alert", "critical", "escalated", "pending") and log.get("timestamp", 0) >= cutoff]
        return alerts[:limit]

    return app
