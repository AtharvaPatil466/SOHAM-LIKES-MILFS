"""Consolidated tracking and scoring utilities for the brain subsystem.

Combines decision logging, delivery tracking, quality scoring, and
message outcome tracking into a single module to reduce file sprawl.
"""

import sqlite3
import time
import uuid
from datetime import datetime, timedelta

from brain.db import get_connection, db_exists


# ── Decision logging ──

def log_decision(supplier_id: str, amount: float, status: str):
    """Writes one row to the decisions table."""
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO decisions (supplier_id, amount, status, timestamp) VALUES (?, ?, ?, ?)",
            (supplier_id, amount, status, time.time()),
        )


def log_delivery(supplier_id: str, order_id: str, expected_date: str, actual_date: str):
    """Writes one row to the deliveries table."""
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO deliveries (supplier_id, order_id, expected_date, actual_date, timestamp) VALUES (?, ?, ?, ?, ?)",
            (supplier_id, order_id, expected_date, actual_date, time.time()),
        )


def log_quality_flag(supplier_id: str, order_id: str, reason: str):
    """Writes one row to the quality_flags table."""
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO quality_flags (supplier_id, order_id, reason, timestamp) VALUES (?, ?, ?, ?)",
            (supplier_id, order_id, reason, time.time()),
        )


# ── Delivery scoring ──

def get_delivery_score(supplier_id: str) -> int:
    """Calculates delivery score (0-100) based on on-time deliveries."""
    if not db_exists():
        return 50

    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                "SELECT expected_date, actual_date FROM deliveries WHERE supplier_id = ?",
                (supplier_id,),
            )
            rows = cursor.fetchall()
        except sqlite3.OperationalError:
            return 50

    if not rows:
        return 50

    on_time = 0
    for expected, actual in rows:
        try:
            exp_date = datetime.fromisoformat(expected.replace("Z", "+00:00"))
            act_date = datetime.fromisoformat(actual.replace("Z", "+00:00"))
            if act_date <= exp_date + timedelta(days=1):
                on_time += 1
        except ValueError:
            if actual <= expected:
                on_time += 1
            elif actual.startswith(expected):
                on_time += 1

    return int((on_time / len(rows)) * 100)


# ── Quality scoring ──

def get_quality_score(supplier_id: str) -> int:
    """Calculates quality score (0-100) based on complaints per order."""
    if not db_exists():
        return 50

    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                "SELECT COUNT(DISTINCT order_id) FROM deliveries WHERE supplier_id = ?",
                (supplier_id,),
            )
            total_orders = cursor.fetchone()[0]

            cursor.execute(
                "SELECT COUNT(*) FROM quality_flags WHERE supplier_id = ?",
                (supplier_id,),
            )
            total_complaints = cursor.fetchone()[0]
        except sqlite3.OperationalError:
            return 50

    if total_orders == 0:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(*) FROM decisions WHERE supplier_id = ? AND status = 'approved'",
                (supplier_id,),
            )
            total_orders = cursor.fetchone()[0]

    if total_orders == 0:
        return 50

    ratio = total_complaints / total_orders
    penalty = int(ratio * 500)
    return max(0, 100 - penalty)


# ── Message outcome tracking ──

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
