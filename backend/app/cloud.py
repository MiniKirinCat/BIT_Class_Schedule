import base64
import json
import os
import re
from datetime import datetime
from typing import Callable
from urllib.parse import quote, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

import httpx
import qrcode
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import AppConfig
from .db import SettingsRepo, SnapshotRepo
from .schedule import PERIOD_TIMES
from .security import CredentialError, safe_message

TZ = ZoneInfo("Asia/Shanghai")
GITHUB_API = "https://api.github.com"
SNAPSHOT_FILENAME = "snapshot.enc.json"
GIST_DESCRIPTION = "下一节加密课表快照"
ENVELOPE_FORMAT = "next-class-snapshot"


class CloudError(Exception):
    pass


def _iso(moment: datetime) -> str:
    return moment.isoformat(timespec="seconds")


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    text = value.strip()
    if not text:
        raise CloudError("快照密钥为空")
    try:
        return base64.b64decode(
            text + "=" * (-len(text) % 4),
            altchars=b"-_",
            validate=True,
        )
    except (ValueError, TypeError) as exc:
        raise CloudError("快照密钥格式不正确") from exc


def generate_snapshot_key() -> str:
    return _b64url_encode(os.urandom(32))


def snapshot_key_bytes(key: str) -> bytes:
    raw = _b64url_decode(key)
    if len(raw) != 32:
        raise CloudError("快照密钥长度不正确")
    return raw


def encrypt_snapshot(payload: dict, key: str, created_at: str) -> dict:
    nonce = os.urandom(12)
    plaintext = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    ciphertext = AESGCM(snapshot_key_bytes(key)).encrypt(nonce, plaintext, None)
    return {
        "format": ENVELOPE_FORMAT,
        "version": 1,
        "alg": "A256GCM",
        "nonce": _b64url_encode(nonce),
        "ciphertext": _b64url_encode(ciphertext),
        "created_at": created_at,
    }


def changes_payload(rows: list[dict]) -> list[dict]:
    result = []
    for row in rows:
        try:
            details = json.loads(row.get("details_json") or "{}")
        except ValueError:
            details = {}
        if not isinstance(details, dict):
            details = {}
        result.append(
            {
                "id": row["id"],
                "detected_at": row["detected_at"],
                "type": row["type"],
                "course_code": row["course_code"],
                "course_name": row["course_name"],
                "summary": row["summary"],
                "before": details.get("before"),
                "after": details.get("after"),
            }
        )
    return result


def build_cloud_payload(
    *,
    app_version: str,
    synced_at: str,
    sync_interval_days: int,
    term: str,
    first_day: str,
    sessions,
    changes: list[dict],
    calendar,
) -> dict:
    return {
        "schema_version": 1,
        "app_version": app_version,
        "synced_at": synced_at,
        "sync_interval_days": sync_interval_days,
        "term": term,
        "first_day": first_day,
        "courses": [session.to_dict() for session in sessions],
        "changes": changes,
        "calendar": [entry.to_dict() for entry in calendar],
        "period_times": [
            {"index": period.index, "start": period.start, "end": period.end}
            for period in PERIOD_TIMES
        ],
    }


def normalize_pages_url(value: str) -> str:
    value = value.strip()
    if not value:
        return ""
    parts = urlsplit(value)
    if parts.scheme != "https" or not parts.netloc:
        raise CloudError("Pages 地址必须以 https:// 开头")
    path = parts.path
    if path and not path.endswith("/"):
        path += "/"
    return urlunsplit((parts.scheme, parts.netloc, path, "", ""))


def canonical_raw_url(raw_url: str | None, gist_id: str, owner: str | None) -> str:
    if raw_url:
        match = re.match(
            r"^(https://gist\.githubusercontent\.com/[^/]+/[^/]+/raw)/[^/]+/(.+)$",
            raw_url,
        )
        if match:
            return f"{match.group(1)}/{match.group(2)}"
        return raw_url
    if owner and gist_id:
        return (
            f"https://gist.githubusercontent.com/{owner}/{gist_id}"
            f"/raw/{SNAPSHOT_FILENAME}"
        )
    return ""


