import asyncio
import logging
import threading
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.config import AppConfig
from app.db import Database, SettingsRepo, SnapshotRepo
from app.models import CalendarEntry, FetchedSchedule
from app.notifier import NotificationError
from app.school_gateway import SchoolError
from app.sync_service import SyncBusyError, SyncService

TZ = ZoneInfo("Asia/Shanghai")
NOW = datetime(2026, 10, 26, 9, 0, tzinfo=TZ)

ROW = {
    "KCH": "MATH101",
    "KCM": "高等数学",
    "SKJS": "李老师",
    "JASMC": "A101",
    "YPSJDD": "周一第1-2节{第1-4周}",
    "SKZC": "111100",
    "SKXQ": 1,
    "KSJC": 1,
    "JSJC": 2,
    "XXXQMC": "良乡",
}


def fetched(rows, term="2025-2026-1", first_day=date(2025, 9, 1)):
    return FetchedSchedule(
        term=term,
        first_day=first_day,
        rows=rows,
        calendar=[CalendarEntry(date="2026-10-26", week=9, weekday=1)],
    )


class FakeCredentials(dict):
    pass


class FakeGateway:
    def __init__(self, raw=None, error=None):
        self.raw = raw
        self.error = error
        self.calls = []

    def fetch(self, username, password):
        self.calls.append((username, password))
        if self.error:
            raise self.error
        return self.raw


class BlockingGateway:
    def __init__(self, raw, started, release):
        self.raw = raw
        self.started = started
        self.release = release

    def fetch(self, username, password):
        self.started.set()
        if not self.release.wait(5):
            raise RuntimeError("test timeout")
        return self.raw


class FakeNotifier:
    def __init__(self, configured=True):
        self.messages = []
        self.configured = configured
        self.fail = False

    def is_configured(self):
        return self.configured

    def send(self, title, content):
        if self.fail:
            raise NotificationError("push down")
        self.messages.append((title, content))


class FakePublisher:
    def __init__(self):
        self.payloads = []
        self.fail_times = 0

    def is_configured(self):
        return True

    def publish(self, payload):
        if self.fail_times > 0:
            self.fail_times -= 1
            raise RuntimeError("gist down")
        self.payloads.append(payload)


def make_service(tmp_path, gateway, *, publisher=None, notifier=None, credentials=None):
    db = Database(tmp_path / "test.db")
    db.initialize()
    settings = SettingsRepo(db)
    settings.set_bool("push_enabled", True)
    snapshots = SnapshotRepo(db)
    config = AppConfig(
        data_dir=tmp_path,
        frontend_dir=tmp_path / "dist",
        scheduler_enabled=False,
    )
    notifier = notifier if notifier is not None else FakeNotifier()
    service = SyncService(
        config=config,
        settings=settings,
        snapshots=snapshots,
        credentials=credentials
        if credentials is not None
        else FakeCredentials(school_username="20250001", school_password="pw"),
        gateway=gateway,
        notifier=notifier,
        publisher=publisher,
        now=lambda: NOW,
    )
    return service, settings, snapshots, notifier


def run(service, moment=NOW):
    return asyncio.run(service.sync("manual", now=moment))


def test_baseline_saves_snapshot_without_notification(tmp_path):
    service, settings, snapshots, notifier = make_service(
        tmp_path, FakeGateway(fetched([ROW]))
    )

    result = run(service)

    assert result.status == "success"
    assert result.course_count == 1
    assert result.change_count == 0
    assert result.cloud_status == "skipped"
    latest = snapshots.latest()
    assert latest is not None
    assert latest.sessions[0].room == "A101"
    assert latest.is_baseline is True
    assert latest.calendar[0].week == 9
    assert notifier.messages == []
    assert settings.get("last_success_sync_at") == NOW.isoformat(timespec="seconds")
    assert settings.get("last_term") == "2025-2026-1"


