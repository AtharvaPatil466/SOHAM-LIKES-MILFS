from abc import ABC, abstractmethod
from enum import Enum
from typing import Any
import time


class SkillState(Enum):
    INITIALIZING = "initializing"
    RUNNING = "running"
    PAUSED = "paused"
    ERROR = "error"
    STOPPED = "stopped"


class BaseSkill(ABC):
    """Abstract base class for all RetailOS skills.

    Every skill must implement: init, run, pause, resume, status.
    The orchestrator only ever calls these five methods.
    """

    def __init__(self, name: str, memory=None, audit=None):
        self.name = name
        self.state = SkillState.INITIALIZING
        self.memory = memory
        self.audit = audit
        self.last_run = None
        self.last_error = None
        self.run_count = 0

    @abstractmethod
    async def init(self) -> None:
        """Load config and memory on startup."""
        pass

    @abstractmethod
    async def run(self, event: dict[str, Any]) -> dict[str, Any]:
        """Execute the skill's core logic given an event."""
        pass

    async def pause(self) -> None:
        """Suspend this skill. Others keep running."""
        self.state = SkillState.PAUSED
        if self.audit:
            await self.audit.log(
                skill=self.name,
                event_type="skill_paused",
                decision="Skill paused by orchestrator or owner",
                reasoning="Manual pause or orchestrator decision",
                outcome="Skill suspended",
                status="success",
            )

    async def resume(self) -> None:
        """Bring this skill back online."""
        self.state = SkillState.RUNNING
        if self.audit:
            await self.audit.log(
                skill=self.name,
                event_type="skill_resumed",
                decision="Skill resumed",
                reasoning="Manual resume or orchestrator decision",
                outcome="Skill active",
                status="success",
            )

    def status(self) -> dict[str, Any]:
        """Return current health and last action."""
        return {
            "name": self.name,
            "state": self.state.value,
            "last_run": self.last_run,
            "last_error": str(self.last_error) if self.last_error else None,
            "run_count": self.run_count,
        }

    async def _safe_run(self, event: dict[str, Any]) -> dict[str, Any]:
        """Wrapper that tracks run metadata and catches exceptions."""
        self.run_count += 1
        self.last_run = time.time()
        try:
            result = await self.run(event)
            self.state = SkillState.RUNNING
            return result
        except Exception as e:
            self.last_error = e
            self.state = SkillState.ERROR
            raise
