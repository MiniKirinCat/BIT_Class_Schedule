import os
import subprocess
import sys
from pathlib import Path
from typing import Callable

STARTUP_SHORTCUT_NAME = "下一节.lnk"


class StartupError(Exception):
    pass


def startup_dir() -> Path:
    appdata = os.environ.get("APPDATA")
    if not appdata:
        raise StartupError("无法定位 Windows 启动目录")
    return Path(appdata) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"


def shortcut_path(directory: Path | None = None) -> Path:
    return (directory or startup_dir()) / STARTUP_SHORTCUT_NAME


def pythonw_path(root: Path) -> Path:
    candidates = (
        root / "runtime" / "pythonw.exe",
        root / ".venv" / "Scripts" / "pythonw.exe",
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise StartupError(
        "找不到 Python 运行时，请重新安装下一节或运行 scripts/setup.ps1"
    )


def tray_paths(root: Path) -> tuple[Path, Path]:
    target = pythonw_path(root)
    script = root / "scripts" / "tray.py"
    if not script.is_file():
        raise StartupError("找不到 scripts/tray.py")
    return target, script


def _ps_quote(value: object) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def build_shortcut_script(*, target: Path, arguments: str, working_dir: Path, shortcut: Path) -> str:
    return "\n".join(
        [
            "$ws = New-Object -ComObject WScript.Shell",
            f"$s = $ws.CreateShortcut({_ps_quote(shortcut)})",
            f"$s.TargetPath = {_ps_quote(target)}",
            f"$s.Arguments = {_ps_quote(arguments)}",
            f"$s.WorkingDirectory = {_ps_quote(working_dir)}",
            "$s.WindowStyle = 7",
            "$s.Description = '下一节'",
            "$s.Save()",
        ]
    )


def enable_startup(
    root: Path,
    *,
    directory: Path | None = None,
    run: Callable[..., object] | None = None,
) -> Path:
    if sys.platform != "win32":
        raise StartupError("开机自启目前只支持 Windows")
    target, script = tray_paths(root)
    shortcut = shortcut_path(directory)
    shortcut.parent.mkdir(parents=True, exist_ok=True)
    arguments = f'"{script}"'
    script_text = build_shortcut_script(
        target=target,
        arguments=arguments,
        working_dir=root,
        shortcut=shortcut,
    )
    runner = run or subprocess.run
    try:
        runner(
            [
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script_text,
            ],
            check=True,
            timeout=20,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise StartupError("无法创建开机启动快捷方式") from exc
    if not shortcut.is_file():
        raise StartupError("开机启动快捷方式没有创建成功")
    return shortcut


def disable_startup(*, directory: Path | None = None) -> None:
    shortcut = shortcut_path(directory)
    try:
        shortcut.unlink()
    except FileNotFoundError:
        return
    except OSError as exc:
        raise StartupError("无法删除开机启动快捷方式") from exc


def startup_status(*, directory: Path | None = None) -> dict:
    supported = sys.platform == "win32"
    if not supported:
        return {"supported": False, "enabled": False}
    try:
        exists = shortcut_path(directory).is_file()
    except StartupError:
        return {"supported": True, "enabled": False}
    return {"supported": True, "enabled": exists}
