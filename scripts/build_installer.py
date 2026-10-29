from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
import time
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYTHON_VERSION = "3.13.2"
PYTHON_TAG = "313"


def run(
    command: list[str],
    *,
    cwd: Path = ROOT,
    env: dict[str, str] | None = None,
) -> None:
    print("+ " + " ".join(command))
    subprocess.run(command, cwd=cwd, env=env, check=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_tree(source: Path, target: Path) -> None:
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(
        source,
        target,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".pytest_cache"),
    )


def find_iscc() -> Path:
    candidates = []
    if os.environ.get("INNO_SETUP"):
        candidates.append(Path(os.environ["INNO_SETUP"]))
    local = os.environ.get("LOCALAPPDATA")
    if local:
        candidates.append(Path(local) / "Programs" / "Inno Setup 6" / "ISCC.exe")
    for variable in ("ProgramFiles(x86)", "ProgramFiles"):
        program_files = os.environ.get(variable)
        if program_files:
            candidates.append(Path(program_files) / "Inno Setup 6" / "ISCC.exe")
    which = shutil.which("iscc")
    if which:
        candidates.append(Path(which))
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise SystemExit(
        "找不到 Inno Setup 6 的 ISCC.exe，请先安装 Inno Setup 6 或设置 INNO_SETUP"
    )


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    print(f"下载 {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "NextClass-Build"})
    with urllib.request.urlopen(request, timeout=120) as response:
        with target.open("wb") as handle:
            shutil.copyfileobj(response, handle)


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def read_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for_health(process: subprocess.Popen, port: int, deadline: float) -> bool:
    url = f"http://127.0.0.1:{port}/api/health"
    while time.time() < deadline:
        if process.poll() is not None:
            return False
        try:
            if read_json(url).get("status") == "ok":
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def stop_process(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def smoke_runtime(
    runtime_python: Path,
    stage: Path,
    version: str,
) -> None:
    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    code = (
        "import sys\n"
        "assert sys.version_info[:2] == (3, 13), sys.version\n"
        "import fastapi, uvicorn, keyring, cryptography, qrcode, pystray, PIL, httpx, bit_login\n"
        "print('runtime', sys.version.split()[0], type(keyring.get_keyring()).__name__)\n"
    )
    run([str(runtime_python), "-c", code], cwd=stage, env=env)

    port = free_port()
    smoke_data = stage / ".smoke-data"
    env["NEXT_CLASS_PORT"] = str(port)
    env["NEXT_CLASS_DATA_DIR"] = str(smoke_data)
    log_path = ROOT / ".build" / "smoke-server.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    with log_path.open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            [str(runtime_python), str(stage / "scripts" / "run_server.py"), "--no-open"],
            cwd=stage,
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
            creationflags=creationflags,
        )
    try:
        if not wait_for_health(process, port, time.time() + 30):
            print(log_path.read_text(encoding="utf-8", errors="replace")[-4000:])
            raise SystemExit("打包运行时启动失败")
        status = read_json(f"http://127.0.0.1:{port}/api/status")
        if status.get("version") != version:
            raise SystemExit(
                f"打包版本不一致：期望 {version}，实际 {status.get('version')}"
            )
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=10) as response:
            if response.status != 200:
                raise SystemExit(f"前端首页返回 HTTP {response.status}")
            html = response.read().decode("utf-8", errors="replace")
        if "下一节" not in html:
            raise SystemExit("前端首页缺少应用名称")
    finally:
        stop_process(process)
        for _ in range(10):
            shutil.rmtree(smoke_data, ignore_errors=True)
            if not smoke_data.exists():
                break
            time.sleep(0.2)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="构建下一节 Windows 安装包")
    parser.add_argument("--version", default="", help="覆盖版本号，默认读取 backend/app/config.py")
    parser.add_argument("--skip-frontend", action="store_true", help="复用现有 frontend/dist-local")
    parser.add_argument("--skip-runtime-smoke", action="store_true", help="跳过打包运行时启动检查")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config_text = (ROOT / "backend" / "app" / "config.py").read_text(encoding="utf-8")
    match = re.search(r'app_version:\s*str\s*=\s*"([^"]+)"', config_text)
    if not match:
        raise SystemExit("无法从 backend/app/config.py 读取版本号")
    version = args.version or match.group(1)
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise SystemExit(f"版本号必须是 x.y.z：{version}")

    package = json.loads((ROOT / "frontend" / "package.json").read_text(encoding="utf-8"))
    if package.get("version") != version:
        raise SystemExit(
            "版本不一致：backend/app/config.py 为 "
            f"{version}，frontend/package.json 为 {package.get('version')}"
        )

    venv_python = ROOT / ".venv" / "Scripts" / "python.exe"
    if not venv_python.is_file():
        raise SystemExit("缺少 .venv，请先运行 scripts/setup.ps1")
    iscc = find_iscc()

    if not args.skip_frontend:
        npm = shutil.which("npm.cmd") or shutil.which("npm")
        if not npm:
            raise SystemExit(
                "需要 Node.js 与 npm 才能构建前端；也可以加 --skip-frontend 使用现有 dist-local"
            )
        frontend = ROOT / "frontend"
        print("安装前端依赖…")
        run([npm, "ci", "--no-audit", "--no-fund"], cwd=frontend)
        print("构建本地前端…")
        run([npm, "run", "build:local"], cwd=frontend)
    if not (ROOT / "frontend" / "dist-local" / "index.html").is_file():
        raise SystemExit("缺少 frontend/dist-local，请先运行 npm run build:local")

    zip_path = (
        ROOT
        / ".build"
        / "python-embed"
        / f"python-{PYTHON_VERSION}-embed-amd64.zip"
    )
    checksum_path = (
        ROOT / "installer" / f"python-{PYTHON_VERSION}-embed-amd64.sha256"
    )
    if not zip_path.is_file():
        download(
            "https://www.python.org/ftp/python/"
            f"{PYTHON_VERSION}/python-{PYTHON_VERSION}-embed-amd64.zip",
            zip_path,
        )
    expected = checksum_path.read_text(encoding="ascii").split()[0].strip().lower()
    actual = sha256(zip_path)
    if actual != expected:
        raise SystemExit(f"Python 运行时校验失败：期望 {expected}，实际 {actual}")

    stage = ROOT / ".build" / "installer-stage"
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)

    print("整理运行文件…")
    copy_tree(ROOT / "backend" / "app", stage / "backend" / "app")
    scripts_dir = stage / "scripts"
    scripts_dir.mkdir(parents=True)
    for name in ("run_server.py", "tray.py", "stop.ps1", "stop_all.ps1", "paths.ps1"):
        shutil.copy2(ROOT / "scripts" / name, scripts_dir / name)
    copy_tree(ROOT / "frontend" / "dist-local", stage / "frontend" / "dist-local")
    (stage / "frontend" / "public").mkdir(parents=True)
    shutil.copy2(
        ROOT / "frontend" / "public" / "icon-192.png",
        stage / "frontend" / "public" / "icon-192.png",
    )
    shutil.copy2(ROOT / "README.md", stage / "README.md")

    print("解压 Python 运行时…")
    runtime_dir = stage / "runtime"
    runtime_dir.mkdir()
    with zipfile.ZipFile(zip_path) as archive:
        archive.extractall(runtime_dir)
    pth = runtime_dir / f"python{PYTHON_TAG}._pth"
    pth.write_text(
        f"python{PYTHON_TAG}.zip\r\n.\r\nLib\\site-packages\r\n",
        encoding="utf-8",
        newline="",
    )

    print("安装运行时依赖…")
    site_packages = runtime_dir / "Lib" / "site-packages"
    run(
        [
            str(venv_python),
            "-m",
            "pip",
            "install",
            "--quiet",
            "--upgrade",
            "--disable-pip-version-check",
            "--no-compile",
            "--target",
            str(site_packages),
            "-r",
            str(ROOT / "backend" / "requirements-runtime.txt"),
        ]
    )

    print("生成应用图标…")
    icon = stage / "assets" / "next-class.ico"
    run(
        [
            str(venv_python),
            str(ROOT / "scripts" / "make_icon.py"),
            str(ROOT / "frontend" / "public" / "icon-512.png"),
            str(icon),
        ]
    )

    runtime_python = runtime_dir / "python.exe"
    if not args.skip_runtime_smoke:
        print("检查打包运行时…")
        smoke_runtime(runtime_python, stage, version)
    for cache in stage.rglob("__pycache__"):
        shutil.rmtree(cache, ignore_errors=True)

    out_dir = ROOT / "dist"
    out_dir.mkdir(parents=True, exist_ok=True)
    language = ROOT / "installer" / "languages" / "ChineseSimplified.isl"
    print("编译安装包…")
    run(
        [
            str(iscc),
            f"/DAppVersion={version}",
            f"/DSourceDir={stage}",
            f"/DOutputDir={out_dir}",
            f"/DSetupIcon={icon}",
            f"/DLanguageFile={language}",
            str(ROOT / "installer" / "next-class.iss"),
        ]
    )

    installer = out_dir / f"NextClass-Setup-{version}.exe"
    if not installer.is_file():
        raise SystemExit(f"没有找到安装包输出：{installer}")
    size_mb = installer.stat().st_size / (1024 * 1024)
    print()
    print(f"安装包：{installer}")
    print(f"大小：{size_mb:.1f} MB")
    print(f"SHA256：{sha256(installer).upper()}")


if __name__ == "__main__":
    main()
