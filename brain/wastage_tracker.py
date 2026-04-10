# brain/wastage_tracker.py
import time
from typing import Optional

from brain.db import get_connection, db_exists


def log_movement(product_id: str, quantity: int, movement_type: str, order_id: Optional[str] = None):
    """Records a stock movement.

    movement_type must be one of: 'sale', 'expiry', 'damage', 'theft', 'restock'
    """
    valid_types = {'sale', 'expiry', 'damage', 'theft', 'restock'}
    if movement_type not in valid_types:
        raise ValueError(f"Invalid movement_type: {movement_type}")

    with get_connection() as conn:
        conn.execute(
            "INSERT INTO stock_movements (product_id, quantity_change, movement_type, timestamp, order_id) VALUES (?, ?, ?, ?, ?)",
            (product_id, quantity, movement_type, time.time(), order_id),
        )


def get_wastage_summary(product_id: str, days: int = 30) -> dict:
    """Calculates lost-to-received ratio over the given time window."""
    if not db_exists():
        return {"wastage_rate": 0.0, "total_lost": 0, "total_received": 0}

    cutoff = time.time() - (days * 86400)

    with get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute('''
            SELECT SUM(quantity_change)
            FROM stock_movements
            WHERE product_id = ? AND movement_type IN ('expiry', 'damage', 'theft') AND timestamp >= ?
        ''', (product_id, cutoff))
        total_lost = abs(cursor.fetchone()[0] or 0)

        cursor.execute('''
            SELECT SUM(quantity_change)
            FROM stock_movements
            WHERE product_id = ? AND movement_type = 'restock' AND timestamp >= ?
        ''', (product_id, cutoff))
        total_received = abs(cursor.fetchone()[0] or 0)

        if total_received == 0:
            cursor.execute('''
                SELECT SUM(quantity_change)
                FROM stock_movements
                WHERE product_id = ? AND movement_type = 'sale' AND timestamp >= ?
            ''', (product_id, cutoff))
            total_sales = abs(cursor.fetchone()[0] or 0)
            total_received = total_sales + total_lost

    rate = (total_lost / total_received) if total_received > 0 else 0.0
    return {"wastage_rate": min(1.0, round(rate, 3)), "total_lost": total_lost, "total_received": total_received}
