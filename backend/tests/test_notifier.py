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
