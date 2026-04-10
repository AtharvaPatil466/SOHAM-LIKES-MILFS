# brain/delivery_tracker.py
import sqlite3
from datetime import datetime, timedelta

from brain.db import get_connection, db_exists


def get_delivery_score(supplier_id: str) -> int:
    """Calculates delivery score (0-100) based on on-time deliveries."""
    if not db_exists():
        return 50

    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute('''
                SELECT expected_date, actual_date
                FROM deliveries
                WHERE supplier_id = ?
            ''', (supplier_id,))
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
