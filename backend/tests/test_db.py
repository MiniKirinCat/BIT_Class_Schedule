from app.db import Database, SettingsRepo, SnapshotRepo
from app.models import CalendarEntry, ChangeEvent, CourseSession


def make_db(tmp_path):
    db = Database(tmp_path / "test.db")
    db.initialize()
    return db


def session(room: str = "A101") -> CourseSession:
    return CourseSession(
        course_code="MATH101",
        course_name="高等数学",
        teacher="李老师",
        room=room,
        campus="良乡",
        weekday=1,
        start_period=1,
        end_period=2,
        weeks=(1, 2, 3),
        raw_time_text="周一第1-2节{第1-3周}",
    )


def test_settings_roundtrip(tmp_path):
    settings = SettingsRepo(make_db(tmp_path))
    settings.set("sync_interval_days", 2)
    assert settings.get_int("sync_interval_days") == 2
    assert settings.get_int("missing", 1) == 1


def test_snapshot_and_changes_roundtrip(tmp_path):
    db = make_db(tmp_path)
    repo = SnapshotRepo(db)
    sync_id = repo.record_sync_run(
        trigger="manual",
        started_at="2026-10-25T12:00:00+08:00",
        finished_at="2026-10-25T12:00:05+08:00",
        status="success",
        term="2025-2026-1",
        course_count=1,
        change_count=0,
    )
    snapshot_id = repo.save_snapshot(
        sync_run_id=sync_id,
        term="2025-2026-1",
        fetched_at="2026-10-25T12:00:05+08:00",
        first_day="2025-09-01",
        sessions=[session()],
        calendar=[CalendarEntry(date="2026-10-26", week=9, weekday=1)],
        payload_hash="abc",
        is_baseline=True,
    )
    change = ChangeEvent(
        type="added",
        course_code="MATH101",
        course_name="高等数学",
        summary="新增：周一 1-2 节 高等数学 · A101",
        before=None,
        after=session().to_dict(),
        fingerprint="fp-1",
    )
    repo.insert_changes(
        sync_run_id=sync_id,
        snapshot_id=snapshot_id,
        changes=[change],
        detected_at="2026-10-25T12:00:05+08:00",
    )

    latest = repo.latest()
    assert latest is not None
    assert latest.term == "2025-2026-1"
    assert latest.sessions[0].room == "A101"
    assert latest.calendar[0].week == 9

    changes = repo.changes_for_term("2025-2026-1", limit=50)
    assert len(changes) == 1
    assert changes[0]["summary"].startswith("新增")
    assert changes[0]["notified_at"] is None

    repo.mark_changes_notified(snapshot_id, "2026-10-25T12:01:00+08:00")
    assert repo.changes_for_term("2025-2026-1")[0]["notified_at"] == "2026-10-25T12:01:00+08:00"

    repo.finish_sync_run(
        sync_id,
        finished_at="2026-10-25T12:00:06+08:00",
        status="success",
        term="2025-2026-1",
        course_count=1,
        change_count=1,
        cloud_publish_status="skipped",
    )
    run = repo.latest_sync_run()
    assert run is not None
    assert run["status"] == "success"
    assert run["change_count"] == 1


def test_failed_sync_run_defaults_cloud_status_to_skipped(tmp_path):
    repo = SnapshotRepo(make_db(tmp_path))
    sync_id = repo.record_sync_run(
        trigger="startup",
        started_at="2026-10-25T12:00:00+08:00",
        finished_at=None,
        status="running",
    )
    repo.finish_sync_run(
        sync_id,
        finished_at="2026-10-25T12:00:01+08:00",
        status="failed",
        error_code="LOGIN_FAILED",
        error_message="登录失败",
    )
    run = repo.latest_sync_run()
    assert run is not None
    assert run["status"] == "failed"
    assert run["cloud_publish_status"] == "skipped"

    explicit_id = repo.record_sync_run(
        trigger="manual",
        started_at="2026-10-25T12:05:00+08:00",
        finished_at=None,
        status="running",
    )
    repo.finish_sync_run(
        explicit_id,
        finished_at="2026-10-25T12:05:01+08:00",
        status="failed",
        cloud_publish_status="failed",
    )
    run = repo.latest_sync_run()
    assert run is not None
    assert run["cloud_publish_status"] == "failed"
