from typing import Callable, Protocol
from urllib.parse import quote

import httpx

from .security import redact

SERVERCHAN_URL = "https://sctapi.ftqq.com/{sendkey}.send"


class NotificationError(Exception):
    pass


class Notifier(Protocol):
    def is_configured(self) -> bool: ...

    def send(self, title: str, content: str) -> None: ...

    def close(self) -> None: ...


class ServerChanNotifier:
    def __init__(
        self,
        sendkey_provider: Callable[[], str | None],
        client: httpx.Client | None = None,
        timeout: float = 10.0,
    ):
        self._sendkey_provider = sendkey_provider
        self._owns_client = client is None
        self._client = client if client is not None else httpx.Client(timeout=timeout)

    def is_configured(self) -> bool:
        try:
            sendkey = self._sendkey_provider()
        except Exception:
            return False
        return bool(str(sendkey).strip()) if sendkey is not None else False

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def send(self, title: str, content: str) -> None:
        try:
            sendkey = self._sendkey_provider()
        except Exception:
            raise NotificationError("无法读取 Server酱配置") from None
        sendkey_text = str(sendkey).strip() if sendkey is not None else ""
        if not sendkey_text:
            raise NotificationError("Server酱 SendKey 未配置")

        def safe(value: object, limit: int) -> str:
            return redact(str(value)).replace(sendkey_text, "[REDACTED]")[:limit]

        url = SERVERCHAN_URL.format(sendkey=quote(sendkey_text, safe=""))
        payload = {
            "title": " ".join(str(title).splitlines()).strip()[:120] or "下一节提醒",
            "desp": content,
        }
        last_error = "Server酱发送失败"
        for attempt in range(2):
            try:
                response = self._client.post(url, data=payload)
            except httpx.HTTPError as exc:
                detail = safe(exc, 160) or type(exc).__name__
                last_error = (
                    "无法连接 Server酱（sctapi.ftqq.com）："
                    f"{detail}。请检查网络，或在代理中将 ftqq.com 设为直连"
                )
                if attempt == 0:
                    continue
                break

            try:
                body = response.json()
            except ValueError:
                body = None

            code = body.get("code") if isinstance(body, dict) else None
            if response.status_code == 200 and str(code) == "0":
                return

            detail = f"Server酱返回异常（HTTP {response.status_code}"
            if code is not None and str(code).strip():
                detail += f"，code {safe(code, 40)}"
            message = ""
            if isinstance(body, dict):
                message = body.get("message") or body.get("msg") or ""
                data = body.get("data")
                if not message and isinstance(data, dict):
                    message = data.get("error") or data.get("message") or ""
            if message:
                detail += f"：{safe(message, 80)}"
            if not isinstance(body, dict):
                detail += "，响应格式错误"
            last_error = detail + "）"

            if response.status_code < 500:
                raise NotificationError(last_error)
            if attempt == 0:
                continue
            break
        raise NotificationError(last_error)
