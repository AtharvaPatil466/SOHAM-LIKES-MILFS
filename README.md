# RetailOS — Autonomous Agent Runtime for Retail Operations

> "Most teams built agents. We built the runtime that runs them."

RetailOS is a persistent autonomous agent runtime that watches for events in a retail supermart and takes action without being asked. The owner's job is one tap: approve or reject.

## Architecture

```
┌─────────────────────────────────────────────┐
│              ORCHESTRATOR                    │
│  Event Loop → Gemini Routing → Skill Exec   │
│  Memory Context │ Audit Logging │ Retries   │
├───────┬───────┬───────┬───────┬─────────────┤
│ Inv.  │ Proc. │ Neg.  │ Cust. │ Analytics   │
│ Skill │ Skill │ Skill │ Skill │ Skill       │
└───────┴───────┴───────┴───────┴─────────────┘
    ↕       ↕       ↕       ↕        ↕
  [Mock]  [Gemini] [Gemini] [Gemini] [Gemini]
  [POS]   [API]   [WhatsApp][API]    [API]
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

Backend runs on `http://localhost:8000`, dashboard on `http://localhost:3000`.

Redis and PostgreSQL are optional — the system falls back to in-memory storage if they're unavailable.

## Skills

| Skill | What it does | Uses Gemini? |
|-------|-------------|-------------|
| Inventory | Polls stock, fires alerts based on sales velocity | No |
| Procurement | Ranks suppliers with reasoning | Yes |
| Negotiation | WhatsApp outreach, parses messy Hinglish replies | Yes (x2) |
| Customer | Segments customers, writes personalized offers | Yes |
| Analytics | Daily pattern analysis, feeds memory | Yes |

## Key API Endpoints

- `POST /api/demo/trigger-flow` — Trigger the ice cream demo
- `POST /api/demo/supplier-reply` — Simulate a supplier WhatsApp reply
- `GET /api/audit` — View the audit trail
- `GET /api/approvals` — Pending owner approvals
- `POST /api/approvals/approve` — One-tap approve
