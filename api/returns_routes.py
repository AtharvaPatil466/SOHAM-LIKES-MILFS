"""Returns & refunds system with proper DB-backed workflow."""

import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import require_role
from db.models import Customer, Return, ReturnItem, User
from db.session import get_db

router = APIRouter(prefix="/api/v2/returns", tags=["returns"])


class ReturnItemRequest(BaseModel):
    sku: str
    product_name: str
    qty: int = 1
    unit_price: float = 0
    reason: str = ""
    action: str = "refund"  # refund | exchange | wastage


class CreateReturnRequest(BaseModel):
    order_id: str
    customer_code: str | None = None
    customer_name: str = "Walk-in"
    items: list[ReturnItemRequest]
    refund_method: str = "Cash"


@router.post("")
async def create_return(
    body: CreateReturnRequest,
    user: User = Depends(require_role("cashier")),
    db: AsyncSession = Depends(get_db),
):
    # Look up customer if provided
    customer_db_id = None
    if body.customer_code:
        result = await db.execute(select(Customer).where(Customer.customer_code == body.customer_code))
        cust = result.scalar_one_or_none()
        if cust:
            customer_db_id = cust.id

    refund_amount = sum(item.unit_price * item.qty for item in body.items)
    return_id = f"RET-{int(time.time())}"

    db_return = Return(
        return_id=return_id,
        order_id=body.order_id,
        customer_id=customer_db_id,
        customer_name=body.customer_name,
        refund_amount=refund_amount,
        refund_method=body.refund_method,
        status="pending",
    )
    db.add(db_return)
    await db.flush()

    for item in body.items:
        db.add(ReturnItem(
            return_id=db_return.id,
            sku=item.sku,
            product_name=item.product_name,
            qty=item.qty,
            unit_price=item.unit_price,
            reason=item.reason,
            action=item.action,
        ))

    await db.flush()

    return {
        "return_id": return_id,
        "status": "pending",
        "refund_amount": refund_amount,
        "refund_method": body.refund_method,
        "items_count": len(body.items),
    }


@router.post("/{return_id}/process")
async def process_return(
    return_id: str,
    user: User = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Return).where(Return.return_id == return_id))
    ret = result.scalar_one_or_none()
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    if ret.status == "processed":
        raise HTTPException(status_code=400, detail="Already processed")

    ret.status = "processed"
    ret.processed_at = time.time()
    await db.flush()

    return {"return_id": return_id, "status": "processed", "refund_amount": ret.refund_amount}


@router.post("/{return_id}/reject")
async def reject_return(
    return_id: str,
    user: User = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Return).where(Return.return_id == return_id))
    ret = result.scalar_one_or_none()
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")

    ret.status = "rejected"
    await db.flush()
    return {"return_id": return_id, "status": "rejected"}


@router.get("")
async def list_returns(
    status: str | None = None,
    limit: int = 50,
    user: User = Depends(require_role("staff")),
    db: AsyncSession = Depends(get_db),
):
    query = select(Return).order_by(Return.timestamp.desc())
    if status:
        query = query.where(Return.status == status)

    result = await db.execute(query.limit(limit))
    returns = result.scalars().all()

    output = []
    for r in returns:
        items_result = await db.execute(select(ReturnItem).where(ReturnItem.return_id == r.id))
        items = items_result.scalars().all()
        output.append({
            "return_id": r.return_id,
            "order_id": r.order_id,
            "customer_name": r.customer_name,
            "refund_amount": r.refund_amount,
            "refund_method": r.refund_method,
            "status": r.status,
            "timestamp": r.timestamp,
            "processed_at": r.processed_at,
            "items": [{"sku": i.sku, "product_name": i.product_name, "qty": i.qty, "reason": i.reason, "action": i.action} for i in items],
        })

    return {"returns": output}


@router.get("/{return_id}")
async def get_return(
    return_id: str,
    user: User = Depends(require_role("staff")),
    db: AsyncSession = Depends(get_db),
):
    """Get details of a specific return."""
    result = await db.execute(select(Return).where(Return.return_id == return_id))
    ret = result.scalar_one_or_none()
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")

    items_result = await db.execute(select(ReturnItem).where(ReturnItem.return_id == ret.id))
    items = items_result.scalars().all()

    return {
        "return_id": ret.return_id,
        "order_id": ret.order_id,
        "customer_name": ret.customer_name,
        "refund_amount": ret.refund_amount,
        "refund_method": ret.refund_method,
        "status": ret.status,
        "timestamp": ret.timestamp,
        "processed_at": ret.processed_at,
        "items": [{"sku": i.sku, "product_name": i.product_name, "qty": i.qty, "unit_price": i.unit_price, "reason": i.reason, "action": i.action} for i in items],
        "credit_note": _generate_credit_note(ret, items) if ret.status == "processed" else None,
    }


