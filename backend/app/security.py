import logging
import re
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Protocol

import keyring
from keyring.errors import KeyringError

SERVICE_NAME = "next-class"

_URL_QUERY = re.compile(r"(https?://[^\s?#]+)\?[^\s#]*")
_URL_FRAGMENT = re.compile(r"(https?://[^\s#]+)#[^\s]*")
_URL_USERINFO = re.compile(r"(https?://)[^/\s@]+@")
_COOKIE = re.compile(r"(?i)(cookie\s*:\s*)[^\n]+")
_AUTH = re.compile(r"(?i)(authorization\s*:\s*)[^\n]+")
_SECRET_PAIR = re.compile(
    r"(?i)\b(password|passwd|token|secret|key|school_password|school_username|pushplus_token|github_token|snapshot_key)"
    r"\s*[=:]\s*([^\s,;&]+)"
)
_JSON_SECRET = re.compile(
    r'(?i)("(?:password|passwd|token|secret|key|school_password|school_username|pushplus_token|github_token|snapshot_key)"'
    r'\s*:\s*")([^"]*)(")'
)


def redact(text: str) -> str:
    text = _URL_QUERY.sub(r"\1?[REDACTED]", str(text))
    text = _URL_FRAGMENT.sub(r"\1#[REDACTED]", text)
    text = _URL_USERINFO.sub(r"\1[REDACTED]@", text)
    text = _COOKIE.sub(r"\1[REDACTED]", text)
    text = _AUTH.sub(r"\1[REDACTED]", text)
    text = _JSON_SECRET.sub(r"\1[REDACTED]\3", text)
    return _SECRET_PAIR.sub(r"\1=[REDACTED]", text)


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
        except KeyringError as exc:
            raise CredentialError("Windows 凭据管理器不可用，无法读取敏感配置") from exc

    def set(self, key: str, value: str) -> None:
        try:
            self._backend.set_password(self._service, key, value)
        except KeyringError as exc:
            raise CredentialError("Windows 凭据管理器不可用，敏感配置未保存") from exc

    def delete(self, key: str) -> None:
        try:
            self._backend.delete_password(self._service, key)
        except KeyringError as exc:
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
