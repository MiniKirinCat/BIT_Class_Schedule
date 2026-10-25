import logging
from logging.handlers import RotatingFileHandler

import pytest
from keyring.errors import KeyringError

from app.security import (
    CredentialError,
    CredentialStore,
    redact,
    safe_message,
    setup_logging,
)


class FakeBackend:
    def __init__(self):
        self.values = {}
        self.fail = False

    def get_password(self, service, username):
        if self.fail:
            raise KeyringError("no backend")
        return self.values.get((service, username))

    def set_password(self, service, username, password):
        if self.fail:
            raise KeyringError("no backend")
        self.values[(service, username)] = password

    def delete_password(self, service, username):
        self.values.pop((service, username), None)


def test_redact_removes_queries_headers_and_secret_pairs():
    text = (
        "GET https://example.com/path?token=abc&x=1\n"
        "Cookie: SESSION=secret-cookie\n"
        "Authorization: Bearer secret-token\n"
        "password=hunter2 school_password=xyz"
    )
    cleaned = redact(text)

    for secret in ("abc", "secret-cookie", "secret-token", "hunter2", "xyz"):
        assert secret not in cleaned
    assert "https://example.com/path?[REDACTED]" in cleaned


def test_safe_message_truncates_after_redaction():
    message = safe_message(RuntimeError("token=abc " + "x" * 500))
    assert "abc" not in message
    assert len(message) <= 300


def test_credential_roundtrip():
    store = CredentialStore(backend=FakeBackend())
    store.set("school_password", "pw")
    assert store.get("school_password") == "pw"
    assert store.has("school_password") is True
    store.delete("school_password")
    assert store.get("school_password") is None


def test_credential_backend_failure_is_explicit():
    backend = FakeBackend()
    backend.fail = True
    store = CredentialStore(backend=backend)

    with pytest.raises(CredentialError):
        store.set("school_password", "pw")
    with pytest.raises(CredentialError):
        store.get("school_password")


def test_redact_sensitive_url_parts_authorization_and_json():
    text = (
        "https://example.com/path#snapshot_key=abc\n"
        "https://user:pass@example.com/path\n"
        "Authorization: Basic dXNlcjpwYXNz\n"
        '{"school_username": "20250001", "snapshot_key": "xyz", '
        '"nested": {"token": "tkn"}}'
    )
    cleaned = redact(text)

    for secret in ("abc", "pass@", "dXNlcjpwYXNz", "20250001", "xyz", "tkn"):
        assert secret not in cleaned
    assert "#[REDACTED]" in cleaned
    assert "[REDACTED]@example.com" in cleaned
    assert '"snapshot_key": "[REDACTED]"' in cleaned


def test_falsy_backend_is_not_replaced_by_keyring():
    class FalsyBackend(FakeBackend):
        def __bool__(self):
            return False

    backend = FalsyBackend()
    store = CredentialStore(backend=backend)
    store.set("school_password", "pw")
    assert store.get("school_password") == "pw"
    assert backend.values[("next-class", "school_password")] == "pw"


def test_setup_logging_redacts_and_configures_rotation(tmp_path):
    logger = logging.getLogger("next_class")
    old_handlers = list(logger.handlers)
    old_level = logger.level
    old_propagate = logger.propagate
    logger.handlers.clear()
    try:
        active = setup_logging(tmp_path)
        handler = active.handlers[0]
        assert isinstance(handler, RotatingFileHandler)
        assert handler.maxBytes == 1_000_000
        assert handler.backupCount == 3

        logging.getLogger("next_class.normalizer").warning("password=hunter2 token=abc")
        handler.flush()
        content = (tmp_path / "app.log").read_text(encoding="utf-8")
        assert "hunter2" not in content
        assert "abc" not in content
        assert "[REDACTED]" in content
    finally:
        for current in list(logger.handlers):
            logger.removeHandler(current)
            current.close()
        logger.handlers[:] = old_handlers
        logger.setLevel(old_level)
        logger.propagate = old_propagate
