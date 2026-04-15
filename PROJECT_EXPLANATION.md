# RetailOS Technical Project Manual

Generated directly from the repository `SOHAM LIKES MILFS`.

This document is meant to be a technical handover manual, not a product pitch. It describes how the project is structured, how the runtime behaves, what each agent-like module does, which persistence layers exist, how the API is organized, and which assets, tests, and configuration files are present in the current repository snapshot.

## 1. How to read this manual

This project mixes a normal backend application with an autonomous runtime. That means there are two equally important ways to understand it:

- as a retail operations platform with APIs, database models, reporting, auth, payments, notifications, and a dashboard;
- as an event-driven runtime that routes operational events into specialized skill modules, keeps memory, creates approvals, and records audit logs.

In the codebase, the word "agent" mostly maps to a skill module plus the shared orchestrator that invokes it. This is not a swarm of isolated microservices. It is one Python application process hosting multiple skill objects that share:

- one orchestrator;
- one audit logger;
- one runtime memory layer;
- one approval system;
- one task queue;
- one HTTP application surface.

## 2. System at a glance

RetailOS is a hybrid retail stack. It combines:

- a FastAPI backend with a large operational API surface;
- an event queue plus orchestrator for autonomous decision routing;
- a plugin-like skills directory that contains the agent behaviors;
- a brain subsystem with heuristics, scoring, forecasting, and domain analytics;
- multiple persistence styles: SQLAlchemy tables, JSON fixtures, Redis-style runtime memory, SQLite data files, and optional PostgreSQL audit storage;
- a Vite + React dashboard acting as the operator cockpit.

The project currently contains approximately:

- 159 first-party Python files outside tooling and dependency folders;
- 259 detected HTTP route decorators;
- 26 relational model classes in `db/models.py`;
- 23 dashboard components under `dashboard/src/components`;
- 7 loadable skill modules: analytics, customer, inventory, negotiation, procurement, scheduling, shelf_manager;
- 36 environment variables documented in `.env.example`;
- 16 artifacts inside `data/`;
- 246 discovered test functions across `tests/`, `e2e/`, and root-level `test_*.py` files.

## 3. Repository shape and hotspots

The main top-level directories have clear responsibilities:

- `main.py`: process entrypoint and runtime bootstrap.
- `api/`: the largest HTTP feature surface.
- `runtime/`: orchestrator, memory, task queue, audit, logging, and related plumbing.
- `skills/`: the "agents" that do work after routing.
- `brain/`: heuristics, scoring, forecasting, and analytics helpers.
- `db/`: SQLAlchemy schema and session setup.
- `auth/`: JWT auth, RBAC, privacy, and encryption helpers.
- `notifications/`, `reports/`, `payments/`, `scheduler/`: supporting operational subsystems.
- `dashboard/`: frontend workspace.
- `tests/`, `e2e/`, and root `test_*.py`: automated verification.

The route-heavy files in the current repository are:

- `api/routes.py`: 67 routes
- `api/vendor_routes.py`: 12 routes
- `reports/routes.py`: 11 routes
- `api/compliance_routes.py`: 10 routes
- `api/ml_routes.py`: 10 routes
- `api/udhaar_routes.py`: 8 routes

The largest Python files in the current repository are:

- `api/routes.py`: about 2498 lines
- `scripts/generate_project_explainer.py`: about 1585 lines
- `tests/test_brain_modules.py`: about 558 lines
- `db/models.py`: about 508 lines
- `skills/shelf_manager.py`: about 447 lines
- `reports/generators.py`: about 443 lines

Those hotspot files matter because they define where the project has the most surface area and where future refactors are most likely to pay off.

## 4. Startup, runtime boot, and process lifecycle

The backend enters through `main.py`. The startup path is:

1. Load environment variables with `dotenv`.
2. Configure logging with `runtime.logging_config.setup_logging()`.
3. Create a `Memory` instance using Redis if available, with in-memory fallback when Redis is missing.
4. Create an `AuditLogger`, preferring PostgreSQL through `asyncpg` and falling back to an in-process list if no database is available.
5. Discover skill modules from `skills/` through `runtime.skill_loader.SkillLoader`.
6. Instantiate the `Orchestrator` with memory, audit, skills, and the unified LLM client.
7. Start the task queue worker pool and the orchestrator event loop.
8. Seed demo memory with supplier history and a daily summary.
9. Build the FastAPI application by calling `api.routes.create_app(orchestrator)`.
10. Store runtime references on `app.state` so the HTTP layer can inspect runtime state and later shut it down.

The important architectural point is that the API is built around a live runtime object. The web server is not just serving CRUD routes; it is serving on top of an already-started autonomous runtime.

## 5. Runtime architecture in detail

### 5.1 Orchestrator

`runtime/orchestrator.py` is the runtime core. It is responsible for:

- accepting events through an async queue;
- preprocessing some event types before normal routing;
- fetching targeted memory context for the incoming event;
- asking the LLM which skills to run;
- falling back to rule-based routing if the LLM fails;
- executing one or more skills;
- interpreting approval-oriented skill outputs;
- emitting follow-up events after approval;
- writing audit records for routing, execution, errors, and ownership decisions.

The effective event lifecycle is:

1. An event enters the queue through `emit_event()`.
2. `_event_loop()` dequeues it.
3. `_process_event()` validates shape and calls `preprocess_event()`.
4. `Memory.get_relevant()` resolves event-specific memory keys.
5. `_route_with_gemini()` decides which skills should act.
6. `_execute_skill()` invokes each selected skill and interprets its result.
7. If a skill says `needs_approval`, the approval is stored instead of auto-committing the action.
8. If an owner approves later, the configured `on_approval_event` is emitted back into the runtime.

This is the single most important behavior in the system. The runtime is intentionally not fully autonomous. It is autonomy with explicit review gates.

### 5.2 Unified LLM client

`runtime/llm_client.py` abstracts the model provider. The code supports:

- Gemini via `google-genai`, using `GEMINI_API_KEY` and `GEMINI_MODEL`;
- Ollama via HTTP, using `OLLAMA_BASE_URL` and `OLLAMA_MODEL`.

This abstraction matters because the same runtime code can run:

- against a hosted model for richer demo behavior;
- against a local model for offline or cheaper experimentation.

The LLM is used at several distinct points:

- orchestrator action routing;
- procurement ranking;
- negotiation outreach drafting and supplier reply parsing;
- customer message generation;
- analytics summarization;
- schedule report formatting;
- shelf optimization suggestions.

Wherever possible, the project also keeps a fallback path so the system still behaves coherently when model access fails.

### 5.3 Base skill contract

All agents in the runtime inherit from `skills/base_skill.py`. The shared contract includes:

- a `name`;
- a lifecycle state (`initializing`, `running`, `paused`, `error`, `stopped`);
- `init()` for startup loading;
- `run(event)` for the actual work;
- `pause()` and `resume()` for operator control;
- `_safe_run()` to track run counts and errors;
- an emit callback for pushing new events back into the orchestrator.

This is important because the runtime is not dispatching arbitrary functions. It dispatches stateful objects with a clear lifecycle and a consistent interface.

### 5.4 Skill result contract

The orchestrator expects business results shaped as plain dictionaries. Several skills return an approval-oriented contract with fields like:

- `needs_approval`;
- `approval_id`;
- `approval_reason`;
- `approval_details`;
- `on_approval_event`.

That implicit contract is the backbone of the human-in-the-loop design. In practice it means a skill can complete analysis and still defer the actual commitment until a person approves the next event.

### 5.5 Runtime memory

`runtime/memory.py` is a Redis-first key-value layer with an in-process dictionary fallback. It is not vector search and not a semantic store. It is curated operational memory.

The current event-to-memory mapping is:

- `customer_offer` pulls: `customer:*:purchases`, `customer:*:last_offer`
- `daily_analytics` pulls: `orchestrator:daily_summary`, `supplier:*:history`, `product:*:restock_history`
- `low_stock` pulls: `product:{sku}:restock_history`, `supplier:*:history`, `orchestrator:daily_summary`
- `procurement_needed` pulls: `supplier:*:history`, `orchestrator:daily_summary`
- `shelf_optimization` pulls: `shelf:*:placement_history`, `orchestrator:daily_summary`
- `shelf_placement_approved` pulls: `shelf:*:placement_history`
- `supplier_reply` pulls: `supplier:{supplier_id}:history`, `product:{sku}:restock_history`

This shows the design philosophy clearly: prompts are composed from narrow business context rather than dumping broad history into the model every time.

### 5.6 Audit chain

`runtime/audit.py` records every meaningful runtime action with fields such as:

- id;
- timestamp;
- skill;
- event type;
- decision;
- reasoning;
- outcome;
- status;
- metadata.

Each entry is chained with a SHA-256 hash using `previous_hash` and `hash`. That turns the audit log into a tamper-evident sequence. The project also exposes verification endpoints so the dashboard or an operator can verify chain integrity.

### 5.7 Approvals

`runtime/approval_manager.py` persists pending approvals using Redis-backed memory with a fallback dictionary. An approval can be:

- saved;
- listed;
- approved, which deletes the pending record and emits the follow-up event;
- rejected, which deletes the pending record and optionally clears temporary state such as shelf suggestions.

Approvals also write audit entries and, for supplier-related actions, push structured signals into the brain decision log.

### 5.8 Task queue

`runtime/task_queue.py` provides background execution with:

- async workers;
- queue persistence in Redis when available;
- result tracking;
- retries with exponential backoff;
- queue stats for runtime inspection.

This lets the orchestrator offload expensive work without blocking the HTTP request path or the main event loop.

### 5.9 Event preprocessing

`runtime/context_builder.py` intercepts some events before normal routing:

- `delivery` events are written into the brain decision log;
- `quality_issue` events are also written into the brain store;
- `daily_analytics` triggers side-effect analyses for churn, expiry, market price fetches, and schedule review before the analytics skill runs.

This is effectively a pre-routing policy layer.

## 6. Agent and skill deep dive

The runtime loads these skill modules dynamically. Each one is a concrete "agent" in the product story.

### 6.1 Inventory agent

File: `skills/inventory.py`

Purpose:
- monitor stock levels;
- detect low-stock and expiry risk;
- update product state;
- emit stock-related follow-up events.

Primary input events:
- `stock_update`;
- `inventory_check`;
- `expiry_risk`.

Primary side effects:
- reads and writes `data/mock_inventory.json`;
- logs movements through `brain.wastage_tracker`;
- creates low-stock alerts and audit records;
- emits `low_stock` events back into the orchestrator;
- creates a restock approval whose follow-up event is `start_procurement`.

Important internal methods:
- `__init__`, `init`, `run`, `_find_item`, `_normalize_item`, `_save_inventory`, `_check_item`, `get_full_inventory`, `update_stock`, `register_product`, `patch_item`, `record_sale`

Operationally, this skill is the front door into the autonomous chain. It is mostly deterministic. It calculates thresholds and days-to-stockout, and then hands the higher-level decision-making over to the procurement flow.

### 6.2 Procurement agent

File: `skills/procurement.py`

Purpose:
- find matching suppliers;
- enrich supplier selection with wastage, pricing, and trust context;
- ask the LLM to rank suppliers;
- store the ranking in memory;
- generate an approval for the top recommendation.

Inputs and context sources:
- product name, SKU, category, daily sales rate, lead time;
- `brain.reorder_optimizer` for optimized order quantity;
- `brain.price_monitor` and `brain.price_analyzer` for market intelligence;
- supplier history from runtime memory;
- trust context from `brain.context_builder`.

Primary output:
- ranking payload with `ranked_suppliers` and `overall_reasoning`;
- approval metadata;
- follow-up event `procurement_approved`.

Important internal methods:
- `__init__`, `init`, `run`, `_find_suppliers`, `_rank_with_gemini`, `_fallback_ranking`

This agent is where the project blends rule-based retail logic with model reasoning most explicitly. The model is not working from scratch; it is given curated context and a strongly structured JSON response contract.

### 6.3 Negotiation agent

File: `skills/negotiation.py`

Purpose:
- draft WhatsApp outreach to the best supplier;
- parse inbound supplier replies, including partial and Hinglish replies;
- request clarification if critical fields are missing;
- produce a structured deal for approval;
- persist short-term negotiation state.

Primary input events:
- `procurement_approved`;
- `supplier_reply`;
- `mock_supplier_reply`.

Primary runtime state:
- `active_negotiations`;
- `message_log`.

Primary follow-up behavior:
- if the supplier reply is incomplete, send clarification;
- if the reply is complete enough, generate an approval and later emit `deal_confirmed`.

Important internal methods:
- `__init__`, `init`, `run`, `_start_negotiation`, `_handle_reply`, `_get_thread`, `_draft_outreach`, `_template_outreach`, `_parse_reply`, `_fallback_parse`, `_draft_clarification`, `handle_timeout`

This is the most NLP-heavy agent in the repository. It converts messy human language into structured commercial terms and keeps the conversation thread tied to a negotiation identifier.

### 6.4 Customer outreach agent

File: `skills/customer.py`

Purpose:
- segment customers for outreach;
- write personalized WhatsApp-style offers;
- track message variants and conversions;
- store last-offer memory;
- handle churn-risk re-engagement.

Primary input patterns:
- downstream of a confirmed deal or targeted offer;
- direct `churn_risk` events from the daily analytics preprocessor.

Segmentation logic includes:
- repeated purchases in the relevant category over the last 90 days;
- no recent offer for that category in the last 7 days;
- explicit WhatsApp opt-in.

Important internal methods:
- `__init__`, `init`, `run`, `_segment_customers`, `_write_message`, `_template_message`, `_detect_template`, `_handle_churn_risk`, `_write_reengage_message`

The customer agent is a downstream monetization agent. It turns operational opportunities into targeted messaging based on real purchase history instead of generic campaigns.

### 6.5 Analytics agent

File: `skills/analytics.py`

Purpose:
- read recent audit history and inventory state;
- ask the model to identify patterns and recommendations;
- write a daily summary into runtime memory;
- trigger `brain.insight_writer` to persist insight artifacts.

Important internal methods:
- `__init__`, `init`, `run`, `_get_inventory_summary`, `_analyze`, `_fallback_analysis`

This agent closes the loop. Its output becomes future routing context, which means the system is meant to learn from what happened recently, at least in a lightweight operational-memory sense.

### 6.6 Scheduling agent

File: `skills/scheduling.py`

Purpose:
- review staffing adequacy for a target date;
- format a manager-readable schedule recommendation;
- require approval before any schedule-related follow-up.

Primary input events:
- `shift_review`;
- `festival_alert`.

Key dependency:
- `brain.shift_optimizer.calculate_adequacy`.

Primary output:
- a formatted markdown report;
- an approval with follow-up event `schedule_approved`.

Important internal methods:
- `__init__`, `init`, `run`, `_format_am_pm`, `_build_raw_fallback`, `_review_shifts`

This agent shows that the runtime is not limited to suppliers and customers. It extends the autonomy pattern to physical-store staffing.

### 6.7 Shelf optimization agent

File: `skills/shelf_manager.py`

Purpose:
- inspect shelf placement versus velocity and zone fitness;
- generate AI suggestions or fall back to rules;
- validate physical constraints such as cold-chain placement and slot capacity;
- persist suggestions to the shelf data file;
- require approval before applying moves.

Primary follow-up event:
- `shelf_placement_approved`.

Important internal methods:
- `__init__`, `init`, `_persist_shelf_data`, `clear_suggestions`, `run`, `_run_optimization`, `_optimize_with_gemini`, `_fallback_suggestions`, `_validate_suggestions`, `_apply_approved_moves`

This agent blends operational data, physical constraints, and model-generated reasoning. It is one of the clearest examples of the project trying to bridge digital analytics with in-store action.

## 7. The brain subsystem

The `brain/` folder is a library of retail intelligence helpers rather than one monolithic engine. It provides the heuristics and analytical signals that the runtime skills consume.

The major clusters are:

- supplier trust and decision logging:
  `decision_logger.py`, `trust_scorer.py`, `auto_approver.py`, `quality_scorer.py`, `delivery_tracker.py`;
- pricing and procurement intelligence:
  `price_monitor.py`, `price_analyzer.py`, `dynamic_pricer.py`, `reorder_optimizer.py`;
- demand and forecasting:
  `demand_forecast.py`, `demand_forecaster.py`, `festival_detector.py`, `seasonal_detector.py`, `footfall_analyzer.py`;
- customer and marketing intelligence:
  `churn_detector.py`, `basket_analyzer.py`, `conversion_scorer.py`, `message_tracker.py`, `insight_writer.py`;
- inventory and shelf intelligence:
  `expiry_alerter.py`, `velocity_analyzer.py`, `wastage_tracker.py`, `shelf_audit.py`;
- operator interaction helpers:
  `recipe_assistant.py`, `voice_input.py`.

The existence of this folder is one of the key reasons the repo feels broader than a simple CRUD app. The runtime skills are not reasoning in a vacuum. They are calling into a large set of domain-specific helpers.

## 8. API architecture and HTTP surface

The HTTP layer is composed in `api.routes.create_app()`, but the project is intentionally only partially modular. There is a very large route aggregation file plus many feature-specific routers.

### 8.1 Central composition root

`api/routes.py` handles:

- app creation and metadata;
- middleware registration;
- scheduler startup;
- websocket registration;
- many core routes directly inside the same file.

This file still contains a large percentage of the operational surface itself, including:

- runtime and skill status;
- inventory and sales flows;
- store profile and customer assistant config;
- orders, customers, udhaar, returns, and supplier payments;
- daily summaries and GST summaries;
- voice parsing and customer assistant operations;
- delivery and shelf-zone endpoints;
- approvals, audit, negotiations, analytics triggers, demo flows, alerts, and websocket endpoints.

### 8.2 Specialized routers

The dedicated router files cover a broad business surface:

- auth and role management;
- analytics and benchmarking;
- assistant/chat flows;
- backup/export operations;
- compliance, consent, export, erasure, and breach reporting;
- offline sync;
- payments, refunds, and webhooks;
- POS hardware helpers;
- promotions;
- push, SMS, WhatsApp, digest, and voice integrations;
- returns and vendor purchase-order workflows;
- loyalty;
- mobile-specific helpers;
- scheduler inspection and health endpoints.

The codebase therefore has both a platform API and a runtime API layered together.

## 9. Persistence model

The project uses several persistence styles at once.

### 9.1 Relational data model

`db/models.py` defines a broad schema covering users, stores, products, customers, orders, returns, delivery requests, staff, shelves, notifications, promotions, loyalty, purchase orders, and audit logs.

This relational model is the strongest sign that the project aims beyond a throwaway demo. The schema is large enough to support multi-domain retail workflows.

### 9.2 JSON-backed demo storage

Several routes and skills still read and write directly from `data/*.json` files such as inventory, suppliers, customers, orders, udhaar, returns, and shelf zones.

That design has clear consequences:

- the app stays very demo-friendly and easy to run locally;
- some flows are file-backed rather than database-backed;
- the project behaves partly like a prototype sandbox and partly like a structured application.

### 9.3 Runtime and analytical state

Runtime state is spread across:

- Redis-style memory for approvals, cached context, and task results;
- PostgreSQL or fallback in-process audit storage;
- SQLite files under `data/`, especially for the brain subsystem and local app data.

This polyglot persistence model is important to understand before extending the project. Not every feature is sourced from the same storage layer.

## 10. Environment and configuration model

The configuration system in `config/settings.py` defines three runtime profiles:

- development: SQLite defaults, human logs, permissive CORS, docs enabled, single worker;
- staging: PostgreSQL defaults, JSON logs, tighter CORS, docs still enabled;
- production: PostgreSQL defaults, JSON logs, stricter CORS, docs disabled.

The repository-level `.env.example` currently documents variables for:

- environment selection;
- Gemini and server port;
- database and Redis;
- auth and JWT expiry;
- SMTP;
- SMS providers;
- WhatsApp;
- Razorpay;
- Sentry;
- encryption;
- Tally;
- web push VAPID;
- logging.

This is more than a local demo `.env`; it is already shaped like a deployment-oriented configuration surface.

## 11. Security, privacy, and authorization

The auth stack includes:

- password hashing through `passlib`/bcrypt;
- JWT auth with role-aware dependencies;
- middleware-level RBAC enforcement;
- security headers and request logging;
- data privacy helpers and field encryption;
- DPDP-style compliance routes for consent, export, erasure, and breach handling.

The role hierarchy is owner > manager > staff > cashier. That hierarchy appears both in route-level authorization logic and in how the UI and runtime approvals are meant to be consumed.

## 12. Notifications, reporting, payments, and operations support

Outside the core runtime, the project includes several ERP-like support systems:

- notifications: push, SMS, WhatsApp, email digests, and in-app records;
- reporting: PDF and Excel generators, GST reports, invoice generation, and daily summaries;
- payments: Razorpay order creation and verification, offline payments, refunds, and payment history;
- scheduler: recurring checks for expiry, low stock, and udhaar reminders;
- integrations: POS hardware helpers and Tally synchronization.

These are not side notes. They are part of why the project feels like a full operations platform instead of a narrow AI demo.

## 13. Frontend architecture

The dashboard in `dashboard/` is a Vite + React single-app workspace. The current frontend architecture is shaped by:

