# brain/footfall_analyzer.py
from datetime import datetime

from brain.db import get_connection, db_exists


def log_footfall(process_date: str, hour: int, customer_count: int, transaction_count: int, source: str = "pos_proxy"):
    """Captures hourly footfall entries into the database."""
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO footfall_logs (date, hour, customer_count, transaction_count, source)
               VALUES (?, ?, ?, ?, ?)""",
            (process_date, hour, customer_count, transaction_count, source),
        )


def get_footfall_pattern(day_of_week: int) -> dict:
    """Returns predictive customer load per hour based on historical day_of_week averages."""
    if not db_exists():
        return {h: 0.0 for h in range(24)}

    hourly_averages = {h: 0.0 for h in range(24)}

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT date, hour, customer_count FROM footfall_logs")
        rows = cursor.fetchall()

    hour_buckets = {h: [] for h in range(24)}
    for row in rows:
        try:
            row_date = datetime.strptime(row[0], "%Y-%m-%d").date()
            if row_date.weekday() == day_of_week:
                hour_buckets[row[1]].append(row[2])
        except ValueError:
            pass

    for h, counts in hour_buckets.items():
        if counts:
            hourly_averages[h] = sum(counts) / len(counts)

    return hourly_averages


def get_total_predicted_footfall(day_of_week: int) -> int:
    pattern = get_footfall_pattern(day_of_week)
    return int(sum(pattern.values()))
