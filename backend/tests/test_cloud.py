import base64
import json
from datetime import datetime
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

import httpx
import pytest
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.cloud import (
    CloudError,
    CloudService,
    GistClient,
    build_pair_url,
    encrypt_snapshot,
    generate_snapshot_key,
    normalize_pages_url,
    snapshot_key_bytes,
)
from app.config import AppConfig
from app.db import Database, SettingsRepo, SnapshotRepo
from app.models import CalendarEntry, CourseSession

TZ = ZoneInfo("Asia/Shanghai")
NOW = datetime(2026, 10, 27, 12, 0, tzinfo=TZ)
FILENAME = "snapshot.enc.json"


class FakeCredentials:
    def __init__(self, **values):
        self.values = values

    def get(self, key):
        return self.values.get(key)

    def set(self, key, value):
        self.values[key] = value

    def delete(self, key):
        self.values.pop(key, None)

    def has(self, key):
        return key in self.values


class GistState:
    token = "ghp-test-token"
    revision = 1

    def __init__(self):
        self.requests = []
        self.fail_patch = 0
        self.content = json.dumps(
            {"format": "next-class-pending", "version": 1}
        )

    def _payload(self):
        return {
            "id": "gist123",
            "html_url": "https://gist.github.com/alice/gist123",
            "owner": {"login": "alice"},
            "files": {
                FILENAME: {
                    "raw_url": (
                        "https://gist.githubusercontent.com/alice/gist123/"
                        f"raw/rev{self.revision}/{FILENAME}"
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
                    "url": str(request.url),
                    "auth": request.headers.get("Authorization"),
                    "body": json.loads(request.content or b"{}"),
                }
            )
            if request.headers.get("Authorization") != f"Bearer {self.token}":
                return httpx.Response(401, json={"message": "Bad credentials"})
            if request.method == "POST" and request.url.path == "/gists":
                self.content = json.loads(request.content)["files"][FILENAME][
                    "content"
                ]
                return httpx.Response(201, json=self._payload())
            if request.method == "GET" and request.url.path == "/gists/gist123":
                return httpx.Response(200, json=self._payload())
            if request.method == "PATCH" and request.url.path == "/gists/gist123":
                if self.fail_patch:
                    self.fail_patch -= 1
                    return httpx.Response(500, json={"message": "down"})
                self.revision += 1
                self.content = json.loads(request.content)["files"][FILENAME][
                    "content"
                ]
                return httpx.Response(200, json=self._payload())
            return httpx.Response(404, json={"message": "Not Found"})

        return httpx.MockTransport(handler)


def make_service(tmp_path, state, credentials=None):
    db = Database(tmp_path / "test.db")
    db.initialize()
    settings = SettingsRepo(db)
    settings.set_int("sync_interval_days", 2)
    snapshots = SnapshotRepo(db)
    service = CloudService(
        config=AppConfig(data_dir=tmp_path, frontend_dir=tmp_path / "dist"),
        settings=settings,
        snapshots=snapshots,
        credentials=credentials or FakeCredentials(),
        client=GistClient(transport=state.transport()),
        now=lambda: NOW,
    )
    return service, settings, snapshots, credentials or service._credentials


def save_snapshot(snapshots):
    snapshots.save_snapshot(
        sync_run_id=1,
        term="2026-2027-1",
        fetched_at=NOW.isoformat(timespec="seconds"),
        first_day="2026-09-07",
        sessions=[
            CourseSession(
                course_code="MATH101",
                course_name="高等数学",
                teacher="李老师",
                room="A101",
                campus="良乡",
                weekday=1,
                start_period=1,
                end_period=2,
                weeks=(1, 2, 3),
            )
        ],
        calendar=[CalendarEntry(date="2026-10-27", week=8, weekday=2)],
        payload_hash="hash",
        is_baseline=True,
    )


def _decode(value):
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def decrypt_envelope(envelope, key):
    raw = snapshot_key_bytes(key)
    plaintext = AESGCM(raw).decrypt(
        _decode(envelope["nonce"]),
        _decode(envelope["ciphertext"]),
        None,
    )
    return json.loads(plaintext)


def test_encrypt_snapshot_roundtrip_hides_plaintext():
    key = generate_snapshot_key()
    payload = {"term": "2026-2027-1", "courses": [{"course_name": "高等数学"}]}

    envelope = encrypt_snapshot(payload, key, NOW.isoformat(timespec="seconds"))

    assert envelope["format"] == "next-class-snapshot"
    assert envelope["version"] == 1
    assert envelope["alg"] == "A256GCM"
    assert envelope["created_at"] == NOW.isoformat(timespec="seconds")
    assert "高等数学" not in json.dumps(envelope, ensure_ascii=False)
    assert decrypt_envelope(envelope, key) == payload


def test_snapshot_key_rejects_bad_values():
    with pytest.raises(CloudError, match="密钥格式"):
        snapshot_key_bytes("not a key!")
    with pytest.raises(CloudError, match="密钥长度"):
        snapshot_key_bytes("c2hvcnQ")


def test_pages_url_validation_and_pair_url():
    assert normalize_pages_url("https://alice.github.io/next-class") == (
        "https://alice.github.io/next-class/"
    )
    with pytest.raises(CloudError, match="https://"):
        normalize_pages_url("http://alice.github.io/next-class")

    link = build_pair_url(
        "https://alice.github.io/next-class/",
        "https://gist.githubusercontent.com/alice/gist123/raw/snapshot.enc.json",
        "gist123",
        "secret-key",
    )
    parts = urlsplit(link)
    query = parse_qs(parts.fragment)
    assert parts.scheme == "https"
    assert parts.netloc == "alice.github.io"
    assert query["snapshot"][0].endswith("/raw/snapshot.enc.json")
    assert query["gist"] == ["gist123"]
    assert query["key"] == ["secret-key"]


def test_gist_client_creates_gist_and_uses_latest_raw_url():
    state = GistState()
    client = GistClient(transport=state.transport())

    info = client.create_gist(state.token)

    assert info["gist_id"] == "gist123"
    assert info["raw_url"] == (
        "https://gist.githubusercontent.com/alice/gist123/raw/snapshot.enc.json"
    )
    assert state.requests[0]["method"] == "POST"
    assert state.requests[0]["auth"] == f"Bearer {state.token}"
    assert state.requests[0]["body"]["public"] is False


def test_gist_client_reports_invalid_token():
    state = GistState()
    client = GistClient(transport=state.transport())

    with pytest.raises(CloudError, match="token"):
        client.create_gist("wrong-token")


def test_cloud_setup_publishes_encrypted_snapshot_and_qr(tmp_path):
    state = GistState()
    service, settings, snapshots, credentials = make_service(tmp_path, state)
    save_snapshot(snapshots)

    result = service.setup(
        token="ghp-test-token",
        pages_url="https://alice.github.io/next-class",
    )

    assert result == {
        "configured": True,
        "published": True,
        "pages_url": "https://alice.github.io/next-class/",
        "gist_id": "gist123",
        "qr_ready": True,
    }
    assert credentials.get("github_token") == "ghp-test-token"
    assert credentials.get("snapshot_key")
    assert settings.get("gist_raw_url") == (
        "https://gist.githubusercontent.com/alice/gist123/raw/snapshot.enc.json"
    )
    assert settings.get("last_cloud_publish_at") == NOW.isoformat(timespec="seconds")
    assert settings.get("last_cloud_error") == ""

    patch = [item for item in state.requests if item["method"] == "PATCH"][-1]
    envelope = json.loads(patch["body"]["files"][FILENAME]["content"])
    payload = decrypt_envelope(envelope, credentials.get("snapshot_key"))
    assert payload["term"] == "2026-2027-1"
    assert payload["sync_interval_days"] == 2
    assert payload["courses"][0]["course_name"] == "高等数学"
    assert payload["calendar"] == [
        {"date": "2026-10-27", "week": 8, "weekday": 2}
    ]

    svg = service.qr_svg()
    assert svg.startswith("<svg")
    assert 'fill="#FFFFFF"' in svg
    assert credentials.get("snapshot_key") not in svg


def test_cloud_setup_rejects_invalid_gist_id(tmp_path):
    state = GistState()
    service, _, _, _ = make_service(tmp_path, state)

    with pytest.raises(CloudError, match="Gist ID"):
        service.setup(
            token="ghp-test-token",
            pages_url="https://alice.github.io/next-class",
            gist_id="../escape",
        )
    assert state.requests == []


def test_cloud_setup_without_snapshot_does_not_offer_qr(tmp_path):
    state = GistState()
    service, _, _, credentials = make_service(tmp_path, state)

    result = service.setup(
        token="ghp-test-token",
        pages_url="https://alice.github.io/next-class",
    )

    assert result["published"] is False
    assert result["qr_ready"] is False
    assert credentials.get("snapshot_key")
    with pytest.raises(CloudError, match="尚未发布"):
        service.qr_svg()


def test_cloud_reset_key_republishes_with_new_key(tmp_path):
    state = GistState()
    service, _, snapshots, credentials = make_service(tmp_path, state)
    save_snapshot(snapshots)
    service.setup(
        token="ghp-test-token",
        pages_url="https://alice.github.io/next-class",
    )
    old_key = credentials.get("snapshot_key")

    result = service.reset_key()

    new_key = credentials.get("snapshot_key")
    assert result["published"] is True
    assert result["qr_ready"] is True
    assert new_key and new_key != old_key
    envelope = json.loads(state.content)
    assert decrypt_envelope(envelope, new_key)["term"] == "2026-2027-1"
    with pytest.raises(InvalidTag):
        decrypt_envelope(envelope, old_key)


def test_cloud_reset_key_restores_old_key_when_publish_fails(tmp_path):
    state = GistState()
    service, _, snapshots, credentials = make_service(tmp_path, state)
    save_snapshot(snapshots)
    service.setup(
        token="ghp-test-token",
        pages_url="https://alice.github.io/next-class",
    )
    old_key = credentials.get("snapshot_key")
    old_content = state.content
    state.fail_patch = 1

    with pytest.raises(CloudError, match="GitHub"):
        service.reset_key()

    assert credentials.get("snapshot_key") == old_key
    assert state.content == old_content
    assert service.qr_ready is True


def test_cloud_reset_key_without_snapshot_disables_qr(tmp_path):
    state = GistState()
    service, _, _, credentials = make_service(tmp_path, state)
    service.setup(
        token="ghp-test-token",
        pages_url="https://alice.github.io/next-class",
    )
    old_key = credentials.get("snapshot_key")

    result = service.reset_key()

    assert result["published"] is False
    assert result["qr_ready"] is False
    assert credentials.get("snapshot_key") != old_key
    with pytest.raises(CloudError, match="尚未发布"):
        service.qr_svg()


def test_cloud_publish_requires_snapshot_and_configuration(tmp_path):
    state = GistState()
    service, _, snapshots, _ = make_service(tmp_path, state)

    with pytest.raises(CloudError, match="尚未发布|配置"):
        service.qr_svg()
    with pytest.raises(CloudError, match="还没有课表快照"):
        service.publish_current()

    save_snapshot(snapshots)
    with pytest.raises(CloudError, match="token"):
        service.publish_current()
