"""SMS notification service supporting MSG91 and Twilio.

In demo mode (no API keys), logs messages in-memory for testing.
"""

import logging
import os
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class SMSService:
    """Multi-provider SMS sender (MSG91, Twilio)."""

    def __init__(self):
        self.provider = os.environ.get("SMS_PROVIDER", "msg91")  # msg91 | twilio
        self.msg91_api_key = os.environ.get("MSG91_API_KEY", "")
        self.msg91_sender_id = os.environ.get("MSG91_SENDER_ID", "RETLOS")
        self.msg91_template_id = os.environ.get("MSG91_TEMPLATE_ID", "")
        self.twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
        self.twilio_token = os.environ.get("TWILIO_AUTH_TOKEN", "")
        self.twilio_from = os.environ.get("TWILIO_FROM_NUMBER", "")
        self._message_log: list[dict] = []

    @property
    def is_configured(self) -> bool:
        if self.provider == "msg91":
            return bool(self.msg91_api_key)
        return bool(self.twilio_sid and self.twilio_token and self.twilio_from)

    async def send(
        self,
        phone: str,
        message: str,
        template_id: str | None = None,
        variables: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Send an SMS message."""
        if not phone:
            return {"status": "error", "detail": "Phone number required"}

        # Normalize Indian phone numbers
        phone = self._normalize_phone(phone)

        if self.is_configured:
            if self.provider == "msg91":
                return await self._send_msg91(phone, message, template_id, variables)
            return await self._send_twilio(phone, message)

        # Demo mode
        entry = {
            "phone": phone,
            "message": message,
            "provider": self.provider,
            "timestamp": time.time(),
            "demo": True,
        }
        self._message_log.append(entry)
        logger.info("SMS (demo) to %s: %s", phone, message[:50])
        return {"status": "sent_demo", "phone": phone, "message_id": f"demo_{int(time.time())}"}

    async def _send_msg91(
        self,
        phone: str,
        message: str,
        template_id: str | None = None,
        variables: dict[str, str] | None = None,
    ) -> dict:
        tid = template_id or self.msg91_template_id
        payload = {
            "sender": self.msg91_sender_id,
            "route": "4",  # transactional
            "country": "91",
            "sms": [{"message": message, "to": [phone]}],
        }
        if tid:
            payload["DLT_TE_ID"] = tid

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://api.msg91.com/api/v5/flow/",
                    json={"template_id": tid, "recipients": [{"mobiles": phone, **(variables or {})}]},
                    headers={"authkey": self.msg91_api_key, "Content-Type": "application/json"},
                    timeout=10,
                )
                result = resp.json()
                self._message_log.append({"phone": phone, "message": message, "provider": "msg91", "response": result, "timestamp": time.time()})
                return {"status": "sent", "phone": phone, "provider": "msg91", "response": result}
        except Exception as e:
            logger.warning("MSG91 send failed to %s: %s", phone, e)
            return {"status": "error", "detail": str(e)}

    async def _send_twilio(self, phone: str, message: str) -> dict:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"https://api.twilio.com/2010-04-01/Accounts/{self.twilio_sid}/Messages.json",
                    data={"To": phone, "From": self.twilio_from, "Body": message},
                    auth=(self.twilio_sid, self.twilio_token),
                    timeout=10,
                )
                result = resp.json()
                self._message_log.append({"phone": phone, "message": message, "provider": "twilio", "sid": result.get("sid"), "timestamp": time.time()})
                return {"status": "sent", "phone": phone, "provider": "twilio", "sid": result.get("sid")}
        except Exception as e:
            logger.warning("Twilio send failed to %s: %s", phone, e)
            return {"status": "error", "detail": str(e)}

    def _normalize_phone(self, phone: str) -> str:
        phone = phone.strip().replace(" ", "").replace("-", "")
        if phone.startswith("0"):
            phone = "+91" + phone[1:]
        elif not phone.startswith("+"):
            if len(phone) == 10:
                phone = "+91" + phone
        return phone

    async def send_otp(self, phone: str, otp: str) -> dict:
        return await self.send(phone, f"Your RetailOS OTP is {otp}. Valid for 5 minutes.")

    async def send_order_update(self, phone: str, order_id: str, status: str) -> dict:
        return await self.send(phone, f"Order {order_id} update: {status}. Thank you for shopping with RetailOS!")

    async def send_payment_confirmation(self, phone: str, amount: float, order_id: str) -> dict:
        return await self.send(phone, f"Payment of Rs.{amount:.2f} received for order {order_id}. Thank you!")

    async def send_low_stock_alert(self, phone: str, product_name: str, current_stock: int) -> dict:
        return await self.send(phone, f"Low stock alert: {product_name} has only {current_stock} units left. Reorder soon!")

    def get_log(self, limit: int = 50) -> list[dict]:
        return self._message_log[-limit:]

    def clear_log(self) -> int:
        count = len(self._message_log)
        self._message_log.clear()
        return count


sms_service = SMSService()
