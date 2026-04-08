import os
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_DB_URL = f"sqlite+aiosqlite:///{DATA_DIR / 'retailos.db'}"


class Base(DeclarativeBase):
    pass


_db_url = os.environ.get("DATABASE_URL", DEFAULT_DB_URL)

# Swap sqlite driver for async variant when needed
if _db_url.startswith("sqlite://"):
    _db_url = _db_url.replace("sqlite://", "sqlite+aiosqlite://", 1)
elif _db_url.startswith("postgresql://"):
    _db_url = _db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Connection pool configuration — tuned per environment via settings
_pool_size = int(os.environ.get("DB_POOL_SIZE", 10))
_max_overflow = int(os.environ.get("DB_MAX_OVERFLOW", 20))
_pool_recycle = int(os.environ.get("DB_POOL_RECYCLE", 1800))  # 30 min
_pool_pre_ping = True  # Verify connections before use, drop stale ones

_engine_kwargs: dict = {"echo": False}

# SQLite doesn't support pool_size, only NullPool
if "sqlite" in _db_url:
    from sqlalchemy.pool import StaticPool
    _engine_kwargs["poolclass"] = StaticPool
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    _engine_kwargs["pool_size"] = _pool_size
    _engine_kwargs["max_overflow"] = _max_overflow
    _engine_kwargs["pool_recycle"] = _pool_recycle
    _engine_kwargs["pool_pre_ping"] = _pool_pre_ping

engine = create_async_engine(_db_url, **_engine_kwargs)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    """FastAPI dependency that yields an async DB session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db():
    """Create all tables. Called once at startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db():
    """Dispose of the engine connection pool."""
    await engine.dispose()
