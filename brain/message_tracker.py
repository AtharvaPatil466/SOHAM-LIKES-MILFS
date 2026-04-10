# brain/message_tracker.py
import time
import uuid

from brain.db import get_connection


def log_message_sent(customer_id: str, message_id: str, template_used: str) -> str:
    """Records an outbound message. Returns the message_id for tracking."""
    if not message_id:
        message_id = f"msg_{uuid.uuid4().hex[:8]}"
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO message_outcomes (customer_id, message_id, template_used, sent_at) VALUES (?, ?, ?, ?)",
            (customer_id, message_id, template_used, time.time()),
        )
    return message_id


def log_reply(customer_id: str, message_id: str):
    """Records when a customer replies to a message."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE message_outcomes SET replied_at = ? WHERE customer_id = ? AND message_id = ?",
            (time.time(), customer_id, message_id),
        )


def log_conversion(customer_id: str, message_id: str, purchase_amount: float):
    """Records when a customer makes a purchase linked to a message."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE message_outcomes SET converted_at = ?, purchase_amount = ? WHERE customer_id = ? AND message_id = ?",
            (time.time(), purchase_amount, customer_id, message_id),
        )
