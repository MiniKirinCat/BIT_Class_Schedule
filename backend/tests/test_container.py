from app.config import AppConfig
from app.container import build_container
from app.db import Database, SettingsRepo, SnapshotRepo
from app.notifier import PushPlusNotifier
from app.scheduler import SyncScheduler
from app.school_gateway import BitSchoolGateway
from app.security import CredentialStore


class FakeCredentials(dict):
    pass


class FalsyCredentials(dict):
    def __bool__(self):
        return False


class FakeGateway:
    def fetch(self, username, password):
        raise AssertionError("no network calls expected")


class FakeNotifier:
    def is_configured(self):
        return False

    def send(self, title, content):
        raise AssertionError("no notifications expected")


class RecordingNotifier(FakeNotifier):
    def __init__(self):
        self.close_calls = 0

    def close(self):
        self.close_calls += 1


class FakePublisher:
    def publish(self, payload):
        raise AssertionError("no publication expected")


def test_container_wires_dependencies(tmp_path):
    config = AppConfig(data_dir=tmp_path, scheduler_enabled=False)
    container = build_container(config, credentials=FakeCredentials())
    try:
        assert container.config is config
        assert container.db.path == tmp_path / "next_class.db"
        assert isinstance(container.db, Database)
        assert isinstance(container.settings, SettingsRepo)
        assert isinstance(container.snapshots, SnapshotRepo)
        assert container.sync_service._snapshots is container.snapshots
        assert container.sync_service._gateway is container.gateway
        assert container.scheduler._service is container.sync_service
    finally:
        container.close()


def test_container_builds_default_dependencies(tmp_path):
    config = AppConfig(data_dir=tmp_path, scheduler_enabled=False, calendar_days=7)
    container = build_container(config)
    try:
        assert isinstance(container.credentials, CredentialStore)
        assert isinstance(container.gateway, BitSchoolGateway)
        assert isinstance(container.notifier, PushPlusNotifier)
        assert isinstance(container.scheduler, SyncScheduler)
        assert container.sync_service._credentials is container.credentials
        assert container.sync_service._gateway is container.gateway
        assert container.sync_service._notifier is container.notifier
        assert container.gateway._calendar_days == 7
        assert container.publisher is None
        # The lifespan owns initialization; building must not touch the database.
        assert not container.db.path.exists()
    finally:
        container.close()


def test_container_passes_through_injected_dependencies(tmp_path):
    config = AppConfig(data_dir=tmp_path, scheduler_enabled=False)
    credentials = FakeCredentials(school_username="u", school_password="p")
    gateway = FakeGateway()
    notifier = FakeNotifier()
    publisher = FakePublisher()

    container = build_container(
        config,
        credentials=credentials,
        gateway=gateway,
        notifier=notifier,
        publisher=publisher,
    )

    try:
        assert container.credentials is credentials
        assert container.gateway is gateway
        assert container.notifier is notifier
        assert container.publisher is publisher
        assert container.sync_service._credentials is credentials
        assert container.sync_service._gateway is gateway
        assert container.sync_service._notifier is notifier
        assert container.sync_service._publisher is publisher
        assert container.owns_notifier is False
    finally:
        container.close()


def test_container_respects_falsy_but_valid_credentials(tmp_path):
    config = AppConfig(data_dir=tmp_path, scheduler_enabled=False)
    credentials = FalsyCredentials(pushplus_token="token-123")
    assert not credentials

    container = build_container(config, credentials=credentials)
    try:
        assert container.credentials is credentials
        assert container.sync_service._credentials is credentials
        # The default notifier reads its token from the injected credentials.
        assert container.notifier.is_configured() is True
    finally:
        container.close()


def test_container_close_closes_owned_notifier(tmp_path):
    config = AppConfig(data_dir=tmp_path, scheduler_enabled=False)
    container = build_container(config)
    assert container.owns_notifier is True

    client = container.notifier._client
    assert not client.is_closed

    container.close()
    assert client.is_closed

    # Repeated close is safe.
    container.close()
    assert client.is_closed


def test_container_close_leaves_injected_notifier_open(tmp_path):
    config = AppConfig(data_dir=tmp_path, scheduler_enabled=False)
    notifier = RecordingNotifier()
    container = build_container(config, notifier=notifier)

    assert container.owns_notifier is False
    container.close()
    container.close()
    assert notifier.close_calls == 0

