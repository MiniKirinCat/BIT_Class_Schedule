import httpx
import pytest

from app.notifier import NotificationError, ServerChanNotifier

BASE_URL = "https://sctapi.ftqq.com"


def make_notifier(handler, sendkey="SCTtestkey"):
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return ServerChanNotifier(lambda: sendkey, client=client)


def form_body(request):
    return dict(httpx.QueryParams(request.content.decode("utf-8")))


def test_send_success_posts_form_to_serverchan():
    calls = []

    def handler(request):
        calls.append((request.method, str(request.url), form_body(request)))
        return httpx.Response(200, json={"code": 0})

    make_notifier(handler).send("课表变动 · 1 处", "高等数学 调整")

    assert calls == [
        (
            "POST",
            f"{BASE_URL}/SCTtestkey.send",
            {"title": "课表变动 · 1 处", "desp": "高等数学 调整"},
        )
    ]


def test_title_newlines_are_flattened():
    calls = []

    def handler(request):
        calls.append(form_body(request))
        return httpx.Response(200, json={"code": 0})

    make_notifier(handler).send("课表\n变动", "正文")
    assert calls[0]["title"] == "课表 变动"


def test_string_code_zero_is_success():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"code": "0"})

    make_notifier(handler).send("标题", "正文")
    assert len(calls) == 1


def test_retries_once_on_server_error():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(500, json={"code": 500})

    with pytest.raises(NotificationError):
        make_notifier(handler).send("标题", "正文")
    assert len(calls) == 2


def test_retries_after_transport_error():
    calls = []

    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            raise httpx.ConnectError("down", request=request)
        return httpx.Response(200, json={"code": 0})

    make_notifier(handler).send("标题", "正文")
    assert len(calls) == 2


def test_rate_limit_is_not_retried():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(429, json={"code": 429, "message": "too many"})

    with pytest.raises(NotificationError) as exc:
        make_notifier(handler).send("标题", "正文")
    assert len(calls) == 1
    assert "429" in str(exc.value)


def test_business_error_is_not_retried():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"code": 40001, "message": "SendKey 无效"})

    with pytest.raises(NotificationError) as exc:
        make_notifier(handler).send("标题", "正文")
    assert len(calls) == 1
    assert "40001" in str(exc.value)
    assert "SendKey 无效" in str(exc.value)


def test_missing_sendkey_is_not_configured_and_does_not_call_network():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"code": 0})

    notifier = make_notifier(handler, sendkey="   ")
    assert notifier.is_configured() is False
    with pytest.raises(NotificationError) as exc:
        notifier.send("标题", "正文")
    assert "Server酱" in str(exc.value)
    assert calls == []


def test_provider_failure_is_not_configured_and_does_not_call_network():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"code": 0})

    def provider():
        raise RuntimeError("keyring down")

    client = httpx.Client(transport=httpx.MockTransport(handler))
    notifier = ServerChanNotifier(provider, client=client)
    assert notifier.is_configured() is False
    with pytest.raises(NotificationError) as exc:
        notifier.send("标题", "正文")
    assert "Server酱" in str(exc.value)
    assert calls == []


def test_sendkey_is_redacted_from_errors():
    secret = "SCTsupersecret"

    def handler(request):
        return httpx.Response(200, json={"code": 40001, "message": f"bad {secret}"})

    with pytest.raises(NotificationError) as exc:
        make_notifier(handler, sendkey=secret).send("标题", "正文")
    assert secret not in str(exc.value)
    assert "[REDACTED]" in str(exc.value)


def test_transport_error_sendkey_is_redacted():
    secret = "SCTsupersecret"

    def handler(request):
        raise httpx.ConnectError(f"bad {secret}", request=request)

    with pytest.raises(NotificationError) as exc:
        make_notifier(handler, sendkey=secret).send("标题", "正文")
    assert secret not in str(exc.value)


def test_malformed_response_keeps_http_status():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(502, text="<html>gateway</html>")

    with pytest.raises(NotificationError) as exc:
        make_notifier(handler).send("标题", "正文")
    message = str(exc.value)
    assert len(calls) == 2
    assert "HTTP 502" in message
    assert "响应格式错误" in message


def test_server_data_error_is_reported():
    def handler(request):
        return httpx.Response(200, json={"code": 1, "data": {"error": "SUCCESS?"}})

    with pytest.raises(NotificationError) as exc:
        make_notifier(handler).send("标题", "正文")
    assert "SUCCESS?" in str(exc.value)


def test_close_leaves_injected_client_open():
    client = httpx.Client(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"code": 0}))
    )
    notifier = ServerChanNotifier(lambda: "SCTtestkey", client=client)
    try:
        notifier.close()
        assert client.is_closed is False
    finally:
        client.close()


def test_close_closes_owned_client():
    notifier = ServerChanNotifier(lambda: "SCTtestkey")
    notifier.close()
    assert notifier._client.is_closed is True
