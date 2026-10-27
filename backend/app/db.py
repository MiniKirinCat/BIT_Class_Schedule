import json
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from .models import CalendarEntry, ChangeEvent, CourseSession


SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  term TEXT,
  course_count INTEGER,
  change_count INTEGER,
  cloud_publish_status TEXT
);
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER NOT NULL,
  term TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  first_day TEXT NOT NULL,
  normalized_json TEXT NOT NULL,
  calendar_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  is_baseline INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER NOT NULL,
  snapshot_id INTEGER NOT NULL,
  detected_at TEXT NOT NULL,
  type TEXT NOT NULL,
  course_code TEXT,
  course_name TEXT,
  summary TEXT NOT NULL,
  details_json TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  notified_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_snapshots_term ON snapshots(term, id DESC);
CREATE INDEX IF NOT EXISTS idx_changes_detected ON changes(detected_at DESC);
"""


@dataclass(frozen=True)
class SnapshotRecord:
    id: int
    sync_run_id: int
    term: str
    fetched_at: str
    first_day: str
    sessions: list[CourseSession]
    calendar: list[CalendarEntry]
    payload_hash: str
    is_baseline: bool


class Database:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def initialize(self) -> None:
        with self.connect() as conn:
            conn.executescript(SCHEMA)
            conn.execute("PRAGMA journal_mode=WAL")


class SettingsRepo:
    def __init__(self, db: Database):
        self.db = db

    def get(self, key: str, default: str | None = None) -> str | None:
        with self.db.connect() as conn:
            row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default

    def set(self, key: str, value: str | int | bool) -> None:
        if isinstance(value, bool):
            value = "true" if value else "false"
        with self.db.connect() as conn:
            conn.execute(
                "INSERT INTO settings(key, value) VALUES(?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, str(value)),
            )

    def get_int(self, key: str, default: int = 0) -> int:
        value = self.get(key)
        return int(value) if value is not None else default

    def set_int(self, key: str, value: int) -> None:
        self.set(key, value)

    def get_bool(self, key: str, default: bool) -> bool:
        value = self.get(key)
        return default if value is None else value.lower() == "true"

    def set_bool(self, key: str, value: bool) -> None:
        self.set(key, value)


class SnapshotRepo:
    def __init__(self, db: Database):
        self.db = db

    def record_sync_run(
        self,
        *,
        trigger: str,
        started_at: str,
        finished_at: str | None,
        status: str,
        term: str | None = None,
        course_count: int | None = None,
        change_count: int | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
        cloud_publish_status: str | None = None,
    ) -> int:
        # cloud_publish_status is never NULL; an unattempted publish is "skipped".
        cloud_publish_status = cloud_publish_status or "skipped"
        with self.db.connect() as conn:
            cur = conn.execute(
                "INSERT INTO sync_runs(trigger, started_at, finished_at, status, error_code, error_message, term, course_count, change_count, cloud_publish_status) "
                "VALUES(?,?,?,?,?,?,?,?,?,?)",
                (trigger, started_at, finished_at, status, error_code, error_message, term, course_count, change_count, cloud_publish_status),
            )
            return int(cur.lastrowid)

    def finish_sync_run(
        self,
        sync_run_id: int,
        *,
        finished_at: str,
        status: str,
        term: str | None = None,
        course_count: int | None = None,
        change_count: int | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
        cloud_publish_status: str | None = None,
    ) -> None:
        # cloud_publish_status is never NULL; an unattempted publish is "skipped".
        cloud_publish_status = cloud_publish_status or "skipped"
        with self.db.connect() as conn:
            conn.execute(
                "UPDATE sync_runs SET finished_at=?, status=?, term=?, course_count=?, change_count=?, "
                "error_code=?, error_message=?, cloud_publish_status=? WHERE id=?",
                (
                    finished_at,
                    status,
                    term,
                    course_count,
                    change_count,
                    error_code,
                    error_message,
                    cloud_publish_status,
                    sync_run_id,
                ),
            )

    def latest_sync_run(self) -> dict | None:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1").fetchone()
        return dict(row) if row else None

    def fail_interrupted_runs(self, finished_at: str) -> int:
        with self.db.connect() as conn:
            cur = conn.execute(
                "UPDATE sync_runs SET status='failed', finished_at=?, "
                "error_code='INTERRUPTED', error_message=? WHERE status='running'",
                (finished_at, "应用上次异常退出，同步未完成"),
            )
            return int(cur.rowcount)

    def save_snapshot(
        self,
        *,
        sync_run_id: int,
        term: str,
        fetched_at: str,
        first_day: str,
        sessions: list[CourseSession],
        calendar: list[CalendarEntry],
        payload_hash: str,
        is_baseline: bool,
    ) -> int:
        with self.db.connect() as conn:
            cur = conn.execute(
                "INSERT INTO snapshots(sync_run_id, term, fetched_at, first_day, normalized_json, calendar_json, payload_hash, is_baseline) "
                "VALUES(?,?,?,?,?,?,?,?)",
                (
                    sync_run_id,
                    term,
                    fetched_at,
                    first_day,
                    json.dumps([s.to_dict() for s in sessions], ensure_ascii=False),
                    json.dumps([c.to_dict() for c in calendar], ensure_ascii=False),
                    payload_hash,
                    int(is_baseline),
                ),
            )
            return int(cur.lastrowid)

    def latest(self) -> SnapshotRecord | None:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM snapshots ORDER BY id DESC LIMIT 1").fetchone()
        if row is None:
            return None
        return SnapshotRecord(
            id=row["id"],
            sync_run_id=row["sync_run_id"],
            term=row["term"],
            fetched_at=row["fetched_at"],
            first_day=row["first_day"],
            sessions=[CourseSession.from_dict(x) for x in json.loads(row["normalized_json"])],
            calendar=[CalendarEntry(**x) for x in json.loads(row["calendar_json"])],
            payload_hash=row["payload_hash"],
            is_baseline=bool(row["is_baseline"]),
        )

    def insert_changes(
        self,
        *,
        sync_run_id: int,
        snapshot_id: int,
        changes: list[ChangeEvent],
        detected_at: str,
    ) -> None:
        with self.db.connect() as conn:
            for change in changes:
                conn.execute(
                    "INSERT INTO changes(sync_run_id, snapshot_id, detected_at, type, course_code, course_name, summary, details_json, fingerprint) "
                    "VALUES(?,?,?,?,?,?,?,?,?)",
                    (
                        sync_run_id,
                        snapshot_id,
                        detected_at,
                        change.type,
                        change.course_code,
                        change.course_name,
                        change.summary,
                        json.dumps({"before": change.before, "after": change.after}, ensure_ascii=False),
                        change.fingerprint,
                    ),
                )

    def mark_changes_notified(self, snapshot_id: int, notified_at: str) -> None:
        with self.db.connect() as conn:
            conn.execute(
                "UPDATE changes SET notified_at=? WHERE snapshot_id=? AND notified_at IS NULL",
                (notified_at, snapshot_id),
            )

    def changes_for_term(self, term: str, limit: int = 50) -> list[dict]:
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT ch.* FROM changes ch "
                "JOIN snapshots s ON s.id=ch.snapshot_id "
                "WHERE s.term=? ORDER BY ch.detected_at DESC, ch.id DESC LIMIT ?",
                (term, limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def latest_snapshot(self) -> SnapshotRecord | None:
        return self.latest()