- one large `App.jsx` controlling tab selection and data loading;
- polling plus WebSocket updates;
- localStorage-backed auth token handling;
- an offline-sync hook that queues mutations;
- many tab-oriented workspace components rather than route-based pages.

The visible workspace is broad. It includes tabs and panels for:

- overview;
- approvals;
- activity;
- agents;
- inventory;
- cart;
- suppliers;
- customers;
- orders;
- financials;
- shelves;
- delivery queue;
- customer assistant;
- staff;
- payments;
- loyalty;
- barcode scanning;
- voice assistant.

The UI is therefore positioned as an operator cockpit rather than a minimal admin panel.

## 14. Offline sync and real-time behavior

The project explicitly supports unstable connectivity scenarios.

The offline pipeline is split between:

- `dashboard/src/useOfflineSync.js`, which queues client-side mutations in localStorage, pushes them when online, and periodically pulls changes;
- `api/offline_sync.py`, which accepts queued operations, tracks idempotency, and serves changed entities since the last sync.

Separately, the realtime layer is handled through WebSockets:

- a legacy events socket;
- a dashboard socket with JWT auth and channel subscriptions;
- backend channel management in `api/websocket_manager.py`.

Together, that means the dashboard is designed to stay useful both when the network is weak and when realtime updates matter.

## 15. Representative end-to-end flows

### 15.1 Low stock to supplier negotiation

1. Inventory changes or an explicit stock check event occurs.
2. The inventory agent detects a low-stock condition.
3. The runtime records an audit entry and creates a restock approval.
4. When approved, the runtime emits `start_procurement`.
5. The procurement agent ranks suppliers using wastage, trust, and market context.
6. Procurement generates another approval and, after approval, emits `procurement_approved`.
7. The negotiation agent drafts supplier outreach.
8. Supplier replies are parsed.
9. If details are missing, the negotiation agent drafts clarification.
10. If a deal is usable, the runtime creates a deal approval.
11. Once approved, the runtime emits `deal_confirmed`.
12. Downstream customer outreach or other business actions can follow.

This is the flagship flow for understanding the project.

### 15.2 Daily analytics loop

1. A `daily_analytics` event enters the runtime.
2. The preprocessor triggers churn detection, expiry detection, price fetches, and schedule review.
3. The analytics agent inspects recent audit history and inventory state.
4. The resulting summary and recommendations are written into runtime memory.
5. Future orchestrator prompts can use that stored summary as context.

This is the closest thing the project has to a continuous learning loop.

### 15.3 Shelf optimization

1. A shelf optimization request is triggered from the UI or runtime.
2. The shelf agent loads zone layout and velocity reports.
3. The LLM or fallback heuristic proposes moves.
4. Constraint validation checks slot capacity and cold-chain rules.
5. Suggestions are persisted to the shelf data file.
6. Approval is required before applying moves.
7. Approved moves are written back to the shelf layout.

### 15.4 Counter sale and operational updates

1. An inventory sale or order update arrives through the API.
2. Inventory state changes.
3. Related domain data such as GST, customer history, or udhaar can also update.
4. Dashboard views can refresh through polling or WebSocket channels.
5. Subsequent low-stock and analytics logic can consume the updated state.

## 16. Testing and verification posture

The automated coverage spans:

- API behavior;
- async runtime flows;
- auth and roles;
- middleware;
- encryption;
- models and business logic;
- forecasting and brain modules;
- promotions;
- GST reporting;
- Tally integration;
- WebSocket behavior;
- root-level feature tests for pricing, trust, inventory, customer flows, scheduling, and end-to-end day scenarios;
- Playwright-based E2E coverage in `e2e/`.

This breadth matters because it shows the repository is not only feature-rich; it also has an explicit verification story across multiple layers.

## 17. Deployment and operations assets

The repository contains several deployment paths:

- `Dockerfile` and `docker-compose.yml` for containerized runs;
- Kubernetes manifests under `k8s/`;
- `Procfile`, `render.yaml`, and `railway.json` for PaaS deployment styles;
- Alembic migrations for schema evolution;
- load-testing assets under `loadtest/`.

This suggests the project is intended to be runnable in different environments, not only from a local `python main.py`.

## 18. Architectural character and tradeoffs

The defining strengths of the project are:

- breadth of business surface;
- a clear human-in-the-loop runtime model;
- explainability through audit logs and approvals;
- strong demoability through JSON-backed local data;
- a meaningful separation between orchestration, skills, and domain heuristics.

The defining tradeoffs are:

- persistence is intentionally hybrid, which increases cognitive load;
- the API surface is broad enough that some files have become very large;
- some features are database-backed while others are fixture-backed;
- the runtime and web layers are tightly coupled at startup.

None of those tradeoffs are hidden in the code. They are part of the architecture's current identity.

## 19. Appendix A: relational model field inventory

### `User`
- Table: `users`
- Field count: 11
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `username`: `Mapped[str]` -> `mapped_column(String(80), unique=True, nullable=False, index=True)`
  `email`: `Mapped[str]` -> `mapped_column(String(255), unique=True, nullable=False, index=True)`
  `password_hash`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `full_name`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `role`: `Mapped[str]` -> `mapped_column(String(20), nullable=False, default='staff')`
  `phone`: `Mapped[Optional[str]]` -> `mapped_column(String(20))`
  `is_active`: `Mapped[bool]` -> `mapped_column(Boolean, default=True)`
  `store_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('stores.id'))`
  `created_at`: `Mapped[float]` -> `mapped_column(Float, default=_now)`
  `last_login`: `Mapped[Optional[float]]` -> `mapped_column(Float)`
- Relationships: none

### `StoreProfile`
- Table: `stores`
- Field count: 8
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `store_name`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `phone`: `Mapped[Optional[str]]` -> `mapped_column(String(20))`
  `address`: `Mapped[Optional[str]]` -> `mapped_column(Text)`
  `gstin`: `Mapped[Optional[str]]` -> `mapped_column(String(20))`
  `hours_json`: `Mapped[Optional[str]]` -> `mapped_column(Text)`
  `holiday_note`: `Mapped[Optional[str]]` -> `mapped_column(Text)`
  `created_at`: `Mapped[float]` -> `mapped_column(Float, default=_now)`
- Relationships: none

### `Product`
- Table: `products`
- Field count: 16
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `sku`: `Mapped[str]` -> `mapped_column(String(30), unique=True, nullable=False, index=True)`
  `product_name`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `category`: `Mapped[str]` -> `mapped_column(String(100), nullable=False, default='')`
  `image_url`: `Mapped[Optional[str]]` -> `mapped_column(Text)`
  `barcode`: `Mapped[Optional[str]]` -> `mapped_column(String(50), index=True)`
  `current_stock`: `Mapped[int]` -> `mapped_column(Integer, default=0)`
  `reorder_threshold`: `Mapped[int]` -> `mapped_column(Integer, default=0)`
  `daily_sales_rate`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `unit_price`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `cost_price`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `shelf_life_days`: `Mapped[Optional[int]]` -> `mapped_column(Integer)`
  `last_restock_date`: `Mapped[Optional[str]]` -> `mapped_column(String(20))`
  `store_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('stores.id'))`
  `is_active`: `Mapped[bool]` -> `mapped_column(Boolean, default=True)`
  `created_at`: `Mapped[float]` -> `mapped_column(Float, default=_now)`
- Relationships: none

### `Customer`
- Table: `customers`
- Field count: 10
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `customer_code`: `Mapped[str]` -> `mapped_column(String(20), unique=True, nullable=False, index=True)`
  `name`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `phone`: `Mapped[str]` -> `mapped_column(String(20), unique=True, nullable=False, index=True)`
  `email`: `Mapped[Optional[str]]` -> `mapped_column(String(255))`
  `whatsapp_opted_in`: `Mapped[bool]` -> `mapped_column(Boolean, default=False)`
  `last_offer_timestamp`: `Mapped[Optional[float]]` -> `mapped_column(Float)`
  `last_offer_category`: `Mapped[Optional[str]]` -> `mapped_column(String(100))`
  `store_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('stores.id'))`
  `created_at`: `Mapped[float]` -> `mapped_column(Float, default=_now)`
- Relationships: none

### `PurchaseHistoryEntry`
- Table: `purchase_history`
- Field count: 7
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `customer_id`: `Mapped[str]` -> `mapped_column(String(36), ForeignKey('customers.id'), index=True)`
  `product`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `category`: `Mapped[str]` -> `mapped_column(String(100), default='')`
  `quantity`: `Mapped[int]` -> `mapped_column(Integer, default=1)`
  `price`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `timestamp`: `Mapped[float]` -> `mapped_column(Float, default=_now)`
- Relationships: none

### `Supplier`
- Table: `suppliers`
- Field count: 17
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `supplier_id`: `Mapped[str]` -> `mapped_column(String(20), unique=True, nullable=False, index=True)`
  `supplier_name`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `contact_phone`: `Mapped[Optional[str]]` -> `mapped_column(String(20))`
  `whatsapp_number`: `Mapped[Optional[str]]` -> `mapped_column(String(20))`
  `products_json`: `Mapped[Optional[str]]` -> `mapped_column(Text)`
  `categories_json`: `Mapped[Optional[str]]` -> `mapped_column(Text)`
  `price_per_unit`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `reliability_score`: `Mapped[float]` -> `mapped_column(Float, default=3.0)`
  `delivery_days`: `Mapped[int]` -> `mapped_column(Integer, default=7)`
  `min_order_qty`: `Mapped[int]` -> `mapped_column(Integer, default=1)`
  `payment_terms`: `Mapped[Optional[str]]` -> `mapped_column(String(100))`
  `location`: `Mapped[Optional[str]]` -> `mapped_column(String(255))`
  `notes`: `Mapped[Optional[str]]` -> `mapped_column(Text)`
  `is_active`: `Mapped[bool]` -> `mapped_column(Boolean, default=True)`
  `store_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('stores.id'))`
  `created_at`: `Mapped[float]` -> `mapped_column(Float, default=_now)`
- Relationships: none

### `Order`
- Table: `orders`
- Field count: 13
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `order_id`: `Mapped[str]` -> `mapped_column(String(30), unique=True, nullable=False, index=True)`
  `customer_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('customers.id'))`
  `customer_name`: `Mapped[Optional[str]]` -> `mapped_column(String(255))`
  `phone`: `Mapped[Optional[str]]` -> `mapped_column(String(20))`
  `total_amount`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `gst_amount`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `discount_amount`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `status`: `Mapped[str]` -> `mapped_column(String(30), default='pending')`
  `payment_method`: `Mapped[str]` -> `mapped_column(String(30), default='Cash')`
  `source`: `Mapped[str]` -> `mapped_column(String(30), default='counter')`
  `store_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('stores.id'))`
  `timestamp`: `Mapped[float]` -> `mapped_column(Float, default=_now)`
- Relationships: none

### `OrderItem`
- Table: `order_items`
- Field count: 7
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `order_id`: `Mapped[str]` -> `mapped_column(String(36), ForeignKey('orders.id'), index=True)`
  `sku`: `Mapped[str]` -> `mapped_column(String(30), nullable=False)`
  `product_name`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `qty`: `Mapped[int]` -> `mapped_column(Integer, default=1)`
  `unit_price`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `total`: `Mapped[float]` -> `mapped_column(Float, default=0)`
- Relationships: none

### `UdhaarLedger`
- Table: `udhaar_ledgers`
- Field count: 12
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `udhaar_id`: `Mapped[str]` -> `mapped_column(String(20), unique=True, nullable=False, index=True)`
  `customer_id`: `Mapped[str]` -> `mapped_column(String(36), ForeignKey('customers.id'), index=True)`
  `customer_name`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `phone`: `Mapped[str]` -> `mapped_column(String(20), nullable=False)`
  `total_credit`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `total_paid`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `balance`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `credit_limit`: `Mapped[float]` -> `mapped_column(Float, default=5000)`
  `last_reminder_sent`: `Mapped[Optional[str]]` -> `mapped_column(String(20))`
  `store_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('stores.id'))`
  `created_at`: `Mapped[str]` -> `mapped_column(String(20), nullable=False)`
- Relationships: none

### `UdhaarEntry`
- Table: `udhaar_entries`
- Field count: 9
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `ledger_id`: `Mapped[str]` -> `mapped_column(String(36), ForeignKey('udhaar_ledgers.id'), index=True)`
  `order_id`: `Mapped[Optional[str]]` -> `mapped_column(String(30))`
  `entry_type`: `Mapped[str]` -> `mapped_column(String(10), nullable=False)`
  `amount`: `Mapped[float]` -> `mapped_column(Float, nullable=False)`
  `items_json`: `Mapped[Optional[str]]` -> `mapped_column(Text)`
  `note`: `Mapped[Optional[str]]` -> `mapped_column(Text)`
  `date`: `Mapped[str]` -> `mapped_column(String(20), nullable=False)`
  `timestamp`: `Mapped[float]` -> `mapped_column(Float, default=_now)`
- Relationships: none

### `Return`
- Table: `returns`
- Field count: 11
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `return_id`: `Mapped[str]` -> `mapped_column(String(20), unique=True, nullable=False, index=True)`
  `order_id`: `Mapped[str]` -> `mapped_column(String(30), nullable=False)`
  `customer_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('customers.id'))`
  `customer_name`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `refund_amount`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `refund_method`: `Mapped[str]` -> `mapped_column(String(30), default='Cash')`
  `status`: `Mapped[str]` -> `mapped_column(String(20), default='pending')`
  `store_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('stores.id'))`
  `timestamp`: `Mapped[float]` -> `mapped_column(Float, default=_now)`
  `processed_at`: `Mapped[Optional[float]]` -> `mapped_column(Float)`
- Relationships: none

### `ReturnItem`
- Table: `return_items`
- Field count: 8
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `return_id`: `Mapped[str]` -> `mapped_column(String(36), ForeignKey('returns.id'), index=True)`
  `sku`: `Mapped[str]` -> `mapped_column(String(30), nullable=False)`
  `product_name`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `qty`: `Mapped[int]` -> `mapped_column(Integer, default=1)`
  `unit_price`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `reason`: `Mapped[str]` -> `mapped_column(String(255), default='')`
  `action`: `Mapped[str]` -> `mapped_column(String(30), default='refund')`
- Relationships: none

### `DeliveryRequest`
- Table: `delivery_requests`
- Field count: 15
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `request_id`: `Mapped[str]` -> `mapped_column(String(20), unique=True, nullable=False, index=True)`
  `customer_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('customers.id'))`
  `customer_name`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `phone`: `Mapped[str]` -> `mapped_column(String(20), nullable=False)`
  `address`: `Mapped[str]` -> `mapped_column(Text, nullable=False)`
  `total_amount`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `status`: `Mapped[str]` -> `mapped_column(String(20), default='pending')`
  `delivery_slot`: `Mapped[Optional[str]]` -> `mapped_column(String(50))`
  `notes`: `Mapped[Optional[str]]` -> `mapped_column(Text)`
  `assigned_to`: `Mapped[Optional[str]]` -> `mapped_column(String(36))`
  `store_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('stores.id'))`
  `requested_at`: `Mapped[float]` -> `mapped_column(Float, default=_now)`
  `dispatched_at`: `Mapped[Optional[float]]` -> `mapped_column(Float)`
  `delivered_at`: `Mapped[Optional[float]]` -> `mapped_column(Float)`
- Relationships: none

### `DeliveryItem`
- Table: `delivery_items`
- Field count: 6
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `delivery_id`: `Mapped[str]` -> `mapped_column(String(36), ForeignKey('delivery_requests.id'), index=True)`
  `sku`: `Mapped[str]` -> `mapped_column(String(30), nullable=False)`
  `product_name`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `qty`: `Mapped[int]` -> `mapped_column(Integer, default=1)`
  `unit_price`: `Mapped[float]` -> `mapped_column(Float, default=0)`
- Relationships: none

### `StaffMember`
- Table: `staff_members`
- Field count: 9
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `staff_code`: `Mapped[str]` -> `mapped_column(String(20), unique=True, nullable=False, index=True)`
  `name`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `phone`: `Mapped[Optional[str]]` -> `mapped_column(String(20))`
  `role`: `Mapped[str]` -> `mapped_column(String(50), default='cashier')`
  `hourly_rate`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `is_active`: `Mapped[bool]` -> `mapped_column(Boolean, default=True)`
  `store_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('stores.id'))`
  `joined_at`: `Mapped[float]` -> `mapped_column(Float, default=_now)`
- Relationships: none

### `StaffShift`
- Table: `staff_shifts_v2`
- Field count: 6
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `staff_id`: `Mapped[str]` -> `mapped_column(String(36), ForeignKey('staff_members.id'), index=True)`
  `shift_date`: `Mapped[str]` -> `mapped_column(String(20), nullable=False)`
  `start_hour`: `Mapped[int]` -> `mapped_column(Integer, nullable=False)`
  `end_hour`: `Mapped[int]` -> `mapped_column(Integer, nullable=False)`
  `status`: `Mapped[str]` -> `mapped_column(String(20), default='scheduled')`
- Relationships: none

### `AttendanceRecord`
- Table: `attendance_records`
- Field count: 7
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `staff_id`: `Mapped[str]` -> `mapped_column(String(36), ForeignKey('staff_members.id'), index=True)`
  `date`: `Mapped[str]` -> `mapped_column(String(20), nullable=False)`
  `clock_in`: `Mapped[Optional[float]]` -> `mapped_column(Float)`
  `clock_out`: `Mapped[Optional[float]]` -> `mapped_column(Float)`
  `status`: `Mapped[str]` -> `mapped_column(String(20), default='present')`
  `hours_worked`: `Mapped[float]` -> `mapped_column(Float, default=0)`
- Relationships: none

### `ShelfZone`
- Table: `shelf_zones`
- Field count: 6
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `zone_id`: `Mapped[str]` -> `mapped_column(String(10), unique=True, nullable=False, index=True)`
  `zone_name`: `Mapped[str]` -> `mapped_column(String(100), nullable=False)`
  `zone_type`: `Mapped[str]` -> `mapped_column(String(30), nullable=False)`
  `total_slots`: `Mapped[int]` -> `mapped_column(Integer, default=10)`
  `store_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('stores.id'))`
- Relationships: none

### `ShelfProduct`
- Table: `shelf_products`
- Field count: 7
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `zone_id`: `Mapped[str]` -> `mapped_column(String(36), ForeignKey('shelf_zones.id'), index=True)`
  `sku`: `Mapped[str]` -> `mapped_column(String(30), nullable=False)`
  `product_name`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `shelf_level`: `Mapped[str]` -> `mapped_column(String(20), default='lower')`
  `placed_date`: `Mapped[Optional[str]]` -> `mapped_column(String(20))`
  `days_here`: `Mapped[int]` -> `mapped_column(Integer, default=0)`
- Relationships: none

### `Notification`
- Table: `notifications`
- Field count: 12
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `user_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('users.id'), index=True)`
  `store_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('stores.id'))`
  `channel`: `Mapped[str]` -> `mapped_column(String(20), nullable=False)`
  `title`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `body`: `Mapped[str]` -> `mapped_column(Text, nullable=False)`
  `category`: `Mapped[str]` -> `mapped_column(String(50), default='general')`
  `priority`: `Mapped[str]` -> `mapped_column(String(10), default='normal')`
  `is_read`: `Mapped[bool]` -> `mapped_column(Boolean, default=False)`
  `sent_at`: `Mapped[float]` -> `mapped_column(Float, default=_now)`
  `read_at`: `Mapped[Optional[float]]` -> `mapped_column(Float)`
  `metadata_json`: `Mapped[Optional[str]]` -> `mapped_column(Text)`
- Relationships: none

### `Promotion`
- Table: `promotions`
- Field count: 16
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `promo_code`: `Mapped[Optional[str]]` -> `mapped_column(String(30), unique=True, index=True)`
  `title`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `description`: `Mapped[Optional[str]]` -> `mapped_column(Text)`
  `promo_type`: `Mapped[str]` -> `mapped_column(String(30), nullable=False)`
  `discount_value`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `min_order_amount`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `applicable_skus_json`: `Mapped[Optional[str]]` -> `mapped_column(Text)`
  `applicable_categories_json`: `Mapped[Optional[str]]` -> `mapped_column(Text)`
  `max_uses`: `Mapped[int]` -> `mapped_column(Integer, default=0)`
  `current_uses`: `Mapped[int]` -> `mapped_column(Integer, default=0)`
  `starts_at`: `Mapped[float]` -> `mapped_column(Float, nullable=False)`
  `ends_at`: `Mapped[float]` -> `mapped_column(Float, nullable=False)`
  `is_active`: `Mapped[bool]` -> `mapped_column(Boolean, default=True)`
  `store_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('stores.id'))`
  `created_at`: `Mapped[float]` -> `mapped_column(Float, default=_now)`
- Relationships: none

### `LoyaltyAccount`
- Table: `loyalty_accounts`
- Field count: 6
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `customer_id`: `Mapped[str]` -> `mapped_column(String(36), ForeignKey('customers.id'), unique=True, index=True)`
  `points_balance`: `Mapped[int]` -> `mapped_column(Integer, default=0)`
  `lifetime_points`: `Mapped[int]` -> `mapped_column(Integer, default=0)`
  `tier`: `Mapped[str]` -> `mapped_column(String(20), default='bronze')`
  `created_at`: `Mapped[float]` -> `mapped_column(Float, default=_now)`
