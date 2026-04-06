"""Structured JSON logging configuration.

Provides structured logging with:
- JSON output format for log aggregation (ELK, Datadog, etc.)
- Correlation IDs for request tracing
- Context injection (store_id, user_id, endpoint)
- Log level configuration via environment
"""

import json
import logging
import os
import sys
import time
import uuid
from contextvars import ContextVar
from typing import Any

# Context variables for request-scoped data
request_id_var: ContextVar[str] = ContextVar("request_id", default="")
user_id_var: ContextVar[str] = ContextVar("user_id", default="")
store_id_var: ContextVar[str] = ContextVar("store_id", default="")


class JSONFormatter(logging.Formatter):
    """Format log records as JSON for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Add correlation context
        req_id = request_id_var.get("")
        if req_id:
            log_entry["request_id"] = req_id
        user_id = user_id_var.get("")
        if user_id:
            log_entry["user_id"] = user_id
        store_id = store_id_var.get("")
        if store_id:
            log_entry["store_id"] = store_id

        # Add exception info
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else "Unknown",
                "message": str(record.exc_info[1]),
                "traceback": self.formatException(record.exc_info),
            }

        # Add extra fields
        for key in ("duration_ms", "status_code", "method", "path", "client_ip"):
            if hasattr(record, key):
                log_entry[key] = getattr(record, key)

        return json.dumps(log_entry, default=str)


class HumanFormatter(logging.Formatter):
    """Human-readable formatter for development."""

    COLORS = {
        "DEBUG": "\033[36m",     # Cyan
        "INFO": "\033[32m",      # Green
        "WARNING": "\033[33m",   # Yellow
        "ERROR": "\033[31m",     # Red
        "CRITICAL": "\033[35m",  # Magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, "")
        req_id = request_id_var.get("")
        prefix = f"[{req_id[:8]}] " if req_id else ""
        return f"{color}{record.levelname:8}{self.RESET} {prefix}{record.name}: {record.getMessage()}"


def setup_logging(
    level: str | None = None,
    json_format: bool | None = None,
) -> None:
    """Configure application-wide structured logging.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR). Defaults to LOG_LEVEL env var.
        json_format: Use JSON format. Defaults to LOG_FORMAT env var or True in production.
    """
    log_level = level or os.environ.get("LOG_LEVEL", "INFO")
    use_json = json_format if json_format is not None else os.environ.get("LOG_FORMAT", "json") == "json"

    # Create formatter
    if use_json:
        formatter = JSONFormatter()
    else:
        formatter = HumanFormatter()

    # Configure root logger
    root = logging.getLogger()
    root.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Remove existing handlers
    for handler in root.handlers[:]:
        root.removeHandler(handler)

    # Add stdout handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    root.addHandler(handler)

    # Quiet noisy libraries
    for lib in ("uvicorn.access", "uvicorn.error", "httpx", "httpcore"):
        logging.getLogger(lib).setLevel(logging.WARNING)

    logging.getLogger("retailos").info(
        "Logging configured: level=%s, format=%s",
        log_level,
        "json" if use_json else "human",
    )


def generate_request_id() -> str:
    """Generate a unique request ID for correlation."""
    return str(uuid.uuid4())
