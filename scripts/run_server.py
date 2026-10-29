import argparse
import json
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
DEFAULT_PORT = 17800
TZ = ZoneInfo("Asia/Shanghai")

if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.paths import data_dir  # noqa: E402

RUNTIME = data_dir() / "runtime.json"


def health(port: int, timeout: float = 1.0) -> bool:
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/api/health", timeout=timeout
        ) as response:
            if response.status != 200:
                return False
            body = json.loads(response.read().decode("utf-8"))
            return isinstance(body, dict) and body.get("status") == "ok"
    except Exception:
        return False


def read_runtime() -> dict | None:
    try:
        data = json.loads(RUNTIME.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    port = data.get("port")
    if not isinstance(port, int) or isinstance(port, bool) or not 1 <= port <= 65535:
        return None
    return data


def existing_instance() -> dict | None:
    data = read_runtime()
    if data is not None and health(data["port"]):
        return data
    return None


def port_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def choose_port() -> int:
    raw = os.environ.get("NEXT_CLASS_PORT")
    if raw:
        try:
            port = int(raw)
        except ValueError as exc:
            raise SystemExit("NEXT_CLASS_PORT 必须是整数") from exc
        if not 1 <= port <= 65535:
            raise SystemExit("NEXT_CLASS_PORT 超出有效端口范围")
        if not port_available(port):
            raise SystemExit(f"端口 {port} 已被占用，未自动改端口")
        return port

    if port_available(DEFAULT_PORT):
        return DEFAULT_PORT
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("127.0.0.1", 0))
            return int(sock.getsockname()[1])
        except OSError as exc:
            raise SystemExit("无法找到可用端口") from exc


def write_runtime(port: int) -> dict:
    RUNTIME.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "port": port,
        "pid": os.getpid(),
        "url": f"http://127.0.0.1:{port}",
        "started_at": datetime.now(TZ).isoformat(timespec="seconds"),
    }
    RUNTIME.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


def clear_runtime(pid: int) -> None:
    data = read_runtime()
    if data and data.get("pid") == pid:
        try:
            RUNTIME.unlink()
        except FileNotFoundError:
            pass


def open_when_ready(port: int, url: str) -> None:
    for _ in range(100):
        if health(port, timeout=0.3):
            webbrowser.open(url)
            return
        time.sleep(0.2)


def main() -> None:
    parser = argparse.ArgumentParser(description="启动下一节")
    parser.add_argument("--no-open", action="store_true", help="不自动打开浏览器")
    args = parser.parse_args()

    existing = existing_instance()
    if existing is not None:
        print(existing["url"])
        if not args.no_open:
            webbrowser.open(existing["url"])
        return

    port = choose_port()
    url = f"http://127.0.0.1:{port}"
    write_runtime(port)
    print(f"下一节运行在 {url}")
    if not args.no_open:
        threading.Thread(
            target=open_when_ready,
            args=(port, url),
            daemon=True,
        ).start()

    socket.setdefaulttimeout(30)
    try:
        import uvicorn

        uvicorn.run("app.main:app", host="127.0.0.1", port=port, log_level="info")
    finally:
        clear_runtime(os.getpid())


if __name__ == "__main__":
    main()
