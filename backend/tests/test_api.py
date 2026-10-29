import json
from datetime import date

import httpx
from fastapi.testclient import TestClient

from app.api import create_app
from app.cloud import GistClient
from app.config import AppConfig
from app.container import build_container
from app.models import CalendarEntry, FetchedSchedule
from app.school_gateway import SchoolError
from app.security import CredentialError

ROW = {
    "KCH": "MATH101",
    "KCM": "高等数学",
    "SKJS": "李老师",
    "JASMC": "A101",
    "YPSJDD": "周一第1-2节{第1-4周}",
    "SKZC": "111100",
    "SKXQ": 1,
    "KSJC": 1,
    "JSJC": 2,
    "XXXQMC": "良乡",
}


class FakeGateway:
    def __init__(self):
        self.raw = FetchedSchedule(
            term="2025-2026-1",
            first_day=date(2025, 9, 1),
            rows=[ROW],
            calendar=[CalendarEntry(date="2026-10-26", week=9, weekday=1)],
        )
        self.error = None
        self.calls = []

    def fetch(self, username, password):
        self.calls.append((username, password))
        if self.error:
            raise self.error
        return self.raw


class FakeCredentials:
    def __init__(self):
        self.values = {}

    def get(self, key):
        return self.values.get(key)

    def set(self, key, value):
        self.values[key] = value

    def delete(self, key):
        self.values.pop(key, None)

    def has(self, key):
        return key in self.values


class BrokenCredentials(FakeCredentials):
    """Simulates an unavailable keyring backend."""

    def get(self, key):
        raise CredentialError("Windows 凭据管理器不可用，无法读取敏感配置")

    def set(self, key, value):
        raise CredentialError("Windows 凭据管理器不可用，敏感配置未保存")

    def has(self, key):
        raise CredentialError("Windows 凭据管理器不可用，无法读取敏感配置")


class FakeNotifier:
    def __init__(self):
        self.messages = []
        self.configured = False
        self.fail = False
        self.error = "push down"
        self.close_calls = 0

    def is_configured(self):
        return self.configured

    def send(self, title, content):
        if self.fail:
            raise RuntimeError(self.error)
        self.messages.append((title, content))

    def close(self):
        self.close_calls += 1


def make_app(
    tmp_path,
    gateway,
    *,
    frontend_dir=None,
    credentials=None,
    notifier=None,
    cloud_client=None,
):
    config = AppConfig(
        data_dir=tmp_path,
        frontend_dir=frontend_dir if frontend_dir is not None else tmp_path / "dist",
        scheduler_enabled=False,
    )
    credentials = credentials if credentials is not None else FakeCredentials()
    notifier = notifier if notifier is not None else FakeNotifier()
    container = build_container(
        config,
        credentials=credentials,
        gateway=gateway,
        notifier=notifier,
        cloud_client=cloud_client,
    )
    return create_app(config, container), credentials, notifier


def test_status_and_dashboard_before_setup(tmp_path):
    app, _, _ = make_app(tmp_path, FakeGateway())
    with TestClient(app) as client:
        status = client.get("/api/status")
        assert status.status_code == 200
        body = status.json()
        assert body["configured"] is False
        assert body["school_configured"] is False
        assert body["school_username"] is None
        assert body["push_configured"] is False
        assert body["cloud_configured"] is False
        assert body["last_sync_at"] is None
        assert body["last_attempt_at"] is None
        assert body["next_due_at"]
        assert body["sync_status"] is None
        assert body["last_error"] is None
        assert body["notification_error"] is None
        assert body["cloud_status"] == "skipped"
        assert body["version"] == AppConfig().app_version

        assert client.get("/api/dashboard").status_code == 404
        assert client.post("/api/sync").status_code == 400


