from dataclasses import dataclass, field
from pathlib import Path

from .paths import PROJECT_ROOT, data_dir

__all__ = ["PROJECT_ROOT", "AppConfig"]


@dataclass(frozen=True)
class AppConfig:
    data_dir: Path = field(default_factory=data_dir)
    frontend_dir: Path = PROJECT_ROOT / "frontend" / "dist-local"
    app_version: str = "1.4.0"
    scheduler_enabled: bool = True
    scheduler_check_seconds: int = 3600
    manual_cooldown_seconds: int = 300
    calendar_days: int = 14

    @property
    def db_path(self) -> Path:
        return self.data_dir / "next_class.db"
