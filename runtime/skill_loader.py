import importlib
import os
import inspect
from typing import Any

from skills.base_skill import BaseSkill


class SkillLoader:
    """Discovers and registers skill files from the skills/ directory.

    Drop a new skill file in, the runtime picks it up automatically.
    """

    def __init__(self, skills_dir: str = "skills", memory=None, audit=None):
        self.skills_dir = skills_dir
        self.memory = memory
        self.audit = audit
        self.skills: dict[str, BaseSkill] = {}

    async def discover_and_load(self) -> dict[str, BaseSkill]:
        """Scan the skills directory and load all valid skill classes."""
        skills_path = os.path.abspath(self.skills_dir)

        for filename in os.listdir(skills_path):
            if not filename.endswith(".py"):
                continue
            if filename.startswith("_") or filename == "base_skill.py":
                continue

            module_name = f"skills.{filename[:-3]}"
            try:
                module = importlib.import_module(module_name)

                # Find all classes that inherit from BaseSkill
                for attr_name in dir(module):
                    attr = getattr(module, attr_name)
                    if (
                        inspect.isclass(attr)
                        and issubclass(attr, BaseSkill)
                        and attr is not BaseSkill
                    ):
                        skill_instance = attr(
                            memory=self.memory, audit=self.audit
                        )
                        await skill_instance.init()
                        self.skills[skill_instance.name] = skill_instance

            except Exception as e:
                print(f"[SkillLoader] Failed to load {module_name}: {e}")

        return self.skills

    def get_skill(self, name: str) -> BaseSkill | None:
        return self.skills.get(name)

    def list_skills(self) -> list[dict[str, Any]]:
        return [skill.status() for skill in self.skills.values()]

    async def reload_skill(self, name: str) -> bool:
        """Hot-reload a single skill by name."""
        if name in self.skills:
            old_skill = self.skills[name]
            await old_skill.pause()

        # Re-import and re-instantiate
        for filename in os.listdir(os.path.abspath(self.skills_dir)):
            if not filename.endswith(".py") or filename.startswith("_") or filename == "base_skill.py":
                continue
            module_name = f"skills.{filename[:-3]}"
            try:
                module = importlib.reload(importlib.import_module(module_name))
                for attr_name in dir(module):
                    attr = getattr(module, attr_name)
                    if (
                        inspect.isclass(attr)
                        and issubclass(attr, BaseSkill)
                        and attr is not BaseSkill
                    ):
                        instance = attr(memory=self.memory, audit=self.audit)
                        if instance.name == name:
                            await instance.init()
                            self.skills[name] = instance
                            return True
            except Exception:
                continue
        return False
