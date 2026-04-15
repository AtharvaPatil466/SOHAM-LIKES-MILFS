from __future__ import annotations

import ast
import html
import json
import re
import sqlite3
from collections import defaultdict
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
)


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_MD = ROOT / "PROJECT_EXPLANATION.md"
OUTPUT_PDF = ROOT / "PROJECT_EXPLANATION.pdf"

EXCLUDED_PARTS = {
    ".git",
    ".claude",
    ".codex",
    ".cursor",
    ".pytest_cache",
    ".ruff_cache",
    ".code-review-graph",
    "venv",
    ".venv",
    "myenv",
    "node_modules",
    "dist",
    "__pycache__",
}

PRIMARY_DIR_ORDER = [
    "main.py",
    "api",
    "runtime",
    "skills",
    "brain",
    "db",
    "auth",
    "notifications",
    "reports",
    "payments",
    "integrations",
    "scheduler",
    "dashboard",
    "i18n",
    "tests",
    "e2e",
    "alembic",
    "data",
]


def include_path(path: Path) -> bool:
    return not any(part in EXCLUDED_PARTS for part in path.parts)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def first_line(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return lines[0] if lines else ""


def chunks(values: list[str], size: int) -> list[list[str]]:
    return [values[idx : idx + size] for idx in range(0, len(values), size)]


def display_or_none(value: str) -> str:
    return value if value else "none"


def function_signature(node: ast.FunctionDef | ast.AsyncFunctionDef) -> str:
    args: list[str] = []

    for arg in node.args.posonlyargs:
        args.append(arg.arg)
    if node.args.posonlyargs:
        args.append("/")

    for arg in node.args.args:
        args.append(arg.arg)

    if node.args.vararg:
        args.append(f"*{node.args.vararg.arg}")
    elif node.args.kwonlyargs:
        args.append("*")

    for arg in node.args.kwonlyargs:
        args.append(arg.arg)

    if node.args.kwarg:
        args.append(f"**{node.args.kwarg.arg}")

    prefix = "async " if isinstance(node, ast.AsyncFunctionDef) else ""
    return f"{prefix}{node.name}({', '.join(args)})"


def parse_python_module(path: Path) -> dict[str, Any]:
    text = read_text(path)
    module = ast.parse(text)
    classes: list[dict[str, Any]] = []
    functions: list[dict[str, Any]] = []

    for node in module.body:
        if isinstance(node, ast.ClassDef):
            methods: list[dict[str, Any]] = []
            for child in node.body:
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    methods.append(
                        {
                            "name": child.name,
                            "signature": function_signature(child),
                            "doc": first_line(ast.get_docstring(child) or ""),
                            "lineno": child.lineno,
                        }
                    )

            classes.append(
                {
                    "name": node.name,
                    "doc": first_line(ast.get_docstring(node) or ""),
                    "methods": methods,
                    "lineno": node.lineno,
                }
            )
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.append(
                {
                    "name": node.name,
                    "signature": function_signature(node),
                    "doc": first_line(ast.get_docstring(node) or ""),
                    "lineno": node.lineno,
                }
            )

    return {
        "path": path.relative_to(ROOT).as_posix(),
        "doc": first_line(ast.get_docstring(module) or ""),
        "classes": classes,
        "functions": functions,
        "lines": text.count("\n") + 1,
    }


def collect_python_modules() -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for path in sorted(ROOT.rglob("*.py")):
        if not include_path(path):
            continue
        rel = path.relative_to(ROOT)
        top = rel.parts[0]
        grouped[top].append(parse_python_module(path))
    return dict(grouped)


def collect_js_files() -> list[dict[str, Any]]:
    files: list[dict[str, Any]] = []
    js_roots = [ROOT / "dashboard" / "src"]
    export_patterns = [
        r"export default function\s+([A-Za-z0-9_]+)",
        r"export function\s+([A-Za-z0-9_]+)",
        r"export const\s+([A-Za-z0-9_]+)",
        r"export default\s+([A-Za-z0-9_]+)",
    ]

    for base in js_roots:
        if not base.exists():
            continue
        for path in sorted(base.rglob("*")):
            if path.suffix not in {".js", ".jsx", ".ts", ".tsx"}:
                continue
            if not include_path(path):
                continue
            text = read_text(path)
            exports: list[str] = []
            for pattern in export_patterns:
                exports.extend(re.findall(pattern, text))
            files.append(
                {
                    "path": path.relative_to(ROOT).as_posix(),
                    "exports": [value for value in exports if value != "function"],
                    "lines": text.count("\n") + 1,
                }
            )
    return files


def collect_routes() -> dict[str, list[dict[str, Any]]]:
    pattern = re.compile(
        r'@\s*(?:router|app)\.(get|post|put|delete|patch)\(\s*[\'"]([^\'"]+)[\'"]'
    )
    route_files = [
        *sorted((ROOT / "api").glob("*.py")),
        ROOT / "auth" / "routes.py",
        ROOT / "reports" / "routes.py",
        ROOT / "notifications" / "routes.py",
    ]
    output: dict[str, list[dict[str, Any]]] = {}

    for path in route_files:
        if not path.exists():
            continue
        entries: list[dict[str, Any]] = []
        for lineno, line in enumerate(read_text(path).splitlines(), start=1):
            match = pattern.search(line)
            if match:
                entries.append(
                    {
                        "method": match.group(1).upper(),
                        "path": match.group(2),
                        "line": lineno,
                    }
                )
        output[path.relative_to(ROOT).as_posix()] = entries

    return output


def collect_db_models() -> list[dict[str, Any]]:
    path = ROOT / "db" / "models.py"
    module = ast.parse(read_text(path))
    models: list[dict[str, Any]] = []

    for node in module.body:
        if not isinstance(node, ast.ClassDef):
            continue
        if not any(isinstance(base, ast.Name) and base.id == "Base" for base in node.bases):
            continue

        table_name = ""
        fields: list[dict[str, Any]] = []
        relationships: list[str] = []

        for stmt in node.body:
            if isinstance(stmt, ast.Assign):
                for target in stmt.targets:
                    if isinstance(target, ast.Name) and target.id == "__tablename__":
                        if isinstance(stmt.value, ast.Constant) and isinstance(stmt.value.value, str):
                            table_name = stmt.value.value
            elif isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                field_name = stmt.target.id
                if field_name.startswith("__"):
                    continue

                annotation = ast.unparse(stmt.annotation) if stmt.annotation else "unknown"
                details = ""
                if stmt.value is not None:
                    details = ast.unparse(stmt.value)

                if "relationship(" in details:
                    relationships.append(f"{field_name}: {details}")
                else:
                    fields.append(
                        {
                            "name": field_name,
                            "annotation": annotation,
                            "details": details,
                        }
                    )

        models.append(
            {
                "name": node.name,
                "table": table_name,
                "fields": fields,
                "relationships": relationships,
            }
        )

    return models


def collect_event_memory_map() -> dict[str, list[str]]:
    path = ROOT / "runtime" / "memory.py"
    module = ast.parse(read_text(path))
    for node in module.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == "EVENT_MEMORY_MAP":
                return ast.literal_eval(node.value)
    return {}


def collect_env_vars() -> list[dict[str, Any]]:
    path = ROOT / ".env.example"
    if not path.exists():
        return []

    section = "General"
    groups: list[dict[str, Any]] = []
    current_items: list[dict[str, str]] = []

    def flush() -> None:
        nonlocal current_items
        if current_items:
            groups.append({"section": section, "items": current_items})
            current_items = []

    for raw_line in read_text(path).splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#"):
            heading = line.lstrip("#").strip()
            if heading.startswith("--") and heading.endswith("--"):
                flush()
                section = heading.strip("- ").strip()
            continue
        if "=" not in line:
            continue
        name, value = line.split("=", 1)
        current_items.append({"name": name.strip(), "default": value.strip()})

    flush()
    return groups


def inspect_json_file(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(read_text(path))
    except Exception as exc:
        return {"kind": "json", "error": str(exc)}

    if isinstance(payload, list):
        sample_keys: list[str] = []
        for item in payload[:3]:
            if isinstance(item, dict):
                for key in item.keys():
                    if key not in sample_keys:
                        sample_keys.append(str(key))
        return {
            "kind": "json",
            "shape": "list",
            "count": len(payload),
            "sample_keys": sample_keys,
        }

    if isinstance(payload, dict):
        return {
            "kind": "json",
            "shape": "dict",
            "count": len(payload),
            "sample_keys": [str(key) for key in list(payload.keys())[:15]],
        }

    return {
        "kind": "json",
        "shape": type(payload).__name__,
        "count": None,
        "sample_keys": [],
    }


def inspect_sqlite_file(path: Path) -> dict[str, Any]:
    try:
        conn = sqlite3.connect(str(path))
    except Exception as exc:
        return {"kind": "sqlite", "error": str(exc)}

    try:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).fetchall()
        tables: list[dict[str, Any]] = []
        for (table_name,) in rows:
            row_count: int | None
            try:
                row_count = conn.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]
            except Exception:
                row_count = None
            tables.append({"name": table_name, "rows": row_count})
        return {"kind": "sqlite", "tables": tables}
    finally:
        conn.close()