- Relationships: none

### `LoyaltyTransaction`
- Table: `loyalty_transactions`
- Field count: 6
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `account_id`: `Mapped[str]` -> `mapped_column(String(36), ForeignKey('loyalty_accounts.id'), index=True)`
  `order_id`: `Mapped[Optional[str]]` -> `mapped_column(String(30))`
  `points`: `Mapped[int]` -> `mapped_column(Integer, nullable=False)`
  `description`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `timestamp`: `Mapped[float]` -> `mapped_column(Float, default=_now)`
- Relationships: none

### `PurchaseOrder`
- Table: `purchase_orders`
- Field count: 11
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `po_number`: `Mapped[str]` -> `mapped_column(String(30), unique=True, nullable=False, index=True)`
  `supplier_id`: `Mapped[str]` -> `mapped_column(String(36), ForeignKey('suppliers.id'), index=True)`
  `status`: `Mapped[str]` -> `mapped_column(String(20), default='draft')`
  `total_amount`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `payment_status`: `Mapped[str]` -> `mapped_column(String(20), default='unpaid')`
  `expected_delivery`: `Mapped[Optional[str]]` -> `mapped_column(String(20))`
  `actual_delivery`: `Mapped[Optional[str]]` -> `mapped_column(String(20))`
  `notes`: `Mapped[Optional[str]]` -> `mapped_column(Text)`
  `store_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('stores.id'))`
  `created_at`: `Mapped[float]` -> `mapped_column(Float, default=_now)`
- Relationships: none

### `PurchaseOrderItem`
- Table: `purchase_order_items`
- Field count: 8
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `po_id`: `Mapped[str]` -> `mapped_column(String(36), ForeignKey('purchase_orders.id'), index=True)`
  `sku`: `Mapped[str]` -> `mapped_column(String(30), nullable=False)`
  `product_name`: `Mapped[str]` -> `mapped_column(String(255), nullable=False)`
  `qty`: `Mapped[int]` -> `mapped_column(Integer, default=1)`
  `unit_price`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `total`: `Mapped[float]` -> `mapped_column(Float, default=0)`
  `received_qty`: `Mapped[int]` -> `mapped_column(Integer, default=0)`
- Relationships: none

### `AuditLog`
- Table: `audit_logs`
- Field count: 10
  `id`: `Mapped[str]` -> `mapped_column(String(36), primary_key=True, default=_gen_id)`
  `timestamp`: `Mapped[float]` -> `mapped_column(Float, nullable=False, default=_now)`
  `skill`: `Mapped[str]` -> `mapped_column(String(50), nullable=False)`
  `event_type`: `Mapped[str]` -> `mapped_column(String(50), nullable=False)`
  `decision`: `Mapped[str]` -> `mapped_column(Text, nullable=False)`
  `reasoning`: `Mapped[str]` -> `mapped_column(Text, nullable=False)`
  `outcome`: `Mapped[str]` -> `mapped_column(Text, nullable=False)`
  `status`: `Mapped[str]` -> `mapped_column(String(20), nullable=False)`
  `metadata_json`: `Mapped[Optional[str]]` -> `mapped_column(Text)`
  `store_id`: `Mapped[Optional[str]]` -> `mapped_column(String(36), ForeignKey('stores.id'))`
- Relationships: none


## 20. Appendix B: runtime memory lookup map

### `customer_offer`
- `customer:*:purchases`
- `customer:*:last_offer`

### `daily_analytics`
- `orchestrator:daily_summary`
- `supplier:*:history`
- `product:*:restock_history`

### `low_stock`
- `product:{sku}:restock_history`
- `supplier:*:history`
- `orchestrator:daily_summary`

### `procurement_needed`
- `supplier:*:history`
- `orchestrator:daily_summary`

### `shelf_optimization`
- `shelf:*:placement_history`
- `orchestrator:daily_summary`

### `shelf_placement_approved`
- `shelf:*:placement_history`

### `supplier_reply`
- `supplier:{supplier_id}:history`
- `product:{sku}:restock_history`

## 21. Appendix C: route inventory by file

### `api/__init__.py`
- no route decorators detected

### `api/analytics_routes.py`
- `GET` `/summary` (line 19)
- `GET` `/revenue-comparison` (line 88)
- `GET` `/top-products` (line 131)
- `GET` `/benchmarks` (line 166)

### `api/assistant_routes.py`
- `POST` `/chat` (line 130)
- `GET` `/status` (line 211)
- `DELETE` `/conversations/{conv_id}` (line 234)

### `api/backup_routes.py`
- `POST` `/create` (line 29)
- `GET` `/list` (line 79)
- `GET` `/download/{filename}` (line 96)
- `POST` `/restore/{filename}` (line 117)
- `DELETE` `/{filename}` (line 163)
- `POST` `/export-json` (line 180)

### `api/compliance_routes.py`
- `GET` `/purposes` (line 32)
- `GET` `/retention-policies` (line 38)
- `POST` `/consent` (line 44)
- `GET` `/consent/{customer_id}` (line 58)
- `GET` `/consent/{customer_id}/check/{purpose}` (line 67)
- `POST` `/data-export` (line 76)
- `POST` `/erasure` (line 89)
- `GET` `/erasure-requests` (line 98)
- `POST` `/breach` (line 107)
- `GET` `/breaches` (line 121)

### `api/digest_routes.py`
- `GET` `/status` (line 20)
- `POST` `/send` (line 29)
- `POST` `/send-daily` (line 42)
- `GET` `/log` (line 56)

### `api/encryption_routes.py`
- `GET` `/status` (line 21)
- `POST` `/encrypt` (line 35)
- `POST` `/decrypt` (line 50)
- `GET` `/pii-fields` (line 63)

### `api/health_routes.py`
- `GET` `/health` (line 30)
- `GET` `/health/ready` (line 35)
- `GET` `/health/live` (line 54)
- `GET` `/api/metrics` (line 59)
- `GET` `/api/metrics/prometheus` (line 84)

### `api/i18n_routes.py`
- `GET` `/languages` (line 22)
- `GET` `/translations/{lang}` (line 44)
- `GET` `/translate` (line 52)
- `POST` `/detect-language` (line 61)
- `POST` `/voice-command` (line 68)

### `api/loyalty_routes.py`
- `POST` `/api/loyalty/enroll/{customer_code}` (line 22)
- `GET` `/api/loyalty/{customer_code}` (line 44)
- `POST` `/api/loyalty/{customer_code}/earn` (line 87)
- `POST` `/api/loyalty/{customer_code}/redeem` (line 125)
- `GET` `/api/receipts/{order_id}` (line 163)
- `GET` `/api/catalog` (line 201)
- `GET` `/api/catalog/categories` (line 234)

### `api/ml_routes.py`
- `GET` `/forecast/{sku}` (line 11)
- `GET` `/pricing/{sku}` (line 21)
- `GET` `/pricing` (line 30)
- `POST` `/forecast/advanced` (line 38)
- `POST` `/forecast/bulk` (line 69)
- `GET` `/basket/pairs` (line 97)
- `GET` `/basket/recommend/{sku}` (line 106)
- `GET` `/basket/categories` (line 116)
- `GET` `/basket/summary` (line 126)
- `POST` `/basket/cross-sell` (line 135)

### `api/mobile_routes.py`
- `GET` `/barcode/{barcode}` (line 40)
- `POST` `/barcode/register` (line 66)
- `GET` `/barcode/search` (line 90)
- `POST` `/sync` (line 140)
- `GET` `/dashboard` (line 169)

### `api/offline_sync.py`
- `POST` `/push` (line 104)
- `GET` `/pull` (line 143)
- `GET` `/status` (line 227)

### `api/payment_routes.py`
- `GET` `/config` (line 58)
- `POST` `/create-order` (line 69)
- `POST` `/verify` (line 102)
- `POST` `/record-offline` (line 149)
- `POST` `/refund` (line 165)
- `GET` `/history` (line 191)
- `POST` `/webhook` (line 202)

### `api/pos_routes.py`
- `GET` `/printer/status` (line 33)
- `POST` `/printer/print` (line 39)
- `POST` `/printer/preview` (line 50)
- `GET` `/printer/log` (line 61)
- `GET` `/scanner/config` (line 67)
- `GET` `/scanner/validate/{barcode}` (line 73)

### `api/promotions_routes.py`
- `POST` `/validate/{promo_code}` (line 99)
- `POST` `/{promo_id}/deactivate` (line 140)
- `POST` `/combo` (line 167)
- `POST` `/flash-sale` (line 210)
- `POST` `/apply` (line 261)
- `GET` `/active-flash-sales` (line 325)

### `api/push_routes.py`
- `GET` `/vapid-key` (line 33)
- `POST` `/subscribe` (line 42)
- `POST` `/unsubscribe` (line 52)
- `POST` `/send` (line 58)
- `POST` `/broadcast` (line 73)
- `GET` `/status` (line 87)
- `GET` `/log` (line 96)

### `api/returns_routes.py`
- `POST` `/{return_id}/process` (line 85)
- `POST` `/{return_id}/reject` (line 105)
- `GET` `/{return_id}` (line 154)
- `GET` `/{return_id}/credit-note` (line 183)
- `POST` `/{return_id}/exchange` (line 202)
- `GET` `/stats/summary` (line 237)

### `api/routes.py`
- `GET` `/api/plugins` (line 1284)
- `GET` `/api/ws/stats` (line 1361)
- `GET` `/api/status` (line 1367)
- `GET` `/api/skills` (line 1377)
- `POST` `/api/skills/{skill_name}/pause` (line 1381)
- `POST` `/api/skills/{skill_name}/resume` (line 1389)
- `POST` `/api/events` (line 1397)
- `GET` `/api/inventory` (line 1406)
- `GET` `/api/store-profile` (line 1413)
- `PUT` `/api/store-profile` (line 1417)
- `GET` `/api/customer-assistant/config` (line 1423)
- `PUT` `/api/customer-assistant/config` (line 1427)
- `GET` `/api/customer-assistant/analytics` (line 1433)
- `POST` `/api/inventory/update` (line 1437)
- `POST` `/api/inventory/register` (line 1449)
- `PATCH` `/api/inventory/{sku}` (line 1460)
- `POST` `/api/inventory/check` (line 1471)
- `POST` `/api/inventory/sale` (line 1480)
- `GET` `/api/orders` (line 1603)
- `GET` `/api/customers` (line 1611)
- `GET` `/api/udhaar` (line 1651)
- `POST` `/api/udhaar/credit` (line 1655)
- `POST` `/api/udhaar/payment` (line 1690)
- `POST` `/api/udhaar/{udhaar_id}/remind` (line 1710)
- `GET` `/api/returns` (line 1731)
- `POST` `/api/returns` (line 1749)
- `POST` `/api/returns/{return_id}/process` (line 1772)
- `POST` `/api/vendor-orders/{order_id}/pay` (line 1789)
- `GET` `/api/vendor-payments` (line 1805)
- `GET` `/api/gst/summary` (line 1838)
- `GET` `/api/daily-summary` (line 1863)
- `POST` `/api/voice/parse` (line 1944)
- `POST` `/api/voice/execute` (line 1997)
- `POST` `/api/customer-assistant/query` (line 2038)
- `POST` `/api/customer-assistant/whatsapp-link` (line 2052)
- `GET` `/api/delivery-requests` (line 2076)
- `PATCH` `/api/delivery-requests/{request_id}/status` (line 2080)
- `GET` `/api/shelf-zones` (line 2146)
- `GET` `/api/shelf-zones/velocity` (line 2164)
- `POST` `/api/shelf-zones/zones` (line 2169)
- `PUT` `/api/shelf-zones/zones/{zone_id}` (line 2198)
- `DELETE` `/api/shelf-zones/zones/{zone_id}` (line 2219)
- `POST` `/api/shelf-zones/zones/{zone_id}/assign` (line 2231)
- `DELETE` `/api/shelf-zones/zones/{zone_id}/products/{sku}` (line 2277)
- `POST` `/api/shelf-zones/optimize` (line 2290)
- `GET` `/api/suppliers` (line 2299)
- `POST` `/api/suppliers/register` (line 2309)
- `GET` `/api/suppliers/{supplier_id}/history` (line 2332)
- `POST` `/api/webhook/supplier-reply` (line 2351)
- `POST` `/api/demo/supplier-reply` (line 2356)
- `GET` `/api/approvals` (line 2366)
- `POST` `/api/approvals/approve` (line 2370)
- `POST` `/api/approvals/reject` (line 2378)
- `GET` `/api/audit` (line 2386)
- `GET` `/api/audit/count` (line 2390)
- `GET` `/api/audit/verify` (line 2394)
- `GET` `/api/audit/verify/{entry_id}` (line 2399)
- `GET` `/api/audit/chain-info` (line 2404)
- `GET` `/api/negotiations` (line 2409)
- `POST` `/api/analytics/run` (line 2416)
- `GET` `/api/analytics/summary` (line 2421)
- `POST` `/api/demo/trigger-flow` (line 2428)
- `GET` `/api/inventory/expiry-risks` (line 2456)
- `GET` `/api/market-prices` (line 2466)
- `GET` `/api/market-prices/{sku}` (line 2479)
- `POST` `/api/market-prices/log` (line 2484)
- `GET` `/api/alerts` (line 2490)

### `api/scheduler_routes.py`
- `GET` `/jobs` (line 26)
- `POST` `/jobs/{job_name}/enable` (line 33)
- `POST` `/jobs/{job_name}/disable` (line 41)
- `POST` `/jobs/{job_name}/run-now` (line 49)

### `api/shelf_audit_routes.py`
- `POST` `/analyze` (line 19)
- `GET` `/status` (line 36)
- `GET` `/log` (line 45)
- `GET` `/summary` (line 54)

### `api/sms_routes.py`
- `GET` `/status` (line 29)
- `POST` `/send` (line 38)
- `POST` `/send-otp` (line 47)
- `POST` `/order-update` (line 56)
- `GET` `/log` (line 65)
- `DELETE` `/log` (line 74)

### `api/staff_routes.py`
- `POST` `/register` (line 30)
- `POST` `/clock-in` (line 69)
- `POST` `/clock-out` (line 99)
- `GET` `/attendance` (line 129)
- `GET` `/performance/{staff_code}` (line 162)
- `POST` `/payroll/calculate` (line 218)
- `GET` `/attendance/summary` (line 318)

### `api/store_routes.py`
- `GET` `/{store_id}` (line 108)
- `PATCH` `/{store_id}` (line 152)
- `POST` `/assign-user` (line 172)
- `GET` `/analytics/summary` (line 201)
- `GET` `/analytics/compare` (line 270)
- `GET` `/analytics/stock-transfer-opportunities` (line 321)

### `api/tally_routes.py`
- `GET` `/status` (line 35)
- `POST` `/sync-order` (line 45)
- `POST` `/sync-purchase` (line 54)
- `GET` `/voucher-xml` (line 63)
- `GET` `/ledger-mappings` (line 83)
- `POST` `/ledger-mappings` (line 89)
- `GET` `/sync-log` (line 99)

### `api/udhaar_routes.py`
- `POST` `/credit` (line 67)
- `POST` `/{udhaar_id}/pay` (line 115)
- `PUT` `/{udhaar_id}/limit` (line 146)
- `POST` `/{udhaar_id}/remind` (line 163)
- `GET` `/{udhaar_id}/interest` (line 199)
- `POST` `/{udhaar_id}/apply-interest` (line 248)
- `GET` `/{udhaar_id}/history` (line 300)
- `GET` `/stats/summary` (line 338)

### `api/vendor_routes.py`
- `POST` `/purchase-orders` (line 34)
- `POST` `/purchase-orders/{po_number}/send` (line 74)
- `POST` `/purchase-orders/{po_number}/confirm` (line 89)
- `POST` `/purchase-orders/{po_number}/receive` (line 104)
- `POST` `/purchase-orders/{po_number}/pay` (line 128)
- `GET` `/purchase-orders` (line 143)
- `GET` `/suppliers/{supplier_code}/profile` (line 182)
- `PATCH` `/suppliers/{supplier_code}/profile` (line 213)
- `POST` `/suppliers/{supplier_code}/catalog` (line 246)
- `GET` `/suppliers/{supplier_code}/orders` (line 264)
- `GET` `/suppliers/{supplier_code}/performance` (line 301)
- `GET` `/suppliers` (line 338)

### `api/versioning.py`
- `GET` `/api/version` (line 58)

### `api/voice_routes.py`
- `GET` `/status` (line 19)
- `POST` `/parse` (line 25)
- `POST` `/transcribe` (line 36)
- `POST` `/command` (line 56)

### `api/webhook_routes.py`
- `GET` `/events` (line 51)
- `DELETE` `/{webhook_id}` (line 86)

### `api/websocket_manager.py`
- no route decorators detected

### `api/whatsapp_routes.py`
- `GET` `/status` (line 39)
- `POST` `/send-text` (line 49)
- `POST` `/send-template` (line 62)
- `POST` `/send-udhaar-reminder` (line 77)
- `POST` `/send-order-confirmation` (line 92)
- `GET` `/message-log` (line 107)
- `DELETE` `/message-log` (line 113)

### `api/workflow_routes.py`
- `GET` `/api/workflow/approval-chains` (line 93)
- `PUT` `/api/workflow/approval-chains/{chain_name}` (line 108)
- `GET` `/api/workflow/audit/search` (line 125)
- `GET` `/api/workflow/undo-stack` (line 205)
- `POST` `/api/workflow/undo` (line 210)
- `POST` `/api/workflow/scheduled-reports` (line 274)
- `GET` `/api/workflow/scheduled-reports` (line 293)

### `auth/routes.py`
- `POST` `/register` (line 50)
- `POST` `/login` (line 82)
- `GET` `/me` (line 104)
- `GET` `/users` (line 117)
- `PATCH` `/users/{user_id}/role` (line 130)
- `PATCH` `/users/{user_id}/deactivate` (line 150)

### `notifications/routes.py`
- `POST` `/{notification_id}/read` (line 34)
- `POST` `/read-all` (line 44)

### `reports/routes.py`
- `GET` `/sales/excel` (line 37)
- `GET` `/pnl/pdf` (line 61)
- `GET` `/gst/excel` (line 97)
- `GET` `/inventory/excel` (line 130)
- `GET` `/inventory/pdf` (line 143)
- `GET` `/customers/excel` (line 157)
- `GET` `/daily-summary/pdf` (line 173)
- `GET` `/pnl/excel` (line 212)
- `GET` `/gstr1/excel` (line 240)
- `GET` `/gstr3b/excel` (line 273)
- `POST` `/invoice/gst` (line 330)

## 22. Appendix D: environment variable inventory

### General
- `RETAILOS_ENV` default `development`
- `GEMINI_API_KEY` default `your-gemini-api-key-here`
- `PORT` default `8000`
- `DATABASE_URL` default `sqlite+aiosqlite:///data/retailos.db`
- `REDIS_URL` default `redis://localhost:6379`
- `JWT_SECRET_KEY` default `change-this-to-a-random-secret-in-production`
- `JWT_EXPIRE_SECONDS` default `86400`
- `SMTP_HOST` default `(empty)`
- `SMTP_PORT` default `587`
- `SMTP_USERNAME` default `(empty)`
- `SMTP_PASSWORD` default `(empty)`
- `SMTP_FROM` default `noreply@retailos.app`
- `SMTP_USE_TLS` default `true`
- `SMS_PROVIDER` default `msg91`
- `MSG91_API_KEY` default `(empty)`
- `MSG91_SENDER_ID` default `RETLOS`
- `MSG91_TEMPLATE_ID` default `(empty)`
- `TWILIO_ACCOUNT_SID` default `(empty)`
- `TWILIO_AUTH_TOKEN` default `(empty)`
- `TWILIO_FROM_NUMBER` default `(empty)`
- `WHATSAPP_API_KEY` default `(empty)`
- `WHATSAPP_PHONE_ID` default `(empty)`
- `RAZORPAY_KEY_ID` default `(empty)`
- `RAZORPAY_KEY_SECRET` default `(empty)`
- `RAZORPAY_WEBHOOK_SECRET` default `(empty)`
- `SENTRY_DSN` default `(empty)`
- `SENTRY_ENVIRONMENT` default `production`
- `SENTRY_TRACES_SAMPLE_RATE` default `0.1`
- `ENCRYPTION_KEY` default `(empty)`
- `TALLY_URL` default `(empty)`
- `TALLY_COMPANY` default `RetailOS Store`
- `VAPID_PUBLIC_KEY` default `(empty)`
- `VAPID_PRIVATE_KEY` default `(empty)`
- `VAPID_EMAIL` default `mailto:admin@retailos.app`
- `LOG_LEVEL` default `INFO`
- `LOG_FORMAT` default `json`

## 23. Appendix E: data directory inventory

### `data/backups`
- Directory children: 0

### `data/brain.db`
- File type: `db`
- Size: 49152 bytes
- Table count: 9
  `decisions` rows: 40
  `deliveries` rows: 40
  `footfall_logs` rows: 0
  `market_prices` rows: 0
  `message_outcomes` rows: 0
  `product_metadata` rows: 0
  `quality_flags` rows: 6
  `staff_shifts` rows: 0
  `stock_movements` rows: 0

