from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class AppConfig:
    data_dir: Path = PROJECT_ROOT / "data"
    frontend_dir: Path = PROJECT_ROOT / "frontend" / "dist-local"
    app_version: str = "1.2.0"
    scheduler_enabled: bool = True
    scheduler_check_seconds: int = 3600
    manual_cooldown_seconds: int = 300
    calendar_days: int = 14

    @property
    def db_path(self) -> Path:
        return self.data_dir / "next_class.db"