def collect_data_inventory() -> list[dict[str, Any]]:
    base = ROOT / "data"
    if not base.exists():
        return []

    items: list[dict[str, Any]] = []
    for path in sorted(base.iterdir()):
        rel = path.relative_to(ROOT).as_posix()
        if path.is_dir():
            items.append(
                {
                    "path": rel,
                    "type": "directory",
                    "children": len(list(path.iterdir())),
                }
            )
            continue

        entry: dict[str, Any] = {
            "path": rel,
            "type": path.suffix.lstrip(".") or "file",
            "bytes": path.stat().st_size,
        }

        if path.suffix == ".json":
            entry.update(inspect_json_file(path))
        elif path.suffix == ".db":
            entry.update(inspect_sqlite_file(path))

        items.append(entry)

    return items


def parse_test_file(path: Path) -> dict[str, Any]:
    module = ast.parse(read_text(path))
    tests: list[str] = []

    for node in module.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith("test_"):
            tests.append(node.name)
        elif isinstance(node, ast.ClassDef):
            for child in node.body:
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)) and child.name.startswith("test_"):
                    tests.append(f"{node.name}.{child.name}")

    return {
        "path": path.relative_to(ROOT).as_posix(),
        "count": len(tests),
        "tests": tests,
        "lines": read_text(path).count("\n") + 1,
    }