### `data/customer_assistant_config.json`
- File type: `json`
- Size: 2187 bytes
- JSON shape: `dict`
- Record count: 8
  Sample keys: `whatsapp_number`, `supported_languages`, `default_voice_language`, `enable_substitutes`, `enable_recipe_clarifications`, `recipe_bundles`
             : `substitution_rules`, `clarification_rules`

### `data/customer_assistant_logs.json`
- File type: `json`
- Size: 3029 bytes
- JSON shape: `list`
- Record count: 10
  Sample keys: `timestamp`, `query`, `normalized_query`, `intent`, `dish_name`, `availability_status`
             : `missing_ingredients`, `not_carried_ingredients`

### `data/mock_customers.json`
- File type: `json`
- Size: 74771 bytes
- JSON shape: `list`
- Record count: 100
  Sample keys: `customer_id`, `name`, `phone`, `whatsapp_opted_in`, `last_offer_timestamp`, `last_offer_category`
             : `purchase_history`

### `data/mock_delivery_requests.json`
- File type: `json`
- Size: 4105 bytes
- JSON shape: `list`
- Record count: 6
  Sample keys: `request_id`, `customer_id`, `customer_name`, `phone`, `address`, `items`
             : `total_amount`, `status`, `requested_at`, `delivery_slot`, `notes`

### `data/mock_inventory.json`
- File type: `json`
- Size: 15057 bytes
- JSON shape: `list`
- Record count: 51
  Sample keys: `sku`, `product_name`, `category`, `image_url`, `current_stock`, `reorder_threshold`
             : `daily_sales_rate`, `unit_price`, `barcode`, `last_restock_date`

### `data/mock_orders.json`
- File type: `json`
- Size: 11824 bytes
- JSON shape: `dict`
- Record count: 2
  Sample keys: `customer_orders`, `vendor_orders`

### `data/mock_returns.json`
- File type: `json`
- Size: 2417 bytes
- JSON shape: `list`
- Record count: 5
  Sample keys: `return_id`, `order_id`, `customer_id`, `customer_name`, `items`, `refund_amount`
             : `refund_method`, `status`, `timestamp`, `processed_at`

### `data/mock_shelf_zones.json`
- File type: `json`
- Size: 18829 bytes
- JSON shape: `dict`
- Record count: 2
  Sample keys: `zones`, `ai_suggestions`

### `data/mock_suppliers.json`
- File type: `json`
- Size: 9865 bytes
- JSON shape: `list`
- Record count: 20
  Sample keys: `supplier_id`, `supplier_name`, `contact_phone`, `products`, `categories`, `price_per_unit`
             : `reliability_score`, `delivery_days`, `min_order_qty`, `payment_terms`, `location`

### `data/mock_udhaar.json`
- File type: `json`
- Size: 3641 bytes
- JSON shape: `list`
- Record count: 5
  Sample keys: `udhaar_id`, `customer_id`, `customer_name`, `phone`, `whatsapp_opted_in`, `entries`
             : `total_credit`, `total_paid`, `balance`, `last_reminder_sent`, `created_at`

### `data/recipe_cache.json`
- File type: `json`
- Size: 3286 bytes
- JSON shape: `dict`
- Record count: 3
  Sample keys: `spaghetti tomato`, `chai`, `chai what do i need for`

### `data/retailos.db`
- File type: `db`
- Size: 548864 bytes
- Table count: 28
  `alembic_version` rows: 1
  `attendance_records` rows: 0
  `audit_logs` rows: 0
  `customers` rows: 100
  `delivery_items` rows: 18
  `delivery_requests` rows: 6
  `loyalty_accounts` rows: 0
  `loyalty_transactions` rows: 0
  `notifications` rows: 0
  `order_items` rows: 28
  `orders` rows: 11
  `processed_sync_ops` rows: 0
  `products` rows: 51
  `promotions` rows: 0
  `purchase_history` rows: 402
  `purchase_order_items` rows: 0
  `purchase_orders` rows: 0
  `return_items` rows: 6
  `returns` rows: 5
  `shelf_products` rows: 41
  `shelf_zones` rows: 8
  `staff_members` rows: 0
  `staff_shifts_v2` rows: 0
  `stores` rows: 1
  `suppliers` rows: 20
  `udhaar_entries` rows: 11
  `udhaar_ledgers` rows: 5
  `users` rows: 0

### `data/store_profile.json`
- File type: `json`
- Size: 440 bytes
- JSON shape: `dict`
- Record count: 5
  Sample keys: `store_name`, `phone`, `address`, `hours`, `holiday_note`

### `data/test_retailos.db`
- File type: `db`
- Size: 409600 bytes
- Table count: 0

## 24. Appendix F: automated test inventory

### `tests/test_api.py`
- Approx lines: 174
- Test count: 16
  Tests: `test_register_user`, `test_register_duplicate_username`, `test_register_invalid_role`, `test_login_success`, `test_login_wrong_password`
       : `test_login_nonexistent_user`, `test_get_me`, `test_get_me_no_token`, `test_health_endpoint`, `test_health_ready`
       : `test_health_live`, `test_webhook_events_list`, `test_i18n_languages`, `test_i18n_translations`, `test_i18n_translate_key`
       : `test_plugins_endpoint`

### `tests/test_async_runtime.py`
- Approx lines: 122
- Test count: 4
  Tests: `test_orchestrator_process_event_uses_mocked_gemini_route`, `test_orchestrator_queues_pending_approval`, `test_procurement_ranking_parses_fenced_json`, `test_negotiation_outreach_returns_mocked_gemini_text`

### `tests/test_auth.py`
- Approx lines: 29
- Test count: 4
  Tests: `test_password_hashing`, `test_jwt_creation_and_decoding`, `test_expired_token`, `test_invalid_token`

### `tests/test_brain.py`
- Approx lines: 72
- Test count: 7
  Tests: `test_churn_detector_on_schedule`, `test_churn_detector_at_risk`, `test_exponential_smoothing_stable`, `test_exponential_smoothing_increasing`, `test_exponential_smoothing_insufficient_data`
       : `test_basket_analysis_runs`, `test_price_suggestion_missing_sku`

### `tests/test_brain_modules.py`
- Approx lines: 558
- Test count: 49
  Tests: `TestBrainDB.test_get_connection_creates_tables`, `TestBrainDB.test_get_connection_idempotent`, `TestBrainDB.test_db_exists`, `TestDecisionLogger.test_log_decision`, `TestDecisionLogger.test_log_delivery`
       : `TestDecisionLogger.test_log_quality_flag`, `TestDeliveryTracker.test_perfect_delivery_score`, `TestDeliveryTracker.test_late_delivery_lowers_score`, `TestDeliveryTracker.test_unknown_supplier`, `TestQualityScorer.test_no_complaints`
       : `TestQualityScorer.test_high_complaint_ratio`, `TestTrustScorer.test_perfect_supplier`, `TestTrustScorer.test_late_delivery_lowers_trust`, `TestTrustScorer.test_quality_complaints_lower_trust`, `TestTrustScorer.test_new_supplier`
       : `TestWastageTracker.test_log_movement_valid`, `TestWastageTracker.test_log_movement_invalid_type`, `TestWastageTracker.test_wastage_summary`, `TestWastageTracker.test_no_wastage`, `TestReorderOptimizer.test_high_wastage_reduces_order`
       : `TestReorderOptimizer.test_zero_wastage`, `TestExpiryAlerter.test_slow_seller_flagged`, `TestExpiryAlerter.test_fast_seller_not_flagged`, `TestExpiryAlerter.test_no_metadata_no_risk`, `TestFootfallAnalyzer.test_log_and_retrieve_pattern`
       : `TestFootfallAnalyzer.test_total_predicted`, `TestMessageTracker.test_log_and_track`, `TestMessageTracker.test_auto_generate_message_id`, `TestConversionScorer.test_template_rankings`, `TestConversionScorer.test_template_context_string`
       : `TestConversionScorer.test_empty_rankings`, `TestPriceMonitor.test_log_and_get_reference`, `TestPriceMonitor.test_old_data_low_confidence`, `TestPriceMonitor.test_no_data`, `TestPriceAnalyzer.test_above_market`
       : `TestPriceAnalyzer.test_below_market`, `TestPriceAnalyzer.test_at_market`, `TestPriceAnalyzer.test_suspiciously_low`, `TestPriceAnalyzer.test_suspiciously_high`, `TestPriceAnalyzer.test_no_market_data`
       : `TestPriceAnalyzer.test_format_verdict_above`, `TestPriceAnalyzer.test_format_verdict_below`, `TestChurnDetector.test_on_schedule_low_score`, `TestChurnDetector.test_lapsed_high_score`, `TestChurnDetector.test_detect_at_risk`
       : `TestChurnDetector.test_insufficient_data_skipped`, `TestSeasonalDetector.test_detects_april_spike`, `TestSeasonalDetector.test_no_spike`, `TestSeasonalDetector.test_empty_orders`

### `tests/test_business_logic.py`
- Approx lines: 179
- Test count: 13
  Tests: `TestDynamicPricer.test_unknown_sku_returns_error`, `TestDynamicPricer.test_suggestion_has_required_fields`, `TestDynamicPricer.test_suggested_price_has_floor`, `TestWebhookDispatch.test_dispatch_to_matching_webhook`, `TestWebhookDispatch.test_dispatch_skips_non_matching_event`
       : `TestWebhookDispatch.test_dispatch_skips_inactive_webhook`, `TestWebhookDispatch.test_dispatch_increments_failure_on_error`, `TestWebhookDispatch.test_supported_events_not_empty`, `TestPluginSystem.test_plugin_context_event_registration`, `TestPluginSystem.test_plugin_context_dispatch_event`
       : `TestPluginSystem.test_plugin_context_dispatch_handles_error`, `TestPluginSystem.test_discover_plugins_returns_list`, `TestPluginSystem.test_loaded_plugins_property`

### `tests/test_encryption.py`
- Approx lines: 55
- Test count: 7
  Tests: `test_encrypt_decrypt_roundtrip`, `test_encrypt_empty_string`, `test_decrypt_plaintext_returns_as_is`, `test_is_encrypted`, `test_different_encryptions_differ`
       : `test_pii_fields_registry`, `test_encrypt_unicode`

### `tests/test_forecasting.py`
- Approx lines: 99
- Test count: 9
  Tests: `test_exponential_smoothing_basic`, `test_exponential_smoothing_constant_series`, `test_double_exponential_smoothing_trending`, `test_detect_seasonality_weekly`, `test_detect_seasonality_none`
       : `test_forecast_demand_full`, `test_forecast_demand_insufficient_data`, `test_forecast_demand_with_reorder`, `test_bulk_forecast`

### `tests/test_gst_reports.py`
- Approx lines: 97
- Test count: 6
  Tests: `test_gstr1_excel_generates`, `test_gstr1_b2b_has_gstin_entries`, `test_gstr1_b2c_has_non_gstin_entries`, `test_gstr3b_excel_generates`, `test_pnl_excel_generates`
       : `test_gstr1_empty_orders`

### `tests/test_i18n.py`
- Approx lines: 157
- Test count: 31
  Tests: `TestTranslations.test_english_default`, `TestTranslations.test_hindi_translation`, `TestTranslations.test_marathi_translation`, `TestTranslations.test_fallback_to_english`, `TestTranslations.test_unknown_key_returns_key`
       : `TestTranslations.test_unknown_language_falls_back`, `TestTranslations.test_placeholder_substitution`, `TestTranslations.test_all_languages_exist`, `TestTranslations.test_get_all_translations_merges`, `TestLanguageDetection.test_detect_english`
       : `TestLanguageDetection.test_detect_hindi`, `TestLanguageDetection.test_detect_tamil`, `TestLanguageDetection.test_detect_telugu`, `TestLanguageDetection.test_detect_bengali`, `TestLanguageDetection.test_detect_gujarati`
       : `TestLanguageDetection.test_detect_kannada`, `TestLanguageDetection.test_detect_empty_defaults_english`, `TestLanguageDetection.test_detect_numbers_defaults_english`, `TestVoiceCommands.test_english_stock_check`, `TestVoiceCommands.test_hindi_stock_check`
       : `TestVoiceCommands.test_english_stock_update`, `TestVoiceCommands.test_english_daily_report`, `TestVoiceCommands.test_hindi_daily_report`, `TestVoiceCommands.test_english_low_stock`, `TestVoiceCommands.test_unknown_command`
       : `TestVoiceCommands.test_empty_command`, `TestVoiceCommands.test_english_new_order`, `TestVoiceCommands.test_command_has_raw_text`, `TestVoiceCommandAPI.test_voice_command_endpoint`, `TestVoiceCommandAPI.test_voice_command_hindi`
       : `TestVoiceCommandAPI.test_detect_language_endpoint`

### `tests/test_middleware.py`
- Approx lines: 38
- Test count: 6
  Tests: `test_sanitize_removes_script_tags`, `test_sanitize_html_encodes`, `test_detect_sql_injection_true`, `test_detect_sql_injection_false`, `test_mask_phone`
       : `test_mask_email`

### `tests/test_models.py`
- Approx lines: 251
- Test count: 11
  Tests: `test_create_store`, `test_create_user_with_store`, `test_create_product`, `test_create_customer`, `test_create_order_with_items`
       : `test_create_udhaar_ledger`, `test_create_loyalty_account`, `test_create_notification`, `test_create_promotion`, `test_user_defaults`
       : `test_product_defaults`

### `tests/test_promotions_api.py`
- Approx lines: 193
- Test count: 20
  Tests: `test_create_promotion`, `test_list_promotions`, `test_create_combo_deal`, `test_payment_config`, `test_record_offline_payment`
       : `test_payment_history`, `test_push_status`, `test_sms_status`, `test_digest_status`, `test_tally_status`
       : `test_shelf_audit_status`, `test_encryption_status`, `test_compliance_purposes`, `test_compliance_retention`, `test_api_version_endpoint`
       : `test_versioned_endpoint_works`, `test_legacy_endpoint_deprecation_header`, `test_websocket_stats`, `test_scheduler_jobs`, `test_backup_status`

### `tests/test_roles.py`
- Approx lines: 103
- Test count: 11
  Tests: `test_owner_can_list_users`, `test_staff_cannot_list_users`, `test_cashier_cannot_list_users`, `test_cashier_can_access_me`, `test_owner_can_register_webhook`
       : `test_staff_cannot_register_webhook`, `test_invalid_token_rejected`, `test_expired_token_rejected`, `test_owner_can_deactivate_user`, `test_owner_cannot_deactivate_self`
       : `test_staff_cannot_deactivate_users`

### `tests/test_tally.py`
- Approx lines: 68
- Test count: 5
  Tests: `test_tally_sync_init_demo_mode`, `test_generate_sales_voucher_xml`, `test_generate_purchase_voucher_xml`, `test_ledger_mappings`, `test_sync_log_starts_empty`

### `tests/test_websocket.py`
- Approx lines: 115
- Test count: 10
  Tests: `test_connect_default_channels`, `test_connect_specific_channels`, `test_disconnect`, `test_subscribe`, `test_unsubscribe`
       : `test_broadcast_reaches_subscribed`, `test_broadcast_skips_unsubscribed`, `test_disconnects_on_send_error`, `test_get_stats`, `test_invalid_channel_ignored`

### `e2e/test_api_e2e.py`
- Approx lines: 198
- Test count: 19
  Tests: `TestHealthEndpoints.test_health_check`, `TestHealthEndpoints.test_health_ready`, `TestHealthEndpoints.test_health_live`, `TestHealthEndpoints.test_openapi_docs`, `TestAuthFlow.test_register_login_flow`
       : `TestAuthFlow.test_login_invalid_credentials`, `TestAuthFlow.test_protected_route_without_token`, `TestAPIEndpoints.test_i18n_languages`, `TestAPIEndpoints.test_webhook_events`, `TestAPIEndpoints.test_payment_config`
       : `TestAPIEndpoints.test_whatsapp_status`, `TestAPIEndpoints.test_push_vapid_key`, `TestAPIEndpoints.test_sms_status`, `TestAPIEndpoints.test_scheduler_jobs`, `TestAPIEndpoints.test_backup_list`
       : `TestDashboardUI.test_dashboard_loads`, `TestDashboardUI.test_dashboard_has_navigation`, `TestPaymentFlow.test_record_offline_payment`, `TestPaymentFlow.test_payment_history`

### `test_customer_features.py`
- Approx lines: 70
- Test count: 3
  Tests: `test_template_rankings_prioritize_conversion_rate`, `test_churn_detection_thresholds`, `test_template_context_contains_top_performer`

### `test_e2e_day.py`
- Approx lines: 62
- Test count: 1
  Tests: `test_orchestrator_day_flow_smoke`

### `test_inventory_features.py`
- Approx lines: 90
- Test count: 4
  Tests: `test_high_expiry_products_get_lower_reorder_quantity`, `test_expiry_risk_respects_sales_velocity`, `test_procurement_prompt_uses_wastage_adjusted_context`, `test_expiry_risk_fallback_routes_inventory_and_customer`

### `test_pricing_features.py`
- Approx lines: 68
- Test count: 3
  Tests: `test_price_verdicts_against_market_reference`, `test_old_quotes_downgrade_confidence`, `test_negotiation_prompt_includes_market_reference`

### `test_scheduling_features.py`
- Approx lines: 105
- Test count: 4
  Tests: `test_peak_saturday_is_flagged_understaffed`, `test_festival_multiplier_increases_projection`, `test_sufficient_staff_clears_understaffed_blocks`, `test_scheduling_review_needs_approval_and_has_fallback_format`

### `test_trust_features.py`
- Approx lines: 55
- Test count: 3
  Tests: `test_late_deliveries_reduce_trust_score`, `test_quality_flags_reduce_trust_score`, `test_seasonal_detector_emits_preempt_event`

## 25. Appendix G: python module inventory

### `main.py`
- `main.py`
  Approx lines: 158
  Purpose: No top-level docstring.
  Classes: none
  Functions: `async init_runtime()`, `async _seed_memory(memory)`, `async startup()`, `main()`

### `api`
- `api/__init__.py`
  Approx lines: 1
  Purpose: No top-level docstring.
  Classes: none
  Functions: none
- `api/analytics_routes.py`
  Approx lines: 232
  Purpose: Cross-store analytics — benchmarking, comparisons, and aggregate insights.
  Classes: none
  Functions: `async cross_store_summary(user, db)`, `async revenue_comparison(days, user, db)`, `async top_products_across_stores(limit, user, db)`, `async store_benchmarks(user, db)`
- `api/assistant_routes.py`
  Approx lines: 242
  Purpose: Voice Assistant API — Gemini-powered conversational assistant for store owners.
  Classes: `AssistantQuery`
  Class `AssistantQuery` line 38: No class docstring.
      Methods: none
  Functions: `_read_json(filename, default)`, `_gather_store_context()`, `async assistant_chat(body, user)`, `_extract_actions(response, query)`, `async assistant_status()`, `async clear_conversation(conv_id, user)`
- `api/backup_routes.py`
  Approx lines: 225
  Purpose: Database backup and restore endpoints.
  Classes: none
  Functions: `_ensure_backup_dir()`, `async create_backup(user)`, `async list_backups(user)`, `async download_backup(filename, user)`, `async restore_backup(filename, user)`, `async delete_backup(filename, user)`
           : `async export_json(user)`, `async _export_all_tables()`
- `api/compliance_routes.py`
  Approx lines: 125
  Purpose: DPDP Act / GDPR compliance API endpoints.
  Classes: `ConsentRecord`, `ErasureRequest`, `BreachReport`
  Class `ConsentRecord` line 13: No class docstring.
      Methods: none
  Class `ErasureRequest` line 20: No class docstring.
      Methods: none
  Class `BreachReport` line 25: No class docstring.
      Methods: none
  Functions: `async list_purposes()`, `async retention_policies()`, `async record_consent(body, user)`, `async get_consent(customer_id, user)`, `async check_consent(customer_id, purpose)`, `async request_data_export(customer_id, user)`
           : `async request_erasure(body, user)`, `async list_erasure_requests(status, user)`, `async report_breach(body, user)`, `async list_breaches(user)`
- `api/digest_routes.py`
  Approx lines: 63
  Purpose: Email digest API endpoints.
  Classes: `SendDigest`
  Class `SendDigest` line 14: No class docstring.
      Methods: none
  Functions: `async digest_status()`, `async send_digest(body, user)`, `async send_daily_digest(user)`, `async digest_log(limit, user)`
- `api/encryption_routes.py`
  Approx lines: 67
  Purpose: Data encryption management API endpoints.
  Classes: `EncryptRequest`, `DecryptRequest`
  Class `EncryptRequest` line 13: No class docstring.
      Methods: none
  Class `DecryptRequest` line 17: No class docstring.
      Methods: none
  Functions: `async encryption_status(user)`, `async encrypt_value(body, user)`, `async decrypt_value(body, user)`, `async list_pii_fields(user)`
- `api/health_routes.py`
  Approx lines: 93
  Purpose: Health checks, structured logging config, and metrics endpoint.
  Classes: none
  Functions: `increment_request_count()`, `increment_error_count()`, `async health_check()`, `async readiness_check(db)`, `async liveness_check()`, `async get_metrics(db)`
           : `async get_prometheus_metrics()`
