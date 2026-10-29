import xml.etree.ElementTree as ElementTree
from datetime import datetime
from typing import Any
from urllib.parse import unquote
from zoneinfo import ZoneInfo

import httpx

from .security import safe_message

TZ = ZoneInfo("Asia/Shanghai")
RELEASES_URL = (
    "https://api.github.com/repos/MiniKirinCat/BIT_Class_Schedule/releases/latest"
)
RELEASES_ATOM_URL = (
    "https://github.com/MiniKirinCat/BIT_Class_Schedule/releases.atom"
)
USER_AGENT = "NextClass-UpdateCheck"


def _version_tuple(value: str | None) -> tuple[int, ...] | None:
    if not isinstance(value, str):
        return None
    text = value.strip().lower()
    if text.startswith("v"):
        text = text[1:]
    text = text.split("+", 1)[0].split("-", 1)[0]
    parts = text.split(".")
    if not parts or not all(part.isdigit() for part in parts):
        return None
    return tuple(int(part) for part in parts)


def is_newer(candidate: str, current: str) -> bool:
    left = _version_tuple(candidate)
    right = _version_tuple(current)
    if left is None or right is None:
        return False
    width = max(len(left), len(right))
    return left + (0,) * (width - len(left)) > right + (0,) * (width - len(right))


def _result(
    *,
    current_version: str,
    checked_at: str,
    status: str,
    latest_version: str | None = None,
    release_url: str | None = None,
    release_name: str | None = None,
    published_at: str | None = None,
    notes: str | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "status": status,
        "current_version": current_version,
        "latest_version": latest_version,
        "update_available": bool(
            latest_version and is_newer(latest_version, current_version)
        ),
        "release_url": release_url,
        "release_name": release_name,
        "published_at": published_at,
        "notes": notes,
        "checked_at": checked_at,
        "error": error,
    }


def _api_payload(
    payload: object,
    *,
    current_version: str,
    checked_at: str,
) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    tag = payload.get("tag_name")
    if not isinstance(tag, str) or not tag.strip():
        return None
    release_url = payload.get("html_url")
    if not isinstance(release_url, str) or not release_url.startswith(
        "https://github.com/"
    ):
        release_url = None
    body = payload.get("body")
    if not isinstance(body, str):
        body = ""
    name = payload.get("name")
    published = payload.get("published_at")
    return _result(
        current_version=current_version,
        checked_at=checked_at,
        status="ok",
        latest_version=tag.strip(),
        release_url=release_url,
        release_name=name.strip() if isinstance(name, str) and name.strip() else None,
        published_at=published if isinstance(published, str) else None,
        notes=body.strip()[:1200] or None,
    )


def _atom_payload(
    content: bytes,
    *,
    current_version: str,
    checked_at: str,
) -> dict[str, Any] | None:
    try:
        root = ElementTree.fromstring(content)
    except ElementTree.ParseError:
        return None
    namespace = "{http://www.w3.org/2005/Atom}"
    entry = root.find(f"{namespace}entry")
    if entry is None:
        return _result(
            current_version=current_version,
            checked_at=checked_at,
            status="unpublished",
        )

    release_url = None
    for link in entry.findall(f"{namespace}link"):
        if link.get("rel") in (None, "alternate"):
            candidate = link.get("href")
            if isinstance(candidate, str):
                release_url = candidate
            break

    tag = None
    if release_url and "/tag/" in release_url:
        tag = unquote(release_url.split("/tag/", 1)[1].split("?", 1)[0].strip("/"))
    if not tag:
        entry_id = entry.findtext(f"{namespace}id") or ""
        if ":Repository/" in entry_id:
            tag = unquote(entry_id.rsplit("/", 1)[-1])
    if not tag:
        return None

    if release_url and not release_url.startswith("https://github.com/"):
        release_url = None
    title = entry.findtext(f"{namespace}title")
    updated = entry.findtext(f"{namespace}updated") or entry.findtext(
        f"{namespace}published"
    )
    return _result(
        current_version=current_version,
        checked_at=checked_at,
        status="ok",
        latest_version=tag,
        release_url=release_url,
        release_name=(
            title.strip()
            if isinstance(title, str) and title.strip() and title.strip() != tag
            else None
        ),
        published_at=updated if isinstance(updated, str) else None,
    )


def check_latest_release(
    current_version: str,
    *,
    client: httpx.Client | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    checked_at = (now or datetime.now(TZ)).isoformat(timespec="seconds")
    owns_client = client is None
    active = client or httpx.Client(timeout=10.0, follow_redirects=True)
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": USER_AGENT,
    }
    fallback_error = None
    try:
        try:
            response = active.get(RELEASES_URL, headers=headers)
            if response.status_code == 404:
                return _result(
                    current_version=current_version,
                    checked_at=checked_at,
                    status="unpublished",
                )
            if response.status_code == 403:
                fallback_error = "GitHub 请求受限，请稍后再试"
            else:
                response.raise_for_status()
                try:
                    payload = response.json()
                except ValueError:
                    fallback_error = "GitHub 返回了无法识别的内容"
                else:
                    result = _api_payload(
                        payload,
                        current_version=current_version,
                        checked_at=checked_at,
                    )
                    if result is not None:
                        return result
                    fallback_error = "发布信息缺少版本号"
        except httpx.HTTPError as exc:
            fallback_error = safe_message(exc) or "无法连接 GitHub"

        # The REST API is rate-limited per IP and can be blocked by proxies.
        # GitHub's public Atom feed exposes the same latest release tag.
        try:
            atom = active.get(
                RELEASES_ATOM_URL,
                headers={
                    "Accept": "application/atom+xml",
                    "User-Agent": USER_AGENT,
                },
            )
            atom.raise_for_status()
            result = _atom_payload(
                atom.content,
                current_version=current_version,
                checked_at=checked_at,
            )
            if result is not None:
                return result
            if fallback_error is None:
                fallback_error = "GitHub 返回了无法识别的内容"
        except httpx.HTTPError as exc:
            if fallback_error is None:
                fallback_error = safe_message(exc) or "无法连接 GitHub"
    finally:
        if owns_client:
            active.close()

    return _result(
        current_version=current_version,
        checked_at=checked_at,
        status="error",
        error=fallback_error or "无法检查更新",
    )