def collect_test_inventory() -> list[dict[str, Any]]:
    seen: set[str] = set()
    files: list[Path] = []

    patterns = [
        "tests/test*.py",
        "e2e/test*.py",
        "test_*.py",
    ]

    for pattern in patterns:
        for path in sorted(ROOT.glob(pattern)):
            if path.as_posix() not in seen:
                seen.add(path.as_posix())
                files.append(path)

    return [parse_test_file(path) for path in files]


def count_routes(routes: dict[str, list[dict[str, Any]]]) -> int:
    return sum(len(items) for items in routes.values())


def count_tests(test_inventory: list[dict[str, Any]]) -> int:
    return sum(item["count"] for item in test_inventory)


def lookup_module(python_modules: dict[str, list[dict[str, Any]]], rel_path: str) -> dict[str, Any] | None:
    for items in python_modules.values():
        for item in items:
            if item["path"] == rel_path:
                return item
    return None


def class_methods(module_info: dict[str, Any] | None, class_name: str) -> list[str]:
    if not module_info:
        return []
    for cls in module_info["classes"]:
        if cls["name"] == class_name:
            return [f"`{method['name']}`" for method in cls["methods"]]
    return []


def top_route_files(routes: dict[str, list[dict[str, Any]]], limit: int = 8) -> list[tuple[str, int]]:
    ranked = sorted(
        ((path, len(entries)) for path, entries in routes.items()),
        key=lambda pair: pair[1],
        reverse=True,
    )
    return ranked[:limit]


def top_python_files(python_modules: dict[str, list[dict[str, Any]]], limit: int = 8) -> list[tuple[str, int]]:
    all_modules = [item for items in python_modules.values() for item in items]
    ranked = sorted(((item["path"], item["lines"]) for item in all_modules), key=lambda pair: pair[1], reverse=True)
    return ranked[:limit]