- `api/i18n_routes.py`
  Approx lines: 88
  Purpose: Localization and voice command API routes.
  Classes: `VoiceCommandRequest`
  Class `VoiceCommandRequest` line 17: No class docstring.
      Methods: none
  Functions: `async list_languages()`, `async get_translations(lang)`, `async translate_key(key, lang)`, `async detect_language(body)`, `async process_voice_command(body)`
- `api/loyalty_routes.py`
  Approx lines: 241
  Purpose: Loyalty program & customer-facing features: points, tiers, digital receipts, online catalog.
  Classes: none
  Functions: `async enroll_customer(customer_code, user, db)`, `async get_loyalty_status(customer_code, db)`, `async earn_points(customer_code, order_id, amount, user, db)`, `async redeem_points(customer_code, points, user, db)`, `async get_digital_receipt(order_id, db)`, `async get_catalog(category, search, db)`
           : `async get_categories(db)`
- `api/ml_routes.py`
  Approx lines: 144
  Purpose: ML & Intelligence API routes: demand forecast, dynamic pricing, basket analysis.
  Classes: none
  Functions: `async get_demand_forecast(sku, horizon, user)`, `async get_pricing_suggestion(sku, user)`, `async get_all_pricing_suggestions(user)`, `async get_advanced_forecast(sku, product_name, forecast_days, user)`, `async get_bulk_forecast(forecast_days, user)`, `async get_basket_pairs(min_support, user)`
           : `async get_basket_recommendations(sku, top_n, user)`, `async get_category_affinities(min_support, user)`, `async get_basket_summary(user)`, `async get_cross_sell(cart_skus, top_n, user)`
- `api/mobile_routes.py`
  Approx lines: 244
  Purpose: Mobile-specific API routes.
  Classes: `BarcodeLookupResponse`, `BarcodeRegisterRequest`, `OfflineSyncRequest`
  Class `BarcodeLookupResponse` line 19: No class docstring.
      Methods: none
  Class `BarcodeRegisterRequest` line 29: No class docstring.
      Methods: none
  Class `OfflineSyncRequest` line 34: No class docstring.
      Methods: none
  Functions: `async lookup_barcode(barcode, user, db)`, `async register_barcode(body, user, db)`, `async search_by_barcode_or_name(q, user, db)`, `async process_offline_sync(body, user)`, `async mobile_dashboard(user, store_id, db)`
- `api/offline_sync.py`
  Approx lines: 293
  Purpose: Offline-first sync engine for kirana stores with spotty internet.
  Classes: `ProcessedSyncOp`, `SyncOperation`, `SyncPushRequest`
  Class `ProcessedSyncOp` line 34: Tracks processed sync operations for idempotency across restarts.
      Methods: none
  Class `SyncOperation` line 65: A single queued operation from the client.
      Methods: none
  Class `SyncPushRequest` line 83: Batch of offline operations to sync.
      Methods: none
  Functions: `async _check_processed(db, op_id)`, `async _mark_processed(db, op_id, result)`, `async sync_push(body, user, db)`, `async sync_pull(since, limit, user, db)`, `async sync_status(user, db)`, `async _process_operation(op, user, db)`
- `api/payment_routes.py`
  Approx lines: 235
  Purpose: Payment API routes — Razorpay UPI, card, wallet integration.
  Classes: `CreatePaymentOrderRequest`, `VerifyPaymentRequest`, `RecordOfflinePaymentRequest`, `RefundRequest`
  Class `CreatePaymentOrderRequest` line 22: No class docstring.
      Methods: none
  Class `VerifyPaymentRequest` line 31: No class docstring.
      Methods: none
  Class `RecordOfflinePaymentRequest` line 40: No class docstring.
      Methods: none
  Class `RefundRequest` line 49: No class docstring.
      Methods: none
  Functions: `async payment_config(user)`, `async create_payment_order(body, user)`, `async verify_payment(body, user)`, `async record_offline_payment(body, user)`, `async create_refund(body, user)`, `async payment_history(order_id, customer_id, user)`
           : `async razorpay_webhook(request)`
- `api/pos_routes.py`
  Approx lines: 86
  Purpose: POS hardware API — receipt printing and barcode scanner config.
  Classes: `PrintReceiptRequest`
  Class `PrintReceiptRequest` line 13: No class docstring.
      Methods: none
  Functions: `async printer_status()`, `async print_receipt(body, user)`, `async preview_receipt(body)`, `async print_log(limit)`, `async scanner_config()`, `async validate_barcode(barcode)`
- `api/promotions_routes.py`
  Approx lines: 350
  Purpose: Promotions engine: coupons, flash sales, bundle deals.
  Classes: `CreatePromoRequest`, `ComboDeal`, `FlashSale`, `CartItem`, `ApplyCouponRequest`
  Class `CreatePromoRequest` line 18: No class docstring.
      Methods: none
  Class `ComboDeal` line 158: No class docstring.
      Methods: none
  Class `FlashSale` line 202: No class docstring.
      Methods: none
  Class `CartItem` line 248: No class docstring.
      Methods: none
  Class `ApplyCouponRequest` line 256: No class docstring.
      Methods: none
  Functions: `async create_promotion(body, user, db)`, `async list_promotions(active_only, user, db)`, `async validate_promo_code(promo_code, order_amount, db)`, `async deactivate_promotion(promo_id, user, db)`, `async create_combo_deal(body, user, db)`, `async create_flash_sale(body, user, db)`
           : `async apply_coupon_to_cart(body, db)`, `async list_flash_sales(db)`
- `api/push_routes.py`
  Approx lines: 103
  Purpose: Web Push Notification API endpoints.
  Classes: `PushSubscription`, `PushMessage`, `BroadcastMessage`
  Class `PushSubscription` line 13: No class docstring.
      Methods: none
  Class `PushMessage` line 18: No class docstring.
      Methods: none
  Class `BroadcastMessage` line 26: No class docstring.
      Methods: none
  Functions: `async get_vapid_key()`, `async subscribe(subscription, user)`, `async unsubscribe(user)`, `async send_push(message, user)`, `async broadcast_push(message, user)`, `async push_status(user)`
           : `async push_log(limit, user)`
- `api/returns_routes.py`
  Approx lines: 294
  Purpose: Returns & refunds system with proper DB-backed workflow.
  Classes: `ReturnItemRequest`, `CreateReturnRequest`
  Class `ReturnItemRequest` line 17: No class docstring.
      Methods: none
  Class `CreateReturnRequest` line 26: No class docstring.
      Methods: none
  Functions: `async create_return(body, user, db)`, `async process_return(return_id, user, db)`, `async reject_return(return_id, user, db)`, `async list_returns(status, limit, user, db)`, `async get_return(return_id, user, db)`, `async get_credit_note(return_id, user, db)`
           : `async process_exchange(return_id, new_items, user, db)`, `async return_stats(user, db)`, `_generate_credit_note(ret, items)`
- `api/routes.py`
  Approx lines: 2498
  Purpose: No top-level docstring.
  Classes: `ConnectionManager`, `EventPayload`, `StockUpdatePayload`, `InventoryRegisterPayload`, `InventoryPatchPayload`, `SaleItemPayload`
         : `InventorySalePayload`, `SupplierReplyPayload`, `ApprovalPayload`, `SupplierRegisterPayload`, `MarketPriceLogPayload`, `DeliveryStatusPayload`
         : `UdhaarCreditPayload`, `UdhaarPaymentPayload`, `ReturnPayload`, `SupplierPaymentPayload`, `VoiceCommandPayload`, `CustomerAssistantPayload`
  Class `ConnectionManager` line 77: No class docstring.
      Methods: `__init__(self)`, `async connect(self, websocket)`, `disconnect(self, websocket)`, `async broadcast(self, message)`
  Class `EventPayload` line 101: No class docstring.
      Methods: none
  Class `StockUpdatePayload` line 106: No class docstring.
      Methods: none
  Class `InventoryRegisterPayload` line 114: No class docstring.
      Methods: none
  Class `InventoryPatchPayload` line 126: No class docstring.
      Methods: none
  Class `SaleItemPayload` line 133: No class docstring.
      Methods: none
  Class `InventorySalePayload` line 138: No class docstring.
      Methods: none
  Class `SupplierReplyPayload` line 146: No class docstring.
      Methods: none
  Class `ApprovalPayload` line 154: No class docstring.
      Methods: none
  Class `SupplierRegisterPayload` line 159: No class docstring.
      Methods: none
  Class `MarketPriceLogPayload` line 174: No class docstring.
      Methods: none
  Class `DeliveryStatusPayload` line 181: No class docstring.
      Methods: none
  Class `UdhaarCreditPayload` line 185: No class docstring.
      Methods: none
  Class `UdhaarPaymentPayload` line 193: No class docstring.
      Methods: none
  Class `ReturnPayload` line 199: No class docstring.
      Methods: none
  Class `SupplierPaymentPayload` line 207: No class docstring.
      Methods: none
  Class `VoiceCommandPayload` line 211: No class docstring.
      Methods: none
  Class `CustomerAssistantPayload` line 215: No class docstring.
      Methods: none
  Functions: `_data_dir()`, `_read_json(filename, default)`, `_write_json(filename, data)`, `_normalize_lookup_text(value)`, `_lookup_tokens(value)`, `_inventory_snapshot(skill)`
           : `_load_store_profile()`, `_load_assistant_config()`, `_write_assistant_config(config)`, `_load_assistant_logs()`, `_write_assistant_logs(entries)`, `_normalize_customer_query(text)`
           : `_resolve_zone_shelf(zone, shelf_level, preferred_shelf_id)`, `_hydrate_shelf_assignments(data, persist)`, `_score_inventory_match(query, item)`, `_find_best_inventory_match(query, inventory)`, `_find_substitutes(ingredient_name, inventory, assistant_config)`, `_extract_candidate_product_query(text)`
           : `_format_store_hours(profile)`, `_is_recipe_query(text)`, `_extract_recipe_query(text)`, `_build_recipe_clarification(recipe_query, assistant_config)`, `_build_shelf_lookup(shelf_data)`, `_classify_inventory_match(item, placement)`
           : `_match_recipe_ingredients(recipe, inventory, shelf_lookup, assistant_config)`, `_build_recipe_answer(recipe, matched)`, `_bundle_recommendations(inventory, assistant_config)`, `_log_customer_assistant_query(original_text, normalized_text, response)`, `_assistant_analytics()`, `async _answer_customer_assistant_query(text, inventory, shelf_data, store_profile, assistant_config)`
           : `_calc_gst(items, inventory_data)`, `_business_date_from_value(value)`, `_order_business_date(order)`, `_return_business_date(return_entry)`, `_movement_type_for_return_reason(reason)`, `_payment_due_snapshot(order)`
           : `_latest_business_date(customer_orders, returns, deliveries)`, `_init_logging()`, `_init_sentry()`, `create_app(orchestrator)`
- `api/scheduler_routes.py`
  Approx lines: 72
  Purpose: Scheduler management API routes.
  Classes: none
  Functions: `set_scheduler(scheduler)`, `get_scheduler()`, `async list_jobs(user)`, `async enable_job(job_name, user)`, `async disable_job(job_name, user)`, `async run_job_now(job_name, user)`
- `api/shelf_audit_routes.py`
  Approx lines: 60
  Purpose: Shelf audit API endpoints.
  Classes: `ShelfImageRequest`
  Class `ShelfImageRequest` line 13: No class docstring.
      Methods: none
  Functions: `async analyze_shelf(body, user)`, `async audit_status()`, `async audit_log(limit, user)`, `async compliance_summary(user)`
- `api/sms_routes.py`
  Approx lines: 79
  Purpose: SMS notification API endpoints.
  Classes: `SendSMS`, `SendOTP`, `OrderSMS`
  Class `SendSMS` line 13: No class docstring.
      Methods: none
  Class `SendOTP` line 18: No class docstring.
      Methods: none
  Class `OrderSMS` line 23: No class docstring.
      Methods: none
  Functions: `async sms_status()`, `async send_sms(body, user)`, `async send_otp(body, user)`, `async send_order_update(body, user)`, `async sms_log(limit, user)`, `async clear_sms_log(user)`
- `api/staff_routes.py`
  Approx lines: 362
  Purpose: Staff management: attendance, performance metrics, payroll.
  Classes: `RegisterStaffRequest`, `ClockRequest`, `PayrollConfig`
  Class `RegisterStaffRequest` line 17: No class docstring.
      Methods: none
  Class `ClockRequest` line 25: No class docstring.
      Methods: none
  Class `PayrollConfig` line 209: No class docstring.
      Methods: none
  Functions: `async register_staff(body, user, db)`, `async list_staff(user, db)`, `async clock_in(body, db)`, `async clock_out(body, db)`, `async get_attendance(date, user, db)`, `async get_staff_performance(staff_code, days, user, db)`
           : `async calculate_payroll(month, config, user, db)`, `async attendance_summary(month, user, db)`
- `api/store_routes.py`
  Approx lines: 392
  Purpose: Multi-store management and cross-store analytics.
  Classes: `CreateStoreRequest`, `UpdateStoreRequest`, `AssignUserRequest`
  Class `CreateStoreRequest` line 31: No class docstring.
      Methods: none
  Class `UpdateStoreRequest` line 38: No class docstring.
      Methods: none
  Class `AssignUserRequest` line 47: No class docstring.
      Methods: none
  Functions: `async create_store(body, user, db)`, `async list_stores(user, db)`, `async get_store(store_id, user, db)`, `async update_store(store_id, body, user, db)`, `async assign_user_to_store(body, user, db)`, `async cross_store_summary(user, db)`
           : `async compare_stores(metric, user, db)`, `async stock_transfer_opportunities(user, db)`
- `api/tally_routes.py`
  Approx lines: 106
  Purpose: Tally ERP sync API endpoints.
  Classes: `SyncOrder`, `SyncPO`, `LedgerMapping`
  Class `SyncOrder` line 14: No class docstring.
      Methods: none
  Class `SyncPO` line 23: No class docstring.
      Methods: none
  Class `LedgerMapping` line 30: No class docstring.
      Methods: none
  Functions: `async tally_status()`, `async sync_order(body, user)`, `async sync_purchase(body, user)`, `async get_voucher_xml(order_id, total_amount, gst_amount, payment_method, voucher_type, user)`, `async get_ledger_mappings(user)`, `async set_ledger_mapping(body, user)`
           : `async sync_log(limit, user)`
- `api/udhaar_routes.py`
  Approx lines: 364
  Purpose: Enhanced credit management (udhaar): limits, reminders, partial payments, interest.
  Classes: `CreditRequest`, `PaymentRequest`, `SetLimitRequest`, `InterestConfig`
  Class `CreditRequest` line 17: No class docstring.
      Methods: none
  Class `PaymentRequest` line 26: No class docstring.
      Methods: none
  Class `SetLimitRequest` line 31: No class docstring.
      Methods: none
  Class `InterestConfig` line 193: No class docstring.
      Methods: none
  Functions: `async list_udhaar_ledgers(outstanding_only, user, db)`, `async add_credit(body, user, db)`, `async record_payment(udhaar_id, body, user, db)`, `async set_credit_limit(udhaar_id, body, user, db)`, `async send_reminder(udhaar_id, user, db)`, `async calculate_interest(udhaar_id, user, db)`
           : `async apply_interest(udhaar_id, user, db)`, `async get_ledger_history(udhaar_id, user, db)`, `async udhaar_stats(user, db)`
- `api/vendor_routes.py`
  Approx lines: 361
  Purpose: Vendor portal: supplier self-service, digital purchase orders.
  Classes: `POItemRequest`, `CreatePORequest`, `SupplierUpdateRequest`, `SupplierCatalogItem`
  Class `POItemRequest` line 20: No class docstring.
      Methods: none
  Class `CreatePORequest` line 27: No class docstring.
      Methods: none
  Class `SupplierUpdateRequest` line 206: No class docstring.
      Methods: none
  Class `SupplierCatalogItem` line 238: No class docstring.
      Methods: none
  Functions: `async create_purchase_order(body, user, db)`, `async send_purchase_order(po_number, user, db)`, `async confirm_purchase_order(po_number, db)`, `async receive_purchase_order(po_number, user, db)`, `async pay_purchase_order(po_number, user, db)`, `async list_purchase_orders(status, limit, user, db)`
           : `async get_supplier_profile(supplier_code, db)`, `async update_supplier_profile(supplier_code, body, db)`, `async update_supplier_catalog(supplier_code, items, db)`, `async get_supplier_orders(supplier_code, status, limit, db)`, `async get_supplier_performance(supplier_code, user, db)`, `async list_all_suppliers(user, db)`
- `api/versioning.py`
  Approx lines: 73
  Purpose: API versioning middleware and utilities.
  Classes: `APIVersionMiddleware`
  Class `APIVersionMiddleware` line 25: Route versioned API requests and add version/deprecation headers.
      Methods: `async dispatch(self, request, call_next)`
  Functions: `async get_api_version()`
- `api/voice_routes.py`
  Approx lines: 78
  Purpose: Voice input API — speech-to-text and command parsing for stock operations.
  Classes: `VoiceParseRequest`
  Class `VoiceParseRequest` line 11: No class docstring.
      Methods: none
  Functions: `async voice_status()`, `async parse_voice_text(body)`, `async transcribe_audio(audio, language)`, `async voice_command_pipeline(body)`
- `api/webhook_routes.py`
  Approx lines: 115
  Purpose: Webhook system for third-party integrations.
  Classes: `WebhookRegisterRequest`
  Class `WebhookRegisterRequest` line 23: No class docstring.
      Methods: none
  Functions: `async list_supported_events()`, `async register_webhook(body, user)`, `async list_webhooks(user)`, `async delete_webhook(webhook_id, user)`, `async dispatch_webhook_event(event_name, payload)`
- `api/websocket_manager.py`
  Approx lines: 131
  Purpose: Enhanced WebSocket manager with channel-based subscriptions.
  Classes: `ChannelManager`
  Class `ChannelManager` line 18: WebSocket connection manager with channel subscriptions.
      Methods: `__init__(self)`, `async connect(self, websocket, channels)`, `disconnect(self, websocket)`, `subscribe(self, websocket, channel)`
             : `unsubscribe(self, websocket, channel)`, `async broadcast(self, channel, event_type, data)`, `async send_to(self, websocket, data)`, `connection_count(self)`
             : `get_stats(self)`
  Functions: `async emit_inventory_update(sku, action, details)`, `async emit_order_event(order_id, action, details)`, `async emit_sale_event(sale_data)`, `async emit_alert(alert_type, message, severity, details)`
- `api/whatsapp_routes.py`
  Approx lines: 118
  Purpose: WhatsApp messaging API routes.
  Classes: `SendTextRequest`, `SendTemplateRequest`, `SendUdhaarReminderRequest`, `SendOrderConfirmationRequest`
  Class `SendTextRequest` line 13: No class docstring.
      Methods: none
  Class `SendTemplateRequest` line 18: No class docstring.
      Methods: none
  Class `SendUdhaarReminderRequest` line 25: No class docstring.
      Methods: none
  Class `SendOrderConfirmationRequest` line 32: No class docstring.
      Methods: none
  Functions: `async whatsapp_status(user)`, `async send_text_message(body, user)`, `async send_template_message(body, user)`, `async send_udhaar_reminder(body, user)`, `async send_order_confirmation(body, user)`, `async message_log(user)`
           : `async clear_log(user)`
- `api/workflow_routes.py`
  Approx lines: 296
  Purpose: Workflow improvements: configurable approval chains, undo/rollback, audit search.
  Classes: `ApprovalChainLevel`, `UpdateChainRequest`, `ScheduleReportRequest`
  Class `ApprovalChainLevel` line 98: No class docstring.
      Methods: none
  Class `UpdateChainRequest` line 103: No class docstring.
      Methods: none
  Class `ScheduleReportRequest` line 267: No class docstring.
      Methods: none
  Functions: `_load_approval_config()`, `_save_approval_config(config)`, `get_required_approver_role(chain_name, amount)`, `async get_approval_chains(user)`, `async update_approval_chain(chain_name, body, user)`, `async search_audit_logs(q, skill, event_type, status, date_from, date_to, limit, offset, user, db)`
           : `push_undoable(action_type, data, reverse_data)`, `async get_undo_stack(user)`, `async undo_last_action(user)`, `async create_scheduled_report(body, user)`, `async list_scheduled_reports(user)`

### `runtime`
- `runtime/__init__.py`
  Approx lines: 1
  Purpose: No top-level docstring.
  Classes: none
  Functions: none
- `runtime/approval_manager.py`
  Approx lines: 160
  Purpose: Persistent approval storage and lifecycle management.
  Classes: `ApprovalManager`
  Class `ApprovalManager` line 22: Manages pending approvals with Redis persistence and in-memory fallback.
      Methods: `__init__(self, memory, audit)`, `async save(self, approval_id, data)`, `async get(self, approval_id)`, `async delete(self, approval_id)`
             : `async list_ids(self)`, `pending_approvals(self)`, `async approve(self, approval_id, emit_event_fn)`, `async reject(self, approval_id, reason, skills)`
             : `async get_pending(self)`
  Functions: `_extract_supplier_amount(details)`