@router.get("/{return_id}/credit-note")
async def get_credit_note(
    return_id: str,
    user: User = Depends(require_role("cashier")),
    db: AsyncSession = Depends(get_db),
):
    """Generate a credit note for a processed return."""
    result = await db.execute(select(Return).where(Return.return_id == return_id))
    ret = result.scalar_one_or_none()
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    if ret.status != "processed":
        raise HTTPException(status_code=400, detail="Return must be processed to generate credit note")

    items_result = await db.execute(select(ReturnItem).where(ReturnItem.return_id == ret.id))
    items = items_result.scalars().all()
    return _generate_credit_note(ret, items)


@router.post("/{return_id}/exchange")
async def process_exchange(
    return_id: str,
    new_items: list[ReturnItemRequest],
    user: User = Depends(require_role("cashier")),
    db: AsyncSession = Depends(get_db),
):
    """Process an exchange: return old items and issue new ones."""
    result = await db.execute(select(Return).where(Return.return_id == return_id))
    ret = result.scalar_one_or_none()
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    if ret.status != "pending":
        raise HTTPException(status_code=400, detail="Return must be pending for exchange")

    ret.status = "exchanged"
    ret.processed_at = time.time()
    ret.refund_method = "Exchange"

    new_total = sum(item.unit_price * item.qty for item in new_items)
    difference = new_total - ret.refund_amount

    await db.flush()

    return {
        "return_id": return_id,
        "status": "exchanged",
        "original_amount": ret.refund_amount,
        "new_items_total": new_total,
        "difference": round(difference, 2),
        "customer_pays": round(max(0, difference), 2),
        "store_refunds": round(max(0, -difference), 2),
    }


@router.get("/stats/summary")
async def return_stats(
    user: User = Depends(require_role("manager")),
    db: AsyncSession = Depends(get_db),
):
    """Get return processing statistics."""
    result = await db.execute(select(Return))
    all_returns = result.scalars().all()

    total = len(all_returns)
    if not total:
        return {"total": 0, "processed": 0, "pending": 0, "rejected": 0, "total_refunded": 0}

    processed = [r for r in all_returns if r.status == "processed"]
    pending = [r for r in all_returns if r.status == "pending"]
    rejected = [r for r in all_returns if r.status == "rejected"]

    return {
        "total": total,
        "processed": len(processed),
        "pending": len(pending),
        "rejected": len(rejected),
        "exchanged": sum(1 for r in all_returns if r.status == "exchanged"),
        "total_refunded": round(sum(r.refund_amount for r in processed), 2),
        "avg_refund": round(sum(r.refund_amount for r in processed) / len(processed), 2) if processed else 0,
        "rejection_rate": round(len(rejected) / total * 100, 1),
    }


def _generate_credit_note(ret, items) -> dict:
    """Generate a credit note document for a processed return."""
    note_number = f"CN-{ret.return_id.replace('RET-', '')}"
    gst_amount = ret.refund_amount * 0.18 / 1.18  # Reverse calculate GST from total

    return {
        "credit_note_number": note_number,
        "return_id": ret.return_id,
        "original_order_id": ret.order_id,
        "customer_name": ret.customer_name,
        "date": time.strftime("%Y-%m-%d", time.localtime(ret.processed_at or ret.timestamp)),
        "items": [
            {
                "sku": i.sku,
                "product_name": i.product_name,
                "qty": i.qty,
                "unit_price": i.unit_price,
                "total": round(i.unit_price * i.qty, 2),
                "reason": i.reason,
            }
            for i in items
        ],
        "subtotal": round(ret.refund_amount - gst_amount, 2),
        "gst_amount": round(gst_amount, 2),
        "total_credit": ret.refund_amount,
        "refund_method": ret.refund_method,
        "note": "This credit note is valid for 30 days from the date of issue.",
    }
