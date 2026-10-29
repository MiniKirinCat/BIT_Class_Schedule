import ctypes
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

import pystray
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

if str(ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(ROOT / "backend"))

from app.paths import data_dir  # noqa: E402

DATA_DIR = data_dir()
RUNTIME = DATA_DIR / "runtime.json"
LOG = DATA_DIR / "app.log"
ICON = ROOT / "frontend" / "public" / "icon-192.png"
MUTEX_NAME = "Local\\NextClassTray"
ERROR_ALREADY_EXISTS = 183
CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def read_runtime() -> dict | None:
    try:
        data = json.loads(RUNTIME.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    url = data.get("url")
    port = data.get("port")
    if not isinstance(url, str) or not isinstance(port, int):
        return None
    return data


def health(url: str, timeout: float = 1.0) -> bool:
    try:
        with urllib.request.urlopen(f"{url}/api/health", timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
        return response.status == 200 and body.get("status") == "ok"
    except Exception:
        return False


def request_json(url: str, path: str, method: str = "GET", timeout: float = 15.0):
    request = urllib.request.Request(
        f"{url}{path}",
        method=method,
        data=b"" if method == "POST" else None,
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def error_detail(exc: Exception) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        try:
            body = json.loads(exc.read().decode("utf-8"))
            detail = body.get("detail")
            if isinstance(detail, str) and detail:
                return detail
        except Exception:
            pass
        return f"HTTP {exc.code}"
    if isinstance(exc, urllib.error.URLError):
        return "无法连接本地服务"
    return str(exc) or type(exc).__name__


class TrayApp:
    def __init__(self, open_on_start: bool = False) -> None:
        self.url: str | None = None
        self.child: subprocess.Popen | None = None
        self.open_on_start = open_on_start
        self.status_text = "正在启动…"
        self._stop = threading.Event()
        self._syncing = threading.Lock()
        image = self._load_icon()
        self.icon = pystray.Icon(
            "next-class",
            image,
            "下一节",
            menu=pystray.Menu(
                pystray.MenuItem("打开下一节", self.open, default=True),
                pystray.MenuItem("立即同步", self.sync),
                pystray.MenuItem(lambda item: self.status_text, lambda: None, enabled=False),
                pystray.MenuItem("查看日志", self.open_log),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("退出并停止服务", self.quit),
            ),
        )

    @staticmethod
    def _load_icon() -> Image.Image:
        try:
            return Image.open(ICON).convert("RGBA").resize((64, 64))
        except OSError:
            return Image.new("RGBA", (64, 64), (31, 92, 74, 255))

    def ensure_server(self) -> bool:
        runtime = read_runtime()
        if runtime and health(runtime["url"]):
            self.url = runtime["url"]
            self.child = None
            return True
        self.child = subprocess.Popen(
            [
                sys.executable,
                str(ROOT / "scripts" / "run_server.py"),
                "--no-open",
            ],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=CREATE_NO_WINDOW,
        )
        for _ in range(100):
            runtime = read_runtime()
            if runtime and health(runtime["url"]):
                self.url = runtime["url"]
                return True
            if self.child.poll() is not None:
                break
            time.sleep(0.2)
        return False

    def update_status(self) -> None:
        if not self.url:
            self.status_text = "服务未启动"
            self.icon.title = "下一节 · 服务未启动"
            return
        try:
            status = request_json(self.url, "/api/status", timeout=2)
        except Exception:
            self.status_text = "服务未连接"
            self.icon.title = "下一节 · 服务未连接"
            return
        sync_status = status.get("sync_status")
        last_sync = status.get("last_sync_at")
        if sync_status in ("failed", "anomaly"):
            self.status_text = "同步异常"
        elif sync_status == "running":
            self.status_text = "正在同步…"
        elif last_sync:
            self.status_text = f"上次同步 {str(last_sync)[5:16].replace('T', ' ')}"
        else:
            self.status_text = "等待首次同步"
        self.icon.title = f"下一节 · {self.status_text}"

    def open(self, icon=None, item=None) -> None:
        if not self.url or not health(self.url):
            if not self.ensure_server():
                self.status_text = "服务启动失败"
                self.icon.title = "下一节 · 服务启动失败"
                return
        webbrowser.open(self.url)

    def sync(self, icon=None, item=None) -> None:
        if self._syncing.locked():
            return
        threading.Thread(target=self._sync_worker, daemon=True).start()

    def _sync_worker(self) -> None:
        if not self.url:
            return
        with self._syncing:
            self.status_text = "正在同步…"
            self.icon.title = "下一节 · 正在同步…"
            try:
                result = request_json(self.url, "/api/sync", "POST", timeout=120)
                if result.get("status") in ("failed", "anomaly"):
                    self.status_text = "同步失败"
                elif result.get("status") == "success":
                    self.status_text = "同步完成"
                self.update_status()
            except Exception as exc:
                self.status_text = "同步失败"
                self.icon.title = "下一节 · 同步失败"
                try:
                    self.icon.notify(error_detail(exc), "下一节同步失败")
                except Exception:
                    pass

    def open_log(self, icon=None, item=None) -> None:
        try:
            os.startfile(LOG)
        except OSError:
            self.status_text = "日志尚未生成"

    def quit(self, icon=None, item=None) -> None:
        self._stop.set()
        if self.child is not None:
            self.child.terminate()
            try:
                self.child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.child.kill()
            runtime = read_runtime()
            if runtime and runtime.get("pid") == self.child.pid:
                try:
                    RUNTIME.unlink()
                except OSError:
                    pass
        else:
            self._stop_existing()
        self.icon.stop()

    @staticmethod
    def _stop_existing() -> None:
        runtime = read_runtime()
        if not runtime:
            return
        subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(ROOT / "scripts" / "stop.ps1"),
            ],
            cwd=ROOT,
            timeout=15,
            creationflags=CREATE_NO_WINDOW,
        )

    def poll(self) -> None:
        while not self._stop.wait(15):
            self.update_status()

    def run(self) -> None:
        if not self.ensure_server():
            self.status_text = "服务启动失败"
            self.icon.title = "下一节 · 服务启动失败"
        else:
            self.update_status()
            threading.Thread(target=self.poll, daemon=True).start()
            if self.open_on_start:
                self.open()
        self.icon.run()


def acquire_mutex(open_existing: bool = False):
    if sys.platform != "win32":
        return None
    kernel32 = ctypes.windll.kernel32
    kernel32.CreateMutexW.restype = ctypes.c_void_p
    kernel32.CreateMutexW.argtypes = (
        ctypes.c_void_p,
        ctypes.c_bool,
        ctypes.c_wchar_p,
    )
    kernel32.CloseHandle.argtypes = (ctypes.c_void_p,)
    handle = kernel32.CreateMutexW(None, False, MUTEX_NAME)
    if not handle:
        return None
    if kernel32.GetLastError() == ERROR_ALREADY_EXISTS:
        kernel32.CloseHandle(handle)
        runtime = read_runtime()
        if open_existing and runtime and health(runtime["url"]):
            webbrowser.open(runtime["url"])
        return None
    return handle


def main() -> None:
    if sys.platform != "win32":
        print("下一节托盘目前只支持 Windows")
        raise SystemExit(1)
    open_on_start = "--open" in sys.argv[1:]
    handle = acquire_mutex(open_on_start)
    if handle is None:
        return
    try:
        TrayApp(open_on_start=open_on_start).run()
    finally:
        ctypes.windll.kernel32.CloseHandle(handle)


if __name__ == "__main__":
    main()
