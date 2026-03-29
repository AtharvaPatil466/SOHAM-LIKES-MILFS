# RetailOS — Quantified Business Impact Model

## Market Context

- India has **12 million kirana stores** generating ~60% of all retail sales
- These stores operate on thin margins (8-15%) with minimal technology adoption
- Stockouts and manual procurement are the two largest sources of lost revenue

---

## 1. Stockout Reduction (Inventory + Analytics Skills)

| Assumption | Value |
|---|---|
| Average stockout loss per store | ~₹8,000/month (2-3 key items × ₹3,000 each) |
| RetailOS reduction in stockouts | **25%** (AI-driven reorder alerts + velocity-based thresholds) |
| Savings per store per month | **₹2,000** |

**At scale:**
| Stores | Monthly Savings | Annual Savings |
|---|---|---|
| 100 | ₹2 lakh | ₹24 lakh |
| 1,000 | ₹20 lakh (₹2 crore/yr) | ₹2.4 crore |
| 10,000 | ₹2 crore | ₹24 crore |

### Why 25% is conservative
- RetailOS monitors stock in real time, fires alerts at configurable thresholds, and factors in daily sales velocity and seasonal patterns (via `brain/seasonal_detector.py` and `brain/reorder_optimizer.py`)
- Industry benchmarks: basic demand forecasting alone reduces stockouts by 20-30% (McKinsey Retail Practice, 2023)

---

## 2. Procurement Savings (Negotiation + Procurement Skills)

| Assumption | Value |
|---|---|
| Average restock order size | ₹15,000 |
| Price reduction via AI negotiation | **8-12%** (targeting 10% midpoint) |
| Savings per restock event | **₹1,500** (at 10%) |
| Restocks per store per month | 4 |
| Procurement savings per store/month | **₹6,000** |

**At scale:**
| Stores | Monthly Savings | Annual Savings |
|---|---|---|
| 100 | ₹6 lakh | ₹72 lakh |
| 1,000 | ₹60 lakh | ₹7.2 crore |
| 10,000 | ₹6 crore | ₹72 crore |

### How this works
- The Procurement skill ranks suppliers by price, reliability, and trust score (`brain/trust_scorer.py`)
- The Negotiation skill conducts autonomous WhatsApp-based conversations with suppliers, leveraging historical price data from `brain/price_monitor.py`
- `brain/auto_approver.py` auto-approves low-risk repeat orders, reducing cycle time

---

## 3. Waste Reduction (Expiry Alerter + Customer Skills)

| Assumption | Value |
|---|---|
| Monthly perishable waste per store | ₹3,000-5,000 |
| Reduction via expiry alerts + flash sales | **30%** |
| Savings per store/month | **₹1,200** |

- `brain/expiry_alerter.py` flags items approaching expiry
- The cascade chain automatically triggers targeted customer promotions (20% flash sales) to move expiring stock

---

## 4. Combined Impact Summary

| Lever | Per Store/Month | 1,000 Stores/Month | 1,000 Stores/Year |
|---|---|---|---|
| Stockout reduction | ₹2,000 | ₹20 lakh | ₹2.4 crore |
| Procurement savings | ₹6,000 | ₹60 lakh | ₹7.2 crore |
| Waste reduction | ₹1,200 | ₹12 lakh | ₹1.44 crore |
| **Total** | **₹9,200** | **₹92 lakh** | **₹11.04 crore** |

---

## Key Assumptions & Methodology

1. **Stockout loss estimate** (₹8,000/store/month): Based on CAIT/FICCI kirana surveys showing 15-20% demand goes unmet due to out-of-stock items
2. **Negotiation savings** (8-12%): Conservative vs. bulk procurement platforms (Udaan, JumboTail) which report 10-15% savings; our AI negotiation targets the lower bound
3. **Restock frequency** (4×/month): Standard for medium-sized kirana stores (weekly restock cycle)
4. **All figures in INR** at current prices; no inflation adjustment needed for Year 1 projections
