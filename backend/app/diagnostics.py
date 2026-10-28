import platform
import sys
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from .security import redact

TZ = ZoneInfo("Asia/Shanghai")
SSO_URL = "https://sso.bit.edu.cn/cas/login"
WEBVPN_URL = "https://webvpn.bit.edu.cn/"


def _iso(moment: datetime) -> str:
    return moment.isoformat(timespec="seconds")


def _safe(value: object, limit: int = 200) -> str:
    return (redact(str(value)).strip() or type(value).__name__)[:limit]


def _probe(client: httpx.Client, url: str) -> dict[str, Any]:
    try:
        response = client.get(url)
    except httpx.HTTPError as exc:
        return {"reachable": False, "status": None, "error": _safe(exc)}
    return {"reachable": True, "status": response.status_code, "error": None}


def keyring_status(credentials) -> dict[str, Any]:
    try:
        credentials.get("school_username")
    except Exception as exc:
        return {"available": False, "error": _safe(exc)}
    return {"available": True, "error": None}


def run_preflight(
    credentials,
    *,
    client: httpx.Client | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    owns_client = client is None
    client = client if client is not None else httpx.Client(
        timeout=5.0, follow_redirects=False
    )
    try:
        sso = _probe(client, SSO_URL)
        webvpn = _probe(client, WEBVPN_URL)
    finally:
        if owns_client:
            client.close()
    if sso["reachable"] and webvpn["reachable"]:
        suggested = "auto"
    elif sso["reachable"]:
        suggested = "campus"
    elif webvpn["reachable"]:
        suggested = "webvpn"
    else:
        suggested = "unknown"
    return {
        "checked_at": _iso(now or datetime.now(TZ)),
        "keyring": keyring_status(credentials),
        "network": {
            "sso": sso,
            "webvpn": webvpn,
            "suggested": suggested,
        },
    }


def sync_run_payload(row: dict) -> dict[str, Any]:
    started = row.get("started_at")
    finished = row.get("finished_at")
    duration = None
    if started and finished:
        try:
            duration = max(
                0,
                int(
                    (
                        datetime.fromisoformat(finished)
                        - datetime.fromisoformat(started)
                    ).total_seconds()
                ),
            )
        except (TypeError, ValueError):
            duration = None
    return {
        "id": row.get("id"),
        "trigger": row.get("trigger"),
        "started_at": started,
        "finished_at": finished,
        "duration_seconds": duration,
        "status": row.get("status"),
        "error_code": row.get("error_code"),
        "error_message": redact(row.get("error_message") or "")[:300] or None,
        "term": row.get("term"),
        "course_count": row.get("course_count"),
        "change_count": row.get("change_count"),
        "cloud_publish_status": row.get("cloud_publish_status"),
    }


def build_report(
    *,
    config,
    credentials,
    settings,
    snapshots,
    now: datetime | None = None,
) -> dict[str, Any]:
    runs = [sync_run_payload(row) for row in snapshots.recent_sync_runs(5)]
    latest = runs[0] if runs else None
    return {
        "format": "next-class-diagnostics",
        "version": 1,
        "generated_at": _iso(now or datetime.now(TZ)),
        "app_version": config.app_version,
        "platform": {
            "system": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
            "python": sys.version.split()[0],
        },
        "keyring": keyring_status(credentials),
        "settings": {
            "sync_interval_days": settings.get_int("sync_interval_days", 1),
            "notifications_enabled": settings.get_bool("push_enabled", False),
            "notifications_configured": _safe_configured(credentials),
            "cloud_configured": bool(
                _credential(credentials, "github_token")
                and _credential(credentials, "snapshot_key")
                and settings.get("gist_id")
            ),
            "cloud_last_publish_at": settings.get("last_cloud_publish_at"),
            "cloud_last_error": redact(settings.get("last_cloud_error") or "")[:300]
            or None,
            "notification_last_error": redact(
                settings.get("last_notification_error") or ""
            )[:300]
            or None,
        },
        "counts": snapshots.counts(),
        "last_sync": latest,
        "sync_runs": runs,
        "note": "已脱敏；不包含学号、密码、SendKey、GitHub token、Cookie 或快照密钥。",
    }


def _credential(credentials, key: str) -> str | None:
    try:
        return credentials.get(key)
    except Exception:
        return None


def _safe_configured(credentials) -> bool:
    return bool(_credential(credentials, "serverchan_sendkey"))
