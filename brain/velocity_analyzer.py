# brain/velocity_analyzer.py
import json
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

# Velocity classification thresholds (units/day)
FAST_MOVER_THRESHOLD = 15
MODERATE_THRESHOLD = 5

# Zone fitness matrix: {zone_type: {classification: fitness_score}}
ZONE_FITNESS = {
    "high_traffic": {"fast_mover": 1.0, "moderate": 0.6, "slow_mover": 0.2},
    "refrigerated": {"fast_mover": 0.9, "moderate": 0.7, "slow_mover": 0.5},
    "freezer": {"fast_mover": 0.9, "moderate": 0.7, "slow_mover": 0.5},
    "standard": {"fast_mover": 0.3, "moderate": 0.8, "slow_mover": 0.9},
}


def _load_json(filename: str, default=None):
    try:
        with open(DATA_DIR / filename, "r") as f:
            return json.load(f)
    except Exception:
        return default if default is not None else []


def classify_velocity(velocity_score: float) -> str:
    """Classify a product by its daily sales velocity."""
    if velocity_score >= FAST_MOVER_THRESHOLD:
        return "fast_mover"
    elif velocity_score >= MODERATE_THRESHOLD:
        return "moderate"
    return "slow_mover"


def compute_zone_fitness(velocity_score: float, zone_type: str) -> float:
    """Return 0.0–1.0 fitness score for how well a product's velocity matches its zone."""
    classification = classify_velocity(velocity_score)
    zone_scores = ZONE_FITNESS.get(zone_type, ZONE_FITNESS["standard"])
    return zone_scores.get(classification, 0.5)


def get_velocity_data(sku: str | None = None) -> list[dict]:
    """Calculate 30-day sales velocity per SKU from orders + inventory fallback."""
    orders_data = _load_json("mock_orders.json", {"customer_orders": []})
    inventory = _load_json("mock_inventory.json", [])

    inv_map = {item["sku"]: item for item in inventory}

    # Count units sold per SKU in last 30 days
    cutoff = time.time() - (30 * 86400)
    sold_map: dict[str, int] = {}

    for order in orders_data.get("customer_orders", []):
        ts = order.get("timestamp", 0)
        if ts < cutoff:
            continue
        for item in order.get("items", []):
            item_sku = item.get("sku", "")
            sold_map[item_sku] = sold_map.get(item_sku, 0) + item.get("qty", 0)

    results = []
    all_skus = set(inv_map.keys()) | set(sold_map.keys())

    for s in sorted(all_skus):
        if sku and s != sku:
            continue

        inv = inv_map.get(s, {})
        total_sold = sold_map.get(s, 0)

        # Use order data if available, otherwise fall back to inventory daily_sales_rate
        if total_sold > 0:
            velocity = total_sold / 30.0
        else:
            velocity = inv.get("daily_sales_rate", 0)

        results.append({
            "sku": s,
            "product_name": inv.get("product_name", "Unknown"),
            "category": inv.get("category", ""),
            "velocity_score": round(velocity, 2),
            "classification": classify_velocity(velocity),
            "total_sold_30d": total_sold,
            "daily_sales_rate_inventory": inv.get("daily_sales_rate", 0),
        })

    return results


def get_velocity_report() -> dict:
    """Full velocity report with zone fitness scores and summary statistics."""
    velocity_data = get_velocity_data()
    shelf_data = _load_json("mock_shelf_zones.json", {"zones": []})

    # Build product-to-zone mapping
    product_zone_map: dict[str, dict] = {}
    for zone in shelf_data.get("zones", []):
        for product in zone.get("products", []):
            product_zone_map[product["sku"]] = {
                "zone_id": zone["zone_id"],
                "zone_name": zone["zone_name"],
                "zone_type": zone["zone_type"],
            }

    # Enrich velocity data with zone info and fitness
    enriched = []
    fitness_scores = []
    counts = {"fast_mover": 0, "moderate": 0, "slow_mover": 0}

    for item in velocity_data:
        zone_info = product_zone_map.get(item["sku"], {})
        zone_type = zone_info.get("zone_type", "")
        fitness = compute_zone_fitness(item["velocity_score"], zone_type) if zone_type else None

        enriched.append({
            **item,
            "current_zone_id": zone_info.get("zone_id"),
            "current_zone_name": zone_info.get("zone_name"),
            "current_zone_type": zone_type or None,
            "zone_fitness": round(fitness, 2) if fitness is not None else None,
        })

        counts[item["classification"]] += 1
        if fitness is not None:
            fitness_scores.append(fitness)

    avg_fitness = round(sum(fitness_scores) / len(fitness_scores), 2) if fitness_scores else 0

    return {
        "products": enriched,
        "summary": {
            "total_products": len(enriched),
            "fast_movers": counts["fast_mover"],
            "moderate": counts["moderate"],
            "slow_movers": counts["slow_mover"],
            "avg_zone_fitness": avg_fitness,
        },
    }
