# brain/decision_logger.py
import time

from brain.db import get_connection


def log_decision(supplier_id: str, amount: float, status: str):
    """Writes one row to the decisions table."""
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO decisions (supplier_id, amount, status, timestamp) VALUES (?, ?, ?, ?)",
            (supplier_id, amount, status, time.time())
        )


def log_delivery(supplier_id: str, order_id: str, expected_date: str, actual_date: str):
    """Writes one row to the deliveries table."""
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO deliveries (supplier_id, order_id, expected_date, actual_date, timestamp) VALUES (?, ?, ?, ?, ?)",
            (supplier_id, order_id, expected_date, actual_date, time.time())
        )


def log_quality_flag(supplier_id: str, order_id: str, reason: str):
    """Writes one row to the quality_flags table."""
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO quality_flags (supplier_id, order_id, reason, timestamp) VALUES (?, ?, ?, ?)",
            (supplier_id, order_id, reason, time.time())
        )
