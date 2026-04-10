# brain/price_monitor.py
import statistics
import time

from brain.db import get_connection, db_exists


def log_manual_price(product_id: str, source_name: str, price_per_unit: float, unit: str = "kg"):
    """Records a manually entered competitor price by staff."""
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO market_prices
               (product_id, source_name, price_per_unit, unit, recorded_at, source_type, confidence)
               VALUES (?, ?, ?, ?, ?, 'manual', 'medium')""",
            (product_id, source_name, price_per_unit, unit, time.time()),
        )


def fetch_agmarknet_prices(product_ids: list[str]):
    """Mocks automated daily pulls from structured agricultural/wholesale APIs."""
    now = time.time()
    with get_connection() as conn:
        for pid in product_ids:
            mock_price = 104.0 if "butter" in pid.lower() else 45.0
            conn.execute(
                """INSERT INTO market_prices
                   (product_id, source_name, price_per_unit, unit, recorded_at, source_type, confidence)
                   VALUES (?, 'agmarknet_api', ?, 'kg', ?, 'automated', 'high')""",
                (pid, mock_price, now),
            )


def get_market_reference(product_id: str) -> dict:
    """Returns median & lowest prices, degrading confidence dynamic to age."""
    if not db_exists():
        return {"median_price": None, "lowest_price": None, "lowest_source": None, "confidence": "none"}

    now = time.time()

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT price_per_unit, source_name, recorded_at, confidence
               FROM market_prices
               WHERE product_id = ?
               ORDER BY recorded_at DESC""",
            (product_id,),
        )
        rows = cursor.fetchall()

    if not rows:
        return {"median_price": None, "lowest_price": None, "lowest_source": None, "confidence": "none"}

    prices = [float(r[0]) for r in rows]
    median = statistics.median(prices)
    lowest_row = min(rows, key=lambda x: x[0])

    latest_time = rows[0][2]
    days_old = (now - latest_time) / 86400.0
    confidence = "low" if days_old > 7.0 else rows[0][3]

    return {
        "median_price": round(median, 2),
        "lowest_price": round(lowest_row[0], 2),
        "lowest_source": lowest_row[1],
        "days_old": round(days_old, 1),
        "confidence": confidence,
    }