def test_update_check_endpoint_returns_release_state(tmp_path, monkeypatch):
    app, _, _ = make_app(tmp_path, FakeGateway())
    monkeypatch.setattr(
        "app.api.check_latest_release",
        lambda version: {
            "status": "ok",
            "current_version": version,
            "latest_version": "v1.3.0",
            "update_available": True,
            "release_url": "https://github.com/MiniKirinCat/BIT_Class_Schedule/releases/tag/v1.3.0",
            "release_name": "下一节 1.3.0",
            "published_at": "2026-10-29T10:00:00Z",
            "notes": None,
            "checked_at": "2026-10-29T10:00:00+08:00",
            "error": None,
        },
    )
    with TestClient(app) as client:
        response = client.get("/api/update/check")
        assert response.status_code == 200
        body = response.json()
        assert body["current_version"] == AppConfig().app_version
        assert body["latest_version"] == "v1.3.0"
        assert body["update_available"] is True


def test_setup_school_syncs_and_then_enforces_cooldown(tmp_path):
    gateway = FakeGateway()
    app, credentials, _ = make_app(tmp_path, gateway)

    with TestClient(app) as client:
        response = client.post(
            "/api/setup/school",
            json={"username": " 20250001 ", "password": "pw"},
        )
        assert response.status_code == 200
        assert response.json()["configured"] is True
        assert response.json()["status"] == "success"
        assert credentials.get("school_username") == "20250001"
        assert credentials.get("school_password") == "pw"
        assert gateway.calls == [("20250001", "pw")]

        dashboard = client.get("/api/dashboard")
        assert dashboard.status_code == 200
        body = dashboard.json()
        assert body["current_term"] == "2025-2026-1"
        assert body["terms"][0]["courses"][0]["course_name"] == "高等数学"
        assert len(body["period_times"]) == 13

        status = client.get("/api/status").json()
        assert status["configured"] is True
        assert status["school_configured"] is True
        assert status["school_username"] == "20250001"
        assert status["push_configured"] is False
        assert status["cloud_configured"] is False
        assert status["last_sync_at"] is not None
        assert status["last_attempt_at"] is not None
        assert status["sync_status"] == "success"
        assert status["cloud_status"] == "skipped"
        assert status["next_due_at"] is not None

        cooldown = client.post("/api/sync")
        assert cooldown.status_code == 429
        assert "分钟" in cooldown.json()["detail"]


def test_setup_school_failure_does_not_save_credentials(tmp_path):
    gateway = FakeGateway()
    gateway.error = SchoolError("LOGIN_FAILED", "登录失败")
    app, credentials, _ = make_app(tmp_path, gateway)

    with TestClient(app) as client:
        response = client.post(
            "/api/setup/school",
            json={"username": "20250001", "password": "bad"},
        )
        assert response.status_code == 502
        assert response.json()["detail"] == "登录失败"
        assert credentials.get("school_username") is None
        assert credentials.get("school_password") is None

        status = client.get("/api/status").json()
        assert status["configured"] is False
        assert status["sync_status"] == "failed"
        assert status["last_error"] == "登录失败"

        # A failed setup must not publish a dashboard snapshot.
        assert client.get("/api/dashboard").status_code == 404


def test_settings_validation_and_update(tmp_path):
    app, _, _ = make_app(tmp_path, FakeGateway())
    with TestClient(app) as client:
        current = client.get("/api/settings")
        assert current.status_code == 200
        assert current.json() == {
            "sync_interval_days": 1,
            "push_enabled": False,
            "school_configured": False,
            "push_configured": False,
            "cloud_configured": False,
            "cloud_pages_url": None,
            "cloud_gist_id": None,
            "cloud_last_publish_at": None,
            "cloud_last_error": None,
            "cloud_qr_ready": False,
        }

        updated = client.put(
            "/api/settings",
            json={"sync_interval_days": 3, "push_enabled": True},
        )
        assert updated.status_code == 200
        assert updated.json()["sync_interval_days"] == 3
        assert updated.json()["push_enabled"] is True

        for invalid in (0, 4):
            rejected = client.put(
                "/api/settings",
                json={"sync_interval_days": invalid},
            )
            assert rejected.status_code == 422
            assert rejected.json() == {"detail": "请求参数不正确"}

        # Rejected updates must not stick.
        assert client.get("/api/settings").json()["sync_interval_days"] == 3


