"""Event preprocessing and context enrichment.

Intercepts specific event types to log data into the brain subsystem,
trigger side-effect analyses (churn detection, expiry alerts, price monitoring),
and enrich events before they reach the main orchestrator routing.
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import Any, Callable, Awaitable

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent


async def preprocess_event(
    event: dict[str, Any],
    skills: dict,
    emit_event: Callable[[dict], Awaitable[None]],
) -> dict[str, Any] | None:
    """Preprocess an event before routing.

    Returns:
        None if the event was fully handled (no further routing needed).
        The original event dict if it should continue to Gemini routing.
    """
    event_type = event.get("type", "unknown")

    # Intercept delivery events → log into brain DB
    if event_type == "delivery":
        from brain.decision_logger import log_delivery
        data = event.get("data", {})
        log_delivery(
            data.get("supplier_id", ""),
            data.get("order_id", ""),
            data.get("expected_date", ""),
            data.get("actual_date", ""),
        )
        return None  # Fully handled

    # Intercept quality issues → log into brain DB
    if event_type == "quality_issue":
        from brain.decision_logger import log_quality_flag
        data = event.get("data", {})
        log_quality_flag(
            data.get("supplier_id", ""),
            data.get("order_id", ""),
            data.get("reason", ""),
        )
        return None  # Fully handled

    # Daily analytics → run churn detection, expiry alerts, price monitoring, scheduling
    if event_type == "daily_analytics":
        await _run_daily_analytics(skills, emit_event)
        # Don't return None — let analytics skill also run

    return event


async def _run_daily_analytics(
    skills: dict,
    emit_event: Callable[[dict], Awaitable[None]],
) -> None:
    """Run all daily background analyses."""

    # Churn detection
    try:
        mock_path = BASE_DIR / "data" / "mock_customers.json"
        with open(mock_path, "r") as f:
            customers = json.load(f)
        from brain.churn_detector import detect_at_risk_customers
        churn_events = detect_at_risk_customers(customers)
        for ce in churn_events:
            asyncio.create_task(emit_event(ce))
    except Exception as e:
        logger.error(f"Churn detection failed: {e}")

    # Expiry alerter
    try:
        inv_path = BASE_DIR / "data" / "mock_inventory.json"
        with open(inv_path, "r") as f:
            inventory_items = json.load(f)
        from brain.expiry_alerter import get_expiry_risks
        expiry_events = get_expiry_risks(inventory_items)
        for ee in expiry_events:
            asyncio.create_task(emit_event(ee))
    except Exception as e:
        logger.error(f"Expiry detection failed: {e}")

    # Competitor price monitoring
    try:
        from brain.price_monitor import fetch_agmarknet_prices
        inv_path = BASE_DIR / "data" / "mock_inventory.json"
        with open(inv_path, "r") as f:
            inv_items = json.load(f)
        sorted_items = sorted(inv_items, key=lambda x: x.get("daily_sales_rate", 0), reverse=True)
        top_20_skus = [i["sku"] for i in sorted_items[:20]]
        if top_20_skus:
            fetch_agmarknet_prices(top_20_skus)
    except Exception as e:
        logger.error(f"Price fetching failed: {e}")

    # Staff scheduling auto-review
    try:
        from datetime import date, timedelta
        tomorrow = date.today() + timedelta(days=1)
        if "scheduling" in skills:
            await skills["scheduling"].run({
                "type": "shift_review",
                "data": {"target_date": tomorrow.isoformat()},
            })
    except Exception as e:
        logger.error(f"Daily scheduling review failed: {e}")