def build_pair_url(pages_url: str, raw_url: str, gist_id: str, key: str) -> str:
    fragment = urlencode(
        {"v": 1, "snapshot": raw_url, "gist": gist_id, "key": key},
        quote_via=quote,
    )
    return f"{pages_url.rstrip('/')}/#{fragment}"


class GistClient:
    def __init__(
        self,
        *,
        transport: httpx.BaseTransport | None = None,
        timeout: float = 15.0,
        api_base: str = GITHUB_API,
    ):
        self._transport = transport
        self._timeout = timeout
        self._api_base = api_base.rstrip("/")

    def _headers(self, token: str) -> dict[str, str]:
        return {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "next-class/0.1",
        }

    def _error_message(self, status: int, *, creating: bool = False) -> str:
        if status in (401, 403):
            return "GitHub token 无效、没有 gist 权限，或触发了速率限制"
        if status == 404 and creating:
            return "GitHub 不允许创建 Gist，请确认 token 具有 gist 权限"
        if status == 404:
            return "Gist 不存在，或 token 无权访问"
        if status == 422:
            return "GitHub 拒绝了 Gist 请求，请检查仓库设置"
        if status >= 500:
            return "GitHub 服务暂时不可用，请稍后重试"
        return f"GitHub 请求失败（HTTP {status}）"

    def _request(
        self,
        method: str,
        path: str,
        token: str,
        body: dict | None = None,
    ) -> dict:
        try:
            with httpx.Client(
                timeout=self._timeout,
                transport=self._transport,
            ) as client:
                response = client.request(
                    method,
                    f"{self._api_base}{path}",
                    headers=self._headers(token),
                    json=body,
                )
        except httpx.HTTPError as exc:
            raise CloudError("无法连接 GitHub，请检查网络") from exc
        if response.status_code >= 400:
            raise CloudError(
                self._error_message(
                    response.status_code,
                    creating=method == "POST" and path == "/gists",
                )
            )
        try:
            data = response.json()
        except ValueError as exc:
            raise CloudError("GitHub 返回了无法识别的响应") from exc
        if not isinstance(data, dict):
            raise CloudError("GitHub 返回了无法识别的响应")
        return data

    def _gist_info(self, data: dict) -> dict:
        gist_id = str(data.get("id") or "")
        files = data.get("files")
        file_info = files.get(SNAPSHOT_FILENAME) if isinstance(files, dict) else None
        raw_url = file_info.get("raw_url") if isinstance(file_info, dict) else None
        owner = data.get("owner")
        owner_login = owner.get("login") if isinstance(owner, dict) else None
        return {
            "gist_id": gist_id,
            "raw_url": canonical_raw_url(raw_url, gist_id, owner_login),
            "html_url": str(data.get("html_url") or ""),
            "has_file": isinstance(file_info, dict),
        }

    def create_gist(self, token: str) -> dict:
        placeholder = json.dumps(
            {"format": "next-class-pending", "version": 1},
            ensure_ascii=False,
        )
        data = self._request(
            "POST",
            "/gists",
            token,
            {
                "description": GIST_DESCRIPTION,
                "public": False,
                "files": {SNAPSHOT_FILENAME: {"content": placeholder}},
            },
        )
        return self._gist_info(data)

    def get_gist(self, token: str, gist_id: str) -> dict:
        return self._gist_info(self._request("GET", f"/gists/{gist_id}", token))

    def update_file(self, token: str, gist_id: str, content: str) -> dict:
        data = self._request(
            "PATCH",
            f"/gists/{gist_id}",
            token,
            {
                "description": GIST_DESCRIPTION,
                "files": {SNAPSHOT_FILENAME: {"content": content}},
            },
        )
        return self._gist_info(data)

    def ensure_gist(self, token: str, gist_id: str | None = None) -> dict:
        if not gist_id:
            return self.create_gist(token)
        info = self.get_gist(token, gist_id)
        if info["raw_url"] or info["has_file"]:
            return info
        placeholder = json.dumps(
            {"format": "next-class-pending", "version": 1},
            ensure_ascii=False,
        )
        return self.update_file(token, gist_id, placeholder)


