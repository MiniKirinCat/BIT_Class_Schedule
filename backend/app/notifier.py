from typing import Callable

import httpx

from .security import redact

PUSHPLUS_URL = "https://www.pushplus.plus/send"


class NotificationError(Exception):
    pass


class PushPlusNotifier:
    def __init__(
        self,
        token_provider: Callable[[], str | None],
        client: httpx.Client | None = None,
        timeout: float = 10.0,
    ):
        self._token_provider = token_provider
        self._client = client if client is not None else httpx.Client(timeout=timeout)

    def is_configured(self) -> bool:
        try:
            return bool(self._token_provider())
        except Exception:
            return False

    def send(self, title: str, content: str) -> None:
        try:
            token = self._token_provider()
        except Exception:
            raise NotificationError("无法读取 PushPlus 配置") from None
        if not token:
            raise NotificationError("PushPlus 未配置")

        token_text = str(token)

        def safe(value: object, limit: int) -> str:
            return redact(str(value)).replace(token_text, "[REDACTED]")[:limit]

        last_error = "PushPlus 发送失败"
        payload = {"token": token, "title": title, "content": content, "template": "txt"}
        for _ in range(2):
            try:
                response = self._client.post(PUSHPLUS_URL, json=payload)
                body = response.json()
                code = body.get("code") if isinstance(body, dict) else None
                if response.status_code == 200 and str(code) == "200":
                    return

                message = body.get("msg") if isinstance(body, dict) else ""
                detail = f"PushPlus 返回异常（HTTP {response.status_code}"
                if code is not None:
                    detail += f"，code {safe(code, 40)}"
                if message:
                    detail += f"：{safe(message, 80)}"
                last_error = detail + "）"
            except (httpx.HTTPError, ValueError, AttributeError) as exc:
                last_error = safe(exc, 200) or last_error
        raise NotificationError(last_error)