def test_serverchan_setup_and_test_notification(tmp_path):
    app, credentials, notifier = make_app(tmp_path, FakeGateway())
    notifier.configured = True

    with TestClient(app) as client:
        response = client.post(
            "/api/setup/notifications",
            json={"token": "  SCTpush-token  ", "test": True},
        )
        assert response.status_code == 200
        assert response.json() == {"configured": True, "tested": True}
        assert credentials.get("serverchan_sendkey") == "SCTpush-token"
        assert app.state.container.settings.get_bool("push_enabled", False) is True
        assert notifier.messages[0][0] == "下一节测试提醒"

        status = client.get("/api/status").json()
        assert status["push_configured"] is True

        tested = client.post("/api/notifications/test")
        assert tested.status_code == 200
        assert tested.json() == {"status": "sent"}
        assert len(notifier.messages) == 2

        blank = client.post("/api/setup/notifications", json={"token": "   "})
        assert blank.status_code == 422


def test_serverchan_setup_failure_keeps_key_and_redacts_error(tmp_path):
    app, credentials, notifier = make_app(tmp_path, FakeGateway())
    notifier.configured = True
    notifier.fail = True
    notifier.error = "send failed token=push-secret-token-123"

    with TestClient(app) as client:
        response = client.post(
            "/api/setup/notifications",
            json={"token": "SCTpush-token", "test": True},
        )
        assert response.status_code == 502
        detail = response.json()["detail"]
        assert "push-secret-token-123" not in detail
        assert "token=[REDACTED]" in detail

        # The token is saved before the optional test send, so a later retry
        # only needs to fix the network/Server酱 side.
        assert credentials.get("serverchan_sendkey") == "SCTpush-token"
        assert app.state.container.settings.get_bool("push_enabled", False) is True


def test_test_notification_requires_configuration(tmp_path):
    app, _, _ = make_app(tmp_path, FakeGateway())
    with TestClient(app) as client:
        assert client.post("/api/notifications/test").status_code == 400


def test_school_setup_rejects_blank_username_and_overlong_password(tmp_path):
    app, credentials, _ = make_app(tmp_path, FakeGateway())
    with TestClient(app) as client:
        blank = client.post(
            "/api/setup/school",
            json={"username": "   ", "password": "pw"},
        )
        assert blank.status_code == 422
        assert blank.json() == {"detail": "学号不能为空"}

        overlong = client.post(
            "/api/setup/school",
            json={"username": "20250001", "password": "x" * 257},
        )
        assert overlong.status_code == 422
        assert overlong.json() == {"detail": "请求参数不正确"}
        assert credentials.get("school_username") is None


def test_school_setup_credential_failure_returns_503(tmp_path):
    password = "secret-password-123"
    app, _, _ = make_app(
        tmp_path,
        FakeGateway(),
        credentials=BrokenCredentials(),
    )
    with TestClient(app) as client:
        status = client.get("/api/status")
        assert status.status_code == 200
        assert status.json()["configured"] is False
        assert status.json()["push_configured"] is False

        response = client.post(
            "/api/setup/school",
            json={"username": "20250001", "password": password},
        )
        assert response.status_code == 503
        assert "凭据管理器" in response.json()["detail"]
        assert password not in response.json()["detail"]


