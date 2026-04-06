"""Email digest API endpoints."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Any

from auth.dependencies import require_role
from db.models import User
from notifications.email_digest import email_digest_service

router = APIRouter(prefix="/api/digests", tags=["notifications"])


class SendDigest(BaseModel):
    to_email: str
    digest_type: str = "daily"  # daily | weekly
    data: dict[str, Any] = {}


@router.get("/status")
async def digest_status():
    """Get email digest service status."""
    return {
        "is_configured": email_digest_service.is_configured,
        "smtp_host": email_digest_service.smtp_host or "(not set)",
    }


@router.post("/send")
async def send_digest(
    body: SendDigest,
    user: User = Depends(require_role("owner")),
):
    """Send an email digest report."""
    return await email_digest_service.send_digest(
        to_email=body.to_email,
        digest_type=body.digest_type,
        data=body.data,
    )


@router.post("/send-daily")
async def send_daily_digest(
    user: User = Depends(require_role("owner")),
):
    """Trigger daily digest to the current user's email."""
    if not user.email:
        return {"status": "error", "detail": "No email on account"}
    return await email_digest_service.send_digest(
        to_email=user.email,
        digest_type="daily",
        data={"revenue": 0, "orders_count": 0, "top_products": [], "low_stock_items": [], "pending_udhaar": 0},
    )


@router.get("/log")
async def digest_log(
    limit: int = 50,
    user: User = Depends(require_role("owner")),
):
    """Get recent email digest log."""
    return {"digests": email_digest_service.get_log(limit)}
