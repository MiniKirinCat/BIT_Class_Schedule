from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from app.update import RELEASES_URL, check_latest_release, is_newer

TZ = ZoneInfo("Asia/Shanghai")
NOW = datetime(2026, 10, 29, 9, 0, tzinfo=TZ)


def make_client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_is_newer_handles_prefixes_and_missing_parts():
    assert is_newer("v1.3.0", "1.2.0") is True
    assert is_newer("1.2.1", "1.2.0") is True
    assert is_newer("1.2.0", "1.2") is False
    assert is_newer("1.10.0", "1.9.9") is True
    assert is_newer("1.2.0-beta.1", "1.1.0") is True
    assert is_newer("nope", "1.2.0") is False
    assert is_newer("1.2.0", "not-a-version") is False


def test_check_returns_newer_release():
    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == RELEASES_URL
        assert request.headers["user-agent"] == "NextClass-UpdateCheck"
        return httpx.Response(
            200,
            json={
                "tag_name": "v1.2.1",
                "name": "下一节 1.2.1",
                "html_url": "https://github.com/MiniKirinCat/BIT_Class_Schedule/releases/tag/v1.2.1",
                "published_at": "2026-10-28T12:00:00Z",
                "body": "修复同步问题\n\n- 细节",
            },
        )

    result = check_latest_release("1.2.0", client=make_client(handler), now=NOW)
    assert result["status"] == "ok"
    assert result["current_version"] == "1.2.0"
    assert result["latest_version"] == "v1.2.1"
    assert result["update_available"] is True
    assert result["release_name"] == "下一节 1.2.1"
    assert result["notes"] == "修复同步问题\n\n- 细节"
    assert result["checked_at"] == "2026-10-29T09:00:00+08:00"
    assert result["error"] is None


def test_check_marks_same_version_as_current():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "tag_name": "1.2.0",
                "html_url": "https://github.com/MiniKirinCat/BIT_Class_Schedule/releases/tag/1.2.0",
            },
        )

    result = check_latest_release("1.2.0", client=make_client(handler), now=NOW)
    assert result["status"] == "ok"
    assert result["update_available"] is False


def test_check_reports_unpublished_repository():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"message": "Not Found"})

    result = check_latest_release("1.2.0", client=make_client(handler), now=NOW)
    assert result["status"] == "unpublished"
    assert result["update_available"] is False
    assert result["error"] is None


def test_check_refuses_unsafe_release_url():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "tag_name": "v9.0.0",
                "html_url": "javascript:alert(1)",
            },
        )

    result = check_latest_release("1.2.0", client=make_client(handler), now=NOW)
    assert result["status"] == "ok"
    assert result["release_url"] is None
    assert result["update_available"] is True


def test_check_handles_rate_limit_and_network_errors():
    rate_limited = check_latest_release(
        "1.2.0",
        client=make_client(lambda request: httpx.Response(403, json={})),
        now=NOW,
    )
    assert rate_limited["status"] == "error"
    assert "受限" in rate_limited["error"]

    def offline(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("proxy unavailable", request=request)

    failed = check_latest_release("1.2.0", client=make_client(offline), now=NOW)
    assert failed["status"] == "error"
    assert failed["error"]
    assert failed["update_available"] is False


ATOM_FEED = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>tag:github.com,2008:Repository/123456/v1.2.2</id>
    <updated>2026-10-28T12:00:00Z</updated>
    <link rel="alternate" type="text/html"
      href="https://github.com/MiniKirinCat/BIT_Class_Schedule/releases/tag/v1.2.2"/>
    <title>v1.2.2</title>
  </entry>
</feed>
"""


def test_falls_back_to_atom_when_api_is_rate_limited():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com":
            return httpx.Response(403, json={"message": "rate limited"})
        assert str(request.url) == "https://github.com/MiniKirinCat/BIT_Class_Schedule/releases.atom"
        return httpx.Response(200, content=ATOM_FEED.encode("utf-8"))

    result = check_latest_release("1.2.0", client=make_client(handler), now=NOW)
    assert result["status"] == "ok"
    assert result["latest_version"] == "v1.2.2"
    assert result["update_available"] is True
    assert result["release_url"].endswith("/releases/tag/v1.2.2")
    assert result["published_at"] == "2026-10-28T12:00:00Z"
    assert result["error"] is None


def test_rate_limited_api_with_empty_atom_feed_means_unpublished():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com":
            return httpx.Response(403)
        return httpx.Response(
            200,
            content=b'<feed xmlns="http://www.w3.org/2005/Atom"></feed>',
        )

    result = check_latest_release("1.2.0", client=make_client(handler), now=NOW)
    assert result["status"] == "unpublished"
    assert result["error"] is None


def test_falls_back_to_atom_after_api_network_error():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com":
            raise httpx.ConnectError("api unavailable", request=request)
        return httpx.Response(200, content=ATOM_FEED.encode("utf-8"))

    result = check_latest_release("1.2.0", client=make_client(handler), now=NOW)
    assert result["status"] == "ok"
    assert result["update_available"] is True


def test_check_handles_invalid_payloads():
    def invalid_json(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"not json")

    result = check_latest_release("1.2.0", client=make_client(invalid_json), now=NOW)
    assert result["status"] == "error"

    def missing_tag(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"html_url": "https://github.com/x"})

    result = check_latest_release("1.2.0", client=make_client(missing_tag), now=NOW)
    assert result["status"] == "error"
    assert "版本号" in result["error"]