class GistApiState:
    token = "ghp-api-token"

    def __init__(self):
        self.requests = []
        self.content = ""
        self.revision = 1

    def payload(self):
        return {
            "id": "gist-api",
            "html_url": "https://gist.github.com/alice/gist-api",
            "owner": {"login": "alice"},
            "files": {
                "snapshot.enc.json": {
                    "raw_url": (
                        "https://gist.githubusercontent.com/alice/gist-api/"
                        f"raw/rev{self.revision}/snapshot.enc.json"
                    ),
                    "content": self.content,
                }
            },
        }

    def transport(self):
        def handler(request: httpx.Request) -> httpx.Response:
            self.requests.append(
                {
                    "method": request.method,
                    "body": json.loads(request.content or b"{}"),
                }
            )
            if request.headers.get("Authorization") != f"Bearer {self.token}":
                return httpx.Response(401, json={"message": "Bad credentials"})
            if request.method == "POST" and request.url.path == "/gists":
                self.content = json.loads(request.content)["files"][
                    "snapshot.enc.json"
                ]["content"]
                return httpx.Response(201, json=self.payload())
            if request.method == "GET" and request.url.path == "/gists/gist-api":
                return httpx.Response(200, json=self.payload())
            if request.method == "PATCH" and request.url.path == "/gists/gist-api":
                self.revision += 1
                self.content = json.loads(request.content)["files"][
                    "snapshot.enc.json"
                ]["content"]
                return httpx.Response(200, json=self.payload())
            return httpx.Response(404, json={"message": "Not Found"})

        return httpx.MockTransport(handler)


def test_cloud_setup_publish_qr_and_key_reset(tmp_path):
    state = GistApiState()
    gateway = FakeGateway()
    app, credentials, _ = make_app(
        tmp_path,
        gateway,
        cloud_client=GistClient(transport=state.transport()),
    )

    with TestClient(app) as client:
        assert client.get("/api/setup/qr").status_code == 400
        setup = client.post(
            "/api/setup/school",
            json={"username": "20250001", "password": "pw"},
        )
        assert setup.status_code == 200

        status = client.get("/api/status").json()
        assert status["cloud_configured"] is False
        assert status["cloud_qr_ready"] is False

        invalid = client.post(
            "/api/setup/cloud",
            json={"token": "ghp-api-token", "pages_url": "http://example.com"},
        )
        assert invalid.status_code == 422
        assert "https://" in invalid.json()["detail"]

        cloud = client.post(
            "/api/setup/cloud",
            json={
                "token": "ghp-api-token",
                "pages_url": "https://alice.github.io/next-class",
            },
        )
        assert cloud.status_code == 200
        body = cloud.json()
        assert body["configured"] is True
        assert body["published"] is True
        assert body["qr_ready"] is True
        assert body["pages_url"] == "https://alice.github.io/next-class/"
        assert credentials.get("github_token") == "ghp-api-token"
        assert credentials.get("snapshot_key")
        assert "高等数学" not in state.content

        status = client.get("/api/status").json()
        assert status["cloud_configured"] is True
        assert status["cloud_qr_ready"] is True
        assert status["cloud_gist_id"] == "gist-api"
        assert status["cloud_pages_url"] == "https://alice.github.io/next-class/"
        assert status["cloud_last_publish_at"]
        assert status["cloud_last_error"] == ""

        settings = client.get("/api/settings").json()
        assert settings["cloud_configured"] is True
        assert settings["cloud_qr_ready"] is True

        qr = client.get("/api/setup/qr")
        assert qr.status_code == 200
        assert qr.headers["content-type"].startswith("image/svg+xml")
        assert qr.headers["cache-control"] == "no-store"
        assert qr.text.startswith("<svg")

        published = client.post("/api/cloud/publish")
        assert published.status_code == 200
        assert published.json()["status"] == "success"

        before_sync = state.content
        gateway.raw = FetchedSchedule(
            term=gateway.raw.term,
            first_day=gateway.raw.first_day,
            rows=[{**ROW, "JASMC": "A202"}],
            calendar=gateway.raw.calendar,
        )
        app.state.container.settings.set(
            "last_attempt_sync_at", "2020-01-01T00:00:00+08:00"
        )
        synced = client.post("/api/sync")
        assert synced.status_code == 200
        assert synced.json()["cloud_status"] == "success"
        assert state.content != before_sync
        assert app.state.container.settings.get("last_cloud_publish_at")

        old_key = credentials.get("snapshot_key")
        reset = client.post("/api/cloud/reset-key")
        assert reset.status_code == 200
        assert reset.json()["published"] is True
        assert credentials.get("snapshot_key") != old_key