def test_room_change_notifies_once_and_clears_hash_after_no_change(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, settings, _, notifier = make_service(tmp_path, gateway)
    run(service)

    gateway.raw = fetched([{**ROW, "JASMC": "B202"}])
    result = run(service)
    assert result.change_count == 1
    assert len(notifier.messages) == 1
    title, content = notifier.messages[0]
    assert title == "课表变动 · 1 处"
    assert "A101" in content and "B202" in content
    assert settings.get("last_notified_change_set_hash")

    run(service)
    assert len(notifier.messages) == 1
    assert not settings.get("last_notified_change_set_hash")

    gateway.raw = fetched([ROW])
    run(service)
    assert len(notifier.messages) == 2
    assert notifier.messages[1][0] == "课表变动 · 1 处"


def test_first_empty_is_anomaly_and_second_is_accepted(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, settings, snapshots, notifier = make_service(tmp_path, gateway)
    run(service)
    baseline_id = snapshots.latest().id

    gateway.raw = fetched([])
    first = run(service)
    assert first.status == "anomaly"
    assert first.error_code == "EMPTY_RESULT"
    assert first.course_count == 0
    assert first.change_count == 0
    assert first.cloud_status == "skipped"
    assert snapshots.latest().id == baseline_id
    assert snapshots.latest().sessions[0].room == "A101"
    assert notifier.messages[-1][0] == "课表同步失败"
    assert "如果下次仍为空，将按空课表更新；否则会继续保留旧课表。" in notifier.messages[-1][1]
    assert settings.get("last_error_code") == "EMPTY_RESULT"
    assert settings.get("last_sync_error")
    assert settings.get_int("empty_streak", 0) == 1
    assert settings.get_int("failure_streak", 0) == 1
    run_row = snapshots.latest_sync_run()
    assert run_row["status"] == "anomaly"
    assert run_row["cloud_publish_status"] == "skipped"

    second = run(service)
    assert second.status == "success"
    assert second.message == "课表连续两次为空，已按空课表更新"
    latest = snapshots.latest()
    assert latest.sessions == []
    assert latest.is_baseline is True
    assert notifier.messages[-1][0] == "课表变动 · 1 处"
    assert "连续两次为空" in notifier.messages[-1][1]
    assert settings.get_int("empty_streak", 0) == 0
    assert settings.get_int("failure_streak", 0) == 0


def test_term_rollover_is_one_baseline_notice(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, _, snapshots, notifier = make_service(tmp_path, gateway)
    run(service)

    gateway.raw = fetched(
        [{**ROW, "KCH": "PHY101", "KCM": "大学物理"}],
        term="2026-2027-1",
        first_day=date(2026, 9, 7),
    )
    result = run(service)

    assert result.status == "success"
    assert result.change_count == 1
    assert snapshots.latest().term == "2026-2027-1"
    assert snapshots.latest().is_baseline is True
    assert [message[0] for message in notifier.messages] == ["新学期课表已同步"]
    content = notifier.messages[0][1]
    assert "2026-2027-1" in content
    assert "共 1 门课程" in content


def test_term_rollover_keeps_previous_term_in_the_published_archive(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    publisher = FakePublisher()
    service, _, _, _ = make_service(tmp_path, gateway, publisher=publisher)
    run(service)

    gateway.raw = fetched(
        [{**ROW, "KCH": "PHY101", "KCM": "大学物理"}],
        term="2026-2027-1",
        first_day=date(2026, 9, 7),
    )
    run(service)

    payload = publisher.payloads[-1]
    assert payload["current_term"] == "2026-2027-1"
    assert [term["term"] for term in payload["terms"]] == [
        "2026-2027-1",
        "2025-2026-1",
    ]
    assert payload["terms"][1]["courses"][0]["course_name"] == "高等数学"


def test_term_rollover_to_empty_schedule_is_baseline_not_anomaly(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, settings, snapshots, notifier = make_service(tmp_path, gateway)
    run(service)

    gateway.raw = fetched([], term="2026-2027-1", first_day=date(2026, 9, 7))
    result = run(service)

    assert result.status == "success"
    assert result.change_count == 1
    assert result.error_code is None
    latest = snapshots.latest()
    assert latest.term == "2026-2027-1"
    assert latest.sessions == []
    assert latest.is_baseline is True
    titles = [message[0] for message in notifier.messages]
    assert titles == ["新学期课表已同步"]
    assert "共 0 门课程" in notifier.messages[-1][1]
    assert "课表同步失败" not in titles
    assert settings.get("last_error_code") == ""


def test_failure_preserves_snapshot_and_notifies_only_first_of_streak(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, settings, snapshots, notifier = make_service(tmp_path, gateway)
    run(service)
    before = snapshots.latest().id

    gateway.error = SchoolError("LOGIN_FAILED", "登录失败")
    assert run(service).status == "failed"
    assert run(service).status == "failed"
    assert snapshots.latest().id == before
    failure_messages = [m for m in notifier.messages if m[0] == "课表同步失败"]
    assert len(failure_messages) == 1
    assert "已保留上次课表；应用运行时会自动重试。" in failure_messages[0][1]
    assert settings.get_int("failure_streak", 0) == 2
    assert settings.get("last_error_code") == "LOGIN_FAILED"

    gateway.error = None
    assert run(service).status == "success"
    assert settings.get_int("failure_streak", 0) == 0
    assert not settings.get("last_error_code")


def test_cloud_failure_does_not_block_local_snapshot_and_alerts_on_second(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    publisher = FakePublisher()
    publisher.fail_times = 2
    service, settings, snapshots, notifier = make_service(
        tmp_path, gateway, publisher=publisher
    )

    assert run(service).cloud_status == "failed"
    assert snapshots.latest() is not None
    assert settings.get_int("cloud_failure_streak", 0) == 1
    assert settings.get("last_cloud_error")

    assert run(service).cloud_status == "failed"
    assert notifier.messages[-1][0] == "云端快照未更新"
    assert "连续两次发布失败" in notifier.messages[-1][1]
    assert settings.get_int("cloud_failure_streak", 0) == 2


def test_notification_failure_does_not_fail_sync(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, settings, snapshots, notifier = make_service(tmp_path, gateway)
    run(service)
    notifier.fail = True
    gateway.raw = fetched([{**ROW, "JASMC": "B202"}])

    result = run(service)

    assert result.status == "success"
    assert snapshots.latest().sessions[0].room == "B202"
    assert settings.get("last_notification_error")
    assert not settings.get("last_notified_change_set_hash")
    assert snapshots.changes_for_term("2025-2026-1")[0]["notified_at"] is None


def test_failed_notification_clears_stale_hash_so_repeated_change_notifies(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, settings, _, notifier = make_service(tmp_path, gateway)

    run(service)  # baseline A
    gateway.raw = fetched([{**ROW, "JASMC": "B202"}])
    run(service)  # B, notified successfully
    assert len(notifier.messages) == 1

    notifier.fail = True
    gateway.raw = fetched([ROW])
    result = run(service)  # back to A, notification fails
    assert result.status == "success"
    assert len(notifier.messages) == 1
    assert not settings.get("last_notified_change_set_hash")

    notifier.fail = False
    gateway.raw = fetched([{**ROW, "JASMC": "B202"}])
    run(service)  # B again, must notify because B -> A was never delivered

    assert len(notifier.messages) == 2
    title, content = notifier.messages[-1]
    assert title == "课表变动 · 1 处"
    assert "A101" in content and "B202" in content


def test_due_time_and_manual_cooldown(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, settings, _, _ = make_service(tmp_path, gateway)
    run(service)

    assert service.next_due_at(NOW) == NOW + timedelta(days=1)
    assert service.is_due(NOW + timedelta(days=1)) is True
    assert service.is_due(NOW + timedelta(hours=23)) is False
    assert service.manual_cooldown_remaining(NOW) == 300
    assert service.manual_cooldown_remaining(NOW + timedelta(seconds=299)) == 1
    assert service.manual_cooldown_remaining(NOW + timedelta(seconds=301)) == 0

    settings.set_int("failure_streak", 1)
    assert service.next_due_at(NOW) == NOW + timedelta(hours=1)


def test_backoff_escalates_and_caps(tmp_path):
    service, settings, _, _ = make_service(tmp_path, FakeGateway(fetched([ROW])))
    run(service)
    assert settings.get("last_attempt_sync_at") == NOW.isoformat(timespec="seconds")

    for streak, hours in ((2, 3), (3, 6), (5, 24), (6, 24)):
        settings.set_int("failure_streak", streak)
        assert service.next_due_at(NOW) == NOW + timedelta(hours=hours)


def test_sync_returns_busy_when_lock_is_held(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, _, _, _ = make_service(tmp_path, gateway)

    async def scenario():
        async with service.lock:
            with pytest.raises(SyncBusyError):
                await service.sync("manual", now=NOW)

    asyncio.run(scenario())


def test_cancelled_sync_keeps_worker_busy_until_thread_finishes(tmp_path):
    started = threading.Event()
    release = threading.Event()
    gateway = BlockingGateway(fetched([ROW]), started, release)
    service, _, _, _ = make_service(tmp_path, gateway)

    async def scenario():
        task = asyncio.create_task(service.sync("manual", now=NOW))
        assert await asyncio.to_thread(started.wait, 2)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

        with pytest.raises(SyncBusyError):
            await service.sync("manual", now=NOW)

        release.set()
        for _ in range(200):
            if not service._worker_lock.locked():
                break
            await asyncio.sleep(0.01)
        assert not service._worker_lock.locked()

    asyncio.run(scenario())


def test_finalization_exception_marks_run_failed(tmp_path, monkeypatch, caplog):
    gateway = FakeGateway(fetched([ROW]))
    service, settings, snapshots, notifier = make_service(tmp_path, gateway)

    def boom():
        raise RuntimeError("db boom")

    monkeypatch.setattr(snapshots, "latest", boom)

    with caplog.at_level(logging.ERROR, logger="next_class.sync"):
        result = run(service)

    assert result.status == "failed"
    assert result.error_code == "UNEXPECTED_ERROR"
    assert result.message == "同步时发生未知错误，请稍后重试"
    assert "db boom" not in result.message
    run_row = snapshots.latest_sync_run()
    assert run_row["status"] == "failed"
    assert run_row["error_code"] == "UNEXPECTED_ERROR"
    assert run_row["error_message"] == "同步时发生未知错误，请稍后重试"
    with snapshots.db.connect() as conn:
        running = conn.execute(
            "SELECT COUNT(*) AS total FROM sync_runs WHERE status='running'"
        ).fetchone()["total"]
    assert running == 0
    assert "sync failed" in caplog.text
    assert "Traceback" not in caplog.text
    assert settings.get("last_error_code") == "UNEXPECTED_ERROR"
    assert notifier.messages[0][0] == "课表同步失败"


def test_not_configured_fails_without_calling_gateway(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, settings, snapshots, notifier = make_service(
        tmp_path, gateway, credentials=FakeCredentials()
    )

    result = run(service)

    assert result.status == "failed"
    assert result.error_code == "NOT_CONFIGURED"
    assert gateway.calls == []
    assert snapshots.latest_sync_run()["status"] == "failed"
    assert notifier.messages[0][0] == "课表同步失败"
    assert "尚未配置教务账号" in notifier.messages[0][1]
    assert settings.get("last_error_code") == "NOT_CONFIGURED"


def test_term_rollover_resets_failure_streak(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, settings, _, _ = make_service(tmp_path, gateway)
    run(service)

    settings.set_int("failure_streak", 3)
    settings.set_int("empty_streak", 1)
    gateway.raw = fetched(
        [{**ROW, "KCH": "PHY101", "KCM": "大学物理"}],
        term="2026-2027-1",
        first_day=date(2026, 9, 7),
    )

    assert run(service).status == "success"
    assert settings.get_int("failure_streak", 0) == 0
    assert settings.get_int("empty_streak", 0) == 0
    assert service.next_due_at(NOW) == NOW + timedelta(days=1)


def test_empty_anomaly_with_existing_failure_streak_does_not_notify(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, settings, snapshots, notifier = make_service(tmp_path, gateway)
    run(service)
    settings.set_int("failure_streak", 1)

    gateway.raw = fetched([])
    result = run(service)

    assert result.status == "anomaly"
    assert settings.get_int("failure_streak", 0) == 2
    assert settings.get("last_error_code") == "EMPTY_RESULT"
    assert snapshots.latest().sessions[0].room == "A101"
    assert notifier.messages == []


def test_publisher_payload_shape_includes_changes_before_and_after(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    publisher = FakePublisher()
    service, _, _, _ = make_service(tmp_path, gateway, publisher=publisher)
    run(service)

    payload = publisher.payloads[0]
    assert payload["schema_version"] == 2
    assert payload["app_version"] == "1.4.0"
    assert payload["synced_at"] == NOW.isoformat(timespec="seconds")
    assert payload["sync_interval_days"] == 1
    assert payload["current_term"] == "2025-2026-1"
    assert len(payload["terms"]) == 1
    term = payload["terms"][0]
    assert term["term"] == "2025-2026-1"
    assert term["first_day"] == "2025-09-01"
    assert term["courses"][0]["room"] == "A101"
    assert term["calendar"][0] == {"date": "2026-10-26", "week": 9, "weekday": 1}
    assert len(payload["period_times"]) == 13
    assert payload["period_times"][0] == {"index": 1, "start": "08:00", "end": "08:45"}
    assert term["changes"] == []

    gateway.raw = fetched([{**ROW, "JASMC": "B202"}])
    run(service)

    change = publisher.payloads[1]["terms"][0]["changes"][0]
    assert {
        "id",
        "detected_at",
        "type",
        "course_code",
        "course_name",
        "summary",
        "before",
        "after",
    } <= set(change)
    assert change["type"] == "modified"
    assert change["before"]["room"] == "A101"
    assert change["after"]["room"] == "B202"


def test_publisher_failure_keeps_local_snapshot_and_does_not_raise(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    publisher = FakePublisher()
    publisher.fail_times = 1
    service, settings, snapshots, _ = make_service(tmp_path, gateway, publisher=publisher)

    result = run(service)

    assert result.status == "success"
    assert result.cloud_status == "failed"
    assert snapshots.latest().sessions[0].room == "A101"
    assert settings.get("last_cloud_error")
    assert publisher.payloads == []


def test_notification_disabled_does_not_mark_changes_notified(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, settings, snapshots, notifier = make_service(tmp_path, gateway)
    settings.set_bool("push_enabled", False)
    run(service)

    gateway.raw = fetched([{**ROW, "JASMC": "B202"}])
    run(service)

    assert notifier.messages == []
    assert not settings.get("last_notified_change_set_hash")
    changes = snapshots.changes_for_term("2025-2026-1")
    assert changes
    assert all(row["notified_at"] is None for row in changes)

    settings.set_bool("push_enabled", True)
    gateway.raw = fetched([ROW])
    run(service)
    assert len(notifier.messages) == 1


def test_unconfigured_notifier_does_not_mark_changes_notified(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, settings, snapshots, notifier = make_service(tmp_path, gateway)
    notifier.configured = False
    run(service)

    gateway.raw = fetched([{**ROW, "JASMC": "B202"}])
    run(service)

    assert notifier.messages == []
    assert not settings.get("last_notified_change_set_hash")
    assert snapshots.changes_for_term("2025-2026-1")[0]["notified_at"] is None


def test_unexpected_error_logs_sanitized_message(tmp_path, caplog):
    gateway = FakeGateway(error=RuntimeError("boom password=supersecret"))
    service, settings, _, notifier = make_service(tmp_path, gateway)

    with caplog.at_level(logging.ERROR, logger="next_class.sync"):
        result = run(service)

    assert result.status == "failed"
    assert result.error_code == "UNEXPECTED_ERROR"
    assert result.message == "同步时发生未知错误，请稍后重试"
    assert "supersecret" not in caplog.text
    assert "sync failed" in caplog.text
    assert settings.get("last_error_code") == "UNEXPECTED_ERROR"
    assert notifier.messages[0][0] == "课表同步失败"