def narrative(
    python_modules: dict[str, list[dict[str, Any]]],
    js_files: list[dict[str, Any]],
    routes: dict[str, list[dict[str, Any]]],
    db_models: list[dict[str, Any]],
    event_memory_map: dict[str, list[str]],
    env_groups: list[dict[str, Any]],
    data_inventory: list[dict[str, Any]],
    test_inventory: list[dict[str, Any]],
) -> str:
    python_file_count = sum(len(items) for items in python_modules.values())
    dashboard_component_count = sum(1 for item in js_files if "/components/" in item["path"])
    route_count = count_routes(routes)
    total_tests = count_tests(test_inventory)
    env_var_count = sum(len(group["items"]) for group in env_groups)
    data_artifact_count = len(data_inventory)

    skill_names: list[str] = []
    for item in python_modules.get("skills", []):
        path = item["path"]
        if path in {"skills/base_skill.py", "skills/__init__.py"}:
            continue
        skill_names.append(Path(path).stem)
    skill_names.sort()

    route_hotspots = "\n".join(
        f"- `{path}`: {count} routes"
        for path, count in top_route_files(routes, limit=6)
    )

    python_hotspots = "\n".join(
        f"- `{path}`: about {count} lines"
        for path, count in top_python_files(python_modules, limit=6)
    )

    inventory_methods = ", ".join(class_methods(lookup_module(python_modules, "skills/inventory.py"), "InventorySkill"))
    procurement_methods = ", ".join(class_methods(lookup_module(python_modules, "skills/procurement.py"), "ProcurementSkill"))
    negotiation_methods = ", ".join(class_methods(lookup_module(python_modules, "skills/negotiation.py"), "NegotiationSkill"))
    customer_methods = ", ".join(class_methods(lookup_module(python_modules, "skills/customer.py"), "CustomerSkill"))
    analytics_methods = ", ".join(class_methods(lookup_module(python_modules, "skills/analytics.py"), "AnalyticsSkill"))
    scheduling_methods = ", ".join(class_methods(lookup_module(python_modules, "skills/scheduling.py"), "SchedulingSkill"))
    shelf_methods = ", ".join(class_methods(lookup_module(python_modules, "skills/shelf_manager.py"), "ShelfManagerSkill"))

    memory_patterns = "\n".join(
        f"- `{event_type}` pulls: {', '.join(f'`{pattern}`' for pattern in patterns)}"
        for event_type, patterns in sorted(event_memory_map.items())
    )

    return f"""# RetailOS Technical Project Manual

Generated directly from the repository `{ROOT.name}`.

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

- {python_file_count} first-party Python files outside tooling and dependency folders;
- {route_count} detected HTTP route decorators;
- {len(db_models)} relational model classes in `db/models.py`;
- {dashboard_component_count} dashboard components under `dashboard/src/components`;
- {len(skill_names)} loadable skill modules: {", ".join(skill_names)};
- {env_var_count} environment variables documented in `.env.example`;
- {data_artifact_count} artifacts inside `data/`;
- {total_tests} discovered test functions across `tests/`, `e2e/`, and root-level `test_*.py` files.

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

{route_hotspots}

The largest Python files in the current repository are:

{python_hotspots}

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

{memory_patterns}

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
- {inventory_methods}

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
- {procurement_methods}

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
- {negotiation_methods}

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
- {customer_methods}

The customer agent is a downstream monetization agent. It turns operational opportunities into targeted messaging based on real purchase history instead of generic campaigns.

### 6.5 Analytics agent

File: `skills/analytics.py`

Purpose:
- read recent audit history and inventory state;
- ask the model to identify patterns and recommendations;
- write a daily summary into runtime memory;
- trigger `brain.insight_writer` to persist insight artifacts.

Important internal methods:
- {analytics_methods}

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
- {scheduling_methods}

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
- {shelf_methods}

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
"""


def wrapped_lines(label: str, values: list[str], indent: str = "  ", chunk_size: int = 6) -> list[str]:
    if not values:
        return [f"{indent}{label}: none"]
    lines: list[str] = []
    value_chunks = chunks(values, chunk_size)
    for idx, value_chunk in enumerate(value_chunks):
        joined = ", ".join(value_chunk)
        current_label = label if idx == 0 else " " * len(label)
        lines.append(f"{indent}{current_label}: {joined}")
    return lines