- `runtime/audit.py`
  Approx lines: 279
  Purpose: No top-level docstring.
  Classes: `AuditLogger`
  Class `AuditLogger` line 32: Append-only, tamper-proof audit trail.
      Methods: `__init__(self, database_url)`, `async init(self)`, `async log(self, skill, event_type, decision, reasoning, outcome, status, metadata)`, `async get_logs(self, skill, event_type, limit, offset)`
             : `async get_log_count(self)`, `async verify_chain(self)`, `async verify_entry(self, entry_id)`, `get_chain_info(self)`
             : `async close(self)`
  Functions: `_compute_hash(entry, previous_hash)`
- `runtime/context_builder.py`
  Approx lines: 117
  Purpose: Event preprocessing and context enrichment.
  Classes: none
  Functions: `async preprocess_event(event, skills, emit_event)`, `async _run_daily_analytics(skills, emit_event)`
- `runtime/dashboard_api.py`
  Approx lines: 37
  Purpose: No top-level docstring.
  Classes: none
  Functions: `_get_connection()`, `add_manual_market_price(product_id, source_name, price, unit)`, `get_product_dashboard_stats(product_id)`
- `runtime/llm_client.py`
  Approx lines: 153
  Purpose: Unified LLM client — switch between Gemini and Ollama via environment variables.
  Classes: `LLMClient`, `GeminiClient`, `OllamaClient`
  Class `LLMClient` line 38: Abstract base for LLM providers.
      Methods: `async generate(self, prompt, *, timeout)`, `generate_sync(self, prompt, *, image_base64, mime_type)`, `get_raw_client(self)`
  Class `GeminiClient` line 54: Google Gemini via google-genai SDK.
      Methods: `__init__(self, api_key, model)`, `async generate(self, prompt, *, timeout)`, `generate_sync(self, prompt, *, image_base64, mime_type)`, `get_raw_client(self)`
  Class `OllamaClient` line 93: Local Ollama server via HTTP API.
      Methods: `__init__(self, base_url, model)`, `async generate(self, prompt, *, timeout)`, `generate_sync(self, prompt, *, image_base64, mime_type)`, `get_raw_client(self)`
  Functions: `get_llm_client()`, `reset_client()`
- `runtime/logging_config.py`
  Approx lines: 189
  Purpose: Structured logging configuration for RetailOS.
  Classes: `JSONFormatter`, `HumanFormatter`
  Class `JSONFormatter` line 59: Format log records as JSON for structured logging.
      Methods: `format(self, record)`
  Class `HumanFormatter` line 85: Human-readable formatter for development.
      Methods: `format(self, record)`
  Functions: `_extra_fields(record)`, `_merge_runtime_context(_logger, _method_name, event_dict)`, `_add_record_metadata(_logger, _method_name, event_dict)`, `_try_import_structlog()`, `bind_request_context(request_id, user_id, store_id)`, `clear_request_context()`
           : `setup_logging(level, json_format)`, `generate_request_id()`
- `runtime/logging_middleware.py`
  Approx lines: 100
  Purpose: Request logging middleware with correlation IDs.
  Classes: `RequestLoggingMiddleware`
  Class `RequestLoggingMiddleware` line 20: Log all HTTP requests with timing and correlation IDs.
      Methods: `async dispatch(self, request, call_next)`
  Functions: none
- `runtime/memory.py`
  Approx lines: 139
  Purpose: No top-level docstring.
  Classes: `Memory`
  Class `Memory` line 19: Redis-backed persistent memory for RetailOS.
      Methods: `__init__(self, redis_url)`, `async init(self, require_redis)`, `async get(self, key)`, `async set(self, key, value, ttl)`
             : `async delete(self, key)`, `async get_relevant(self, event_type, context)`, `async _scan_keys(self, pattern)`, `async get_all_with_prefix(self, prefix)`
             : `async close(self)`
  Functions: none
- `runtime/metrics.py`
  Approx lines: 175
  Purpose: Prometheus-style metrics collection for RetailOS.
  Classes: `MetricsCollector`
  Class `MetricsCollector` line 18: In-memory metrics collection with Prometheus-compatible output.
      Methods: `__init__(self)`, `record_request(self, method, path, status_code, duration_ms)`, `request_started(self)`, `request_finished(self)`
             : `increment(self, name, value)`, `set_gauge(self, name, value)`, `uptime_seconds(self)`, `get_summary(self)`
             : `get_prometheus_text(self)`, `_format_uptime(self)`
  Functions: none
- `runtime/orchestrator.py`
  Approx lines: 371
  Purpose: Core orchestrator — the brain of RetailOS.
  Classes: `Orchestrator`
  Class `Orchestrator` line 65: Core event loop — routes events to skills via Gemini.
      Methods: `__init__(self, memory, audit, skills, api_key)`, `pending_approvals(self)`, `async start(self)`, `async _handle_skill_task(self, payload)`
             : `async stop(self)`, `async emit_event(self, event)`, `async _event_loop(self)`, `async _process_event(self, event)`
             : `async _route_with_gemini(self, event, context)`, `_fallback_route(self, event)`, `async _execute_skill(self, skill_name, event, params, reason)`, `async _handle_approval(self, skill_name, result, event)`
             : `async approve(self, approval_id)`, `async reject(self, approval_id, reason)`, `async get_pending_approvals(self)`
  Functions: none
- `runtime/skill_loader.py`
  Approx lines: 88
  Purpose: No top-level docstring.
  Classes: `SkillLoader`
  Class `SkillLoader` line 9: Discovers and registers skill files from the skills/ directory.
      Methods: `__init__(self, skills_dir, memory, audit)`, `async discover_and_load(self)`, `get_skill(self, name)`, `list_skills(self)`
             : `async reload_skill(self, name)`
  Functions: none
- `runtime/task_queue.py`
  Approx lines: 235
  Purpose: Async background task queue with Redis-backed persistence.
  Classes: `TaskQueue`
  Class `TaskQueue` line 25: Async task queue with Redis persistence.
      Methods: `__init__(self, memory, max_workers)`, `register_handler(self, task_type, handler)`, `async enqueue(self, task_type, payload, priority, max_retries)`, `async get_result(self, task_id)`
             : `async start(self)`, `async stop(self)`, `async _restore_pending(self)`, `async _worker(self, name)`
             : `async _save_result(self, task_id, result)`, `get_stats(self)`
  Functions: none

### `skills`
- `skills/__init__.py`
  Approx lines: 1
  Purpose: No top-level docstring.
  Classes: none
  Functions: none
- `skills/analytics.py`
  Approx lines: 195
  Purpose: No top-level docstring.
  Classes: `AnalyticsSkill`
  Class `AnalyticsSkill` line 41: Runs daily analysis on audit logs and purchase data.
      Methods: `__init__(self, memory, audit)`, `async init(self)`, `async run(self, event)`, `async _get_inventory_summary(self)`
             : `async _analyze(self, logs, inventory)`, `_fallback_analysis(self, logs, inventory)`
  Functions: none
- `skills/base_skill.py`
  Approx lines: 99
  Purpose: No top-level docstring.
  Classes: `SkillState`, `BaseSkill`
  Class `SkillState` line 7: No class docstring.
      Methods: none
  Class `BaseSkill` line 15: Abstract base class for all RetailOS skills.
      Methods: `__init__(self, name, memory, audit)`, `set_emit_callback(self, callback)`, `async _emit_to_orchestrator(self, event)`, `async init(self)`
             : `async run(self, event)`, `async pause(self)`, `async resume(self)`, `status(self)`
             : `async _safe_run(self, event)`
  Functions: none
- `skills/customer.py`
  Approx lines: 315
  Purpose: No top-level docstring.
  Classes: `CustomerSkill`
  Class `CustomerSkill` line 30: Segments customers and sends personalized WhatsApp offers.
      Methods: `__init__(self, memory, audit)`, `async init(self)`, `async run(self, event)`, `_segment_customers(self, category_or_product)`
             : `async _write_message(self, customer, product_name, discount)`, `_template_message(self, customer, product_name, discount)`, `_detect_template(self, message)`, `async _handle_churn_risk(self, data)`
             : `async _write_reengage_message(self, customer, avg_gap, days_absent)`
  Functions: none
- `skills/inventory.py`
  Approx lines: 365
  Purpose: No top-level docstring.
  Classes: `InventorySkill`
  Class `InventorySkill` line 11: Monitors stock levels and fires alerts when items cross thresholds.
      Methods: `__init__(self, memory, audit)`, `async init(self)`, `async run(self, event)`, `_find_item(self, sku)`
             : `_normalize_item(self, item)`, `_save_inventory(self)`, `_check_item(self, item)`, `async get_full_inventory(self)`
             : `async update_stock(self, sku, quantity, movement_type, unit_price, image_url, category)`, `async register_product(self, product)`, `async patch_item(self, sku, *, unit_price, image_url, category, barcode)`, `async record_sale(self, items)`
  Functions: none
- `skills/negotiation.py`
  Approx lines: 438
  Purpose: No top-level docstring.
  Classes: `NegotiationSkill`
  Class `NegotiationSkill` line 48: Handles supplier outreach via WhatsApp and parses replies.
      Methods: `__init__(self, memory, audit)`, `async init(self)`, `async run(self, event)`, `async _start_negotiation(self, data)`
             : `async _handle_reply(self, data)`, `_get_thread(self, negotiation_id)`, `async _draft_outreach(self, product_name, supplier, relationship, price_context)`, `_template_outreach(self, product_name, supplier)`
             : `async _parse_reply(self, raw_reply, supplier_name)`, `_fallback_parse(self, raw_reply)`, `async _draft_clarification(self, original_reply, missing_fields)`, `async handle_timeout(self, negotiation_id)`
  Functions: none
- `skills/procurement.py`
  Approx lines: 285
  Purpose: No top-level docstring.
  Classes: `ProcurementSkill`
  Class `ProcurementSkill` line 46: Ranks suppliers for a given product using Gemini + memory context.
      Methods: `__init__(self, memory, audit)`, `async init(self)`, `async run(self, event)`, `_find_suppliers(self, product_name, category)`
             : `async _rank_with_gemini(self, product_name, suppliers, memory_context, wastage_context, market_context)`, `_fallback_ranking(self, suppliers)`
  Functions: none
- `skills/scheduling.py`
  Approx lines: 128
  Purpose: No top-level docstring.
  Classes: `SchedulingSkill`
  Class `SchedulingSkill` line 25: Sixth autonomous module targeting physical resourcing management dynamically.
      Methods: `__init__(self, memory, audit)`, `async init(self)`, `async run(self, event)`, `_format_am_pm(self, hour)`
             : `_build_raw_fallback(self, target_date, adequacy)`, `async _review_shifts(self, data)`
  Functions: none
- `skills/shelf_manager.py`
  Approx lines: 447
  Purpose: No top-level docstring.
  Classes: `ShelfManagerSkill`
  Class `ShelfManagerSkill` line 50: Analyzes shelf placements and suggests optimizations based on sales velocity.
      Methods: `__init__(self, memory, audit)`, `async init(self)`, `_persist_shelf_data(self)`, `async clear_suggestions(self)`
             : `async run(self, event)`, `async _run_optimization(self)`, `async _optimize_with_gemini(self, report, zone_availability)`, `_fallback_suggestions(self, report, zone_availability, zone_type_map)`
             : `_validate_suggestions(self, suggestions, zone_type_map, zone_availability)`, `async _apply_approved_moves(self, data)`
  Functions: none

### `brain`
- `brain/__init__.py`
  Approx lines: 1
  Purpose: No top-level docstring.
  Classes: none
  Functions: none
- `brain/auto_approver.py`
  Approx lines: 18
  Purpose: No top-level docstring.
  Classes: none
  Functions: `should_auto_approve(supplier_id, amount)`
- `brain/basket_analyzer.py`
  Approx lines: 200
  Purpose: Basket analysis — frequently bought together.
  Classes: none
  Functions: `_load_orders()`, `_load_inventory()`, `compute_co_occurrences(min_support)`, `get_recommendations_for(sku, top_n)`, `get_category_affinities(min_support)`, `get_basket_summary()`
           : `get_cross_sell_scores(cart_skus, top_n)`
- `brain/churn_detector.py`
  Approx lines: 84
  Purpose: No top-level docstring.
  Classes: none
  Functions: `get_churn_scores(customers, current_time)`, `detect_at_risk_customers(customers, current_time)`
- `brain/config.py`
  Approx lines: 8
  Purpose: No top-level docstring.
  Classes: none
  Functions: none
- `brain/context_builder.py`
  Approx lines: 41
  Purpose: No top-level docstring.
  Classes: none
  Functions: `get_supplier_context(supplier_id)`
- `brain/conversion_scorer.py`
  Approx lines: 58
  Purpose: No top-level docstring.
  Classes: none
  Functions: `get_template_rankings()`, `get_template_context()`
- `brain/db.py`
  Approx lines: 123
  Purpose: Centralized database layer for the brain subsystem.
  Classes: none
  Functions: `_ensure_schema(conn)`, `get_connection()`, `db_exists()`
- `brain/decision_logger.py`
  Approx lines: 32
  Purpose: No top-level docstring.
  Classes: none
  Functions: `log_decision(supplier_id, amount, status)`, `log_delivery(supplier_id, order_id, expected_date, actual_date)`, `log_quality_flag(supplier_id, order_id, reason)`
- `brain/delivery_tracker.py`
  Approx lines: 42
  Purpose: No top-level docstring.
  Classes: none
  Functions: `get_delivery_score(supplier_id)`
- `brain/demand_forecast.py`
  Approx lines: 204
  Purpose: Time-series demand forecasting for inventory planning.
  Classes: none
  Functions: `exponential_smoothing(series, alpha)`, `double_exponential_smoothing(series, alpha, beta)`, `detect_seasonality(series, period)`, `forecast_demand(daily_sales, forecast_days, product_name)`, `bulk_forecast(products, forecast_days)`
- `brain/demand_forecaster.py`
  Approx lines: 106
  Purpose: Time-series demand forecasting using exponential smoothing.
  Classes: none
  Functions: `_load_orders()`, `get_daily_sales_history(sku, days)`, `exponential_smoothing_forecast(series, alpha, horizon)`, `forecast_demand(sku, horizon)`
- `brain/dynamic_pricer.py`
  Approx lines: 108
  Purpose: Dynamic pricing engine.
  Classes: none
  Functions: `_load_inventory()`, `get_price_suggestion(sku)`, `get_all_price_suggestions()`
- `brain/expiry_alerter.py`
  Approx lines: 68
  Purpose: No top-level docstring.
  Classes: none
  Functions: `get_expiry_risks(inventory_items, current_date)`
- `brain/festival_detector.py`
  Approx lines: 25
  Purpose: No top-level docstring.
  Classes: none
  Functions: `check_upcoming_festival(target_date, lookahead_days)`
- `brain/footfall_analyzer.py`
  Approx lines: 48
  Purpose: No top-level docstring.
  Classes: none
  Functions: `log_footfall(process_date, hour, customer_count, transaction_count, source)`, `get_footfall_pattern(day_of_week)`, `get_total_predicted_footfall(day_of_week)`
- `brain/insight_writer.py`
  Approx lines: 51
  Purpose: No top-level docstring.
  Classes: none
  Functions: `async write_daily_insight(memory)`
- `brain/message_tracker.py`
  Approx lines: 36
  Purpose: No top-level docstring.
  Classes: none
  Functions: `log_message_sent(customer_id, message_id, template_used)`, `log_reply(customer_id, message_id)`, `log_conversion(customer_id, message_id, purchase_amount)`
- `brain/price_analyzer.py`
  Approx lines: 54
  Purpose: No top-level docstring.
  Classes: none
  Functions: `analyze_quote(quoted_price, market_ref)`, `format_supplier_verdict(supplier_name, quoted_price, market_ref)`
- `brain/price_monitor.py`
  Approx lines: 69
  Purpose: No top-level docstring.
  Classes: none
  Functions: `log_manual_price(product_id, source_name, price_per_unit, unit)`, `fetch_agmarknet_prices(product_ids)`, `get_market_reference(product_id)`
- `brain/quality_scorer.py`
  Approx lines: 35
  Purpose: No top-level docstring.
  Classes: none
  Functions: `get_quality_score(supplier_id)`
- `brain/recipe_assistant.py`
  Approx lines: 189
  Purpose: No top-level docstring.
  Classes: none
  Functions: `_normalize_recipe_key(value)`, `_load_cache()`, `_save_cache(cache)`, `_fallback_recipe(query)`, `async parse_recipe_request(text)`
- `brain/reorder_optimizer.py`
  Approx lines: 22
  Purpose: No top-level docstring.
  Classes: none
  Functions: `get_optimized_reorder_quantity(product_id, avg_daily_sales, lead_time_days)`
- `brain/seasonal_detector.py`
  Approx lines: 56
  Purpose: No top-level docstring.
  Classes: none
  Functions: `detect_seasonal_spikes(current_date, historical_orders)`
- `brain/shelf_audit.py`
  Approx lines: 174
  Purpose: Image-based shelf audit analysis.
  Classes: `ShelfAuditor`
  Class `ShelfAuditor` line 20: Camera-based shelf compliance checker.
      Methods: `__init__(self)`, `is_configured(self)`, `async analyze_shelf_image(self, image_base64, zone_id, zone_name)`, `async _analyze_with_gemini(self, image_base64, zone_id, zone_name)`
             : `_mock_analysis(self, zone_id, zone_name, error)`, `get_audit_log(self, limit)`, `get_compliance_summary(self)`
  Functions: none
- `brain/shift_optimizer.py`
  Approx lines: 118
  Purpose: No top-level docstring.
  Classes: none
  Functions: `get_current_shifts(shift_date)`, `calculate_adequacy(target_date)`
- `brain/trust_scorer.py`
  Approx lines: 65
  Purpose: No top-level docstring.
  Classes: none
  Functions: `get_trust_score(supplier_id)`
- `brain/velocity_analyzer.py`
  Approx lines: 143
  Purpose: No top-level docstring.
  Classes: none
  Functions: `_load_json(filename, default)`, `classify_velocity(velocity_score)`, `compute_zone_fitness(velocity_score, zone_type)`, `get_velocity_data(sku)`, `get_velocity_report()`
- `brain/voice_input.py`
  Approx lines: 210
  Purpose: Voice-to-text input for stock updates and commands.
  Classes: `VoiceInputProcessor`
  Class `VoiceInputProcessor` line 53: Process voice input (transcribed text) into actionable commands.
      Methods: `__init__(self)`, `get_status(self)`, `parse_command(self, text)`, `_extract_entities(self, intent, match)`
             : `_describe_action(self, intent, entities)`, `async transcribe_audio(self, audio_bytes, language)`
  Functions: none
- `brain/wastage_tracker.py`
  Approx lines: 59
  Purpose: No top-level docstring.
  Classes: none
  Functions: `log_movement(product_id, quantity, movement_type, order_id)`, `get_wastage_summary(product_id, days)`

### `db`
- `db/__init__.py`
  Approx lines: 36
  Purpose: No top-level docstring.
  Classes: none
  Functions: none
- `db/models.py`
  Approx lines: 508
  Purpose: No top-level docstring.
  Classes: `User`, `StoreProfile`, `Product`, `Customer`, `PurchaseHistoryEntry`, `Supplier`
         : `Order`, `OrderItem`, `UdhaarLedger`, `UdhaarEntry`, `Return`, `ReturnItem`
         : `DeliveryRequest`, `DeliveryItem`, `StaffMember`, `StaffShift`, `AttendanceRecord`, `ShelfZone`
         : `ShelfProduct`, `Notification`, `Promotion`, `LoyaltyAccount`, `LoyaltyTransaction`, `PurchaseOrder`
         : `PurchaseOrderItem`, `AuditLog`
  Class `User` line 30: No class docstring.
      Methods: none
  Class `StoreProfile` line 50: No class docstring.
      Methods: none
  Class `Product` line 67: No class docstring.
      Methods: none
  Class `Customer` line 92: No class docstring.
      Methods: none
  Class `PurchaseHistoryEntry` line 111: No class docstring.
      Methods: none
  Class `Supplier` line 127: No class docstring.
      Methods: none
  Class `Order` line 151: No class docstring.
      Methods: none
  Class `OrderItem` line 177: No class docstring.
      Methods: none
  Class `UdhaarLedger` line 193: No class docstring.
      Methods: none
  Class `UdhaarEntry` line 212: No class docstring.
      Methods: none
  Class `Return` line 230: No class docstring.
      Methods: none
  Class `ReturnItem` line 248: No class docstring.
      Methods: none
  Class `DeliveryRequest` line 265: No class docstring.
      Methods: none
  Class `DeliveryItem` line 287: No class docstring.
      Methods: none
  Class `StaffMember` line 302: No class docstring.
      Methods: none
  Class `StaffShift` line 319: No class docstring.
      Methods: none
  Class `AttendanceRecord` line 334: No class docstring.
      Methods: none
  Class `ShelfZone` line 352: No class docstring.
      Methods: none
  Class `ShelfProduct` line 365: No class docstring.
      Methods: none
  Class `Notification` line 381: No class docstring.
      Methods: none
  Class `Promotion` line 402: No class docstring.
      Methods: none
  Class `LoyaltyAccount` line 425: No class docstring.
      Methods: none
  Class `LoyaltyTransaction` line 439: No class docstring.
      Methods: none
  Class `PurchaseOrder` line 454: No class docstring.
      Methods: none
  Class `PurchaseOrderItem` line 472: No class docstring.
      Methods: none
  Class `AuditLog` line 489: No class docstring.
      Methods: none
  Functions: `_gen_id()`, `_now()`
