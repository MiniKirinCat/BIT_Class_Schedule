import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RUNTIME_EXE = "python.exe" if sys.platform == "win32" else "python3"


def installed_root() -> bool:
    return (PROJECT_ROOT / "runtime" / RUNTIME_EXE).is_file()


def data_dir() -> Path:
    override = os.environ.get("NEXT_CLASS_DATA_DIR")
    if override:
        return Path(override).expanduser()
    if installed_root():
        local_appdata = os.environ.get("LOCALAPPDATA")
        if local_appdata:
            return Path(local_appdata) / "NextClass" / "data"
    return PROJECT_ROOT / "data"
