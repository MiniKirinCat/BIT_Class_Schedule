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
        self._owns_client = client is None
        self._client = client if client is not None else httpx.Client(timeout=timeout)

    def is_configured(self) -> bool:
        try:
            token = self._token_provider()
        except Exception:
            return False
        return bool(str(token).strip()) if token is not None else False

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def send(self, title: str, content: str) -> None:
        try:
            token = self._token_provider()
        except Exception:
            raise NotificationError("无法读取 PushPlus 配置") from None
        token_text = str(token).strip() if token is not None else ""
        if not token_text:
            raise NotificationError("PushPlus 未配置")

        def safe(value: object, limit: int) -> str:
            return redact(str(value)).replace(token_text, "[REDACTED]")[:limit]

        last_error = "PushPlus 发送失败"
        payload = {"token": token_text, "title": title, "content": content, "template": "txt"}
        for _ in range(2):
            try:
                response = self._client.post(PUSHPLUS_URL, json=payload)
            except httpx.HTTPError as exc:
                last_error = safe(exc, 200) or type(exc).__name__
                continue

            try:
                body = response.json()
            except ValueError:
                body = None

            code = body.get("code") if isinstance(body, dict) else None
            if response.status_code == 200 and str(code) == "200":
                return

            detail = f"PushPlus 返回异常（HTTP {response.status_code}"
            if code is not None and str(code).strip():
                detail += f"，code {safe(code, 40)}"
            message = body.get("msg") if isinstance(body, dict) else ""
            if message:
                detail += f"：{safe(message, 80)}"
            if not isinstance(body, dict):
                detail += "，响应格式错误"
            last_error = detail + "）"
        raise NotificationError(last_error)