- `db/seed.py`
  Approx lines: 270
  Purpose: Seed the SQLAlchemy database from existing JSON fixture files.
  Classes: none
  Functions: `_load(filename, default)`, `async seed()`
- `db/session.py`
  Approx lines: 66
  Purpose: No top-level docstring.
  Classes: `Base`
  Class `Base` line 11: No class docstring.
      Methods: none
  Functions: `async get_db()`, `async init_db()`, `async close_db()`

### `auth`
- `auth/__init__.py`
  Approx lines: 8
  Purpose: No top-level docstring.
  Classes: none
  Functions: none
- `auth/dependencies.py`
  Approx lines: 148
  Purpose: No top-level docstring.
  Classes: `StoreScopedSession`
  Class `StoreScopedSession` line 95: Wraps an async DB session to auto-filter queries by store_id.
      Methods: `__init__(self, db, store_id)`, `async query(self, model, *extra_filters, order_by, limit)`, `async get_one(self, model, *filters)`
  Functions: `async get_current_user(credentials, db)`, `require_role(minimum_role)`, `async get_store_id(user)`, `async get_store_scoped_session(user, db)`
- `auth/dpdp_compliance.py`
  Approx lines: 222
  Purpose: DPDP Act (Digital Personal Data Protection) compliance utilities.
  Classes: `DPDPComplianceManager`
  Class `DPDPComplianceManager` line 69: DPDP Act compliance management.
      Methods: `__init__(self)`, `record_consent(self, customer_id, purpose, consented, channel)`, `check_consent(self, customer_id, purpose)`, `get_consent_history(self, customer_id)`
             : `generate_data_export(self, customer_data)`, `request_data_erasure(self, customer_id, reason)`, `log_data_breach(self, description, affected_records, data_types, severity)`, `get_data_requests(self, status)`
             : `get_breach_log(self)`, `get_retention_policies(self)`, `get_purpose_registry(self)`
  Functions: none
- `auth/encryption.py`
  Approx lines: 122
  Purpose: Data encryption at rest for sensitive fields.
  Classes: `FieldEncryptor`
  Class `FieldEncryptor` line 32: Encrypt/decrypt sensitive database fields.
      Methods: `__init__(self)`, `_ensure_fernet(self)`, `encrypt(self, plaintext)`, `decrypt(self, ciphertext)`
             : `is_encrypted(self, value)`, `encrypt_dict(self, data, fields)`, `decrypt_dict(self, data, fields)`
  Functions: `_get_key()`, `encrypt_pii(value)`, `decrypt_pii(value)`
- `auth/middleware.py`
  Approx lines: 331
  Purpose: Security middleware: rate limiting, input sanitization, CORS hardening, RBAC.
  Classes: `RateLimitMiddleware`, `SecurityHeadersMiddleware`, `RBACMiddleware`
  Class `RateLimitMiddleware` line 41: Tiered rate limiter with per-IP, per-endpoint, and per-role controls.
      Methods: `__init__(self, app, requests_per_minute)`, `async dispatch(self, request, call_next)`, `get_stats(self)`
  Class `SecurityHeadersMiddleware` line 124: Add security headers to all responses.
      Methods: `async dispatch(self, request, call_next)`
  Class `RBACMiddleware` line 250: Enforce role-based access control on API routes via JWT inspection.
      Methods: `async dispatch(self, request, call_next)`
  Functions: `sanitize_string(value)`, `detect_sql_injection(value)`, `hash_pii(value)`, `mask_phone(phone)`, `mask_email(email)`
- `auth/routes.py`
  Approx lines: 166
  Purpose: No top-level docstring.
  Classes: `RegisterRequest`, `LoginRequest`, `TokenResponse`, `UserResponse`
  Class `RegisterRequest` line 16: No class docstring.
      Methods: none
  Class `LoginRequest` line 26: No class docstring.
      Methods: none
  Class `TokenResponse` line 32: No class docstring.
      Methods: none
  Class `UserResponse` line 39: No class docstring.
      Methods: none
  Functions: `async register(body, db)`, `async login(body, db)`, `async get_me(user)`, `async list_users(user, db)`, `async update_user_role(user_id, role, current_user, db)`, `async deactivate_user(user_id, current_user, db)`
- `auth/security.py`
  Approx lines: 36
  Purpose: No top-level docstring.
  Classes: none
  Functions: `hash_password(password)`, `verify_password(plain, hashed)`, `create_access_token(data, expires_delta)`, `decode_token(token)`

### `notifications`
- `notifications/__init__.py`
  Approx lines: 4
  Purpose: No top-level docstring.
  Classes: none
  Functions: none
- `notifications/email_digest.py`
  Approx lines: 165
  Purpose: Scheduled email digest service.
  Classes: `EmailDigestService`
  Class `EmailDigestService` line 17: Scheduled email digest generator and sender.
      Methods: `__init__(self)`, `is_configured(self)`, `_build_daily_digest_html(self, data)`, `_build_weekly_summary_html(self, data)`
             : `async send_digest(self, to_email, digest_type, data)`, `get_log(self, limit)`
  Functions: none
- `notifications/push.py`
  Approx lines: 126
  Purpose: Web Push Notification service using VAPID protocol.
  Classes: `PushNotificationService`
  Class `PushNotificationService` line 17: VAPID-based web push notification sender.
      Methods: `__init__(self)`, `is_configured(self)`, `get_public_key(self)`, `subscribe(self, user_id, subscription)`
             : `unsubscribe(self, user_id)`, `get_subscription(self, user_id)`, `async send(self, user_id, title, body, icon, url, data)`, `async broadcast(self, title, body, icon, url)`
             : `get_log(self, limit)`, `get_subscribers_count(self)`
  Functions: none
- `notifications/routes.py`
  Approx lines: 51
  Purpose: No top-level docstring.
  Classes: none
  Functions: `async get_notifications(limit, user, db)`, `async mark_read(notification_id, user, db)`, `async mark_all_read(user, db)`
- `notifications/service.py`
  Approx lines: 179
  Purpose: No top-level docstring.
  Classes: `NotificationService`
  Class `NotificationService` line 15: Unified notification dispatcher.
      Methods: `__init__(self)`, `async send(self, db, *, user_id, store_id, channel, title, body, category, priority, metadata)`, `async send_to_role(self, db, *, store_id, role, channel, title, body, category, priority, metadata)`, `async get_unread(self, db, user_id, limit)`
             : `async mark_read(self, db, notification_id)`, `async mark_all_read(self, db, user_id)`, `async _send_email(self, user_id, subject, body, db)`, `async _send_sms(self, user_id, body, db)`
             : `async _send_whatsapp(self, user_id, body, db)`
  Functions: none
- `notifications/sms.py`
  Approx lines: 145
  Purpose: SMS notification service supporting MSG91 and Twilio.
  Classes: `SMSService`
  Class `SMSService` line 16: Multi-provider SMS sender (MSG91, Twilio).
      Methods: `__init__(self)`, `is_configured(self)`, `async send(self, phone, message, template_id, variables)`, `async _send_msg91(self, phone, message, template_id, variables)`
             : `async _send_twilio(self, phone, message)`, `_normalize_phone(self, phone)`, `async send_otp(self, phone, otp)`, `async send_order_update(self, phone, order_id, status)`
             : `async send_payment_confirmation(self, phone, amount, order_id)`, `async send_low_stock_alert(self, phone, product_name, current_stock)`, `get_log(self, limit)`, `clear_log(self)`
  Functions: none
- `notifications/whatsapp.py`
  Approx lines: 178
  Purpose: WhatsApp Business API integration via Gupshup/Meta Cloud API.
  Classes: `WhatsAppClient`
  Class `WhatsAppClient` line 26: Async WhatsApp Business API client.
      Methods: `__init__(self)`, `is_configured(self)`, `async _send(self, payload)`, `async send_text(self, to, message)`
             : `async send_template(self, to, template_name, language_code, parameters)`, `async send_document(self, to, document_url, filename, caption)`, `async send_image(self, to, image_url, caption)`, `async send_order_confirmation(self, phone, order_id, total, items_count)`
             : `async send_udhaar_reminder(self, phone, customer_name, balance, due_date)`, `async send_delivery_update(self, phone, order_id, status, eta)`, `async send_digital_receipt(self, phone, receipt_url, order_id)`
  Functions: `get_message_log()`, `clear_message_log()`

### `reports`
- `reports/__init__.py`
  Approx lines: 1
  Purpose: No top-level docstring.
  Classes: none
  Functions: none
- `reports/generators.py`
  Approx lines: 443
  Purpose: Report generators for PDF and Excel exports.
  Classes: none
  Functions: `generate_sales_excel(orders, date_from, date_to)`, `generate_pnl_pdf(revenue, cost_of_goods, gst_collected, returns_amount, period, store_name)`, `generate_gst_excel(orders, date_from, date_to)`, `generate_inventory_excel(products)`, `generate_inventory_pdf(products)`, `generate_customer_excel(customers, date_from, date_to)`
           : `generate_daily_summary_pdf(date_str, revenue, orders_count, top_products, payment_breakdown, store_name)`, `_days_left(product)`
- `reports/gst_invoice.py`
  Approx lines: 260
  Purpose: GST-compliant invoice PDF generator.
  Classes: none
  Functions: `generate_gst_invoice(invoice_number, invoice_date, seller, buyer, items, place_of_supply, reverse_charge, notes)`, `_amount_in_words(amount)`
- `reports/gst_returns.py`
  Approx lines: 288
  Purpose: GST Returns export generators (GSTR-1, GSTR-3B format).
  Classes: none
  Functions: `generate_gstr1_excel(invoices, date_from, date_to, gstin, store_name)`, `generate_gstr3b_excel(sales_data, purchase_data, date_from, date_to, gstin)`, `generate_pnl_excel(revenue, cost_of_goods, gst_collected, returns_amount, expenses, period, store_name)`, `_header_row(ws, row, text)`, `_styled_headers(ws, row, headers)`, `_auto_width(wb)`
- `reports/routes.py`
  Approx lines: 358
  Purpose: No top-level docstring.
  Classes: `InvoiceItem`, `InvoiceParty`, `GenerateInvoiceRequest`
  Class `InvoiceItem` line 302: No class docstring.
      Methods: none
  Class `InvoiceParty` line 311: No class docstring.
      Methods: none
  Class `GenerateInvoiceRequest` line 319: No class docstring.
      Methods: none
  Functions: `_read_json(filename, default)`, `async export_sales_excel(date_from, date_to, user)`, `async export_pnl_pdf(date_from, date_to, user)`, `async export_gst_excel(date_from, date_to, user)`, `async export_inventory_excel(user)`, `async export_inventory_pdf(user)`
           : `async export_customer_excel(date_from, date_to, user)`, `async export_daily_summary_pdf(date_str, user)`, `async export_pnl_excel(date_from, date_to, user)`, `async export_gstr1(date_from, date_to, user)`, `async export_gstr3b(date_from, date_to, user)`, `async generate_invoice(body, user)`

### `payments`
- `payments/__init__.py`
  Approx lines: 2
  Purpose: Payment gateway integrations for RetailOS.
  Classes: none
  Functions: none
- `payments/razorpay_client.py`
  Approx lines: 167
  Purpose: Razorpay payment gateway integration.
  Classes: `RazorpayClient`
  Class `RazorpayClient` line 23: Async Razorpay API client.
      Methods: `__init__(self, key_id, key_secret)`, `is_configured(self)`, `async _request(self, method, path, data)`, `async create_order(self, amount_paise, currency, receipt, notes)`
             : `async fetch_order(self, order_id)`, `async fetch_payment(self, payment_id)`, `async create_refund(self, payment_id, amount_paise, notes)`, `async fetch_refund(self, payment_id, refund_id)`
             : `verify_payment_signature(self, razorpay_order_id, razorpay_payment_id, razorpay_signature)`, `verify_webhook_signature(self, body, signature, webhook_secret)`
  Functions: `record_payment(order_id, amount, method, status, customer_id, razorpay_payment_id, razorpay_order_id)`, `get_payment_records(order_id, customer_id)`

### `integrations`
- `integrations/__init__.py`
  Approx lines: 1
  Purpose: No top-level docstring.
  Classes: none
  Functions: none
- `integrations/pos_hardware.py`
  Approx lines: 249
  Purpose: POS hardware integration — barcode scanners and receipt printers.
  Classes: `ReceiptPrinter`, `BarcodeScanner`
  Class `ReceiptPrinter` line 22: ESC/POS receipt printer driver.
      Methods: `__init__(self)`, `is_configured(self)`, `get_status(self)`, `generate_receipt(self, order, store)`
             : `print_receipt(self, receipt_bytes)`, `get_print_log(self, limit)`
  Class `BarcodeScanner` line 192: Barcode scanner configuration and utilities.
      Methods: `validate_ean13(barcode)`, `detect_format(barcode)`, `get_scanner_config()`
  Functions: none
- `integrations/tally.py`
  Approx lines: 183
  Purpose: Tally ERP integration for accounting sync.
  Classes: `TallySync`
  Class `TallySync` line 34: Tally ERP sync client.
      Methods: `__init__(self)`, `is_configured(self)`, `map_ledger(self, retailos_name, tally_name)`, `get_ledger_mappings(self)`
             : `generate_sales_voucher_xml(self, order)`, `generate_purchase_voucher_xml(self, po)`, `async sync_order(self, order)`, `async sync_purchase_order(self, po)`
             : `get_sync_log(self, limit)`, `get_voucher_xml(self, order, voucher_type)`
  Functions: none

### `scheduler`
- `scheduler/__init__.py`
  Approx lines: 2
  Purpose: RetailOS task scheduler — cron-like background jobs.
  Classes: none
  Functions: none
- `scheduler/engine.py`
  Approx lines: 233
  Purpose: Lightweight async task scheduler for RetailOS.
  Classes: `ScheduledJob`, `Scheduler`
  Class `ScheduledJob` line 19: No class docstring.
      Methods: none
  Class `Scheduler` line 31: Simple interval-based async scheduler.
      Methods: `__init__(self)`, `add_job(self, name, func, interval_seconds, description, enabled)`, `remove_job(self, name)`, `enable_job(self, name)`
             : `disable_job(self, name)`, `list_jobs(self)`, `async _run_loop(self)`, `start(self)`
             : `stop(self)`
  Functions: `async job_expiry_alerts()`, `async job_low_stock_check()`, `async job_udhaar_reminders()`, `register_default_jobs(scheduler)`

### `i18n`
- `i18n/__init__.py`
  Approx lines: 6
  Purpose: RetailOS Internationalization (i18n) system.
  Classes: none
  Functions: none
- `i18n/service.py`
  Approx lines: 130
  Purpose: i18n service — translate keys, detect language, parse voice commands.
  Classes: none
  Functions: `translate(key, lang, **kwargs)`, `t(key, lang, **kwargs)`, `get_all_translations(lang)`, `detect_language_from_text(text)`, `parse_voice_command(text)`
- `i18n/translations.py`
  Approx lines: 335
  Purpose: Translation strings for RetailOS.
  Classes: none
  Functions: none

### `tests`
- `tests/__init__.py`
  Approx lines: 1
  Purpose: No top-level docstring.
  Classes: none
  Functions: none
- `tests/conftest.py`
  Approx lines: 109
  Purpose: Shared test fixtures for integration tests.
  Classes: none
  Functions: `_make_mock_orchestrator()`, `async setup_db()`, `async db_session(setup_db)`, `async app(setup_db)`, `async client(app)`, `async authed_client(app)`
           : `async register_user(client, username, role)`, `auth_header(token)`
- `tests/test_api.py`
  Approx lines: 174
  Purpose: API integration tests — auth flow, CRUD endpoints, error handling.
  Classes: none
  Functions: `async test_register_user(client)`, `async test_register_duplicate_username(client)`, `async test_register_invalid_role(client)`, `async test_login_success(client)`, `async test_login_wrong_password(client)`, `async test_login_nonexistent_user(client)`
           : `async test_get_me(client)`, `async test_get_me_no_token(client)`, `async test_health_endpoint(client)`, `async test_health_ready(client)`, `async test_health_live(client)`, `async test_webhook_events_list(client)`
           : `async test_i18n_languages(client)`, `async test_i18n_translations(client)`, `async test_i18n_translate_key(client)`, `async test_plugins_endpoint(client)`
- `tests/test_async_runtime.py`
  Approx lines: 122
  Purpose: No top-level docstring.
  Classes: `DummySkill`
  Class `DummySkill` line 21: No class docstring.
      Methods: `__init__(self, name, result)`, `async init(self)`, `async run(self, event)`
  Functions: `_mock_llm(text)`, `async test_orchestrator_process_event_uses_mocked_gemini_route(audit_mock)`, `async test_orchestrator_queues_pending_approval(audit_mock)`, `async test_procurement_ranking_parses_fenced_json()`, `async test_negotiation_outreach_returns_mocked_gemini_text()`
- `tests/test_auth.py`
  Approx lines: 29
  Purpose: Integration tests for authentication system.
  Classes: none
  Functions: `test_password_hashing()`, `test_jwt_creation_and_decoding()`, `test_expired_token()`, `test_invalid_token()`
- `tests/test_brain.py`
  Approx lines: 72
  Purpose: Integration tests for brain modules.
  Classes: none
  Functions: `test_churn_detector_on_schedule()`, `test_churn_detector_at_risk()`, `test_exponential_smoothing_stable()`, `test_exponential_smoothing_increasing()`, `test_exponential_smoothing_insufficient_data()`, `test_basket_analysis_runs()`
           : `test_price_suggestion_missing_sku()`
- `tests/test_brain_modules.py`
  Approx lines: 558
  Purpose: Comprehensive tests for brain/ modules.
  Classes: `TestBrainDB`, `TestDecisionLogger`, `TestDeliveryTracker`, `TestQualityScorer`, `TestTrustScorer`, `TestWastageTracker`
         : `TestReorderOptimizer`, `TestExpiryAlerter`, `TestFootfallAnalyzer`, `TestMessageTracker`, `TestConversionScorer`, `TestPriceMonitor`
         : `TestPriceAnalyzer`, `TestChurnDetector`, `TestSeasonalDetector`
  Class `TestBrainDB` line 40: No class docstring.
      Methods: `test_get_connection_creates_tables(self)`, `test_get_connection_idempotent(self)`, `test_db_exists(self)`
  Class `TestDecisionLogger` line 73: No class docstring.
      Methods: `test_log_decision(self)`, `test_log_delivery(self)`, `test_log_quality_flag(self)`
  Class `TestDeliveryTracker` line 107: No class docstring.
      Methods: `test_perfect_delivery_score(self)`, `test_late_delivery_lowers_score(self)`, `test_unknown_supplier(self)`
  Class `TestQualityScorer` line 132: No class docstring.
      Methods: `test_no_complaints(self)`, `test_high_complaint_ratio(self)`
  Class `TestTrustScorer` line 153: No class docstring.
      Methods: `test_perfect_supplier(self)`, `test_late_delivery_lowers_trust(self)`, `test_quality_complaints_lower_trust(self)`, `test_new_supplier(self)`
  Class `TestWastageTracker` line 204: No class docstring.
      Methods: `test_log_movement_valid(self)`, `test_log_movement_invalid_type(self)`, `test_wastage_summary(self)`, `test_no_wastage(self)`
  Class `TestReorderOptimizer` line 238: No class docstring.
      Methods: `test_high_wastage_reduces_order(self)`, `test_zero_wastage(self)`
  Class `TestExpiryAlerter` line 262: No class docstring.
      Methods: `test_slow_seller_flagged(self)`, `test_fast_seller_not_flagged(self)`, `test_no_metadata_no_risk(self)`
  Class `TestFootfallAnalyzer` line 300: No class docstring.
      Methods: `test_log_and_retrieve_pattern(self)`, `test_total_predicted(self)`
  Class `TestMessageTracker` line 329: No class docstring.
      Methods: `test_log_and_track(self)`, `test_auto_generate_message_id(self)`
  Class `TestConversionScorer` line 353: No class docstring.
      Methods: `test_template_rankings(self)`, `test_template_context_string(self)`, `test_empty_rankings(self)`
  Class `TestPriceMonitor` line 391: No class docstring.
      Methods: `test_log_and_get_reference(self)`, `test_old_data_low_confidence(self)`, `test_no_data(self)`
  Class `TestPriceAnalyzer` line 426: No class docstring.
      Methods: `test_above_market(self)`, `test_below_market(self)`, `test_at_market(self)`, `test_suspiciously_low(self)`
             : `test_suspiciously_high(self)`, `test_no_market_data(self)`, `test_format_verdict_above(self)`, `test_format_verdict_below(self)`
  Class `TestChurnDetector` line 480: No class docstring.
      Methods: `test_on_schedule_low_score(self)`, `test_lapsed_high_score(self)`, `test_detect_at_risk(self)`, `test_insufficient_data_skipped(self)`
  Class `TestSeasonalDetector` line 530: No class docstring.
      Methods: `test_detects_april_spike(self)`, `test_no_spike(self)`, `test_empty_orders(self)`
  Functions: `_isolate_brain_db(tmp_path)`
