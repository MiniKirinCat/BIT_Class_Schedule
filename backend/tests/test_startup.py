from pathlib import Path

import pytest

from app.startup import (
    StartupError,
    build_shortcut_script,
    disable_startup,
    enable_startup,
    startup_status,
)


def make_root(tmp_path: Path) -> Path:
    (tmp_path / ".venv" / "Scripts").mkdir(parents=True)
    (tmp_path / ".venv" / "Scripts" / "pythonw.exe").write_text("", encoding="utf-8")
    (tmp_path / "scripts").mkdir()
    (tmp_path / "scripts" / "tray.py").write_text("", encoding="utf-8")
    return tmp_path


def test_build_shortcut_script_quotes_apostrophes():
    script = build_shortcut_script(
        target=Path(r"C:\a'b\pythonw.exe"),
        arguments='"C:\\a\'b\\tray.py"',
        working_dir=Path(r"C:\a'b"),
        shortcut=Path(r"C:\startup\下一节.lnk"),
    )
    assert "pythonw.exe" in script
    assert "''" in script
    assert "$s.Save()" in script


def test_enable_startup_creates_shortcut(tmp_path):
    root = make_root(tmp_path)
    startup = tmp_path / "Startup"
    calls = []

    def fake_run(args, **kwargs):
        calls.append((args, kwargs))
        (startup / "下一节.lnk").write_text("shortcut", encoding="utf-8")

    shortcut = enable_startup(root, directory=startup, run=fake_run)
    assert shortcut == startup / "下一节.lnk"
    assert shortcut.is_file()
    assert calls[0][0][0] == "powershell"
    assert "tray.py" in calls[0][0][-1]
    assert startup_status(directory=startup)["enabled"] is True


def test_enable_startup_reports_missing_venv(tmp_path):
    root = tmp_path
    with pytest.raises(StartupError) as exc:
        enable_startup(root, directory=tmp_path / "Startup", run=lambda *a, **k: None)
    assert "setup.ps1" in str(exc.value)


def test_disable_startup_is_idempotent(tmp_path):
    startup = tmp_path / "Startup"
    startup.mkdir()
    (startup / "下一节.lnk").write_text("shortcut", encoding="utf-8")
    disable_startup(directory=startup)
    assert not (startup / "下一节.lnk").exists()
    disable_startup(directory=startup)
    assert startup_status(directory=startup)["enabled"] is False