def format_db_models(db_models: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for model in db_models:
        lines.append(f"### `{model['name']}`")
        lines.append(f"- Table: `{display_or_none(model['table'])}`")
        lines.append(f"- Field count: {len(model['fields'])}")
        for field in model["fields"]:
            detail = field["details"] if field["details"] else "no column details parsed"
            lines.append(f"  `{field['name']}`: `{field['annotation']}` -> `{detail}`")
        if model["relationships"]:
            lines.append("- Relationships:")
            for relation in model["relationships"]:
                lines.append(f"  `{relation}`")
        else:
            lines.append("- Relationships: none")
        lines.append("")
    return "\n".join(lines)


def format_event_memory_map(event_memory_map: dict[str, list[str]]) -> str:
    lines = ["## 20. Appendix B: runtime memory lookup map", ""]
    for event_type, patterns in sorted(event_memory_map.items()):
        lines.append(f"### `{event_type}`")
        for pattern in patterns:
            lines.append(f"- `{pattern}`")
        lines.append("")
    return "\n".join(lines)


def format_routes(routes: dict[str, list[dict[str, Any]]]) -> str:
    lines = ["## 21. Appendix C: route inventory by file", ""]
    for path in sorted(routes):
        lines.append(f"### `{path}`")
        if not routes[path]:
            lines.append("- no route decorators detected")
        else:
            for route in routes[path]:
                lines.append(f"- `{route['method']}` `{route['path']}` (line {route['line']})")
        lines.append("")
    return "\n".join(lines)


def format_env_inventory(env_groups: list[dict[str, Any]]) -> str:
    lines = ["## 22. Appendix D: environment variable inventory", ""]
    for group in env_groups:
        lines.append(f"### {group['section']}")
        for item in group["items"]:
            default_value = item["default"] if item["default"] else "(empty)"
            lines.append(f"- `{item['name']}` default `{default_value}`")
        lines.append("")
    return "\n".join(lines)


def format_data_inventory(data_inventory: list[dict[str, Any]]) -> str:
    lines = ["## 23. Appendix E: data directory inventory", ""]
    for item in data_inventory:
        lines.append(f"### `{item['path']}`")
        if item["type"] == "directory":
            lines.append(f"- Directory children: {item['children']}")
            lines.append("")
            continue

        lines.append(f"- File type: `{item['type']}`")
        lines.append(f"- Size: {item.get('bytes', 0)} bytes")

        if item.get("kind") == "json":
            if "error" in item:
                lines.append(f"- JSON inspection error: {item['error']}")
            else:
                lines.append(f"- JSON shape: `{item['shape']}`")
                if item.get("count") is not None:
                    lines.append(f"- Record count: {item['count']}")
                sample_keys = [f"`{key}`" for key in item.get("sample_keys", [])]
                lines.extend(wrapped_lines("Sample keys", sample_keys))
        elif item.get("kind") == "sqlite":
            if "error" in item:
                lines.append(f"- SQLite inspection error: {item['error']}")
            else:
                tables = item.get("tables", [])
                lines.append(f"- Table count: {len(tables)}")
                for table in tables:
                    row_text = "unknown" if table["rows"] is None else str(table["rows"])
                    lines.append(f"  `{table['name']}` rows: {row_text}")
        lines.append("")
    return "\n".join(lines)


def format_test_inventory(test_inventory: list[dict[str, Any]]) -> str:
    lines = ["## 24. Appendix F: automated test inventory", ""]
    for item in test_inventory:
        lines.append(f"### `{item['path']}`")
        lines.append(f"- Approx lines: {item['lines']}")
        lines.append(f"- Test count: {item['count']}")
        test_names = [f"`{name}`" for name in item["tests"]]
        lines.extend(wrapped_lines("Tests", test_names, chunk_size=5))
        lines.append("")
    return "\n".join(lines)


def format_python_inventory(python_modules: dict[str, list[dict[str, Any]]]) -> str:
    lines = ["## 25. Appendix G: python module inventory", ""]
    ordered_keys = [key for key in PRIMARY_DIR_ORDER if key in python_modules]
    ordered_keys += [key for key in sorted(python_modules) if key not in ordered_keys]

    for key in ordered_keys:
        lines.append(f"### `{key}`")
        for item in python_modules[key]:
            lines.append(f"- `{item['path']}`")
            lines.append(f"  Approx lines: {item['lines']}")
            lines.append(f"  Purpose: {item['doc'] or 'No top-level docstring.'}")
            if item["classes"]:
                class_names = [f"`{cls['name']}`" for cls in item["classes"]]
                lines.extend(wrapped_lines("Classes", class_names))
                for cls in item["classes"]:
                    lines.append(f"  Class `{cls['name']}` line {cls['lineno']}: {cls['doc'] or 'No class docstring.'}")
                    method_names = [f"`{method['signature']}`" for method in cls["methods"]]
                    lines.extend(wrapped_lines("  Methods", method_names, indent="    ", chunk_size=4))
            else:
                lines.append("  Classes: none")
            if item["functions"]:
                function_names = [f"`{fn['signature']}`" for fn in item["functions"]]
                lines.extend(wrapped_lines("Functions", function_names))
            else:
                lines.append("  Functions: none")
        lines.append("")
    return "\n".join(lines)


def format_frontend_inventory(js_files: list[dict[str, Any]]) -> str:
    lines = ["## 26. Appendix H: dashboard file inventory", ""]
    for item in js_files:
        lines.append(f"- `{item['path']}`")
        lines.append(f"  Approx lines: {item['lines']}")
        exports = [f"`{value}`" for value in item["exports"]]
        lines.extend(wrapped_lines("Exports", exports))
    lines.append("")
    return "\n".join(lines)


def build_markdown() -> str:
    python_modules = collect_python_modules()
    js_files = collect_js_files()
    routes = collect_routes()
    db_models = collect_db_models()
    event_memory_map = collect_event_memory_map()
    env_groups = collect_env_vars()
    data_inventory = collect_data_inventory()
    test_inventory = collect_test_inventory()

    parts = [
        narrative(
            python_modules,
            js_files,
            routes,
            db_models,
            event_memory_map,
            env_groups,
            data_inventory,
            test_inventory,
        ),
        format_db_models(db_models),
        "",
        format_event_memory_map(event_memory_map),
        format_routes(routes),
        format_env_inventory(env_groups),
        format_data_inventory(data_inventory),
        format_test_inventory(test_inventory),
        format_python_inventory(python_modules),
        format_frontend_inventory(js_files),
    ]
    return "\n".join(parts).rstrip() + "\n"


def escape_paragraph(text: str) -> str:
    text = html.escape(text)
    text = text.replace("`", "")
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    return text


def _page_number(canvas, doc):
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(colors.grey)
    canvas.drawRightString(doc.pagesize[0] - 18 * mm, 12 * mm, f"Page {doc.page}")


def render_pdf(markdown_text: str) -> None:
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TitleCenter",
        parent=styles["Title"],
        alignment=TA_CENTER,
        textColor=colors.HexColor("#111827"),
        spaceAfter=10,
    )
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName="Helvetica-Bold", spaceBefore=10, spaceAfter=6)
    h2 = ParagraphStyle(
        "H2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#1f2937"),
        spaceBefore=8,
        spaceAfter=4,
    )
    h3 = ParagraphStyle(
        "H3",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#374151"),
        spaceBefore=6,
        spaceAfter=3,
    )
    body = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13,
        spaceAfter=4,
    )
    bullet = ParagraphStyle("BulletBody", parent=body, leftIndent=10, firstLineIndent=0)
    code = ParagraphStyle(
        "Code",
        parent=styles["Code"],
        fontName="Courier",
        fontSize=7.8,
        leading=9.2,
        backColor=colors.HexColor("#f3f4f6"),
        borderPadding=5,
        spaceAfter=4,
    )

    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="RetailOS Technical Project Manual",
        author="OpenAI Codex",
    )

    story = [
        Paragraph("RetailOS Technical Project Manual", title_style),
        Paragraph(f"Generated from source in {escape_paragraph(ROOT.name)}", body),
        Spacer(1, 6),
    ]

    in_code = False
    code_lines: list[str] = []

    def flush_code() -> None:
        nonlocal code_lines
        if code_lines:
            story.append(Preformatted("\n".join(code_lines), code))
            code_lines = []

    for raw_line in markdown_text.splitlines():
        line = raw_line.rstrip()
        if line.startswith("```"):
            if in_code:
                flush_code()
                in_code = False
            else:
                in_code = True
            continue

        if in_code:
            code_lines.append(line)
            continue

        if not line:
            story.append(Spacer(1, 4))
            continue
        if line.startswith("# "):
            story.append(Paragraph(escape_paragraph(line[2:]), h1))
            continue
        if line.startswith("## "):
            text = line[3:]
            if "Appendix" in text:
                story.append(PageBreak())
            story.append(Paragraph(escape_paragraph(text), h2))
            continue
        if line.startswith("### "):
            story.append(Paragraph(escape_paragraph(line[4:]), h3))
            continue
        if line.startswith("- "):
            item = Paragraph(escape_paragraph(line[2:]), bullet)
            story.append(ListFlowable([ListItem(item)], bulletType="bullet", start="circle", leftIndent=14))
            continue
        if line.startswith("  "):
            story.append(Paragraph(escape_paragraph(line.strip()), ParagraphStyle("Indented", parent=body, leftIndent=14)))
            continue
        story.append(Paragraph(escape_paragraph(line), body))

    flush_code()
    doc.build(story, onFirstPage=_page_number, onLaterPages=_page_number)


def main() -> None:
    markdown = build_markdown()
    OUTPUT_MD.write_text(markdown, encoding="utf-8")
    render_pdf(markdown)
    print(
        json.dumps(
            {
                "markdown": OUTPUT_MD.name,
                "pdf": OUTPUT_PDF.name,
                "markdown_bytes": OUTPUT_MD.stat().st_size,
                "pdf_bytes": OUTPUT_PDF.stat().st_size,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