class CloudService:
    def __init__(
        self,
        *,
        config: AppConfig,
        settings: SettingsRepo,
        snapshots: SnapshotRepo,
        credentials,
        client: GistClient | None = None,
        now: Callable[[], datetime] | None = None,
    ):
        self._config = config
        self._settings = settings
        self._snapshots = snapshots
        self._credentials = credentials
        self._client = client or GistClient()
        self._now = now or (lambda: datetime.now(TZ))

    def _credential(self, key: str) -> str | None:
        try:
            return self._credentials.get(key)
        except CredentialError:
            return None

    def is_configured(self) -> bool:
        return bool(
            self._credential("github_token")
            and self._credential("snapshot_key")
            and self._settings.get("gist_id")
        )

    @property
    def pages_url(self) -> str:
        return self._settings.get("pages_url") or ""

    @property
    def qr_ready(self) -> bool:
        key = self._credential("snapshot_key")
        try:
            snapshot_key_bytes(key or "")
        except CloudError:
            return False
        return bool(
            self._credential("github_token")
            and self._settings.get("gist_id")
            and self._settings.get("gist_raw_url")
            and self._settings.get("last_cloud_publish_at")
            and self.pages_url
        )

    def _require_config(self, *, require_key: bool = True) -> tuple[str, str, str]:
        token = self._credential("github_token")
        key = self._credential("snapshot_key")
        gist_id = self._settings.get("gist_id")
        if not token:
            raise CloudError("请先填写 GitHub token")
        if require_key and not key:
            raise CloudError("快照密钥不存在，请重置配对密钥")
        if not gist_id:
            raise CloudError("请先完成 Gist 配置")
        return token, key or "", gist_id

    def setup(
        self,
        *,
        token: str = "",
        pages_url: str = "",
        gist_id: str | None = None,
    ) -> dict:
        token = token.strip() or (self._credential("github_token") or "")
        if not token:
            raise CloudError("请输入 GitHub token")
        pages = normalize_pages_url(pages_url) if pages_url.strip() else ""
        requested_gist = (gist_id or "").strip() or self._settings.get("gist_id") or ""
        if requested_gist and not re.fullmatch(r"[A-Za-z0-9]{1,64}", requested_gist):
            raise CloudError("Gist ID 格式不正确")
        info = self._client.ensure_gist(token, requested_gist or None)
        if not info["gist_id"]:
            raise CloudError("GitHub 未返回 Gist ID")

        key = self._credential("snapshot_key")
        new_key = not key
        key = key or generate_snapshot_key()

        try:
            self._credentials.set("github_token", token)
            if new_key:
                self._credentials.set("snapshot_key", key)
        except CredentialError as exc:
            raise CloudError(str(exc)) from exc
        self._settings.set("gist_id", info["gist_id"])
        if info["raw_url"]:
            self._settings.set("gist_raw_url", info["raw_url"])
        if pages:
            self._settings.set("pages_url", pages)
        self._settings.set("last_cloud_publish_at", "")

        published = False
        if self._snapshots.latest() is not None:
            self.publish_current()
            published = True
        return {
            "configured": True,
            "published": published,
            "pages_url": self.pages_url,
            "gist_id": info["gist_id"],
            "qr_ready": self.qr_ready,
        }

    def current_payload(self) -> dict:
        snapshot = self._snapshots.latest()
        if snapshot is None:
            raise CloudError("还没有课表快照，请先完成同步")
        return build_cloud_payload(
            app_version=self._config.app_version,
            synced_at=snapshot.fetched_at,
            sync_interval_days=self._settings.get_int("sync_interval_days", 1),
            term=snapshot.term,
            first_day=snapshot.first_day,
            sessions=snapshot.sessions,
            changes=changes_payload(
                self._snapshots.changes_for_term(snapshot.term, limit=50)
            ),
            calendar=snapshot.calendar,
        )

    def publish_payload(self, payload: dict, *, key: str | None = None) -> str:
        token, stored_key, gist_id = self._require_config(require_key=key is None)
        encryption_key = key or stored_key
        created_at = _iso(self._now())
        try:
            envelope = encrypt_snapshot(payload, encryption_key, created_at)
            info = self._client.update_file(
                token,
                gist_id,
                json.dumps(envelope, ensure_ascii=False),
            )
        except CloudError as exc:
            self._settings.set("last_cloud_error", safe_message(exc))
            raise
        if info["raw_url"]:
            self._settings.set("gist_raw_url", info["raw_url"])
        self._settings.set("last_cloud_publish_at", created_at)
        self._settings.set("last_cloud_error", "")
        self._settings.set_int("cloud_failure_streak", 0)
        return created_at

    def publish_current(self, *, key: str | None = None) -> str:
        return self.publish_payload(self.current_payload(), key=key)

    def reset_key(self) -> dict:
        _, old_key, gist_id = self._require_config(require_key=False)
        new_key = generate_snapshot_key()
        try:
            self._credentials.set("snapshot_key", new_key)
        except CredentialError as exc:
            raise CloudError(str(exc)) from exc

        published = False
        try:
            if self._snapshots.latest() is not None:
                self.publish_current()
                published = True
            else:
                self._settings.set("last_cloud_publish_at", "")
        except Exception:
            if old_key:
                try:
                    self._credentials.set("snapshot_key", old_key)
                except CredentialError:
                    pass
            else:
                self._settings.set("last_cloud_publish_at", "")
            raise
        return {
            "configured": True,
            "published": published,
            "pages_url": self.pages_url,
            "gist_id": gist_id,
            "qr_ready": self.qr_ready,
        }

    def qr_svg(self) -> str:
        if not self.is_configured():
            raise CloudError("请先完成云端快照配置")
        raw_url = self._settings.get("gist_raw_url")
        pages_url = self.pages_url
        key = self._credential("snapshot_key")
        gist_id = self._settings.get("gist_id")
        if not raw_url or not self._settings.get("last_cloud_publish_at"):
            raise CloudError("云端快照尚未发布")
        if not pages_url:
            raise CloudError("请先填写 GitHub Pages 地址")
        if not key or not gist_id:
            raise CloudError("快照配对信息不完整")
        try:
            snapshot_key_bytes(key)
        except CloudError as exc:
            raise CloudError("快照密钥损坏，请重置配对密钥") from exc
        link = build_pair_url(pages_url, raw_url, gist_id, key)

        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=1,
            border=2,
        )
        qr.add_data(link)
        qr.make(fit=True)
        matrix = qr.get_matrix()
        size = len(matrix)
        path_parts = []
        for y, row in enumerate(matrix):
            x = 0
            while x < size:
                if not row[x]:
                    x += 1
                    continue
                start = x
                while x < size and row[x]:
                    x += 1
                width = x - start
                path_parts.append(f"M{start} {y}h{width}v1h-{width}z")
        path = "".join(path_parts)
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
            'shape-rendering="crispEdges" role="img" aria-label="手机配对二维码">'
            f'<rect width="{size}" height="{size}" fill="#FFFFFF"/>'
            f'<path d="{path}" fill="#1D211E"/>'
            "</svg>"
        )


class SyncCloudPublisher:
    def __init__(self, cloud: CloudService):
        self._cloud = cloud

    def is_configured(self) -> bool:
        return self._cloud.is_configured()

    def publish(self, payload: dict) -> None:
        self._cloud.publish_payload(payload)
