"""Async background task queue with Redis-backed persistence.

Decouples skill execution from the main event loop so Gemini API calls
and long-running skills don't block request handling.

Features:
- Async worker pool with configurable concurrency
- Redis-backed task persistence (survives restarts)
- In-memory fallback when Redis is unavailable
- Task status tracking (pending → running → completed/failed)
- Automatic retry with exponential backoff
"""

import asyncio
import json
import logging
import time
import traceback
import uuid
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)


class TaskQueue:
    """Async task queue with Redis persistence."""

    QUEUE_KEY = "retailos:task_queue"
    RESULT_PREFIX = "retailos:task_result:"

    def __init__(self, memory=None, max_workers: int = 4):
        self.memory = memory  # Redis-backed Memory instance
        self._local_queue: asyncio.Queue = asyncio.Queue()
        self._results: dict[str, dict] = {}
        self._handlers: dict[str, Callable] = {}
        self._workers: list[asyncio.Task] = []
        self._max_workers = max_workers
        self._running = False

    def register_handler(self, task_type: str, handler: Callable[..., Coroutine]):
        """Register an async handler for a task type."""
        self._handlers[task_type] = handler

    async def enqueue(
        self,
        task_type: str,
        payload: dict[str, Any],
        priority: int = 0,
        max_retries: int = 3,
    ) -> str:
        """Add a task to the queue. Returns task_id."""
        task_id = str(uuid.uuid4())
        task = {
            "id": task_id,
            "type": task_type,
            "payload": payload,
            "priority": priority,
            "max_retries": max_retries,
            "attempt": 0,
            "status": "pending",
            "created_at": time.time(),
        }

        # Persist to Redis
        if self.memory and self.memory.client:
            try:
                await self.memory.client.lpush(
                    self.QUEUE_KEY, json.dumps(task, default=str)
                )
            except Exception:
                pass

        # Also push to local queue for immediate processing
        await self._local_queue.put(task)

        logger.info("Task %s enqueued: %s", task_id[:8], task_type)
        return task_id

    async def get_result(self, task_id: str) -> dict[str, Any] | None:
        """Get the result of a completed task."""
        # Check local cache first
        if task_id in self._results:
            return self._results[task_id]

        # Check Redis
        if self.memory and self.memory.client:
            try:
                result = await self.memory.get(f"{self.RESULT_PREFIX}{task_id}")
                if result:
                    return result
            except Exception:
                pass

        return None

    async def start(self):
        """Start the worker pool."""
        if self._running:
            return
        self._running = True

        # Restore any pending tasks from Redis
        await self._restore_pending()

        # Start worker tasks
        for i in range(self._max_workers):
            worker = asyncio.create_task(self._worker(f"worker-{i}"))
            self._workers.append(worker)

        logger.info("Task queue started with %d workers", self._max_workers)

    async def stop(self):
        """Stop all workers gracefully."""
        self._running = False
        # Push sentinel values to unblock workers
        for _ in self._workers:
            await self._local_queue.put(None)
        for w in self._workers:
            w.cancel()
        self._workers.clear()

    async def _restore_pending(self):
        """Restore pending tasks from Redis on startup."""
        if not self.memory or not self.memory.client:
            return

        try:
            # Read all pending tasks from Redis list
            raw_tasks = await self.memory.client.lrange(self.QUEUE_KEY, 0, -1)
            restored = 0
            for raw in raw_tasks:
                try:
                    task = json.loads(raw)
                    if task.get("status") == "pending":
                        await self._local_queue.put(task)
                        restored += 1
                except (json.JSONDecodeError, KeyError):
                    pass

            if restored:
                logger.info("Restored %d pending tasks from Redis", restored)
            # Clear the Redis queue (they're now in the local queue)
            await self.memory.client.delete(self.QUEUE_KEY)
        except Exception as e:
            logger.warning("Could not restore tasks from Redis: %s", e)

    async def _worker(self, name: str):
        """Process tasks from the queue."""
        while self._running:
            try:
                task = await asyncio.wait_for(self._local_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            if task is None:  # Sentinel for shutdown
                break

            task_type = task.get("type", "")
            task_id = task.get("id", "unknown")
            handler = self._handlers.get(task_type)

            if not handler:
                logger.warning("%s: no handler for task type '%s'", name, task_type)
                await self._save_result(task_id, {
                    "status": "failed",
                    "error": f"No handler for task type '{task_type}'",
                })
                continue

            task["status"] = "running"
            task["attempt"] = task.get("attempt", 0) + 1

            try:
                result = await handler(task["payload"])
                await self._save_result(task_id, {
                    "status": "completed",
                    "result": result,
                    "completed_at": time.time(),
                })
                logger.info("%s: task %s completed", name, task_id[:8])

            except Exception as e:
                max_retries = task.get("max_retries", 3)
                attempt = task.get("attempt", 1)

                if attempt < max_retries:
                    # Re-enqueue with backoff
                    task["status"] = "pending"
                    delay = 2 ** attempt
                    logger.warning(
                        "%s: task %s failed (attempt %d/%d), retrying in %ds: %s",
                        name, task_id[:8], attempt, max_retries, delay, e,
                    )
                    await asyncio.sleep(delay)
                    await self._local_queue.put(task)
                else:
                    await self._save_result(task_id, {
                        "status": "failed",
                        "error": str(e),
                        "traceback": traceback.format_exc()[:1000],
                        "attempts": attempt,
                        "failed_at": time.time(),
                    })
                    logger.error(
                        "%s: task %s failed permanently after %d attempts: %s",
                        name, task_id[:8], attempt, e,
                    )

    async def _save_result(self, task_id: str, result: dict):
        """Persist task result to Redis and local cache."""
        self._results[task_id] = result

        if self.memory and self.memory.client:
            try:
                await self.memory.set(
                    f"{self.RESULT_PREFIX}{task_id}",
                    result,
                    ttl=86400,  # Keep results for 24h
                )
            except Exception:
                pass

    def get_stats(self) -> dict[str, Any]:
        """Get queue statistics."""
        completed = sum(1 for r in self._results.values() if r.get("status") == "completed")
        failed = sum(1 for r in self._results.values() if r.get("status") == "failed")
        return {
            "workers": self._max_workers,
            "running": self._running,
            "queue_size": self._local_queue.qsize(),
            "completed_tasks": completed,
            "failed_tasks": failed,
            "total_tracked": len(self._results),
        }
