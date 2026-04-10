# brain/quality_scorer.py
import sqlite3

from brain.db import get_connection, db_exists


def get_quality_score(supplier_id: str) -> int:
    """Calculates quality score (0-100) based on complaints per order."""
    if not db_exists():
        return 50

    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute('SELECT COUNT(DISTINCT order_id) FROM deliveries WHERE supplier_id = ?', (supplier_id,))
            total_orders = cursor.fetchone()[0]

            cursor.execute('SELECT COUNT(*) FROM quality_flags WHERE supplier_id = ?', (supplier_id,))
            total_complaints = cursor.fetchone()[0]
        except sqlite3.OperationalError:
            return 50

    if total_orders == 0:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM decisions WHERE supplier_id = ? AND status = 'approved'", (supplier_id,))
            total_orders = cursor.fetchone()[0]

    if total_orders == 0:
        return 50

    ratio = total_complaints / total_orders
    penalty = int(ratio * 500)
    return max(0, 100 - penalty)
