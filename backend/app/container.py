from dataclasses import dataclass

from .cloud import CloudService, GistClient, SyncCloudPublisher
from .config import AppConfig
from .db import Database, SettingsRepo, SnapshotRepo
from .notifier import Notifier, ServerChanNotifier
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
    notifier: Notifier
    cloud: CloudService
    publisher: CloudPublisher | None
    sync_service: SyncService
    scheduler: SyncScheduler
    owns_notifier: bool = False

    def close(self) -> None:
        if self.owns_notifier:
            self.notifier.close()


def build_container(
    config: AppConfig,
    *,
    credentials=None,
    gateway=None,
    notifier=None,
    publisher: CloudPublisher | None = None,
    cloud_client: GistClient | None = None,
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
    owns_notifier = notifier is None
    notifier = (
        notifier
        if notifier is not None
        else ServerChanNotifier(lambda: credentials.get("serverchan_sendkey"))
    )
    cloud = CloudService(
        config=config,
        settings=settings,
        snapshots=snapshots,
        credentials=credentials,
        client=cloud_client,
    )
    active_publisher = (
        publisher if publisher is not None else SyncCloudPublisher(cloud)
    )
    sync_service = SyncService(
        config=config,
        settings=settings,
        snapshots=snapshots,
        credentials=credentials,
        gateway=gateway,
        notifier=notifier,
        publisher=active_publisher,
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
        cloud=cloud,
        publisher=active_publisher,
        sync_service=sync_service,
        scheduler=scheduler,
        owns_notifier=owns_notifier,
    )
