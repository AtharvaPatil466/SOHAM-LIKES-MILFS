"""Centralized configuration with environment-based profiles.

Supports three environments:
- development: SQLite, debug logging, relaxed CORS, hot reload
- staging: PostgreSQL, JSON logging, restricted CORS, demo keys
- production: PostgreSQL, JSON logging, strict CORS, real keys required

Usage:
    from config.settings import settings
    print(settings.database_url)
    print(settings.is_production)
"""

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Settings:
    """Application settings resolved from environment variables."""

    # ── Environment ──
    env: str = ""
    debug: bool = False

    # ── Server ──
    port: int = 8000
    workers: int = 4
    worker_timeout: int = 120

    # ── Database ──
    database_url: str = ""
    db_pool_size: int = 10
    db_max_overflow: int = 20

    # ── Redis ──
    redis_url: str = ""

    # ── Auth ──
    jwt_secret_key: str = ""
    jwt_expire_seconds: int = 86400

    # ── CORS ──
    cors_origins: list[str] = field(default_factory=list)

    # ── Logging ──
    log_level: str = "INFO"
    log_format: str = "json"

    # ── Feature flags ──
    enable_docs: bool = True
    enable_debug_routes: bool = False
    enable_rate_limiting: bool = True

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def is_staging(self) -> bool:
        return self.env == "staging"

    @property
    def is_development(self) -> bool:
        return self.env == "development"


def _detect_env() -> str:
    """Detect environment from RETAILOS_ENV or ENV, defaulting to development."""
    return os.environ.get("RETAILOS_ENV", os.environ.get("ENV", "development")).lower()


def _load_settings() -> Settings:
    """Load settings from environment variables with environment-specific defaults."""
    env = _detect_env()
    data_dir = Path(__file__).resolve().parent.parent / "data"

    # Environment-specific defaults
    defaults = {
        "development": {
            "database_url": f"sqlite+aiosqlite:///{data_dir / 'retailos.db'}",
            "debug": True,
            "log_level": "DEBUG",
            "log_format": "human",
            "cors_origins": ["*"],
            "enable_docs": True,
            "enable_debug_routes": True,
            "workers": 1,
            "db_pool_size": 5,
            "db_max_overflow": 5,
        },
        "staging": {
            "database_url": "postgresql+asyncpg://retailos:retailos@localhost:5432/retailos_staging",
            "debug": False,
            "log_level": "INFO",
            "log_format": "json",
            "cors_origins": ["https://staging.retailos.app"],
            "enable_docs": True,
            "enable_debug_routes": False,
            "workers": 2,
            "db_pool_size": 10,
            "db_max_overflow": 10,
        },
        "production": {
            "database_url": "postgresql+asyncpg://retailos:retailos@localhost:5432/retailos",
            "debug": False,
            "log_level": "WARNING",
            "log_format": "json",
            "cors_origins": ["https://retailos.app", "https://www.retailos.app"],
            "enable_docs": False,
            "enable_debug_routes": False,
            "workers": 4,
            "db_pool_size": 20,
            "db_max_overflow": 20,
        },
    }

    env_defaults = defaults.get(env, defaults["development"])

    return Settings(
        env=env,
        debug=os.environ.get("DEBUG", str(env_defaults["debug"])).lower() in ("true", "1"),
        port=int(os.environ.get("PORT", 8000)),
        workers=int(os.environ.get("WORKERS", env_defaults["workers"])),
        worker_timeout=int(os.environ.get("WORKER_TIMEOUT", 120)),
        database_url=os.environ.get("DATABASE_URL", env_defaults["database_url"]),
        db_pool_size=int(os.environ.get("DB_POOL_SIZE", env_defaults["db_pool_size"])),
        db_max_overflow=int(os.environ.get("DB_MAX_OVERFLOW", env_defaults["db_max_overflow"])),
        redis_url=os.environ.get("REDIS_URL", ""),
        jwt_secret_key=os.environ.get("JWT_SECRET_KEY", ""),
        jwt_expire_seconds=int(os.environ.get("JWT_EXPIRE_SECONDS", 86400)),
        cors_origins=os.environ.get("CORS_ORIGINS", ",".join(env_defaults["cors_origins"])).split(","),
        log_level=os.environ.get("LOG_LEVEL", env_defaults["log_level"]),
        log_format=os.environ.get("LOG_FORMAT", env_defaults["log_format"]),
        enable_docs=os.environ.get("ENABLE_DOCS", str(env_defaults["enable_docs"])).lower() in ("true", "1"),
        enable_debug_routes=os.environ.get("ENABLE_DEBUG_ROUTES", str(env_defaults["enable_debug_routes"])).lower() in ("true", "1"),
        enable_rate_limiting=os.environ.get("ENABLE_RATE_LIMITING", "true").lower() in ("true", "1"),
    )


# Singleton — imported everywhere
settings = _load_settings()
