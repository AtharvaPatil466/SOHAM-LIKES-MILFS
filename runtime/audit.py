import asyncio
import json
import time
import uuid
from typing import Any, Optional

import asyncpg


class AuditLogger:
    """Append-only audit trail stored in PostgreSQL.

    Every action the system takes is logged with full reasoning.
    Nothing is ever deleted or modified.
    """

    def __init__(self, database_url: str):
        self.database_url = database_url
        self.pool: Optional[asyncpg.Pool] = None
        self._fallback_logs: list[dict] = []
        self.on_log: Optional[callable] = None

    async def init(self) -> None:
        try:
            self.pool = await asyncpg.create_pool(self.database_url, min_size=2, max_size=10)
            await self.pool.execute("""
                CREATE TABLE IF NOT EXISTS audit_log (
                    id TEXT PRIMARY KEY,
                    timestamp DOUBLE PRECISION NOT NULL,
                    skill TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    decision TEXT NOT NULL,
                    reasoning TEXT NOT NULL,
                    outcome TEXT NOT NULL,
                    status TEXT NOT NULL,
                    metadata JSONB DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
                CREATE INDEX IF NOT EXISTS idx_audit_skill ON audit_log(skill);
                CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type);
            """)
        except Exception:
            # Fall back to in-memory logging if PostgreSQL is unavailable
            self.pool = None

    async def log(
        self,
        skill: str,
        event_type: str,
        decision: str,
        reasoning: str,
        outcome: str,
        status: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        entry = {
            "id": str(uuid.uuid4()),
            "timestamp": time.time(),
            "skill": skill,
            "event_type": event_type,
            "decision": decision,
            "reasoning": reasoning,
            "outcome": outcome,
            "status": status,
            "metadata": metadata or {},
        }

        if self.pool:
            try:
                await self.pool.execute(
                    """
                    INSERT INTO audit_log (id, timestamp, skill, event_type, decision, reasoning, outcome, status, metadata)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    """,
                    entry["id"],
                    entry["timestamp"],
                    skill,
                    event_type,
                    decision,
                    reasoning,
                    outcome,
                    status,
                    json.dumps(metadata or {}),
                )
            except Exception:
                self._fallback_logs.append(entry)
        else:
            self._fallback_logs.append(entry)

        if self.on_log:
            try:
                if asyncio.iscoroutinefunction(self.on_log):
                    asyncio.create_task(self.on_log(entry))
                else:
                    self.on_log(entry)
            except Exception:
                pass

        return entry

    async def get_logs(
        self,
        skill: str | None = None,
        event_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        if self.pool:
            query = "SELECT * FROM audit_log WHERE 1=1"
            params = []
            idx = 1

            if skill:
                query += f" AND skill = ${idx}"
                params.append(skill)
                idx += 1
            if event_type:
                query += f" AND event_type = ${idx}"
                params.append(event_type)
                idx += 1

            query += f" ORDER BY timestamp DESC LIMIT ${idx} OFFSET ${idx + 1}"
            idx += 2
            params.extend([limit, offset])

            rows = await self.pool.fetch(query, *params)
            return [
                {
                    "id": r["id"],
                    "timestamp": r["timestamp"],
                    "skill": r["skill"],
                    "event_type": r["event_type"],
                    "decision": r["decision"],
                    "reasoning": r["reasoning"],
                    "outcome": r["outcome"],
                    "status": r["status"],
                    "metadata": json.loads(r["metadata"]) if isinstance(r["metadata"], str) else r["metadata"],
                }
                for r in rows
            ]
        else:
            logs = self._fallback_logs[:]
            if skill:
                logs = [entry for entry in logs if entry["skill"] == skill]
            if event_type:
                logs = [entry for entry in logs if entry["event_type"] == event_type]
            logs.sort(key=lambda x: x["timestamp"], reverse=True)
            return logs[offset : offset + limit]

    async def get_log_count(self) -> int:
        if self.pool:
            row = await self.pool.fetchrow("SELECT COUNT(*) as cnt FROM audit_log")
            return row["cnt"]
        return len(self._fallback_logs)

    async def close(self) -> None:
        if self.pool:
            await self.pool.close()