def test_cloud_setup_rejects_bad_token_and_missing_token(tmp_path):
    state = GistApiState()
    app, _, _ = make_app(
        tmp_path,
        FakeGateway(),
        cloud_client=GistClient(transport=state.transport()),
    )

    with TestClient(app) as client:
        missing = client.post(
            "/api/setup/cloud",
            json={"pages_url": "https://alice.github.io/next-class"},
        )
        assert missing.status_code == 422
        assert "token" in missing.json()["detail"]

        bad = client.post(
            "/api/setup/cloud",
            json={
                "token": "wrong-token",
                "pages_url": "https://alice.github.io/next-class",
            },
        )
        assert bad.status_code == 502
        assert "token" in bad.json()["detail"]
        assert client.get("/api/status").json()["cloud_configured"] is False


def test_dashboard_payload_contains_expected_fields(tmp_path):
    gateway = FakeGateway()
    app, _, _ = make_app(tmp_path, gateway)

    with TestClient(app) as client:
        setup = client.post(
            "/api/setup/school",
            json={"username": "20250001", "password": "pw"},
        )
        assert setup.status_code == 200

        body = client.get("/api/dashboard").json()
        assert body["schema_version"] == 2
        assert body["app_version"] == AppConfig().app_version
        assert body["synced_at"]
        assert body["sync_interval_days"] == 1
        assert body["current_term"] == "2025-2026-1"
        assert len(body["period_times"]) == 13
        assert body["period_times"][0] == {
            "index": 1,
            "start": "08:00",
            "end": "08:45",
        }
        assert len(body["terms"]) == 1
        term = body["terms"][0]
        assert term["term"] == "2025-2026-1"
        assert term["first_day"] == "2025-09-01"
        assert [course["course_name"] for course in term["courses"]] == ["高等数学"]
        assert term["courses"][0]["weeks"] == [1, 2, 3, 4]
        assert term["calendar"] == [
            {"date": "2026-10-26", "week": 9, "weekday": 1}
        ]
        assert term["changes"] == []
        assert body["sync_status"] == "success"
        assert body["last_attempt_at"]
        assert body["next_due_at"]
        assert body["cloud_status"] == "skipped"
        assert body["last_error"] == ""
        assert body["configured"] is True

        # A second sync with a different room records one change entry.
        gateway.raw = FetchedSchedule(
            term=gateway.raw.term,
            first_day=gateway.raw.first_day,
            rows=[{**ROW, "JASMC": "A202"}],
            calendar=gateway.raw.calendar,
        )
        app.state.container.settings.set(
            "last_attempt_sync_at", "2020-01-01T00:00:00+08:00"
        )
        synced = client.post("/api/sync")
        assert synced.status_code == 200
        assert synced.json()["change_count"] == 1

        body = client.get("/api/dashboard").json()
        changes = body["terms"][0]["changes"]
        assert len(changes) == 1
        change = changes[0]
        assert set(change) == {
            "id",
            "detected_at",
            "type",
            "course_code",
            "course_name",
            "summary",
            "before",
            "after",
        }
        assert change["type"] == "modified"
        assert change["course_code"] == "MATH101"
        assert change["course_name"] == "高等数学"
        assert change["before"]["room"] == "A101"
        assert change["after"]["room"] == "A202"


