import json

import httpx
import pytest

from app.notifier import NotificationError, PushPlusNotifier

PUSHPLUS_URL = "https://www.pushplus.plus/send"


def make_notifier(handler, token="test-token"):
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return PushPlusNotifier(lambda: token, client=client)


def test_send_success_posts_expected_payload():
    calls = []

    def handler(request):
        calls.append((request.method, str(request.url), json.loads(request.content)))
        return httpx.Response(200, json={"code": 200, "msg": "ok"})

    notifier = make_notifier(handler)
    notifier.send("标题", "正文")

    assert calls == [
        (
            "POST",
            PUSHPLUS_URL,
            {"token": "test-token", "title": "标题", "content": "正文", "template": "txt"},
        )
    ]


def test_retries_once_then_succeeds():
    calls = []
    responses = [
        httpx.Response(500, json={"code": 500}),
        httpx.Response(200, json={"code": 200}),
    ]

    def handler(request):
        calls.append(request)
        return responses.pop(0)

    make_notifier(handler).send("标题", "正文")
    assert len(calls) == 2


def test_business_error_code_is_a_failure():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"code": 903, "msg": "token 无效"})

    with pytest.raises(NotificationError) as exc:
        make_notifier(handler).send("标题", "正文")
    assert len(calls) == 2
    assert "903" in str(exc.value)
    assert "token 无效" in str(exc.value)


def test_missing_token_is_not_configured_and_does_not_call_network():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"code": 200})

    notifier = make_notifier(handler, token="")
    assert notifier.is_configured() is False
    with pytest.raises(NotificationError) as exc:
        notifier.send("标题", "正文")
    assert "PushPlus 未配置" in str(exc.value)
    assert calls == []


def test_is_configured_true_with_token():
    notifier = make_notifier(lambda request: httpx.Response(200, json={"code": 200}))
    assert notifier.is_configured() is True


def test_string_code_200_is_success():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"code": "200"})

    make_notifier(handler).send("标题", "正文")
    assert len(calls) == 1


def test_two_failures_raise_after_two_attempts():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(500, json={"code": 500, "msg": "server error"})

    with pytest.raises(NotificationError) as exc:
        make_notifier(handler).send("标题", "正文")
    assert len(calls) == 2
    assert "HTTP 500" in str(exc.value)
    assert "server error" in str(exc.value)


def test_token_provider_failure_is_not_configured_and_does_not_call_network():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"code": 200})

    def provider():
        raise RuntimeError("keyring down")

    client = httpx.Client(transport=httpx.MockTransport(handler))
    notifier = PushPlusNotifier(provider, client=client)
    assert notifier.is_configured() is False
    with pytest.raises(NotificationError) as exc:
        notifier.send("标题", "正文")
    assert "无法读取 PushPlus 配置" in str(exc.value)
    assert calls == []


def test_retries_after_transport_error():
    calls = []

    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            raise httpx.ConnectError("down", request=request)
        return httpx.Response(200, json={"code": 200})

    make_notifier(handler).send("标题", "正文")
    assert len(calls) == 2


def test_falsy_client_is_respected():
    calls = []

    class FalsyClient:
        def __bool__(self):
            return False

        def post(self, url, json):
            calls.append(json)
            return httpx.Response(200, json={"code": 200})

    notifier = PushPlusNotifier(lambda: "test-token", client=FalsyClient())
    notifier.send("标题", "正文")
    assert calls == [
        {"token": "test-token", "title": "标题", "content": "正文", "template": "txt"}
    ]


def test_server_message_is_redacted():
    secret = "super-secret-token"

    def handler(request):
        return httpx.Response(200, json={"code": 903, "msg": f"token: {secret}"})

    with pytest.raises(NotificationError) as exc:
        make_notifier(handler, token=secret).send("标题", "正文")
    assert secret not in str(exc.value)


def test_server_bare_token_echo_is_redacted():
    secret = "super-secret-token"

    def handler(request):
        return httpx.Response(200, json={"code": 903, "msg": f"bad {secret}"})

    with pytest.raises(NotificationError) as exc:
        make_notifier(handler, token=secret).send("标题", "正文")
    assert secret not in str(exc.value)


def test_server_token_in_code_is_redacted():
    secret = "super-secret-token"

    def handler(request):
        return httpx.Response(200, json={"code": f"bad {secret}", "msg": "x"})

    with pytest.raises(NotificationError) as exc:
        make_notifier(handler, token=secret).send("标题", "正文")
    assert secret not in str(exc.value)


def test_http_status_failure_is_reported_even_with_success_code():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(500, json={"code": 200})

    with pytest.raises(NotificationError) as exc:
        make_notifier(handler).send("标题", "正文")
    assert len(calls) == 2
    assert "HTTP 500" in str(exc.value)


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


def test_non_dict_json_reports_status_without_crashing():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=["unexpected"])

    with pytest.raises(NotificationError) as exc:
        make_notifier(handler).send("标题", "正文")
    message = str(exc.value)
    assert len(calls) == 2
    assert "HTTP 200" in message
    assert "响应格式错误" in message


def test_whitespace_token_is_not_configured():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"code": 200})

    notifier = make_notifier(handler, token="   ")
    assert notifier.is_configured() is False
    with pytest.raises(NotificationError) as exc:
        notifier.send("标题", "正文")
    assert "PushPlus 未配置" in str(exc.value)
    assert calls == []


def test_token_is_stripped_before_sending():
    calls = []

    def handler(request):
        calls.append(json.loads(request.content))
        return httpx.Response(200, json={"code": 200})

    make_notifier(handler, token="  test-token  ").send("标题", "正文")
    assert calls == [
        {"token": "test-token", "title": "标题", "content": "正文", "template": "txt"}
    ]


def test_empty_business_code_is_not_rendered():
    def handler(request):
        return httpx.Response(200, json={"code": "", "msg": "no code"})

    with pytest.raises(NotificationError) as exc:
        make_notifier(handler).send("标题", "正文")
    message = str(exc.value)
    assert "HTTP 200" in message
    assert "no code" in message
    assert "code ：" not in message


def test_empty_transport_error_reports_exception_type():
    calls = []

    def handler(request):
        calls.append(request)
        raise httpx.ConnectError("", request=request)

    with pytest.raises(NotificationError) as exc:
        make_notifier(handler).send("标题", "正文")
    assert len(calls) == 2
    assert "ConnectError" in str(exc.value)


def test_transport_error_message_token_is_redacted():
    secret = "super-secret-token"

    def handler(request):
        raise httpx.ConnectError(f"bad {secret}", request=request)

    with pytest.raises(NotificationError) as exc:
        make_notifier(handler, token=secret).send("标题", "正文")
    assert secret not in str(exc.value)


def test_close_leaves_injected_client_open():
    client = httpx.Client(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"code": 200}))
    )
    notifier = PushPlusNotifier(lambda: "test-token", client=client)
    try:
        notifier.close()
        assert client.is_closed is False
    finally:
        client.close()


def test_close_closes_owned_client():
    notifier = PushPlusNotifier(lambda: "test-token")
    notifier.close()
    assert notifier._client.is_closed is True
