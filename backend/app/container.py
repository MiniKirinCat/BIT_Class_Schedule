from dataclasses import dataclass

from .config import AppConfig
from .db import Database, SettingsRepo, SnapshotRepo
from .notifier import PushPlusNotifier
from .scheduler import SyncScheduler
from .school_gateway import BitSchoolGateway
from .security import CredentialStore
from .sync_service import CloudPublisher, SyncService


@dataclass
class Container:
    config: AppConfig
    db: Database
    settings: SettingsRepo
    snapshots: SnapshotRepo
    credentials: CredentialStore
    gateway: BitSchoolGateway
    notifier: PushPlusNotifier
    publisher: CloudPublisher | None
    sync_service: SyncService
    scheduler: SyncScheduler


def build_container(
    config: AppConfig,
    *,
    credentials=None,
    gateway=None,
    notifier=None,
    publisher: CloudPublisher | None = None,
) -> Container:
    db = Database(config.db_path)
    settings = SettingsRepo(db)
    snapshots = SnapshotRepo(db)
    credentials = credentials if credentials is not None else CredentialStore()
    gateway = (
        gateway
        if gateway is not None
        else BitSchoolGateway(calendar_days=config.calendar_days)
    )
    notifier = (
        notifier
        if notifier is not None
        else PushPlusNotifier(lambda: credentials.get("pushplus_token"))
    )
    sync_service = SyncService(
        config=config,
        settings=settings,
        snapshots=snapshots,
        credentials=credentials,
        gateway=gateway,
        notifier=notifier,
        publisher=publisher,
    )
    scheduler = SyncScheduler(sync_service, config)
    return Container(
        config=config,
        db=db,
        settings=settings,
        snapshots=snapshots,
        credentials=credentials,
        gateway=gateway,
        notifier=notifier,
        publisher=publisher,
        sync_service=sync_service,
        scheduler=scheduler,
    )
