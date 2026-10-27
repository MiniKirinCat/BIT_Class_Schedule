import importlib.util
import json
import socket
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "run_server", ROOT / "scripts" / "run_server.py"
)
run_server = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(run_server)


def test_choose_port_prefers_17800(monkeypatch):
    monkeypatch.delenv("NEXT_CLASS_PORT", raising=False)
    monkeypatch.setattr(run_server, "port_available", lambda port: port == 17800)
    assert run_server.choose_port() == 17800


def test_choose_port_falls_back_to_ephemeral_port(monkeypatch):
    monkeypatch.delenv("NEXT_CLASS_PORT", raising=False)
    monkeypatch.setattr(run_server, "port_available", lambda port: False)
    port = run_server.choose_port()
    assert 1 <= port <= 65535
    assert port != 17800


def test_explicit_port_conflict_aborts(monkeypatch):
    monkeypatch.setenv("NEXT_CLASS_PORT", "18000")
    monkeypatch.setattr(run_server, "port_available", lambda port: False)
    with pytest.raises(SystemExit):
        run_server.choose_port()


@pytest.mark.parametrize("value", ["abc", "0", "65536", "-1"])
def test_invalid_explicit_port_aborts(monkeypatch, value):
    monkeypatch.setenv("NEXT_CLASS_PORT", value)
    with pytest.raises(SystemExit):
        run_server.choose_port()


def test_explicit_available_port_is_used(monkeypatch):
    monkeypatch.setenv("NEXT_CLASS_PORT", "18000")
    monkeypatch.setattr(run_server, "port_available", lambda port: True)
    assert run_server.choose_port() == 18000


def test_existing_instance_requires_healthy_port(monkeypatch, tmp_path):
    runtime = tmp_path / "runtime.json"
    runtime.write_text(
        json.dumps({"port": 17800, "pid": 123, "url": "http://127.0.0.1:17800"}),
        encoding="utf-8",
    )
    monkeypatch.setattr(run_server, "RUNTIME", runtime)
    monkeypatch.setattr(run_server, "health", lambda port, timeout=1.0: True)
    assert run_server.existing_instance()["port"] == 17800

    monkeypatch.setattr(run_server, "health", lambda port, timeout=1.0: False)
    assert run_server.existing_instance() is None


def test_existing_instance_ignores_invalid_runtime(monkeypatch, tmp_path):
    runtime = tmp_path / "runtime.json"
    monkeypatch.setattr(run_server, "RUNTIME", runtime)
    assert run_server.existing_instance() is None

    runtime.write_text("{not json", encoding="utf-8")
    assert run_server.existing_instance() is None

    runtime.write_text(json.dumps({"port": "17800"}), encoding="utf-8")
    assert run_server.existing_instance() is None

    runtime.write_text(json.dumps({"port": True}), encoding="utf-8")
    assert run_server.existing_instance() is None


def test_write_and_clear_runtime(monkeypatch, tmp_path):
    runtime = tmp_path / "data" / "runtime.json"
    monkeypatch.setattr(run_server, "RUNTIME", runtime)
    data = run_server.write_runtime(17800)

    assert data["port"] == 17800
    assert data["pid"] == run_server.os.getpid()
    assert data["url"] == "http://127.0.0.1:17800"
    assert data["started_at"]
    written = json.loads(runtime.read_text(encoding="utf-8"))
    assert written == data
    assert "password" not in written
    assert "token" not in written

    run_server.clear_runtime(run_server.os.getpid())
    assert not runtime.exists()


def test_clear_runtime_does_not_remove_another_process_file(monkeypatch, tmp_path):
    runtime = tmp_path / "runtime.json"
    monkeypatch.setattr(run_server, "RUNTIME", runtime)
    runtime.write_text(json.dumps({"port": 17800, "pid": 999}), encoding="utf-8")

    run_server.clear_runtime(123)

    assert runtime.exists()


class FakeResponse:
    def __init__(self, status=200, body=b'{"status": "ok"}'):
        self.status = status
        self.body = body

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_health_checks_status_and_body(monkeypatch):
    monkeypatch.setattr(
        run_server.urllib.request,
        "urlopen",
        lambda url, timeout: FakeResponse(),
    )
    assert run_server.health(17800) is True

    monkeypatch.setattr(
        run_server.urllib.request,
        "urlopen",
        lambda url, timeout: FakeResponse(status=500),
    )
    assert run_server.health(17800) is False

    monkeypatch.setattr(
        run_server.urllib.request,
        "urlopen",
        lambda url, timeout: FakeResponse(body=b'{"status": "other"}'),
    )
    assert run_server.health(17800) is False


def test_port_available_detects_bound_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        port = sock.getsockname()[1]
        assert run_server.port_available(port) is False
