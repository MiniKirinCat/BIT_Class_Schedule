from datetime import datetime, timezone

import httpx

from app.config import AppConfig
from app.db import Database, SettingsRepo, SnapshotRepo
from app.diagnostics import build_report, run_preflight, sync_run_payload
from app.security import CredentialError


class FakeCredentials:
    def __init__(self, values=None, fail=False):
        self.values = values or {}
        self.fail = fail

    def get(self, key):
        if self.fail:
            raise CredentialError("Windows 凭据管理器不可用，无法读取敏感配置")
        return self.values.get(key)


def test_sync_run_payload_computes_duration_and_redacts():
    payload = sync_run_payload(
        {
            "id": 3,
            "trigger": "manual",
            "started_at": "2026-10-27T10:00:00+08:00",
            "finished_at": "2026-10-27T10:00:05+08:00",
            "status": "failed",
            "error_code": "LOGIN_FAILED",
            "error_message": "password=secret123",
            "term": "2026-2027-1",
            "course_count": 0,
            "change_count": 0,
            "cloud_publish_status": "skipped",
        }
    )
    assert payload["duration_seconds"] == 5
    assert payload["error_message"] == "password=[REDACTED]"
    assert payload["error_code"] == "LOGIN_FAILED"


def test_preflight_reports_campus_when_only_sso_is_reachable():
    def handler(request):
        if "sso" in str(request.url):
            return httpx.Response(200, text="login")
        raise httpx.ConnectError("blocked", request=request)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    result = run_preflight(
        FakeCredentials(),
        client=client,
        now=datetime(2026, 10, 27, 10, 0, tzinfo=timezone.utc),
    )
    client.close()
    assert result["keyring"]["available"] is True
    assert result["network"]["sso"]["reachable"] is True
    assert result["network"]["webvpn"]["reachable"] is False
    assert result["network"]["suggested"] == "campus"


def test_preflight_reports_auto_when_both_are_reachable():
    client = httpx.Client(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, text="ok"))
    )
    result = run_preflight(FakeCredentials(), client=client)
    client.close()
    assert result["network"]["suggested"] == "auto"


def test_preflight_reports_keyring_failure_and_unknown_network():
    client = httpx.Client(
        transport=httpx.MockTransport(
            lambda request: (_ for _ in ()).throw(
                httpx.ConnectError("down", request=request)
            )
        )
    )
    result = run_preflight(FakeCredentials(fail=True), client=client)
    client.close()
    assert result["keyring"]["available"] is False
    assert "凭据管理器" in result["keyring"]["error"]
    assert result["network"]["suggested"] == "unknown"


def test_build_report_contains_no_secrets(tmp_path):
    db = Database(tmp_path / "next_class.db")
    db.initialize()
    settings = SettingsRepo(db)
    snapshots = SnapshotRepo(db)
    settings.set_int("sync_interval_days", 2)
    settings.set_bool("push_enabled", True)
    settings.set("last_notification_error", "SendKey=secret-key")
    settings.set("last_cloud_error", "token=secret-token")
    snapshots.record_sync_run(
        trigger="manual",
        started_at="2026-10-27T10:00:00+08:00",
        finished_at="2026-10-27T10:00:03+08:00",
        status="failed",
        term="2026-2027-1",
        course_count=0,
        change_count=0,
        error_code="LOGIN_FAILED",
        error_message="password=secret-password",
    )
    credentials = FakeCredentials(
        {
            "school_username": "20250001",
            "school_password": "secret-password",
            "serverchan_sendkey": "secret-key",
            "github_token": "secret-token",
            "snapshot_key": "secret-snapshot-key",
        }
    )
    report = build_report(
        config=AppConfig(data_dir=tmp_path, frontend_dir=tmp_path / "dist"),
        credentials=credentials,
        settings=settings,
        snapshots=snapshots,
    )
    text = str(report)
    assert "20250001" not in text
    assert "secret-password" not in text
    assert "secret-key" not in text
    assert "secret-token" not in text
    assert "secret-snapshot-key" not in text
    assert report["settings"]["sync_interval_days"] == 2
    assert report["settings"]["notifications_enabled"] is True
    assert report["settings"]["notifications_configured"] is True
    assert report["counts"] == {"snapshots": 0, "changes": 0}
    assert report["sync_runs"][0]["error_code"] == "LOGIN_FAILED"
    assert report["note"].startswith("已脱敏")
