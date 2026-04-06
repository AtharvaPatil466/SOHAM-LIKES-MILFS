"""Basket analysis — frequently bought together.

Uses co-occurrence counting from order history.
"""

import json
from collections import Counter
from itertools import combinations
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _load_orders():
    try:
        with open(DATA_DIR / "mock_orders.json") as f:
            return json.load(f).get("customer_orders", [])
    except Exception:
        return []


def _load_inventory():
    try:
        with open(DATA_DIR / "mock_inventory.json") as f:
            return {item["sku"]: item for item in json.load(f)}
    except Exception:
        return {}


def compute_co_occurrences(min_support: int = 2) -> list[dict]:
    """Find product pairs frequently bought together."""
    orders = _load_orders()
    inv = _load_inventory()
    pair_counts: Counter = Counter()
    sku_counts: Counter = Counter()

    for order in orders:
        skus = list({item["sku"] for item in order.get("items", [])})
        for sku in skus:
            sku_counts[sku] += 1
        for pair in combinations(sorted(skus), 2):
            pair_counts[pair] += 1

    results = []
    for (sku_a, sku_b), count in pair_counts.most_common(50):
        if count < min_support:
            break
        # Calculate lift: P(A&B) / (P(A) * P(B))
        total_orders = len(orders) or 1
        p_ab = count / total_orders
        p_a = sku_counts.get(sku_a, 1) / total_orders
        p_b = sku_counts.get(sku_b, 1) / total_orders
        lift = p_ab / (p_a * p_b) if (p_a * p_b) > 0 else 0

        results.append({
            "product_a": {"sku": sku_a, "name": inv.get(sku_a, {}).get("product_name", sku_a)},
            "product_b": {"sku": sku_b, "name": inv.get(sku_b, {}).get("product_name", sku_b)},
            "co_occurrence_count": count,
            "lift": round(lift, 2),
            "confidence_a_then_b": round(count / max(sku_counts.get(sku_a, 1), 1) * 100, 1),
            "confidence_b_then_a": round(count / max(sku_counts.get(sku_b, 1), 1) * 100, 1),
        })

    results.sort(key=lambda x: x["lift"], reverse=True)
    return results


def get_recommendations_for(sku: str, top_n: int = 5) -> list[dict]:
    """Given a product, recommend what to buy with it."""
    all_pairs = compute_co_occurrences(min_support=1)
    _load_inventory()

    recommendations = []
    for pair in all_pairs:
        if pair["product_a"]["sku"] == sku:
            recommendations.append({
                "sku": pair["product_b"]["sku"],
                "product_name": pair["product_b"]["name"],
                "score": pair["lift"],
                "co_purchases": pair["co_occurrence_count"],
            })
        elif pair["product_b"]["sku"] == sku:
            recommendations.append({
                "sku": pair["product_a"]["sku"],
                "product_name": pair["product_a"]["name"],
                "score": pair["lift"],
                "co_purchases": pair["co_occurrence_count"],
            })

    recommendations.sort(key=lambda x: x["score"], reverse=True)
    return recommendations[:top_n]


def get_category_affinities(min_support: int = 2) -> list[dict]:
    """Find category pairs frequently bought together."""
    orders = _load_orders()
    inv = _load_inventory()
    pair_counts: Counter = Counter()
    cat_counts: Counter = Counter()

    for order in orders:
        categories = set()
        for item in order.get("items", []):
            sku = item.get("sku", "")
            cat = inv.get(sku, {}).get("category", "Other")
            categories.add(cat)
        for cat in categories:
            cat_counts[cat] += 1
        for pair in combinations(sorted(categories), 2):
            pair_counts[pair] += 1

    total = len(orders) or 1
    results = []
    for (cat_a, cat_b), count in pair_counts.most_common(30):
        if count < min_support:
            break
        p_ab = count / total
        p_a = cat_counts.get(cat_a, 1) / total
        p_b = cat_counts.get(cat_b, 1) / total
        lift = p_ab / (p_a * p_b) if (p_a * p_b) > 0 else 0
        results.append({
            "category_a": cat_a,
            "category_b": cat_b,
            "co_occurrence": count,
            "lift": round(lift, 2),
            "support": round(p_ab * 100, 1),
        })
    results.sort(key=lambda x: x["lift"], reverse=True)
    return results


def get_basket_summary() -> dict:
    """Get overall basket analysis summary stats."""
    orders = _load_orders()
    inv = _load_inventory()

    if not orders:
        return {"total_orders": 0, "avg_basket_size": 0, "avg_basket_value": 0}

    basket_sizes = []
    basket_values = []
    for order in orders:
        items = order.get("items", [])
        basket_sizes.append(len(items))
        basket_values.append(sum(item.get("total", item.get("qty", 1) * item.get("unit_price", 0)) for item in items))

    # Most common items
    item_freq: Counter = Counter()
    for order in orders:
        for item in order.get("items", []):
            item_freq[item.get("sku", "")] += 1

    top_items = []
    for sku, count in item_freq.most_common(10):
        name = inv.get(sku, {}).get("product_name", sku)
        top_items.append({"sku": sku, "name": name, "frequency": count, "pct_of_orders": round(count / len(orders) * 100, 1)})

    return {
        "total_orders": len(orders),
        "avg_basket_size": round(sum(basket_sizes) / len(basket_sizes), 1),
        "avg_basket_value": round(sum(basket_values) / len(basket_values), 2),
        "max_basket_size": max(basket_sizes),
        "single_item_orders_pct": round(sum(1 for s in basket_sizes if s == 1) / len(basket_sizes) * 100, 1),
        "top_items": top_items,
    }


def get_cross_sell_scores(cart_skus: list[str], top_n: int = 5) -> list[dict]:
    """Given current cart items, score potential cross-sell products.

    Uses weighted combination of co-occurrence across all cart items.
    """
    all_pairs = compute_co_occurrences(min_support=1)
    inv = _load_inventory()
    scores: dict[str, float] = {}

    for sku in cart_skus:
        for pair in all_pairs:
            if pair["product_a"]["sku"] == sku:
                other = pair["product_b"]["sku"]
                if other not in cart_skus:
                    scores[other] = scores.get(other, 0) + pair["lift"]
            elif pair["product_b"]["sku"] == sku:
                other = pair["product_a"]["sku"]
                if other not in cart_skus:
                    scores[other] = scores.get(other, 0) + pair["lift"]

    results = []
    for sku, score in sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_n]:
        product = inv.get(sku, {})
        results.append({
            "sku": sku,
            "product_name": product.get("product_name", sku),
            "category": product.get("category", ""),
            "price": product.get("unit_price", 0),
            "cross_sell_score": round(score, 2),
        })

    return results