def test_manual_sync_reports_busy_before_cooldown(tmp_path):
    gateway = FakeGateway()
    app, _, _ = make_app(tmp_path, gateway)

    with TestClient(app) as client:
        setup = client.post(
            "/api/setup/school",
            json={"username": "20250001", "password": "pw"},
        )
        assert setup.status_code == 200

        container = app.state.container
        assert container.sync_service._worker_lock.acquire(blocking=False)
        try:
            response = client.post("/api/sync")
        finally:
            container.sync_service._worker_lock.release()

        assert response.status_code == 409
        assert "正在" in response.json()["detail"]


def test_manual_sync_runs_after_cooldown_expires(tmp_path):
    gateway = FakeGateway()
    app, _, _ = make_app(tmp_path, gateway)

    with TestClient(app) as client:
        setup = client.post(
            "/api/setup/school",
            json={"username": "20250001", "password": "pw"},
        )
        assert setup.status_code == 200
        assert client.post("/api/sync").status_code == 429

        app.state.container.settings.set(
            "last_attempt_sync_at", "2020-01-01T00:00:00+08:00"
        )
        calls_before = len(gateway.calls)
        response = client.post("/api/sync")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "success"
        assert body["course_count"] == 1
        assert body["change_count"] == 0
        assert body["cloud_status"] == "skipped"
        assert body["error_code"] is None
        assert len(gateway.calls) == calls_before + 1


