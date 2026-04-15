![CI](https://github.com/AtharvaPatil466/Retailos/actions/workflows/ci.yml/badge.svg)
![Python](https://img.shields.io/badge/python-3.12%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)

# RetailOS — Autonomous Agent Runtime for Retail Operations

> Indian kirana stores do Rs.12 lakh crore in revenue but run on WhatsApp and gut instinct. RetailOS is an AI co-pilot that watches your store 24/7 and only asks you one question: **approve or reject.**

RetailOS is not a chatbot. It's a **persistent autonomous runtime** — an event-driven system that detects problems (low stock, unreliable suppliers, expiring products), decides what to do (rank suppliers, negotiate prices, target customers), and acts on it. The store owner just approves.

## The Demo Flow

```
Ice cream stock drops below threshold
        │
        ▼
  ┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
  │  Inventory   │────▶│ Procurement  │────▶│  Negotiation     │
  │  detects low │     │ ranks 3      │     │  drafts WhatsApp │
  │  stock       │     │ suppliers    │     │  message         │
  └─────────────┘     └──────┬───────┘     └────────┬────────┘
                             │                       │
                      Owner approves           Supplier replies
                       (one tap)            "bhai 450 final, kal
                             │                tak bhej do"
                             ▼                       │
                    ┌────────────────┐                ▼
                    │   Customer     │      ┌─────────────────┐
                    │   Skill sends  │◀─────│  Gemini parses  │
                    │   personalized │      │  Hinglish reply │
                    │   WhatsApp     │      │  into structured│
                    │   offers       │      │  deal data      │
                    └────────────────┘      └─────────────────┘
```

**Every decision is logged.** Every action is traceable. The audit trail is tamper-proof (SHA-256 hash chain).

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    ORCHESTRATOR                       │
│  Event Loop → Gemini Routing → Skill Execution       │
│  Circuit Breaker │ Flow Tracing │ Retry + Fallback   │
├────────┬────────┬────────┬────────┬──────────────────┤
│  Inv.  │ Proc.  │  Neg.  │ Cust.  │   Analytics      │
│ Skill  │ Skill  │ Skill  │ Skill  │   Skill          │
├────────┴────────┴────────┴────────┴──────────────────┤
│                    BRAIN LAYER                        │
│  Trust Scorer │ Demand Forecast │ Churn Detector     │
│  Price Analyzer │ Festival Detector │ Expiry Alerter │
├──────────────────────────────────────────────────────┤
│               RUNTIME INFRASTRUCTURE                  │
│  Memory (Redis + fallback) │ Audit (PostgreSQL)      │
│  Task Queue │ Approval Manager │ LLM Client          │
└──────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Backend
pip install -r requirements.txt
cp .env.example .env  # Add your GEMINI_API_KEY
python main.py

# Dashboard (separate terminal)
cd dashboard
npm install
npm run dev
```

Backend: `http://localhost:8000` | Dashboard: `http://localhost:3000`

Redis and PostgreSQL are optional — the system gracefully falls back to in-memory storage.

## Skills

| Skill | What it does | Gemini Calls |
|-------|-------------|:---:|
| **Inventory** | Monitors stock levels, calculates days-until-stockout, fires alerts based on sales velocity | 0 |
| **Procurement** | Ranks suppliers using price, reliability, trust scores, wastage data, and market intelligence | 1 |
| **Negotiation** | Drafts WhatsApp outreach, parses messy Hinglish supplier replies into structured deal data | 2 |
| **Customer** | Segments customers by purchase history, writes personalized WhatsApp offers, detects churn | 1 |
| **Analytics** | Daily pattern analysis across audit logs — insights feed back into memory for smarter future decisions | 1 |

## Brain Modules

Pure-math intelligence layer — no LLM calls, fully deterministic and testable.

| Module | What it does |
|--------|-------------|
| Trust Scorer | Weighted score (delivery 30% + quality 20% + approval rate 40% + price consistency 10%) |
| Demand Forecast | Holt's double exponential smoothing with weekly seasonality detection |
| Churn Detector | Purchase gap analysis — flags customers whose buying frequency is declining |
| Price Analyzer | Compares supplier quotes against market data, flags suspicious pricing |
| Festival Detector | Upcoming Indian festival detection with demand multipliers (config-driven) |
| Expiry Alerter | Predicts waste by comparing shelf life against sales velocity |

## Key Design Decisions

| Decision | Why |
|----------|-----|
| **Event-driven, not request-driven** | The system acts autonomously — it doesn't wait for someone to ask |
| **Gemini for routing, not just generation** | The orchestrator uses Gemini to decide *which skills to run*, not just to generate text |
| **Circuit breaker on LLM calls** | After 3 consecutive Gemini failures, falls back to rule-based routing for 60s — demo never hangs |
| **Tamper-proof audit trail** | SHA-256 hash chain — every entry links to the previous one. Modifying any entry breaks the chain |
| **Flow IDs for tracing** | Every event gets a UUID that propagates through the entire skill chain — trace any decision end-to-end |
| **Hinglish NLP as a feature** | Parsing "bhai 450 final, kal tak bhej do" is the hardest NLP problem here and the most demo-worthy |

## API Endpoints

| Method | Endpoint | What it does |
|--------|----------|-------------|
| `POST` | `/api/demo/trigger-flow` | Trigger the full ice cream restock demo |
| `POST` | `/api/demo/supplier-reply` | Simulate a supplier's WhatsApp reply |
| `GET` | `/api/audit` | View the tamper-proof audit trail |
| `GET` | `/api/audit/verify` | Verify hash chain integrity |
| `GET` | `/api/approvals` | List pending owner approvals |
| `POST` | `/api/approvals/approve` | One-tap approve |
| `POST` | `/api/approvals/reject` | Reject with reason |
| `POST` | `/api/events` | Push any event into the orchestrator |
| `GET` | `/api/inventory` | Current stock levels |
| `POST` | `/api/inventory/sale` | Record a sale |
| `WS` | `/ws/events` | Real-time event stream |

## Tech Stack

- **Runtime**: Python 3.12+, FastAPI, asyncio
- **LLM**: Google Gemini (with Ollama fallback for local dev)
- **Memory**: Redis (with in-memory fallback)
- **Database**: PostgreSQL for audit, SQLite for brain state
- **Dashboard**: React + Vite
- **Infra**: Docker, docker-compose, Kubernetes configs
- **CI**: GitHub Actions (pytest + ruff lint)

## Project Structure

```
retailos/
├── runtime/          # Core infrastructure
│   ├── orchestrator.py    # Event loop, Gemini routing, skill execution
│   ├── events.py          # Event type constants
│   ├── utils.py           # Shared utilities, circuit breaker
│   ├── audit.py           # Tamper-proof hash chain audit logger
│   ├── memory.py          # Redis + fallback memory layer
│   └── approval_manager.py
├── skills/           # Autonomous skill modules
│   ├── inventory.py       # Stock monitoring
│   ├── procurement.py     # Supplier ranking
│   ├── negotiation.py     # WhatsApp + Hinglish parsing
│   ├── customer.py        # Segmentation + offers
│   └── analytics.py       # Daily intelligence
├── brain/            # Deterministic intelligence layer
│   ├── trackers.py        # Decision, delivery, quality, message tracking
│   ├── trust_scorer.py    # Composite supplier trust score
│   ├── demand_forecast.py # Exponential smoothing forecaster
│   ├── churn_detector.py  # Customer churn detection
│   ├── festival_detector.py # Indian festival demand multipliers
│   └── price_analyzer.py  # Market price comparison
├── api/              # FastAPI routes
├── dashboard/        # React frontend
└── tests/            # 78 tests, all passing
```

## Running Tests

```bash
python -m pytest tests/ test_*.py -v
```

## License

MIT
