import asyncio
import hashlib
import json
import logging
import math
import threading
from datetime import datetime, timedelta
from typing import Callable, Protocol
from zoneinfo import ZoneInfo

from .change_detector import (
    change_set_hash,
    detect_changes,
    empty_confirmed_event,
    format_change_message,
)
from .cloud import build_archive_payload, changes_payload
from .config import AppConfig
from .db import SettingsRepo, SnapshotRepo
from .models import ChangeEvent, CourseSession, FetchedSchedule, SyncResult
from .normalizer import NormalizationError, normalize
from .school_gateway import SchoolError
from .security import CredentialError, redact, safe_message

TZ = ZoneInfo("Asia/Shanghai")
BACKOFF_HOURS = (1, 3, 6, 12, 24)


class SyncBusyError(Exception):
    pass


class CloudPublisher(Protocol):
    def is_configured(self) -> bool: ...

    def publish(self, payload: dict) -> None: ...


def _iso(moment: datetime) -> str:
    return moment.isoformat(timespec="seconds")


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=TZ)


def _snapshot_hash(term: str, first_day: str, sessions: list[CourseSession]) -> str:
    raw = json.dumps(
        {
            "term": term,
            "first_day": first_day,
            "sessions": [session.to_dict() for session in sessions],
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class SyncService:
    def __init__(
        self,
        *,
        config: AppConfig,
        settings: SettingsRepo,
        snapshots: SnapshotRepo,
        credentials,
        gateway,
        notifier,
        publisher: CloudPublisher | None = None,
        now: Callable[[], datetime] | None = None,
        logger: logging.Logger | None = None,
    ):
        self._config = config
        self._settings = settings
        self._snapshots = snapshots
        self._credentials = credentials
        self._gateway = gateway
        self._notifier = notifier
        self._publisher = publisher
        self._now = now or (lambda: datetime.now(TZ))
        self._logger = logger or logging.getLogger("next_class.sync")
        self._lock = asyncio.Lock()
        self._worker_lock = threading.Lock()

    @property
    def lock(self) -> asyncio.Lock:
        return self._lock

    @property
    def is_busy(self) -> bool:
        return self._lock.locked() or self._worker_lock.locked()

    def is_configured(self) -> bool:
        try:
            return bool(
                self._credentials.get("school_username")
                and self._credentials.get("school_password")
            )
        except CredentialError:
            return False

    def manual_cooldown_remaining(self, now: datetime | None = None) -> int:
        current = now or self._now()
        last_attempt = _parse_iso(self._settings.get("last_attempt_sync_at"))
        if last_attempt is None:
            return 0
        elapsed = (current - last_attempt).total_seconds()
        remaining = self._config.manual_cooldown_seconds - elapsed
        return max(0, int(math.ceil(remaining)))

    def next_due_at(self, now: datetime | None = None) -> datetime:
        current = now or self._now()
        failure_streak = self._settings.get_int("failure_streak", 0)
        if failure_streak > 0:
            last_attempt = _parse_iso(self._settings.get("last_attempt_sync_at"))
            if last_attempt is None:
                return current
            hours = BACKOFF_HOURS[min(failure_streak - 1, len(BACKOFF_HOURS) - 1)]
            return last_attempt + timedelta(hours=hours)

        last_success = _parse_iso(self._settings.get("last_success_sync_at"))
        if last_success is None:
            return current
        interval = self._settings.get_int("sync_interval_days", 1)
        return last_success + timedelta(days=interval)

    def is_due(self, now: datetime | None = None) -> bool:
        current = now or self._now()
        return current >= self.next_due_at(current)

    async def sync(
        self,
        trigger: str = "manual",
        *,
        username: str | None = None,
        password: str | None = None,
        now: datetime | None = None,
    ) -> SyncResult:
        if self._lock.locked():
            raise SyncBusyError("同步正在进行中")
        async with self._lock:
            moment = now or self._now()
            return await asyncio.to_thread(
                self._sync_blocking, trigger, moment, username, password
            )

    def _sync_blocking(
        self,
        trigger: str,
        moment: datetime,
        username: str | None,
        password: str | None,
    ) -> SyncResult:
        if not self._worker_lock.acquire(blocking=False):
            raise SyncBusyError("同步正在进行中")
        try:
            started = _iso(moment)
            self._settings.set("last_attempt_sync_at", started)
            run_id = self._snapshots.record_sync_run(
                trigger=trigger,
                started_at=started,
                finished_at=None,
                status="running",
            )

            try:
                try:
                    username = username or self._credentials.get("school_username")
                    password = password or self._credentials.get("school_password")
                except CredentialError as exc:
                    return self._fail(run_id, "KEYRING_ERROR", str(exc), moment)
                if not username or not password:
                    return self._fail(
                        run_id, "NOT_CONFIGURED", "尚未配置教务账号", moment
                    )

                try:
                    fetched = self._gateway.fetch(username, password)
                    sessions = normalize(fetched.rows)
                except SchoolError as exc:
                    return self._fail(run_id, exc.code, exc.user_message, moment)
                except NormalizationError:
                    return self._fail(
                        run_id, "PARSE_ERROR", "课表解析失败，已保留上次快照", moment
                    )

                previous = self._snapshots.latest()
                if (
                    previous is not None
                    and previous.term == fetched.term
                    and not sessions
                    and previous.sessions
                ):
                    return self._handle_empty(run_id, fetched, moment)

                changes = detect_changes(
                    previous.sessions if previous else None,
                    sessions,
                    previous.term if previous else None,
                    fetched.term,
                    previous.first_day if previous else None,
                    fetched.first_day.isoformat(),
                    _iso(moment),
                )
                is_baseline = previous is None or previous.term != fetched.term
                return self._complete_success(
                    run_id=run_id,
                    fetched=fetched,
                    sessions=sessions,
                    changes=changes,
                    is_baseline=is_baseline,
                    moment=moment,
                )
            except Exception as exc:
                self._logger.error("sync failed: %s", safe_message(exc))
                return self._fail(
                    run_id, "UNEXPECTED_ERROR", "同步时发生未知错误，请稍后重试", moment
                )
        finally:
            self._worker_lock.release()

    def _handle_empty(
        self,
        run_id: int,
        fetched: FetchedSchedule,
        moment: datetime,
    ) -> SyncResult:
        empty_streak = self._settings.get_int("empty_streak", 0) + 1
        if empty_streak == 1:
            self._settings.set_int("empty_streak", 1)
            failure_streak = self._settings.get_int("failure_streak", 0) + 1
            self._settings.set_int("failure_streak", failure_streak)
            message = "教务系统返回空课表，已保留上次快照"
            self._settings.set("last_sync_error", message)
            self._settings.set("last_error_code", "EMPTY_RESULT")
            self._snapshots.finish_sync_run(
                run_id,
                finished_at=_iso(moment),
                status="anomaly",
                term=fetched.term,
                course_count=0,
                change_count=0,
                error_code="EMPTY_RESULT",
                error_message=message,
                cloud_publish_status="skipped",
            )
            if failure_streak == 1:
                self._send_notification(
                    "课表同步失败",
                    f"原因：{message}\n"
                    "如果下次仍为空，将按空课表更新；否则会继续保留旧课表。",
                )
            return SyncResult(
                status="anomaly",
                message=message,
                course_count=0,
                change_count=0,
                cloud_status="skipped",
                error_code="EMPTY_RESULT",
            )

        return self._complete_success(
            run_id=run_id,
            fetched=fetched,
            sessions=[],
            changes=[empty_confirmed_event()],
            is_baseline=True,
            moment=moment,
            message="课表连续两次为空，已按空课表更新",
        )

    def _complete_success(
        self,
        *,
        run_id: int,
        fetched: FetchedSchedule,
        sessions: list[CourseSession],
        changes: list[ChangeEvent],
        is_baseline: bool,
        moment: datetime,
        message: str = "",
    ) -> SyncResult:
        finished = _iso(moment)
        first_day = fetched.first_day.isoformat()
        snapshot_id = self._snapshots.save_snapshot(
            sync_run_id=run_id,
            term=fetched.term,
            fetched_at=finished,
            first_day=first_day,
            sessions=sessions,
            calendar=fetched.calendar,
            payload_hash=_snapshot_hash(fetched.term, first_day, sessions),
            is_baseline=is_baseline,
        )
        if changes:
            self._snapshots.insert_changes(
                sync_run_id=run_id,
                snapshot_id=snapshot_id,
                changes=changes,
                detected_at=finished,
            )

        self._settings.set("last_success_sync_at", finished)
        self._settings.set("last_term", fetched.term)
        self._settings.set("last_sync_error", "")
        self._settings.set("last_error_code", "")
        self._settings.set_int("failure_streak", 0)
        self._settings.set_int("empty_streak", 0)

        self._notify_changes(changes, sessions, fetched.term, snapshot_id, finished)
        cloud_status = self._publish(fetched.term, finished)

        self._snapshots.finish_sync_run(
            run_id,
            finished_at=finished,
            status="success",
            term=fetched.term,
            course_count=len(sessions),
            change_count=len(changes),
            cloud_publish_status=cloud_status,
        )
        return SyncResult(
            status="success",
            message=message,
            course_count=len(sessions),
            change_count=len(changes),
            cloud_status=cloud_status,
        )

    def _notify_changes(
        self,
        changes: list[ChangeEvent],
        sessions: list[CourseSession],
        term: str,
        snapshot_id: int,
        detected_at: str,
    ) -> None:
        if not changes:
            self._settings.set("last_notified_change_set_hash", "")
            return

        digest = change_set_hash(changes)
        if digest == self._settings.get("last_notified_change_set_hash"):
            return

        if any(change.type == "term_rollover" for change in changes):
            title = "新学期课表已同步"
            content = (
                f"已切换到新学期 {term}，共 {len(sessions)} 门课程。\n"
                + format_change_message(changes, detected_at)
            )
        else:
            title = f"课表变动 · {len(changes)} 处"
            content = format_change_message(changes, detected_at)

        if self._send_notification(title, content):
            self._settings.set("last_notified_change_set_hash", digest)
            self._snapshots.mark_changes_notified(snapshot_id, detected_at)
        else:
            self._settings.set("last_notified_change_set_hash", "")

    def _send_notification(self, title: str, content: str) -> bool:
        if not self._settings.get_bool("push_enabled", False):
            return False
        if not self._notifier.is_configured():
            return False
        try:
            self._notifier.send(title, content)
        except Exception as exc:
            message = safe_message(exc)
            self._settings.set("last_notification_error", message)
            self._logger.warning("notification failed: %s", message)
            return False
        self._settings.set("last_notification_error", "")
        return True

    def _publish(self, current_term: str, finished: str) -> str:
        if self._publisher is None:
            return "skipped"
        try:
            configured = self._publisher.is_configured()
        except Exception as exc:
            message = safe_message(exc)
            self._settings.set("last_cloud_error", message)
            self._logger.warning("cloud configuration check failed: %s", message)
            return "failed"
        if not configured:
            return "skipped"

        records = self._snapshots.latest_per_term()
        payload = build_archive_payload(
            app_version=self._config.app_version,
            synced_at=finished,
            sync_interval_days=self._settings.get_int("sync_interval_days", 1),
            current_term=current_term,
            records=records,
            changes_by_term={
                record.term: changes_payload(
                    self._snapshots.changes_for_term(record.term, limit=50)
                )
                for record in records
            },
        )

        try:
            self._publisher.publish(payload)
        except Exception as exc:
            streak = self._settings.get_int("cloud_failure_streak", 0) + 1
            self._settings.set_int("cloud_failure_streak", streak)
            self._settings.set("last_cloud_error", safe_message(exc))
            if streak == 2:
                self._send_notification(
                    "云端快照未更新",
                    "连续两次发布失败，本地课表已正常同步。"
                    "请检查 GitHub token 和 Gist 设置。",
                )
            return "failed"

        self._settings.set_int("cloud_failure_streak", 0)
        self._settings.set("last_cloud_publish_at", finished)
        self._settings.set("last_cloud_error", "")
        return "success"

    def _fail(
        self,
        run_id: int,
        code: str,
        message: str,
        moment: datetime,
    ) -> SyncResult:
        message = redact(message)[:300]
        failure_streak = self._settings.get_int("failure_streak", 0) + 1
        self._settings.set_int("failure_streak", failure_streak)
        self._settings.set("last_sync_error", message)
        self._settings.set("last_error_code", code)
        self._snapshots.finish_sync_run(
            run_id,
            finished_at=_iso(moment),
            status="failed",
            error_code=code,
            error_message=message,
        )
        if failure_streak == 1:
            self._send_notification(
                "课表同步失败",
                f"原因：{message}\n已保留上次课表；应用运行时会自动重试。",
            )
        return SyncResult(status="failed", message=message, error_code=code)