def test_static_frontend_mounted_without_shadowing_api(tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text(
        "<html><body>next-class index</body></html>", encoding="utf-8"
    )
    app, _, _ = make_app(tmp_path, FakeGateway(), frontend_dir=dist)

    with TestClient(app) as client:
        root = client.get("/")
        assert root.status_code == 200
        assert "next-class index" in root.text

        assert client.get("/api/health").json() == {"status": "ok"}

        missing = client.get("/api/missing")
        assert missing.status_code == 404
        assert missing.headers["content-type"].startswith("application/json")
        assert missing.json() == {"detail": "接口不存在"}
        assert "next-class index" not in missing.text


def test_lifespan_initializes_db_and_closes_owned_notifier(tmp_path):
    config = AppConfig(
        data_dir=tmp_path,
        frontend_dir=tmp_path / "dist",
        scheduler_enabled=False,
    )
    container = build_container(
        config,
        credentials=FakeCredentials(),
        gateway=FakeGateway(),
    )
    assert container.owns_notifier is True
    http_client = container.notifier._client
    app = create_app(config, container)

    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        assert container.db.path.exists()
        assert container.settings.get("app_schema_version") == "1"
        assert container.settings.get("sync_interval_days") == "1"
        assert not http_client.is_closed

    assert http_client.is_closed


def test_lifespan_leaves_injected_notifier_open(tmp_path):
    config = AppConfig(
        data_dir=tmp_path,
        frontend_dir=tmp_path / "dist",
        scheduler_enabled=False,
    )
    notifier = FakeNotifier()
    container = build_container(
        config,
        credentials=FakeCredentials(),
        gateway=FakeGateway(),
        notifier=notifier,
    )
    app = create_app(config, container)

    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        assert container.settings.get("app_schema_version") == "1"

    assert notifier.close_calls == 0


def test_lifespan_builds_container_when_none_injected(tmp_path):
    config = AppConfig(
        data_dir=tmp_path,
        frontend_dir=tmp_path / "dist",
        scheduler_enabled=False,
    )
    app = create_app(config)

    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        active = app.state.container
        assert active is not None
        assert active.config is config
        assert active.db.path.exists()
        assert not active.notifier._client.is_closed

    assert active.notifier._client.is_closed


def test_unhandled_errors_return_json_and_redact_log(tmp_path, monkeypatch, caplog):
    app, _, _ = make_app(tmp_path, FakeGateway())

    def explode():
        raise RuntimeError("boom password=supersecret")

    with caplog.at_level("ERROR", logger="next_class.api"):
        with TestClient(app) as client:
            monkeypatch.setattr(
                app.state.container.snapshots, "latest_sync_run", explode
            )
            response = client.get("/api/status")

    assert response.status_code == 500
    assert response.json() == {"detail": "服务内部错误"}
    assert "supersecret" not in response.text
    assert "supersecret" not in caplog.text
    assert "unhandled API error" in caplog.text


def test_lifespan_marks_interrupted_runs_failed(tmp_path):
    config = AppConfig(
        data_dir=tmp_path,
        frontend_dir=tmp_path / "dist",
        scheduler_enabled=False,
    )
    container = build_container(
        config,
        credentials=FakeCredentials(),
        gateway=FakeGateway(),
        notifier=FakeNotifier(),
    )
    container.db.initialize()
    container.snapshots.record_sync_run(
        trigger="startup",
        started_at="2026-10-25T12:00:00+08:00",
        finished_at=None,
        status="running",
    )
    app = create_app(config, container)

    with TestClient(app) as client:
        assert client.get("/api/status").status_code == 200

    run = container.snapshots.latest_sync_run()
    assert run is not None
    assert run["status"] == "failed"
    assert run["error_code"] == "INTERRUPTED"


def test_sync_runs_and_diagnostics_are_sanitized(tmp_path, monkeypatch):
    app, credentials, _ = make_app(tmp_path, FakeGateway())
    credentials.set("school_username", "20250001")
    credentials.set("serverchan_sendkey", "SCTsecret-key")
    with TestClient(app) as client:
        active = app.state.container
        active.snapshots.record_sync_run(
            trigger="manual",
            started_at="2026-10-27T10:00:00+08:00",
            finished_at="2026-10-27T10:00:04+08:00",
            status="failed",
            error_code="LOGIN_FAILED",
            error_message="password=secret-password",
            course_count=0,
            change_count=0,
        )
        runs = client.get("/api/sync-runs?limit=1")
        assert runs.status_code == 200
        assert runs.json()["runs"][0]["duration_seconds"] == 4
        assert runs.json()["runs"][0]["error_message"] == "password=[REDACTED]"

        monkeypatch.setattr(
            "app.api.run_preflight",
            lambda credentials: {
                "checked_at": "2026-10-27T10:00:00+08:00",
                "keyring": {"available": True, "error": None},
                "network": {
                    "sso": {"reachable": True, "status": 200, "error": None},
                    "webvpn": {"reachable": True, "status": 200, "error": None},
                    "suggested": "auto",
                },
            },
        )
        preflight = client.post("/api/diagnostics/preflight")
        assert preflight.status_code == 200
        assert preflight.json()["keyring"]["available"] is True

        report = client.get("/api/diagnostics")
        assert report.status_code == 200
        body = report.json()
        text = str(body)
        assert "20250001" not in text
        assert "SCTsecret-key" not in text
        assert "secret-password" not in text
        assert body["counts"]["snapshots"] == 0
        assert body["sync_runs"][0]["error_code"] == "LOGIN_FAILED"


def test_startup_toggle(tmp_path, monkeypatch):
    app, _, _ = make_app(tmp_path, FakeGateway())
    state = {"enabled": False}

    monkeypatch.setattr(
        "app.api.startup_status",
        lambda: {"supported": True, "enabled": state["enabled"]},
    )
    monkeypatch.setattr(
        "app.api.enable_startup",
        lambda root: state.update(enabled=True),
    )
    monkeypatch.setattr(
        "app.api.disable_startup",
        lambda: state.update(enabled=False),
    )

    with TestClient(app) as client:
        assert client.get("/api/system/startup").json() == {
            "supported": True,
            "enabled": False,
        }
        enabled = client.put("/api/system/startup", json={"enabled": True})
        assert enabled.status_code == 200
        assert enabled.json()["enabled"] is True
        disabled = client.put("/api/system/startup", json={"enabled": False})
        assert disabled.status_code == 200
        assert disabled.json()["enabled"] is False
