"""WhatsApp messaging API routes."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.dependencies import require_role
from db.models import User
from notifications.whatsapp import whatsapp_client, get_message_log, clear_message_log

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])


class SendTextRequest(BaseModel):
    phone: str
    message: str


class SendTemplateRequest(BaseModel):
    phone: str
    template_name: str
    language: str = "en"
    parameters: list[str] = []


class SendUdhaarReminderRequest(BaseModel):
    phone: str
    customer_name: str
    balance: float
    due_date: str = ""


class SendOrderConfirmationRequest(BaseModel):
    phone: str
    order_id: str
    total: float
    items_count: int


@router.get("/status")
async def whatsapp_status(user: User = Depends(require_role("manager"))):
    """Check WhatsApp API configuration status."""
    return {
        "configured": whatsapp_client.is_configured,
        "phone_id": whatsapp_client.phone_id or "(not set)",
        "messages_sent": len(get_message_log()),
    }


@router.post("/send-text")
async def send_text_message(
    body: SendTextRequest,
    user: User = Depends(require_role("staff")),
):
    """Send a free-form text message via WhatsApp."""
    try:
        result = await whatsapp_client.send_text(body.phone, body.message)
        return {"status": "sent", "result": result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"WhatsApp send failed: {str(e)}")


@router.post("/send-template")
async def send_template_message(
    body: SendTemplateRequest,
    user: User = Depends(require_role("staff")),
):
    """Send a pre-approved template message."""
    try:
        result = await whatsapp_client.send_template(
            body.phone, body.template_name, body.language, body.parameters or None,
        )
        return {"status": "sent", "result": result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"WhatsApp send failed: {str(e)}")


@router.post("/send-udhaar-reminder")
async def send_udhaar_reminder(
    body: SendUdhaarReminderRequest,
    user: User = Depends(require_role("staff")),
):
    """Send a credit/udhaar payment reminder to a customer."""
    try:
        result = await whatsapp_client.send_udhaar_reminder(
            body.phone, body.customer_name, body.balance, body.due_date,
        )
        return {"status": "sent", "result": result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"WhatsApp send failed: {str(e)}")


@router.post("/send-order-confirmation")
async def send_order_confirmation(
    body: SendOrderConfirmationRequest,
    user: User = Depends(require_role("cashier")),
):
    """Send an order confirmation to a customer."""
    try:
        result = await whatsapp_client.send_order_confirmation(
            body.phone, body.order_id, body.total, body.items_count,
        )
        return {"status": "sent", "result": result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"WhatsApp send failed: {str(e)}")


@router.get("/message-log")
async def message_log(user: User = Depends(require_role("manager"))):
    """View sent message log (for debugging/demo)."""
    return {"messages": get_message_log(), "count": len(get_message_log())}


@router.delete("/message-log")
async def clear_log(user: User = Depends(require_role("owner"))):
    """Clear the message log."""
    clear_message_log()
    return {"status": "cleared"}
