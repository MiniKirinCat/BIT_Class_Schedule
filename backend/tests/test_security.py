import logging
from logging.handlers import RotatingFileHandler

import pytest
from keyring.errors import KeyringError, PasswordDeleteError

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
        if self.fail:
            raise KeyringError("no backend")
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

    with pytest.raises(CredentialError, match="无法读取敏感配置"):
        store.get("school_password")
    with pytest.raises(CredentialError, match="敏感配置未保存"):
        store.set("school_password", "pw")
    with pytest.raises(CredentialError, match="无法删除敏感配置"):
        store.delete("school_password")


def test_non_keyring_backend_errors_are_wrapped():
    class BrokenBackend:
        def get_password(self, service, username):
            raise OSError("backend down")

        def set_password(self, service, username, password):
            raise OSError("backend down")

        def delete_password(self, service, username):
            raise OSError("backend down")

    store = CredentialStore(backend=BrokenBackend())
    with pytest.raises(CredentialError, match="无法读取敏感配置"):
        store.get("school_password")
    with pytest.raises(CredentialError, match="敏感配置未保存"):
        store.set("school_password", "pw")
    with pytest.raises(CredentialError, match="无法删除敏感配置"):
        store.delete("school_password")


def test_delete_missing_is_idempotent():
    class MissingDeleteBackend(FakeBackend):
        def delete_password(self, service, username):
            raise PasswordDeleteError("missing")

    store = CredentialStore(backend=MissingDeleteBackend())
    store.delete("school_password")


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


def test_redact_structured_headers_and_adversarial_values():
    text = (
        "{'password': 'secret-one', 'Authorization': 'Bearer secret-two', "
        "'Cookie': 'SESSION=secret-three'}\n"
        "[('Authorization', 'Bearer secret-four'), ('Cookie', 'SESSION=secret-five')]\n"
        '{"school_username": 20250001, "access_token": "secret-six", '
        '"client_secret": "secret-seven", "api_key": "secret-eight"}\n'
        '{"password": "ab\\"secret-nine"}'
    )
    cleaned = redact(text)

    for secret in (
        "secret-one",
        "secret-two",
        "secret-three",
        "secret-four",
        "secret-five",
        "20250001",
        "secret-six",
        "secret-seven",
        "secret-eight",
        "secret-nine",
    ):
        assert secret not in cleaned
    assert "[REDACTED]" in cleaned


def test_redact_uppercase_urls_and_userinfo():
    cleaned = redact(
        "HTTPS://user:secret-pass@example.com/path?token=secret-query#snapshot_key=secret-frag"
    )
    for secret in ("secret-pass", "secret-query", "secret-frag"):
        assert secret not in cleaned
    assert "[REDACTED]" in cleaned


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
        assert active.name == "next_class"
        assert active.level == logging.INFO
        assert active.propagate is False
        assert len(active.handlers) == 1
        assert handler.encoding == "utf-8"
        assert isinstance(handler, RotatingFileHandler)
        assert handler.maxBytes == 1_000_000
        assert handler.backupCount == 3

        again = setup_logging(tmp_path)
        assert again is active
        assert len(again.handlers) == 1

        logging.getLogger("next_class.normalizer").warning("password=hunter2 token=abc")
        handler.flush()
        content = (tmp_path / "app.log").read_text(encoding="utf-8")
        assert "hunter2" not in content
        assert "abc" not in content
        assert "[REDACTED]" in content

        try:
            raise RuntimeError("token=secret-trace")
        except RuntimeError:
            logging.getLogger("next_class.normalizer").exception("failed")
        handler.flush()
        content = (tmp_path / "app.log").read_text(encoding="utf-8")
        assert "secret-trace" not in content
    finally:
        for current in list(logger.handlers):
            logger.removeHandler(current)
            current.close()
        logger.handlers[:] = old_handlers
        logger.setLevel(old_level)
        logger.propagate = old_propagate
