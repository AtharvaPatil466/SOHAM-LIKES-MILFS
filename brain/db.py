"""Centralized database layer for the brain subsystem.

All brain modules use this single module for SQLite access.
Tables are created once on first connection, not scattered across files.
"""

import sqlite3
import threading
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "brain.db"

_init_lock = threading.Lock()
_initialized = False

# All brain tables — defined in one place
_SCHEMA = [
    """CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL,
        timestamp REAL NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        expected_date TEXT NOT NULL,
        actual_date TEXT NOT NULL,
        timestamp REAL NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS quality_flags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        timestamp REAL NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS message_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        template_used TEXT NOT NULL,
        sent_at REAL NOT NULL,
        replied_at REAL,
        converted_at REAL,
        purchase_amount REAL
    )""",
    """CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id TEXT NOT NULL,
        quantity_change INTEGER NOT NULL,
        movement_type TEXT NOT NULL,
        timestamp REAL NOT NULL,
        order_id TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS product_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id TEXT NOT NULL UNIQUE,
        shelf_life_days INTEGER NOT NULL,
        last_restock_date TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS market_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id TEXT NOT NULL,
        source_name TEXT NOT NULL,
        price_per_unit REAL NOT NULL,
        unit TEXT,
        recorded_at REAL NOT NULL,
        source_type TEXT NOT NULL,
        confidence TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS footfall_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        hour INTEGER NOT NULL,
        customer_count INTEGER NOT NULL,
        transaction_count INTEGER NOT NULL,
        source TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS staff_shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id TEXT NOT NULL,
        staff_name TEXT NOT NULL,
        role TEXT NOT NULL,
        shift_date TEXT NOT NULL,
        start_hour INTEGER NOT NULL,
        end_hour INTEGER NOT NULL
    )""",
]


def _ensure_schema(conn: sqlite3.Connection) -> None:
    """Create all tables if they don't exist (idempotent)."""
    global _initialized
    if _initialized:
        return
    with _init_lock:
        if _initialized:
            return
        for ddl in _SCHEMA:
            conn.execute(ddl)
        _initialized = True


def get_connection() -> sqlite3.Connection:
    """Get a SQLite connection with all brain tables guaranteed to exist.

    Usage:
        with get_connection() as conn:
            conn.execute("INSERT INTO decisions ...")
    """
    conn = sqlite3.connect(DB_PATH)
    _ensure_schema(conn)
    return conn


def db_exists() -> bool:
    """Check if the brain database file exists."""
    return DB_PATH.exists()
