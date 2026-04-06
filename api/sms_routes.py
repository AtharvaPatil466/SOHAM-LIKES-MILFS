"""SMS notification API endpoints."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth.dependencies import require_role
from db.models import User
from notifications.sms import sms_service

router = APIRouter(prefix="/api/sms", tags=["notifications"])


class SendSMS(BaseModel):
    phone: str
    message: str


class SendOTP(BaseModel):
    phone: str
    otp: str


class OrderSMS(BaseModel):
    phone: str
    order_id: str
    status: str


@router.get("/status")
async def sms_status():
    """Get SMS service configuration status."""
    return {
        "is_configured": sms_service.is_configured,
        "provider": sms_service.provider,
    }


@router.post("/send")
async def send_sms(
    body: SendSMS,
    user: User = Depends(require_role("manager")),
):
    """Send an SMS message."""
    return await sms_service.send(body.phone, body.message)


@router.post("/send-otp")
async def send_otp(
    body: SendOTP,
    user: User = Depends(require_role("cashier")),
):
    """Send OTP via SMS."""
    return await sms_service.send_otp(body.phone, body.otp)


@router.post("/order-update")
async def send_order_update(
    body: OrderSMS,
    user: User = Depends(require_role("cashier")),
):
    """Send order status update via SMS."""
    return await sms_service.send_order_update(body.phone, body.order_id, body.status)


@router.get("/log")
async def sms_log(
    limit: int = 50,
    user: User = Depends(require_role("manager")),
):
    """Get recent SMS message log."""
    return {"messages": sms_service.get_log(limit)}


@router.delete("/log")
async def clear_sms_log(user: User = Depends(require_role("owner"))):
    """Clear SMS message log."""
    count = sms_service.clear_log()
    return {"status": "cleared", "count": count}