- `tests/test_business_logic.py`
  Approx lines: 179
  Purpose: Business logic tests — dynamic pricer, webhook dispatch, plugin system.
  Classes: `TestDynamicPricer`, `TestWebhookDispatch`, `TestPluginSystem`
  Class `TestDynamicPricer` line 13: No class docstring.
      Methods: `test_unknown_sku_returns_error(self)`, `test_suggestion_has_required_fields(self)`, `test_suggested_price_has_floor(self)`
  Class `TestWebhookDispatch` line 36: No class docstring.
      Methods: `setup_method(self)`, `teardown_method(self)`, `async test_dispatch_to_matching_webhook(self)`, `async test_dispatch_skips_non_matching_event(self)`
             : `async test_dispatch_skips_inactive_webhook(self)`, `async test_dispatch_increments_failure_on_error(self)`, `test_supported_events_not_empty(self)`
  Class `TestPluginSystem` line 144: No class docstring.
      Methods: `test_plugin_context_event_registration(self)`, `async test_plugin_context_dispatch_event(self)`, `async test_plugin_context_dispatch_handles_error(self)`, `test_discover_plugins_returns_list(self)`
             : `test_loaded_plugins_property(self)`
  Functions: none
- `tests/test_encryption.py`
  Approx lines: 55
  Purpose: Tests for PII encryption and DPDP compliance.
  Classes: none
  Functions: `test_encrypt_decrypt_roundtrip()`, `test_encrypt_empty_string()`, `test_decrypt_plaintext_returns_as_is()`, `test_is_encrypted()`, `test_different_encryptions_differ()`, `test_pii_fields_registry()`
           : `test_encrypt_unicode()`
- `tests/test_forecasting.py`
  Approx lines: 99
  Purpose: Tests for demand forecasting and time-series analysis.
  Classes: none
  Functions: `test_exponential_smoothing_basic()`, `test_exponential_smoothing_constant_series()`, `test_double_exponential_smoothing_trending()`, `test_detect_seasonality_weekly()`, `test_detect_seasonality_none()`, `test_forecast_demand_full()`
           : `test_forecast_demand_insufficient_data()`, `test_forecast_demand_with_reorder()`, `test_bulk_forecast()`
- `tests/test_gst_reports.py`
  Approx lines: 97
  Purpose: Tests for GST return generation and P&L reports.
  Classes: none
  Functions: `_make_invoices()`, `test_gstr1_excel_generates()`, `test_gstr1_b2b_has_gstin_entries()`, `test_gstr1_b2c_has_non_gstin_entries()`, `test_gstr3b_excel_generates()`, `test_pnl_excel_generates()`
           : `test_gstr1_empty_orders()`
- `tests/test_i18n.py`
  Approx lines: 157
  Purpose: i18n and voice command tests.
  Classes: `TestTranslations`, `TestLanguageDetection`, `TestVoiceCommands`, `TestVoiceCommandAPI`
  Class `TestTranslations` line 15: No class docstring.
      Methods: `test_english_default(self)`, `test_hindi_translation(self)`, `test_marathi_translation(self)`, `test_fallback_to_english(self)`
             : `test_unknown_key_returns_key(self)`, `test_unknown_language_falls_back(self)`, `test_placeholder_substitution(self)`, `test_all_languages_exist(self)`
             : `test_get_all_translations_merges(self)`
  Class `TestLanguageDetection` line 60: No class docstring.
      Methods: `test_detect_english(self)`, `test_detect_hindi(self)`, `test_detect_tamil(self)`, `test_detect_telugu(self)`
             : `test_detect_bengali(self)`, `test_detect_gujarati(self)`, `test_detect_kannada(self)`, `test_detect_empty_defaults_english(self)`
             : `test_detect_numbers_defaults_english(self)`
  Class `TestVoiceCommands` line 89: No class docstring.
      Methods: `test_english_stock_check(self)`, `test_hindi_stock_check(self)`, `test_english_stock_update(self)`, `test_english_daily_report(self)`
             : `test_hindi_daily_report(self)`, `test_english_low_stock(self)`, `test_unknown_command(self)`, `test_empty_command(self)`
             : `test_english_new_order(self)`, `test_command_has_raw_text(self)`
  Class `TestVoiceCommandAPI` line 136: No class docstring.
      Methods: `async test_voice_command_endpoint(self, client)`, `async test_voice_command_hindi(self, client)`, `async test_detect_language_endpoint(self, client)`
  Functions: none
- `tests/test_middleware.py`
  Approx lines: 38
  Purpose: Tests for security middleware utilities.
  Classes: none
  Functions: `test_sanitize_removes_script_tags()`, `test_sanitize_html_encodes()`, `test_detect_sql_injection_true()`, `test_detect_sql_injection_false()`, `test_mask_phone()`, `test_mask_email()`
- `tests/test_models.py`
  Approx lines: 251
  Purpose: Database model tests — CRUD operations, constraints, relationships.
  Classes: none
  Functions: `async test_create_store(db_session)`, `async test_create_user_with_store(db_session)`, `async test_create_product(db_session)`, `async test_create_customer(db_session)`, `async test_create_order_with_items(db_session)`, `async test_create_udhaar_ledger(db_session)`
           : `async test_create_loyalty_account(db_session)`, `async test_create_notification(db_session)`, `async test_create_promotion(db_session)`, `async test_user_defaults(db_session)`, `async test_product_defaults(db_session)`
- `tests/test_promotions_api.py`
  Approx lines: 193
  Purpose: Integration tests for promotions, payments, and notification endpoints.
  Classes: none
  Functions: `async test_create_promotion(client)`, `async test_list_promotions(client)`, `async test_create_combo_deal(client)`, `async test_payment_config(client)`, `async test_record_offline_payment(client)`, `async test_payment_history(client)`
           : `async test_push_status(client)`, `async test_sms_status(client)`, `async test_digest_status(client)`, `async test_tally_status(client)`, `async test_shelf_audit_status(client)`, `async test_encryption_status(client)`
           : `async test_compliance_purposes(client)`, `async test_compliance_retention(client)`, `async test_api_version_endpoint(client)`, `async test_versioned_endpoint_works(client)`, `async test_legacy_endpoint_deprecation_header(client)`, `async test_websocket_stats(client)`
           : `async test_scheduler_jobs(client)`, `async test_backup_status(client)`
- `tests/test_roles.py`
  Approx lines: 103
  Purpose: Role-based access control tests — verify role hierarchy enforcement.
  Classes: none
  Functions: `async test_owner_can_list_users(client)`, `async test_staff_cannot_list_users(client)`, `async test_cashier_cannot_list_users(client)`, `async test_cashier_can_access_me(client)`, `async test_owner_can_register_webhook(client)`, `async test_staff_cannot_register_webhook(client)`
           : `async test_invalid_token_rejected(client)`, `async test_expired_token_rejected(client)`, `async test_owner_can_deactivate_user(client)`, `async test_owner_cannot_deactivate_self(client)`, `async test_staff_cannot_deactivate_users(client)`
- `tests/test_tally.py`
  Approx lines: 68
  Purpose: Tests for Tally ERP integration.
  Classes: none
  Functions: `test_tally_sync_init_demo_mode()`, `test_generate_sales_voucher_xml()`, `test_generate_purchase_voucher_xml()`, `test_ledger_mappings()`, `test_sync_log_starts_empty()`
- `tests/test_websocket.py`
  Approx lines: 115
  Purpose: Tests for WebSocket channel manager.
  Classes: none
  Functions: `manager()`, `_mock_ws(accept)`, `async test_connect_default_channels(manager)`, `async test_connect_specific_channels(manager)`, `async test_disconnect(manager)`, `async test_subscribe(manager)`
           : `async test_unsubscribe(manager)`, `async test_broadcast_reaches_subscribed(manager)`, `async test_broadcast_skips_unsubscribed(manager)`, `async test_disconnects_on_send_error(manager)`, `async test_get_stats(manager)`, `async test_invalid_channel_ignored(manager)`

### `e2e`
- `e2e/conftest.py`
  Approx lines: 18
  Purpose: Playwright E2E test configuration.
  Classes: none
  Functions: `base_url()`, `dashboard_url()`
- `e2e/playwright.config.py`
  Approx lines: 16
  Purpose: Playwright test configuration.
  Classes: none
  Functions: none
- `e2e/test_api_e2e.py`
  Approx lines: 198
  Purpose: End-to-end API tests using Playwright.
  Classes: `TestHealthEndpoints`, `TestAuthFlow`, `TestAPIEndpoints`, `TestDashboardUI`, `TestPaymentFlow`
  Class `TestHealthEndpoints` line 24: Test health check endpoints are accessible.
      Methods: `test_health_check(self, page, base_url)`, `test_health_ready(self, page, base_url)`, `test_health_live(self, page, base_url)`, `test_openapi_docs(self, page, base_url)`
  Class `TestAuthFlow` line 50: Test complete authentication flow.
      Methods: `test_register_login_flow(self, page, base_url)`, `test_login_invalid_credentials(self, page, base_url)`, `test_protected_route_without_token(self, page, base_url)`
  Class `TestAPIEndpoints` line 92: Test key API endpoints work end-to-end.
      Methods: `setup_auth(self, page, base_url)`, `test_i18n_languages(self, page, base_url)`, `test_webhook_events(self, page, base_url)`, `test_payment_config(self, page, base_url)`
             : `test_whatsapp_status(self, page, base_url)`, `test_push_vapid_key(self, page, base_url)`, `test_sms_status(self, page, base_url)`, `test_scheduler_jobs(self, page, base_url)`
             : `test_backup_list(self, page, base_url)`
  Class `TestDashboardUI` line 145: Test dashboard loads and renders correctly.
      Methods: `test_dashboard_loads(self, page, dashboard_url)`, `test_dashboard_has_navigation(self, page, dashboard_url)`
  Class `TestPaymentFlow` line 165: Test payment recording flow.
      Methods: `setup_auth(self, page, base_url)`, `test_record_offline_payment(self, page, base_url)`, `test_payment_history(self, page, base_url)`
  Functions: none

### `alembic`
- `alembic/env.py`
  Approx lines: 62
  Purpose: No top-level docstring.
  Classes: none
  Functions: `run_migrations_offline()`, `run_migrations_online()`
- `alembic/versions/001_core_stores_users.py`
  Approx lines: 52
  Purpose: core: stores and users
  Classes: none
  Functions: `upgrade()`, `downgrade()`
- `alembic/versions/002_inventory_crm.py`
  Approx lines: 98
  Purpose: inventory: products, customers, purchase_history, suppliers
  Classes: none
  Functions: `upgrade()`, `downgrade()`
- `alembic/versions/003_transactions.py`
  Approx lines: 153
  Purpose: transactions: orders, udhaar, returns, deliveries
  Classes: none
  Functions: `upgrade()`, `downgrade()`
- `alembic/versions/004_staff_ops.py`
  Approx lines: 88
  Purpose: staff & store ops: staff_members, shifts, attendance, shelf zones
  Classes: none
  Functions: `upgrade()`, `downgrade()`
- `alembic/versions/005_features_audit.py`
  Approx lines: 135
  Purpose: features & audit: notifications, promotions, loyalty, purchase orders, audit logs
  Classes: none
  Functions: `upgrade()`, `downgrade()`

### `config`
- `config/__init__.py`
  Approx lines: 1
  Purpose: No top-level docstring.
  Classes: none
  Functions: none
- `config/settings.py`
  Approx lines: 144
  Purpose: Centralized configuration with environment-based profiles.
  Classes: `Settings`
  Class `Settings` line 20: Application settings resolved from environment variables.
      Methods: `is_production(self)`, `is_staging(self)`, `is_development(self)`
  Functions: `_detect_env()`, `_load_settings()`

### `conftest.py`
- `conftest.py`
  Approx lines: 52
  Purpose: Shared fixtures for root-level tests.
  Classes: none
  Functions: `isolated_brain_db(tmp_path, monkeypatch)`, `audit_mock()`, `gemini_client_factory()`, `mock_llm_factory()`

### `loadtest`
- `loadtest/locustfile.py`
  Approx lines: 171
  Purpose: Load testing for RetailOS using Locust.
  Classes: `RetailOSUser`, `CashierUser`
  Class `RetailOSUser` line 17: Simulates a typical RetailOS user (cashier/staff/owner).
      Methods: `on_start(self)`, `auth_headers(self)`, `health_check(self)`, `health_ready(self)`
             : `get_me(self)`, `list_languages(self)`, `get_translations(self)`, `voice_command(self)`
             : `list_webhook_events(self)`, `payment_config(self)`, `payment_history(self)`, `record_payment(self)`
             : `list_scheduled_jobs(self)`, `whatsapp_status(self)`, `list_plugins(self)`
  Class `CashierUser` line 124: Simulates a cashier doing rapid POS lookups.
      Methods: `on_start(self)`, `auth_headers(self)`, `barcode_search(self)`, `barcode_lookup(self)`
             : `record_sale(self)`
  Functions: none

### `plugins`
- `plugins/__init__.py`
  Approx lines: 8
  Purpose: RetailOS Plugin System.
  Classes: none
  Functions: none
- `plugins/loader.py`
  Approx lines: 106
  Purpose: Plugin loader for RetailOS.
  Classes: `PluginContext`
  Class `PluginContext` line 40: Context object passed to each plugin's register() function.
      Methods: `on_event(self, event_name, handler)`, `async dispatch_event(self, event_name, payload)`, `loaded_plugins(self)`
  Functions: `discover_plugins()`, `load_plugins(app)`

### `scripts`
- `scripts/generate_project_explainer.py`
  Approx lines: 1585
  Purpose: No top-level docstring.
  Classes: none
  Functions: `include_path(path)`, `read_text(path)`, `first_line(text)`, `chunks(values, size)`, `display_or_none(value)`, `function_signature(node)`
           : `parse_python_module(path)`, `collect_python_modules()`, `collect_js_files()`, `collect_routes()`, `collect_db_models()`, `collect_event_memory_map()`
           : `collect_env_vars()`, `inspect_json_file(path)`, `inspect_sqlite_file(path)`, `collect_data_inventory()`, `parse_test_file(path)`, `collect_test_inventory()`
           : `count_routes(routes)`, `count_tests(test_inventory)`, `lookup_module(python_modules, rel_path)`, `class_methods(module_info, class_name)`, `top_route_files(routes, limit)`, `top_python_files(python_modules, limit)`
           : `narrative(python_modules, js_files, routes, db_models, event_memory_map, env_groups, data_inventory, test_inventory)`, `wrapped_lines(label, values, indent, chunk_size)`, `format_db_models(db_models)`, `format_event_memory_map(event_memory_map)`, `format_routes(routes)`, `format_env_inventory(env_groups)`
           : `format_data_inventory(data_inventory)`, `format_test_inventory(test_inventory)`, `format_python_inventory(python_modules)`, `format_frontend_inventory(js_files)`, `build_markdown()`, `escape_paragraph(text)`
           : `_page_number(canvas, doc)`, `render_pdf(markdown_text)`, `main()`

### `test_customer_features.py`
- `test_customer_features.py`
  Approx lines: 70
  Purpose: No top-level docstring.
  Classes: none
  Functions: `test_template_rankings_prioritize_conversion_rate(isolated_brain_db)`, `test_churn_detection_thresholds()`, `test_template_context_contains_top_performer(isolated_brain_db)`

### `test_e2e_day.py`
- `test_e2e_day.py`
  Approx lines: 62
  Purpose: No top-level docstring.
  Classes: `_WorkflowSkill`
  Class `_WorkflowSkill` line 11: No class docstring.
      Methods: `__init__(self, name, result)`, `async init(self)`, `async run(self, event)`
  Functions: `async test_orchestrator_day_flow_smoke()`

### `test_inventory_features.py`
- `test_inventory_features.py`
  Approx lines: 90
  Purpose: No top-level docstring.
  Classes: none
  Functions: `test_high_expiry_products_get_lower_reorder_quantity(isolated_brain_db)`, `test_expiry_risk_respects_sales_velocity(isolated_brain_db)`, `async test_procurement_prompt_uses_wastage_adjusted_context(isolated_brain_db)`, `async test_expiry_risk_fallback_routes_inventory_and_customer(audit_mock)`

### `test_pricing_features.py`
- `test_pricing_features.py`
  Approx lines: 68
  Purpose: No top-level docstring.
  Classes: none
  Functions: `test_price_verdicts_against_market_reference(isolated_brain_db)`, `test_old_quotes_downgrade_confidence(isolated_brain_db)`, `async test_negotiation_prompt_includes_market_reference(isolated_brain_db, mock_llm_factory)`

### `test_scheduling_features.py`
- `test_scheduling_features.py`
  Approx lines: 105
  Purpose: No top-level docstring.
  Classes: none
  Functions: `_seed_footfall_history()`, `_next_target_saturday()`, `test_peak_saturday_is_flagged_understaffed(isolated_brain_db)`, `test_festival_multiplier_increases_projection(isolated_brain_db)`, `test_sufficient_staff_clears_understaffed_blocks(isolated_brain_db)`, `async test_scheduling_review_needs_approval_and_has_fallback_format(isolated_brain_db, mock_llm_factory)`

### `test_trust_features.py`
- `test_trust_features.py`
  Approx lines: 55
  Purpose: No top-level docstring.
  Classes: none
  Functions: `test_late_deliveries_reduce_trust_score(isolated_brain_db)`, `test_quality_flags_reduce_trust_score(isolated_brain_db)`, `test_seasonal_detector_emits_preempt_event()`

## 26. Appendix H: dashboard file inventory

- `dashboard/src/App.jsx`
  Approx lines: 691
  Exports: `App`
- `dashboard/src/ApprovalQueue.jsx`
  Approx lines: 143
  Exports: `ApprovalQueue`
- `dashboard/src/AuditLog.jsx`
  Approx lines: 148
  Exports: `AuditLog`
- `dashboard/src/DemoControls.jsx`
  Approx lines: 196
  Exports: `DemoControls`
- `dashboard/src/Scheduling.jsx`
  Approx lines: 57
  Exports: `Scheduling`
- `dashboard/src/SkillStatus.jsx`
  Approx lines: 97
  Exports: `SkillStatus`
- `dashboard/src/components/AgentsTab.jsx`
  Approx lines: 181
  Exports: `AgentsTab`
- `dashboard/src/components/AlertsPanel.jsx`
  Approx lines: 165
  Exports: `AlertsPanel`
- `dashboard/src/components/ApprovalsTab.jsx`
  Approx lines: 303
  Exports: `ApprovalsTab`
- `dashboard/src/components/BarcodeScannerTab.jsx`
  Approx lines: 291
  Exports: `BarcodeScannerTab`
- `dashboard/src/components/CartTab.jsx`
  Approx lines: 586
  Exports: `CartTab`
- `dashboard/src/components/CustomerAssistantTab.jsx`
  Approx lines: 927
  Exports: `CustomerAssistantTab`
- `dashboard/src/components/CustomersTab.jsx`
  Approx lines: 511
  Exports: `CustomersTab`
- `dashboard/src/components/DeliveryQueueTab.jsx`
  Approx lines: 232
  Exports: `DeliveryQueueTab`
- `dashboard/src/components/FinancialsTab.jsx`
  Approx lines: 373
  Exports: `FinancialsTab`
- `dashboard/src/components/HomeTab.jsx`
  Approx lines: 408
  Exports: `HomeTab`
- `dashboard/src/components/InventoryTab.jsx`
  Approx lines: 866
  Exports: `InventoryTab`
- `dashboard/src/components/LoginForm.jsx`
  Approx lines: 127
  Exports: `LoginForm`
- `dashboard/src/components/LoyaltyTab.jsx`
  Approx lines: 96
  Exports: `LoyaltyTab`
- `dashboard/src/components/OrdersTab.jsx`
  Approx lines: 484
  Exports: `OrdersTab`
- `dashboard/src/components/PaymentsTab.jsx`
  Approx lines: 162
  Exports: `PaymentsTab`
- `dashboard/src/components/PlansTab.jsx`
  Approx lines: 119
  Exports: `PlansTab`
- `dashboard/src/components/ShelfTrackerTab.jsx`
  Approx lines: 584
  Exports: `ShelfTrackerTab`
- `dashboard/src/components/Sidebar.jsx`
  Approx lines: 122
  Exports: `Sidebar`
- `dashboard/src/components/StaffTab.jsx`
  Approx lines: 95
  Exports: `StaffTab`
- `dashboard/src/components/SuppliersTab.jsx`
  Approx lines: 347
  Exports: `SuppliersTab`
- `dashboard/src/components/VoiceAssistantTab.jsx`
  Approx lines: 349
  Exports: `VoiceAssistantTab`
- `dashboard/src/components/WhatHappenedTab.jsx`
  Approx lines: 156
  Exports: `WhatHappenedTab`
- `dashboard/src/components/WorkspaceTab.jsx`
  Approx lines: 134
  Exports: `WorkspaceTab`
- `dashboard/src/main.jsx`
  Approx lines: 49
  Exports: none
- `dashboard/src/useOfflineSync.js`
  Approx lines: 206
  Exports: `useOfflineSync`
