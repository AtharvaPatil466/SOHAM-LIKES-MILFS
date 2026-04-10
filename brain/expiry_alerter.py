# brain/expiry_alerter.py
import sqlite3
from datetime import date

from brain.db import get_connection, db_exists


def get_expiry_risks(inventory_items: list[dict], current_date: date | None = None) -> list[dict]:
    """Generates expiry_risk events for items likely to expire before selling out."""
    if current_date is None:
        current_date = date.today()

    metadata_map = {}
    if db_exists():
        with get_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT product_id, shelf_life_days, last_restock_date FROM product_metadata")
                for row in cursor.fetchall():
                    metadata_map[row[0]] = {"shelf_life_days": row[1], "last_restock_date": row[2]}
            except sqlite3.OperationalError:
                pass

    events = []
    for item in inventory_items:
        sku = item.get("sku")
        if not sku or sku not in metadata_map:
            continue

        meta = metadata_map[sku]
        shelf_life = meta["shelf_life_days"]
        restock_date_str = meta["last_restock_date"] or item.get("last_restock_date")

        if not shelf_life or not restock_date_str:
            continue

        try:
            restock_date = date.fromisoformat(restock_date_str)
        except ValueError:
            continue

        days_since_restock = (current_date - restock_date).days
        days_to_expiry = shelf_life - days_since_restock

        if days_to_expiry <= 0:
            continue

        current_stock = item.get("current_stock", 0)
        daily_rate = item.get("daily_sales_rate", 0)
        days_to_sellout = (current_stock / daily_rate) if daily_rate > 0 else float('inf')

        if days_to_sellout > days_to_expiry and days_to_expiry <= 10:
            expected_unsold = current_stock - (daily_rate * days_to_expiry)
            if expected_unsold > 0:
                events.append({
                    "type": "expiry_risk",
                    "data": {
                        "product_id": sku,
                        "product_name": item.get("product_name"),
                        "category": item.get("category"),
                        "days_to_expiry": days_to_expiry,
                        "current_stock": current_stock,
                        "expected_unsold": round(expected_unsold, 1),
                    },
                })

    return events
