import logging
import re
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Protocol

import keyring
from keyring.errors import PasswordDeleteError

SERVICE_NAME = "next-class"

_URL_QUERY = re.compile(r"(?i)(https?://[^\s?#]+)\?[^\s#]*")
_URL_FRAGMENT = re.compile(r"(?i)(https?://[^\s#]+)#[^\s]*")
_URL_USERINFO = re.compile(r"(?i)(https?://)[^/\s]+@")
_COOKIE = re.compile(r"(?i)(cookie\s*:\s*)[^\n]+")
_AUTH = re.compile(r"(?i)(authorization\s*:\s*)[^\n]+")
_SECRET_KEYS = (
    r"school_password|school_username|pushplus_token|github_token|snapshot_key|"
    r"access_token|refresh_token|auth_token|client_secret|api_key|"
    r"x-api-key|api-key|x-auth-token|auth-token|access-token|refresh-token|client-secret|"
    r"proxy-authorization|set-cookie|session_id|sessionid|"
    r"password|passwd|authorization|cookie|session|username|token|secret|key"
)
_QUOTED_VALUE = r"\"(?:\\.|[^\"\\\n])*\"|'(?:\\.|[^'\\\n])*'"
_SECRET_PAIR = re.compile(
    rf"(?i)(?P<prefix>(?P<q>[\"']?)(?:{_SECRET_KEYS})(?P=q)\s*[:=]\s*)"
    rf"(?P<value>(?:{_QUOTED_VALUE})|[^\n,;&}}\]]*)"
)
_SECRET_TUPLE = re.compile(
    rf"(?i)(?P<prefix>(?P<q>[\"'])(?:{_SECRET_KEYS})(?P=q)\s*,\s*)"
    rf"(?P<value>(?:{_QUOTED_VALUE}))"
)


def _quoted_redaction(value: str) -> str:
    quote = value[0]
    return f"{quote}[REDACTED]{quote}"


def _redact_pair(match: re.Match[str]) -> str:
    value = match.group("value")
    replacement = _quoted_redaction(value) if value[:1] in {"'", '"'} else "[REDACTED]"
    return match.group("prefix") + replacement


def _redact_tuple(match: re.Match[str]) -> str:
    return match.group("prefix") + _quoted_redaction(match.group("value"))


def redact(text: str) -> str:
    text = _URL_QUERY.sub(r"\1?[REDACTED]", str(text))
    text = _URL_FRAGMENT.sub(r"\1#[REDACTED]", text)
    text = _URL_USERINFO.sub(r"\1[REDACTED]@", text)
    text = _COOKIE.sub(r"\1[REDACTED]", text)
    text = _AUTH.sub(r"\1[REDACTED]", text)
    text = _SECRET_TUPLE.sub(_redact_tuple, text)
    return _SECRET_PAIR.sub(_redact_pair, text)


def safe_message(exc: BaseException, limit: int = 300) -> str:
    message = redact(str(exc)).strip() or exc.__class__.__name__
    return message[:limit]


class CredentialError(Exception):
    pass


class CredentialBackend(Protocol):
    def get_password(self, service: str, username: str) -> str | None: ...
    def set_password(self, service: str, username: str, password: str) -> None: ...
    def delete_password(self, service: str, username: str) -> None: ...


class CredentialStore:
    def __init__(self, backend: CredentialBackend | None = None, service: str = SERVICE_NAME):
        self._backend = backend if backend is not None else keyring
        self._service = service

    def get(self, key: str) -> str | None:
        try:
            return self._backend.get_password(self._service, key)
        except Exception as exc:
            raise CredentialError("Windows 凭据管理器不可用，无法读取敏感配置") from exc

    def set(self, key: str, value: str) -> None:
        try:
            self._backend.set_password(self._service, key, value)
        except Exception as exc:
            raise CredentialError("Windows 凭据管理器不可用，敏感配置未保存") from exc

    def delete(self, key: str) -> None:
        try:
            self._backend.delete_password(self._service, key)
        except PasswordDeleteError:
            return
        except Exception as exc:
            raise CredentialError("Windows 凭据管理器不可用，无法删除敏感配置") from exc

    def has(self, key: str) -> bool:
        return bool(self.get(key))


class _SafeFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return redact(super().format(record))


def setup_logging(data_dir: Path) -> logging.Logger:
    data_dir = Path(data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("next_class")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    if not logger.handlers:
        handler = RotatingFileHandler(
            data_dir / "app.log",
            maxBytes=1_000_000,
            backupCount=3,
            encoding="utf-8",
        )
        handler.setFormatter(_SafeFormatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
        logger.addHandler(handler)
    return logger
