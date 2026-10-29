from pathlib import Path

from app import paths
from app.config import AppConfig


def test_development_data_dir_is_project_data(tmp_path, monkeypatch):
    monkeypatch.delenv("NEXT_CLASS_DATA_DIR", raising=False)
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    assert paths.installed_root() is False
    assert paths.data_dir() == tmp_path / "data"


def test_installed_data_dir_uses_local_appdata(tmp_path, monkeypatch):
    monkeypatch.delenv("NEXT_CLASS_DATA_DIR", raising=False)
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    (runtime / paths.RUNTIME_EXE).write_text("", encoding="utf-8")
    monkeypatch.setenv("LOCALAPPDATA", r"C:\Users\test\AppData\Local")
    assert paths.installed_root() is True
    assert paths.data_dir() == Path(r"C:\Users\test\AppData\Local") / "NextClass" / "data"


def test_data_dir_env_override_wins(tmp_path, monkeypatch):
    monkeypatch.setenv("NEXT_CLASS_DATA_DIR", str(tmp_path / "custom"))
    assert paths.data_dir() == tmp_path / "custom"


def test_config_default_factory_reads_override(tmp_path, monkeypatch):
    monkeypatch.setenv("NEXT_CLASS_DATA_DIR", str(tmp_path / "custom"))
    config = AppConfig()
    assert config.data_dir == tmp_path / "custom"
    assert config.db_path == tmp_path / "custom" / "next_class.db"
