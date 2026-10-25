# 下一节 · 本地核心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个可在 Windows 笔记本本地运行的「下一节」课表应用：自动抓取 BIT 教务课表、检测变动、通过 PushPlus 发微信提醒，并提供带两套主题和五种布局的移动端优先本地 Web UI。

**Architecture:** 单个 FastAPI 进程承载 REST API、SQLite、同步调度器和 React 静态页面；BIT-Login-Python 负责 SSO/WebVPN 和课程表；前端只通过同源相对 `/api` 访问本地服务。云快照通过 `CloudPublisher` 接口预留，本计划注入 `None` 表示跳过发布，下一份计划实现 GitHub Gist/Pages。

**Tech Stack:** Python 3.13、FastAPI、SQLite、BIT-Login-Python（固定 commit）、keyring、httpx、pytest；React 19、Vite、TypeScript、Vitest、React Testing Library、Playwright；自定义 CSS + 语义主题 token。

**Spec:** `docs/superpowers/specs/2026-10-25-next-class-timetable-design.md`

**Scope note:** 本计划覆盖规格的第 1–6、8–10 节中的本地部分；第 7 节云端快照与云端 PWA 由第二份计划 `2026-10-25-next-class-cloud.md` 完成。同步服务会保留 `CloudPublisher` 接口，避免第二份计划改核心流程。

**Commit identity:** 所有提交固定为 `白泽 <minikirincat@outlook.com>`，通过每次命令的 `-c` 参数传入，不修改全局 git 配置：

```bash
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "..."
```

---

## File Structure

```text
backend/
  app/
    __init__.py
    config.py
    models.py
    db.py
    normalizer.py
    schedule.py
    change_detector.py
    security.py
    school_gateway.py
    notifier.py
    sync_service.py
    scheduler.py
    container.py
    api.py
    main.py
  tests/
    test_health.py
    test_db.py
    test_normalizer.py
    test_schedule.py
    test_change_detector.py
    test_security.py
    test_school_gateway.py
    test_notifier.py
    test_sync_service.py
    test_scheduler.py
    test_container.py
    test_api.py
    test_launcher.py
  requirements.txt
frontend/
  package.json
  package-lock.json
  vite.config.ts
  vitest.config.ts
  playwright.config.ts
  tsconfig.json
  index.html
  e2e/smoke.spec.ts
  src/
    main.tsx
    App.tsx
    types.ts
    styles.css
    styles/themes.css
    test/setup.ts
    lib/schedule.ts
    lib/theme.ts
    lib/storage.ts
    lib/__tests__/schedule.test.ts
    lib/__tests__/theme.test.ts
    lib/__tests__/storage.test.ts
    shared/AppShell.tsx
    shared/TodayPage.tsx
    shared/Sheet.tsx
    shared/today/TodayFocus.tsx
    shared/today/TodayTimeline.tsx
    shared/today/TodayCompact.tsx
    shared/today/ChangeBanner.tsx
    shared/today/CourseDetailSheet.tsx
    shared/today/LayoutSheet.tsx
    shared/week/WeekPage.tsx
    shared/week/WeekGrid.tsx
    shared/week/WeekDayList.tsx
    shared/changes/ChangesPage.tsx
    shared/BottomNav.tsx
    shared/StaleBadge.tsx
    shared/__tests__/today.test.tsx
    shared/__tests__/week.test.tsx
    shared/__tests__/changes.test.tsx
    local/LocalApp.tsx
    local/SetupWizard.tsx
    local/SettingsPage.tsx
    local/__tests__/setup.test.tsx
    data/types.ts
    data/local.ts
    data/__tests__/local.test.ts
pyproject.toml
scripts/
  run_server.py
  setup.ps1
  start.ps1
  stop.ps1
  dev_fixture_server.py
README.md
```

---

### Task 1: Backend scaffold, health API, test tooling

**Files:**
- Create: `backend/requirements.txt`, `backend/app/__init__.py`, `backend/app/config.py`, `backend/app/api.py`, `backend/app/main.py`, `backend/tests/test_health.py`, `pyproject.toml`

- [ ] **Step 1: Write the failing health test**

```python
# backend/tests/test_health.py
from fastapi.testclient import TestClient

from app.api import create_app


def test_health_returns_ok():
    client = TestClient(create_app())
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run it and verify it fails**

Run:

```bash
py -3.13 -m venv .venv
./.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
./.venv/Scripts/python.exe -m pytest backend/tests/test_health.py -v
```

Expected: collection error because `backend/app/api.py` and `backend/requirements.txt` do not exist yet.

- [ ] **Step 3: Add dependencies, pytest config, and config module**

```text
# backend/requirements.txt
fastapi==0.115.6
uvicorn[standard]==0.34.0
pydantic==2.10.4
httpx==0.28.1
keyring==25.6.0
cryptography==44.0.1
pytest==8.3.4
pytest-asyncio==0.25.0
bit_login @ git+https://github.com/BIT101-dev/BIT-Login-Python.git@5d537ca6123b405666b82eabc2328b8f4c70b6ca
```

```toml
# pyproject.toml
[tool.pytest.ini_options]
testpaths = ["backend/tests"]
pythonpath = ["backend"]
asyncio_mode = "auto"
```

```python
# backend/app/config.py
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class AppConfig:
    data_dir: Path = PROJECT_ROOT / "data"
    frontend_dir: Path = PROJECT_ROOT / "frontend" / "dist-local"
    app_version: str = "0.1.0"
    scheduler_enabled: bool = True
    scheduler_check_seconds: int = 3600
    manual_cooldown_seconds: int = 300
    calendar_days: int = 14

    @property
    def db_path(self) -> Path:
        return self.data_dir / "next_class.db"
```

- [ ] **Step 4: Implement the minimal app factory and entrypoint**

```python
# backend/app/api.py
from fastapi import FastAPI

from .config import AppConfig


def create_app(config: AppConfig | None = None) -> FastAPI:
    app = FastAPI(title="下一节", version=(config or AppConfig()).app_version)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
```

```python
# backend/app/main.py
from .api import create_app

app = create_app()
```

```python
# backend/app/__init__.py
```

- [ ] **Step 5: Run the test and verify it passes**

Run:

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_health.py -v
```

Expected: `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add backend pyproject.toml
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "feat: scaffold backend and health endpoint"
```

---

### Task 2: Domain models, SQLite schema, and repositories

**Files:**
- Create: `backend/app/models.py`, `backend/app/db.py`, `backend/tests/test_db.py`

- [ ] **Step 1: Write failing repository tests**

```python
# backend/tests/test_db.py
from datetime import datetime, timezone

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
```

- [ ] **Step 2: Run it and verify it fails**

Run:

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_db.py -v
```

Expected: import error for `app.db` / `app.models`.

- [ ] **Step 3: Implement the models**

```python
# backend/app/models.py
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Literal


@dataclass(frozen=True)
class CourseSession:
    course_code: str
    course_name: str
    teacher: str
    room: str
    campus: str
    weekday: int
    start_period: int
    end_period: int
    weeks: tuple[int, ...]
    raw_time_text: str = ""

    def to_dict(self) -> dict:
        data = asdict(self)
        data["weeks"] = list(self.weeks)
        return data

    @classmethod
    def from_dict(cls, data: dict) -> "CourseSession":
        return cls(
            course_code=data["course_code"],
            course_name=data["course_name"],
            teacher=data.get("teacher", ""),
            room=data.get("room", ""),
            campus=data.get("campus", ""),
            weekday=int(data["weekday"]),
            start_period=int(data["start_period"]),
            end_period=int(data["end_period"]),
            weeks=tuple(int(w) for w in data.get("weeks", [])),
            raw_time_text=data.get("raw_time_text", ""),
        )


@dataclass(frozen=True)
class CalendarEntry:
    date: str
    week: int
    weekday: int

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class ChangeEvent:
    type: str
    course_code: str | None
    course_name: str | None
    summary: str
    before: dict | None
    after: dict | None
    fingerprint: str

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class FetchedSchedule:
    term: str
    first_day: date
    rows: list[dict]
    calendar: list[CalendarEntry] = field(default_factory=list)


@dataclass(frozen=True)
class SyncResult:
    status: Literal["success", "failed", "anomaly", "skipped"]
    message: str = ""
    course_count: int = 0
    change_count: int = 0
    cloud_status: str = "skipped"
    error_code: str | None = None
```

- [ ] **Step 4: Implement schema and repositories**

```python
# backend/app/db.py
import json
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
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

    def get_int(self, key: str, default: int) -> int:
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
```

- [ ] **Step 5: Run tests and verify they pass**

Run:

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_db.py -v
```

Expected: `2 passed`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/app/db.py backend/tests/test_db.py
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "feat: add domain models and sqlite repositories"
```

---

### Task 3: Schedule constants, week parsing, calendar helpers, normalizer

**Files:**
- Create: `backend/app/schedule.py`, `backend/app/normalizer.py`, `backend/tests/test_schedule.py`, `backend/tests/test_normalizer.py`

- [ ] **Step 1: Write failing schedule and normalizer tests**

```python
# backend/tests/test_schedule.py
from datetime import date

from app.models import CalendarEntry, CourseSession
from app.schedule import (
    PERIOD_TIMES,
    format_periods,
    format_session_label,
    format_weekday,
    parse_term,
    weeks_label,
)


def test_period_times_are_complete_and_ordered():
    assert len(PERIOD_TIMES) == 13
    assert PERIOD_TIMES[0].start == "08:00"
    assert PERIOD_TIMES[-1].end == "20:55"


def test_parse_term():
    assert parse_term("2025-2026-1") == ("2025-2026", "1")


def test_session_label():
    s = CourseSession("MATH101", "高等数学", "李老师", "A101", "良乡", 1, 1, 2, (1, 2))
    assert format_weekday(1) == "周一"
    assert format_periods(1, 2) == "1-2 节"
    assert weeks_label((1, 2, 3, 5)) == "第1-3,5周"
    assert format_session_label(s) == "周一 1-2 节"
```

```python
# backend/tests/test_normalizer.py
import pytest

from app.normalizer import NormalizationError, normalize, parse_weeks


ROW = {
    "KCH": "MATH101",
    "KCM": "高等数学",
    "SKJS": "李老师",
    "JASMC": "综教 A101",
    "YPSJDD": "周一第1-2节{第1-3周}",
    "SKZC": "111000",
    "SKXQ": 1,
    "KSJC": 1,
    "JSJC": 2,
    "XXXQMC": "良乡",
}


def test_parse_weeks():
    assert parse_weeks("101100") == (1, 3, 4)


def test_normalize_row():
    sessions = normalize([ROW])
    assert len(sessions) == 1
    s = sessions[0]
    assert s.course_name == "高等数学"
    assert s.room == "综教 A101"
    assert s.weeks == (1, 2, 3)
    assert s.weekday == 1


def test_normalize_deduplicates_exact_rows():
    assert len(normalize([ROW, ROW])) == 1


def test_normalize_rejects_invalid_weekday():
    with pytest.raises(NormalizationError):
        normalize([{**ROW, "SKXQ": 8}])


def test_missing_course_code_uses_stable_fallback():
    sessions = normalize([{**ROW, "KCH": ""}])
    assert sessions[0].course_code == "高等数学|李老师"
```

- [ ] **Step 2: Run them and verify they fail**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_schedule.py backend/tests/test_normalizer.py -v
```

Expected: import errors for `app.schedule` / `app.normalizer`.

- [ ] **Step 3: Implement schedule helpers**

```python
# backend/app/schedule.py
from dataclasses import dataclass

from .models import CalendarEntry, CourseSession


@dataclass(frozen=True)
class PeriodTime:
    index: int
    start: str
    end: str


PERIOD_TIMES = (
    PeriodTime(1, "08:00", "08:45"),
    PeriodTime(2, "08:50", "09:35"),
    PeriodTime(3, "09:55", "10:40"),
    PeriodTime(4, "10:45", "11:30"),
    PeriodTime(5, "11:35", "12:20"),
    PeriodTime(6, "13:20", "14:05"),
    PeriodTime(7, "14:10", "14:55"),
    PeriodTime(8, "15:15", "16:00"),
    PeriodTime(9, "16:05", "16:50"),
    PeriodTime(10, "16:55", "17:40"),
    PeriodTime(11, "18:30", "19:15"),
    PeriodTime(12, "19:20", "20:05"),
    PeriodTime(13, "20:10", "20:55"),
)

WEEKDAYS = ("", "周一", "周二", "周三", "周四", "周五", "周六", "周日")


def parse_term(term: str) -> tuple[str, str]:
    try:
        first, second, xq = term.split("-")
    except ValueError as exc:
        raise ValueError(f"学期格式不正确: {term}") from exc
    return f"{first}-{second}", xq


def format_weekday(weekday: int) -> str:
    return WEEKDAYS[weekday]


def format_periods(start: int, end: int) -> str:
    return f"{start} 节" if start == end else f"{start}-{end} 节"


def format_session_label(session: CourseSession) -> str:
    return f"{format_weekday(session.weekday)} {format_periods(session.start_period, session.end_period)}"


def _compress(numbers: list[int]) -> str:
    values = sorted(set(numbers))
    if not values:
        return ""
    parts: list[str] = []
    run_start = run_end = values[0]
    for value in values[1:]:
        if value == run_end + 1:
            run_end = value
            continue
        parts.append(str(run_start) if run_start == run_end else f"{run_start}-{run_end}")
        run_start = run_end = value
    parts.append(str(run_start) if run_start == run_end else f"{run_start}-{run_end}")
    return ",".join(parts)


def weeks_label(weeks: tuple[int, ...] | list[int]) -> str:
    return f"第{_compress(list(weeks))}周"


def calendar_entry_for(calendar: list[CalendarEntry], date_str: str) -> CalendarEntry | None:
    return next((entry for entry in calendar if entry.date == date_str), None)
```

- [ ] **Step 4: Implement the normalizer**

```python
# backend/app/normalizer.py
import logging

from .models import CourseSession

logger = logging.getLogger("next_class.normalizer")


class NormalizationError(Exception):
    pass


def parse_weeks(bitmap: str) -> tuple[int, ...]:
    if not isinstance(bitmap, str) or not bitmap:
        raise NormalizationError("SKZC 周次位图缺失或类型错误")
    return tuple(index + 1 for index, flag in enumerate(bitmap) if flag == "1")


def _as_text(value: object, field: str) -> str:
    if value is None:
        return ""
    if not isinstance(value, (str, int)):
        raise NormalizationError(f"{field} 类型错误")
    return str(value).strip()


def normalize(rows: list[dict]) -> list[CourseSession]:
    result: list[CourseSession] = []
    seen: set[tuple] = set()
    warned_missing_code = False
    for row in rows:
        try:
            weekday = int(row["SKXQ"])
            start = int(row["KSJC"])
            end = int(row["JSJC"])
            weeks = parse_weeks(row.get("SKZC", ""))
        except (KeyError, TypeError, ValueError) as exc:
            raise NormalizationError("课程行缺少必要字段或字段类型错误") from exc
        if not 1 <= weekday <= 7:
            raise NormalizationError(f"SKXQ 超出 1-7: {weekday}")
        if not (1 <= start <= end <= 13):
            raise NormalizationError(f"节次超出 1-13: {start}-{end}")
        if not weeks:
            continue

        course_name = _as_text(row.get("KCM"), "KCM")
        teacher = _as_text(row.get("SKJS"), "SKJS")
        course_code = _as_text(row.get("KCH"), "KCH")
        if not course_code:
            course_code = f"{course_name}|{teacher}"
            if not warned_missing_code:
                logger.warning("课程号缺失，使用课程名和教师作为回退键")
                warned_missing_code = True
        if not course_name:
            raise NormalizationError("课程名为空")

        session = CourseSession(
            course_code=course_code,
            course_name=course_name,
            teacher=teacher,
            room=_as_text(row.get("JASMC"), "JASMC"),
            campus=_as_text(row.get("XXXQMC"), "XXXQMC"),
            weekday=weekday,
            start_period=start,
            end_period=end,
            weeks=weeks,
            raw_time_text=_as_text(row.get("YPSJDD"), "YPSJDD"),
        )
        key = (
            session.course_code,
            session.weekday,
            session.start_period,
            session.end_period,
            session.weeks,
            session.room,
            session.teacher,
        )
        if key not in seen:
            seen.add(key)
            result.append(session)

    return sorted(result, key=lambda s: (s.weekday, s.start_period, s.course_code, s.room))
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_schedule.py backend/tests/test_normalizer.py -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schedule.py backend/app/normalizer.py backend/tests/test_schedule.py backend/tests/test_normalizer.py
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "feat: normalize schedules and parse week bitmaps"
```

---

### Task 4: Change detector and notification summary

**Files:**
- Create: `backend/app/change_detector.py`, `backend/tests/test_change_detector.py`

- [ ] **Step 1: Write failing change-detector tests**

```python
# backend/tests/test_change_detector.py
from app.change_detector import detect_changes, empty_confirmed_event, format_change_message
from app.models import CourseSession


def s(**overrides):
    base = dict(
        course_code="MATH101",
        course_name="高等数学",
        teacher="李老师",
        room="A101",
        campus="良乡",
        weekday=3,
        start_period=3,
        end_period=4,
        weeks=(1, 2, 3, 4),
        raw_time_text="",
    )
    base.update(overrides)
    return CourseSession(**base)


def test_baseline_has_no_changes():
    assert detect_changes(None, [s()], None, "2025-2026-1", None, "2025-09-01", "2026-10-25T12:00:00+08:00") == []


def test_room_change_is_modified():
    changes = detect_changes([s()], [s(room="B202")], "2025-2026-1", "2025-2026-1", "2025-09-01", "2025-09-01", "2026-10-25T12:00:00+08:00")
    assert len(changes) == 1
    assert changes[0].type == "modified"
    assert "A101" in changes[0].summary and "B202" in changes[0].summary


def test_added_and_removed():
    added = detect_changes([], [s()], "2025-2026-1", "2025-2026-1", "2025-09-01", "2025-09-01", "2026-10-25T12:00:00+08:00")
    removed = detect_changes([s()], [], "2025-2026-1", "2025-2026-1", "2025-09-01", "2025-09-01", "2026-10-25T12:00:00+08:00")
    assert added[0].type == "added" and "新增" in added[0].summary
    assert removed[0].type == "removed" and "取消" in removed[0].summary


def test_time_change_is_modified():
    changes = detect_changes([s()], [s(weekday=5, start_period=5, end_period=6)], "2025-2026-1", "2025-2026-1", "2025-09-01", "2025-09-01", "2026-10-25T12:00:00+08:00")
    assert len(changes) == 1
    assert "调整" in changes[0].summary


def test_term_rollover_does_not_report_all_removed():
    changes = detect_changes([s()], [s(course_code="PHY101", course_name="大学物理")], "2024-2025-2", "2025-2026-1", "2025-02-17", "2025-09-01", "2026-10-25T12:00:00+08:00")
    assert len(changes) == 1
    assert changes[0].type == "term_rollover"


def test_ambiguous_pair_is_not_guessed():
    old = [s(start_period=1, end_period=2), s(start_period=3, end_period=4)]
    new = [s(start_period=5, end_period=6), s(start_period=7, end_period=8)]
    changes = detect_changes(old, new, "2025-2026-1", "2025-2026-1", "2025-09-01", "2025-09-01", "2026-10-25T12:00:00+08:00")
    types = sorted(change.type for change in changes)
    assert types == ["added", "added", "removed", "removed"]


def test_one_new_two_old_is_not_guessed():
    old = [s(start_period=1, end_period=2), s(start_period=3, end_period=4)]
    new = [s(start_period=5, end_period=6)]
    changes = detect_changes(old, new, "2025-2026-1", "2025-2026-1", "2025-09-01", "2025-09-01", "2026-10-25T12:00:00+08:00")
    types = sorted(change.type for change in changes)
    assert types == ["added", "removed", "removed"]


def test_message_is_self_contained_and_capped():
    changes = detect_changes(None, [], None, "2025-2026-1", None, "2025-09-01", "2026-10-25T12:00:00+08:00")
    message = format_change_message(changes, "2026-10-25T12:00:00+08:00")
    assert "检测于" in message


def test_empty_confirmed_event():
    event = empty_confirmed_event()
    assert event.type == "empty_confirmed"
    assert "连续两次为空" in event.summary
```

- [ ] **Step 2: Run them and verify they fail**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_change_detector.py -v
```

Expected: import error.

- [ ] **Step 3: Implement the detector**

```python
# backend/app/change_detector.py
import hashlib
from collections import defaultdict
from datetime import datetime

from .models import ChangeEvent, CourseSession
from .schedule import format_periods, format_session_label, format_weekday, weeks_label


def _fingerprint(kind: str, course_code: str | None, summary: str) -> str:
    raw = f"{kind}|{course_code or ''}|{summary}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _event(kind: str, course_code: str | None, course_name: str | None, summary: str, before: dict | None = None, after: dict | None = None) -> ChangeEvent:
    return ChangeEvent(kind, course_code, course_name, summary, before, after, _fingerprint(kind, course_code, summary))


def _same_course_weeks(a: CourseSession, b: CourseSession) -> bool:
    return a.course_code == b.course_code and bool(set(a.weeks) & set(b.weeks))


def _modified_summary(old: CourseSession, new: CourseSession) -> str:
    parts: list[str] = []
    if (old.weekday, old.start_period, old.end_period) != (new.weekday, new.start_period, new.end_period):
        parts.append(f"时间 {format_weekday(old.weekday)} {format_periods(old.start_period, old.end_period)} → {format_weekday(new.weekday)} {format_periods(new.start_period, new.end_period)}")
    if old.room != new.room:
        parts.append(f"教室 {old.room or '未填教室'} → {new.room or '未填教室'}")
    if old.teacher != new.teacher:
        parts.append(f"教师 {old.teacher or '未填教师'} → {new.teacher or '未填教师'}")
    if old.weeks != new.weeks:
        parts.append(f"周次 {weeks_label(old.weeks)} → {weeks_label(new.weeks)}")
    return f"{new.course_name}：调整 " + "；".join(parts)


def detect_changes(
    previous: list[CourseSession] | None,
    current: list[CourseSession],
    previous_term: str | None,
    current_term: str,
    previous_first_day: str | None,
    current_first_day: str,
    detected_at: str,
) -> list[ChangeEvent]:
    if previous is None:
        return []

    if previous_term and previous_term != current_term:
        return [
            _event(
                "term_rollover",
                None,
                None,
                f"已切换到新学期 {current_term}，课表已同步",
                {"term": previous_term},
                {"term": current_term},
            )
        ]

    events: list[ChangeEvent] = []
    if previous_first_day and previous_first_day != current_first_day:
        events.append(
            _event(
                "term_start_changed",
                None,
                None,
                "学期起始日期已更新，请留意周次",
                {"first_day": previous_first_day},
                {"first_day": current_first_day},
            )
        )

    old_map = {
        (s.course_code, s.weekday, s.start_period, s.end_period, s.weeks, s.room, s.teacher): s
        for s in previous
    }
    new_map = {
        (s.course_code, s.weekday, s.start_period, s.end_period, s.weeks, s.room, s.teacher): s
        for s in current
    }

    removed = [s for key, s in old_map.items() if key not in new_map]
    added = [s for key, s in new_map.items() if key not in old_map]

    added_by_course: dict[str, list[CourseSession]] = defaultdict(list)
    for session in added:
        added_by_course[session.course_code].append(session)
    old_by_course: dict[str, list[CourseSession]] = defaultdict(list)
    for session in previous:
        old_by_course[session.course_code].append(session)

    matched_added_ids: set[int] = set()
    for old in sorted(removed, key=lambda s: (s.weekday, s.start_period, s.course_code)):
        candidates = [
            session
            for session in added_by_course.get(old.course_code, [])
            if id(session) not in matched_added_ids and _same_course_weeks(old, session)
        ]
        unique_match = len(candidates) == 1
        if unique_match:
            new = candidates[0]
            reverse = [
                session
                for session in old_by_course.get(new.course_code, [])
                if _same_course_weeks(session, new)
            ]
            unique_match = len(reverse) == 1
        if unique_match:
            new = candidates[0]
            matched_added_ids.add(id(new))
            summary = _modified_summary(old, new)
            events.append(_event("modified", old.course_code, new.course_name, summary, old.to_dict(), new.to_dict()))
        else:
            summary = f"取消：{format_session_label(old)} {old.course_name}" + (f" · {old.room}" if old.room else "")
            events.append(_event("removed", old.course_code, old.course_name, summary, old.to_dict(), None))

    for new in added:
        if id(new) in matched_added_ids:
            continue
        summary = f"新增：{format_session_label(new)} {new.course_name}" + (f" · {new.room}" if new.room else "")
        events.append(_event("added", new.course_code, new.course_name, summary, None, new.to_dict()))

    unique = {event.fingerprint: event for event in events}
    return sorted(unique.values(), key=lambda e: (e.type, e.course_code or "", e.summary))


def empty_confirmed_event() -> ChangeEvent:
    summary = "课表连续两次为空，已按空课表更新"
    return _event("empty_confirmed", None, None, summary)


def change_set_hash(changes: list[ChangeEvent]) -> str:
    if not changes:
        return ""
    raw = "\n".join(sorted(f"{c.type}|{c.course_code or ''}|{c.summary}" for c in changes))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def format_change_message(changes: list[ChangeEvent], detected_at: str) -> str:
    when = datetime.fromisoformat(detected_at).strftime("%m-%d %H:%M")
    lines = [f"{index + 1}. {change.summary}" for index, change in enumerate(changes[:5])]
    if len(changes) > 5:
        lines.append(f"……共 {len(changes)} 处")
    return f"检测于 {when}\n" + "\n".join(lines)
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_change_detector.py -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/change_detector.py backend/tests/test_change_detector.py
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "feat: detect timetable changes and build summaries"
```

---

### Task 5: Credential storage, redaction, and rotating logs

**Files:**
- Create: `backend/app/security.py`, `backend/tests/test_security.py`

- [ ] **Step 1: Write failing security tests**

```python
# backend/tests/test_security.py
import pytest
from keyring.errors import KeyringError

from app.security import CredentialError, CredentialStore, redact, safe_message


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
```

- [ ] **Step 2: Run it and verify it fails**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_security.py -v
```

Expected: import error for `app.security`.

- [ ] **Step 3: Implement `security.py`**

```python
# backend/app/security.py
import logging
import re
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Protocol

import keyring
from keyring.errors import KeyringError

SERVICE_NAME = "next-class"

_URL_QUERY = re.compile(r"(https?://[^\s?#]+)\?[^\s#]*")
_COOKIE = re.compile(r"(?i)(cookie\s*:\s*)[^\n]+")
_BEARER = re.compile(r"(?i)(authorization\s*:\s*bearer\s+)[^\s,;]+")
_SECRET_PAIR = re.compile(
    r"(?i)\b(password|passwd|token|secret|key|school_password|pushplus_token|github_token)"
    r"\s*[=:]\s*([^\s,;&]+)"
)


def redact(text: str) -> str:
    text = _URL_QUERY.sub(r"\1?[REDACTED]", str(text))
    text = _COOKIE.sub(r"\1[REDACTED]", text)
    text = _BEARER.sub(r"\1[REDACTED]", text)
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
        self._backend = backend or keyring
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
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_security.py -v
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/security.py backend/tests/test_security.py
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "feat: store credentials in keyring and redact logs"
```

---

### Task 6: BIT-Login adapter and calendar slice

**Files:**
- Create: `backend/app/school_gateway.py`, `backend/tests/test_school_gateway.py`

- [ ] **Step 1: Write failing gateway tests**

```python
# backend/tests/test_school_gateway.py
from datetime import date

import pytest
from bit_login.config import CONFIG

from app.models import CalendarEntry
from app.school_gateway import (
    BitSchoolGateway,
    SchoolError,
    _default_fetch_calendar,
    calendar_entry_from_payload,
)

RAW = {
    "term": "2025-2026-1",
    "firstDay": "2025-09-01",
    "data": [{"KCH": "MATH101", "KCM": "高等数学"}],
}


class FakeResponse:
    def __init__(self, payload, status=200):
        self.payload = payload
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self, payloads):
        self.payloads = list(payloads)
        self.calls = []

    def post(self, url, data):
        self.calls.append(data)
        value = self.payloads.pop(0)
        if isinstance(value, Exception):
            raise value
        return FakeResponse(value)


def test_fetch_combines_schedule_and_calendar():
    seen_dates = []

    def fetch_calendar(session, term, dates):
        seen_dates.extend(dates)
        return [CalendarEntry(date=dates[0].isoformat(), week=9, weekday=1)]

    gateway = BitSchoolGateway(
        login=lambda username, password: object(),
        fetch_courses=lambda session: RAW,
        fetch_calendar=fetch_calendar,
        today=lambda: date(2026, 10, 25),
    )

    result = gateway.fetch("20250001", "pw")

    assert result.term == "2025-2026-1"
    assert result.first_day == date(2025, 9, 1)
    assert result.rows == RAW["data"]
    assert result.calendar[0].week == 9
    assert len(seen_dates) == 14
    assert seen_dates[0] == date(2026, 10, 25)


def test_login_failure_is_wrapped_without_password():
    def fail_login(username, password):
        raise RuntimeError(f"login failed for {username} password={password}")

    gateway = BitSchoolGateway(login=fail_login, fetch_courses=lambda s: RAW)
    with pytest.raises(SchoolError) as exc:
        gateway.fetch("20250001", "hunter2")
    assert exc.value.code == "LOGIN_FAILED"
    assert "hunter2" not in str(exc.value)


def test_missing_first_day_is_data_error():
    gateway = BitSchoolGateway(
        login=lambda u, p: object(),
        fetch_courses=lambda s: {"term": "2025-2026-1", "data": []},
    )
    with pytest.raises(SchoolError) as exc:
        gateway.fetch("20250001", "pw")
    assert exc.value.code == "DATA_ERROR"


def test_calendar_failure_does_not_fail_schedule():
    def fail_calendar(session, term, dates):
        raise RuntimeError("calendar down")

    gateway = BitSchoolGateway(
        login=lambda u, p: object(),
        fetch_courses=lambda s: RAW,
        fetch_calendar=fail_calendar,
    )
    result = gateway.fetch("20250001", "pw")
    assert result.calendar == []


def test_calendar_entry_accepts_numeric_zc_and_falls_back_to_date_weekday():
    entry = calendar_entry_from_payload(
        {"datas": {"rqzhzcjc": {"rows": [{"ZC": 9}]}}},
        date(2026, 10, 25),
    )
    assert entry == CalendarEntry(date="2026-10-25", week=9, weekday=7)


def test_default_calendar_skips_individual_failures(monkeypatch):
    monkeypatch.setitem(CONFIG["urls"], "active", {"jxzxehall_app": "http://test"})
    session = FakeSession(
        [
            RuntimeError("network down"),
            {"datas": {"rqzhzcjc": {"rows": [{"ZC": "9", "XQJ": 6}]}}},
        ]
    )

    entries = _default_fetch_calendar(
        session,
        "2025-2026-1",
        [date(2026, 10, 24), date(2026, 10, 25)],
    )

    assert entries == [CalendarEntry(date="2026-10-25", week=9, weekday=6)]
    assert session.calls[1] == {"RQ": "2026-10-25", "XN": "2025-2026", "XQ": "1"}
```

- [ ] **Step 2: Run it and verify it fails**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_school_gateway.py -v
```

Expected: import error for `app.school_gateway`.

- [ ] **Step 3: Implement the adapter**

```python
# backend/app/school_gateway.py
import logging
import re
from datetime import date, datetime, timedelta
from typing import Callable
from zoneinfo import ZoneInfo

from .models import CalendarEntry, FetchedSchedule
from .security import redact

TZ = ZoneInfo("Asia/Shanghai")
logger = logging.getLogger("next_class.school")


class SchoolError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.user_message = message


def _default_login(username: str, password: str):
    import bit_login

    return bit_login.jxzxehall_login().login(username, password).get_session()


def _default_fetch_courses(session):
    import bit_login

    return bit_login.jxzxehall.course(session).get_courses()


def _calendar_url() -> str:
    from bit_login.config import CONFIG

    base = CONFIG["urls"]["active"]["jxzxehall_app"]
    return f"{base}/jwapp/sys/kxjas/modules/kxjas/rqzhzcjc.do"


def calendar_entry_from_payload(payload: dict, day: date) -> CalendarEntry | None:
    block = payload.get("datas", {}).get("rqzhzcjc") if isinstance(payload, dict) else None
    if isinstance(block, dict):
        rows = block.get("rows", [])
    elif isinstance(block, list):
        rows = block
    else:
        rows = []
    if isinstance(rows, dict):
        rows = [rows]
    if not rows:
        return None

    row = rows[0]
    match = re.search(r"\d+", str(row.get("ZC", "")))
    if not match:
        return None
    week = int(match.group())
    raw_weekday = row.get("XQJ", row.get("XQ"))
    try:
        weekday = int(raw_weekday) if raw_weekday is not None else day.isoweekday()
    except (TypeError, ValueError):
        weekday = day.isoweekday()
    if not 1 <= weekday <= 7:
        weekday = day.isoweekday()
    return CalendarEntry(date=day.isoformat(), week=week, weekday=weekday)


def _default_fetch_calendar(session, term: str, dates: list[date]) -> list[CalendarEntry]:
    try:
        xn, xq = term.rsplit("-", 1)
        url = _calendar_url()
    except (ValueError, KeyError):
        return []

    entries: list[CalendarEntry] = []
    for day in dates:
        try:
            response = session.post(
                url,
                data={"RQ": day.isoformat(), "XN": xn, "XQ": xq},
            )
            response.raise_for_status()
            entry = calendar_entry_from_payload(response.json(), day)
            if entry is not None:
                entries.append(entry)
        except Exception as exc:
            logger.info("日历切片 %s 获取失败：%s", day.isoformat(), redact(str(exc))[:120])
    return entries


class BitSchoolGateway:
    def __init__(
        self,
        *,
        login: Callable[[str, str], object] | None = None,
        fetch_courses: Callable[[object], dict] | None = None,
        fetch_calendar: Callable[[object, str, list[date]], list[CalendarEntry]] | None = None,
        today: Callable[[], date] | None = None,
        calendar_days: int = 14,
    ):
        self._login = login or _default_login
        self._fetch_courses = fetch_courses or _default_fetch_courses
        self._fetch_calendar = fetch_calendar or _default_fetch_calendar
        self._today = today or (lambda: datetime.now(TZ).date())
        self._calendar_days = calendar_days

    def fetch(self, username: str, password: str) -> FetchedSchedule:
        try:
            session = self._login(username, password)
        except SchoolError:
            raise
        except Exception as exc:
            raise SchoolError("LOGIN_FAILED", "登录教务系统失败，请检查账号密码或网络") from exc

        try:
            raw = self._fetch_courses(session)
        except Exception as exc:
            raise SchoolError("FETCH_FAILED", "读取课表失败，请稍后重试") from exc

        if not isinstance(raw, dict):
            raise SchoolError("DATA_ERROR", "教务系统返回的课表格式不正确")
        term = raw.get("term")
        first_day_text = raw.get("firstDay")
        rows = raw.get("data")
        if not isinstance(term, str) or not term:
            raise SchoolError("DATA_ERROR", "教务系统未返回当前学期")
        if not isinstance(first_day_text, str) or not first_day_text:
            raise SchoolError("DATA_ERROR", "教务系统未返回学期起始日期")
        try:
            first_day = date.fromisoformat(first_day_text)
        except ValueError as exc:
            raise SchoolError("DATA_ERROR", "学期起始日期格式不正确") from exc
        if not isinstance(rows, list):
            raise SchoolError("DATA_ERROR", "教务系统未返回课程列表")

        start = self._today()
        days = [start + timedelta(days=index) for index in range(self._calendar_days)]
        try:
            calendar = self._fetch_calendar(session, term, days)
        except Exception as exc:
            logger.info("日历切片整体获取失败：%s", redact(str(exc))[:120])
            calendar = []

        return FetchedSchedule(term=term, first_day=first_day, rows=rows, calendar=calendar)
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_school_gateway.py -v
```

Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/school_gateway.py backend/tests/test_school_gateway.py
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "feat: adapt bit-login schedule and calendar endpoints"
```

---

### Task 7: PushPlus notifier with one retry

**Files:**
- Create: `backend/app/notifier.py`, `backend/tests/test_notifier.py`

- [ ] **Step 1: Write failing notifier tests**

```python
# backend/tests/test_notifier.py
import json

import httpx
import pytest

from app.notifier import NotificationError, PushPlusNotifier


def make_notifier(handler, token="test-token"):
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return PushPlusNotifier(lambda: token, client=client)


def test_send_success_posts_expected_payload():
    calls = []

    def handler(request):
        calls.append(json.loads(request.content))
        return httpx.Response(200, json={"code": 200, "msg": "ok"})

    notifier = make_notifier(handler)
    notifier.send("标题", "正文")

    assert calls == [
        {"token": "test-token", "title": "标题", "content": "正文", "template": "txt"}
    ]


def test_retries_once_then_succeeds():
    responses = [
        httpx.Response(500, json={"code": 500}),
        httpx.Response(200, json={"code": 200}),
    ]

    def handler(request):
        return responses.pop(0)

    make_notifier(handler).send("标题", "正文")


def test_business_error_code_is_a_failure():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"code": 903, "msg": "token 无效"})

    with pytest.raises(NotificationError):
        make_notifier(handler).send("标题", "正文")
    assert len(calls) == 2


def test_missing_token_is_not_configured_and_does_not_call_network():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"code": 200})

    notifier = make_notifier(handler, token="")
    assert notifier.is_configured() is False
    with pytest.raises(NotificationError):
        notifier.send("标题", "正文")
    assert calls == []
```

- [ ] **Step 2: Run it and verify it fails**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_notifier.py -v
```

Expected: import error for `app.notifier`.

- [ ] **Step 3: Implement the notifier**

```python
# backend/app/notifier.py
import httpx

from .security import redact

PUSHPLUS_URL = "https://www.pushplus.plus/send"


class NotificationError(Exception):
    pass


class PushPlusNotifier:
    def __init__(self, token_provider, client: httpx.Client | None = None, timeout: float = 10.0):
        self._token_provider = token_provider
        self._client = client or httpx.Client(timeout=timeout)

    def is_configured(self) -> bool:
        return bool(self._token_provider())

    def send(self, title: str, content: str) -> None:
        token = self._token_provider()
        if not token:
            raise NotificationError("PushPlus 未配置")

        last_error = "PushPlus 发送失败"
        payload = {"token": token, "title": title, "content": content, "template": "txt"}
        for _ in range(2):
            try:
                response = self._client.post(PUSHPLUS_URL, json=payload)
                if response.status_code == 200 and response.json().get("code") == 200:
                    return
                last_error = f"PushPlus 返回异常（HTTP {response.status_code}）"
            except (httpx.HTTPError, ValueError, AttributeError) as exc:
                last_error = redact(str(exc))[:200] or last_error
        raise NotificationError(last_error)
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_notifier.py -v
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/notifier.py backend/tests/test_notifier.py
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "feat: send WeChat notifications through PushPlus"
```

---

### Task 8: Sync service with empty-result guard, backoff state, and notification dedup

**Files:**
- Create: `backend/app/sync_service.py`, `backend/tests/test_sync_service.py`

- [ ] **Step 1: Write failing sync-service tests**

```python
# backend/tests/test_sync_service.py
import asyncio
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

    def fetch(self, username, password):
        if self.error:
            raise self.error
        return self.raw


class FakeNotifier:
    def __init__(self):
        self.messages = []
        self.configured = True
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

    def publish(self, payload):
        if self.fail_times > 0:
            self.fail_times -= 1
            raise RuntimeError("gist down")
        self.payloads.append(payload)


def make_service(tmp_path, gateway, *, publisher=None):
    db = Database(tmp_path / "test.db")
    db.initialize()
    settings = SettingsRepo(db)
    settings.set_bool("push_enabled", True)
    snapshots = SnapshotRepo(db)
    config = AppConfig(data_dir=tmp_path, frontend_dir=tmp_path / "dist", scheduler_enabled=False)
    notifier = FakeNotifier()
    service = SyncService(
        config=config,
        settings=settings,
        snapshots=snapshots,
        credentials=FakeCredentials(school_username="20250001", school_password="pw"),
        gateway=gateway,
        notifier=notifier,
        publisher=publisher,
        now=lambda: NOW,
    )
    return service, settings, snapshots, notifier


def run(service, moment=NOW):
    return asyncio.run(service.sync("manual", now=moment))


def test_baseline_saves_snapshot_without_notification(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, _, snapshots, notifier = make_service(tmp_path, gateway)

    result = run(service)

    assert result.status == "success"
    assert result.course_count == 1
    assert snapshots.latest().sessions[0].room == "A101"
    assert notifier.messages == []


def test_room_change_notifies_once_and_clears_hash_after_no_change(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, _, _, notifier = make_service(tmp_path, gateway)
    run(service)

    gateway.raw = fetched([{**ROW, "JASMC": "B202"}])
    result = run(service)
    assert result.change_count == 1
    assert notifier.messages[0][0] == "课表变动 · 1 处"
    assert "A101" in notifier.messages[0][1] and "B202" in notifier.messages[0][1]

    run(service)
    assert len(notifier.messages) == 1

    gateway.raw = fetched([ROW])
    run(service)
    assert len(notifier.messages) == 2


def test_first_empty_is_anomaly_and_second_is_accepted(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, _, snapshots, notifier = make_service(tmp_path, gateway)
    run(service)

    gateway.raw = fetched([])
    first = run(service)
    assert first.status == "anomaly"
    assert snapshots.latest().sessions[0].room == "A101"
    assert notifier.messages[-1][0] == "课表同步失败"

    second = run(service)
    assert second.status == "success"
    assert snapshots.latest().sessions == []
    assert "连续两次为空" in notifier.messages[-1][1]


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
    assert snapshots.latest().term == "2026-2027-1"
    assert notifier.messages[-1][0] == "新学期课表已同步"


def test_failure_preserves_snapshot_and_notifies_only_first_of_streak(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, settings, snapshots, notifier = make_service(tmp_path, gateway)
    run(service)
    before = snapshots.latest().id

    gateway.error = SchoolError("LOGIN_FAILED", "登录失败")
    assert run(service).status == "failed"
    assert run(service).status == "failed"
    assert snapshots.latest().id == before
    assert len([m for m in notifier.messages if m[0] == "课表同步失败"]) == 1
    assert settings.get_int("failure_streak", 0) == 2

    gateway.error = None
    assert run(service).status == "success"
    assert settings.get_int("failure_streak", 0) == 0


def test_cloud_failure_does_not_block_local_snapshot_and_alerts_on_second(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    publisher = FakePublisher()
    publisher.fail_times = 2
    service, _, snapshots, notifier = make_service(tmp_path, gateway, publisher=publisher)

    assert run(service).cloud_status == "failed"
    assert snapshots.latest() is not None
    assert run(service).cloud_status == "failed"
    assert any(title == "云端快照未更新" for title, _ in notifier.messages)


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


def test_due_time_and_manual_cooldown(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, settings, _, _ = make_service(tmp_path, gateway)
    run(service)

    assert service.next_due_at(NOW) == NOW + timedelta(days=1)
    assert service.is_due(NOW + timedelta(days=1)) is True
    assert service.manual_cooldown_remaining(NOW) == 300
    assert service.manual_cooldown_remaining(NOW + timedelta(seconds=301)) == 0

    settings.set_int("failure_streak", 1)
    assert service.next_due_at(NOW) == NOW + timedelta(hours=1)


def test_sync_returns_busy_when_lock_is_held(tmp_path):
    gateway = FakeGateway(fetched([ROW]))
    service, _, _, _ = make_service(tmp_path, gateway)

    async def scenario():
        async with service.lock:
            with pytest.raises(SyncBusyError):
                await service.sync("manual", now=NOW)

    asyncio.run(scenario())
```

- [ ] **Step 2: Run it and verify it fails**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_sync_service.py -v
```

Expected: import error for `app.sync_service`.

- [ ] **Step 3: Implement the sync service**

```python
# backend/app/sync_service.py
import asyncio
import hashlib
import json
import logging
import math
from datetime import datetime, timedelta
from typing import Callable, Protocol
from zoneinfo import ZoneInfo

from .change_detector import (
    change_set_hash,
    detect_changes,
    empty_confirmed_event,
    format_change_message,
)
from .config import AppConfig
from .db import SettingsRepo, SnapshotRepo
from .models import ChangeEvent, CourseSession, FetchedSchedule, SyncResult
from .normalizer import NormalizationError, normalize
from .schedule import PERIOD_TIMES
from .school_gateway import SchoolError
from .security import CredentialError, redact, safe_message

TZ = ZoneInfo("Asia/Shanghai")
BACKOFF_HOURS = (1, 3, 6, 12, 24)


class SyncBusyError(Exception):
    pass


class CloudPublisher(Protocol):
    def publish(self, payload: dict) -> None: ...


def _iso(moment: datetime) -> str:
    return moment.isoformat(timespec="seconds")


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
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


def _changes_payload(rows: list[dict]) -> list[dict]:
    result = []
    for row in rows:
        try:
            details = json.loads(row.get("details_json") or "{}")
        except ValueError:
            details = {}
        result.append(
            {
                "id": row["id"],
                "detected_at": row["detected_at"],
                "type": row["type"],
                "course_code": row["course_code"],
                "course_name": row["course_name"],
                "summary": row["summary"],
                "before": details.get("before"),
                "after": details.get("after"),
            }
        )
    return result


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

    @property
    def lock(self) -> asyncio.Lock:
        return self._lock

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
        started = _iso(moment)
        self._settings.set("last_attempt_sync_at", started)
        run_id = self._snapshots.record_sync_run(
            trigger=trigger,
            started_at=started,
            finished_at=None,
            status="running",
        )

        try:
            username = username or self._credentials.get("school_username")
            password = password or self._credentials.get("school_password")
        except CredentialError as exc:
            return self._fail(run_id, "KEYRING_ERROR", str(exc), moment)
        if not username or not password:
            return self._fail(run_id, "NOT_CONFIGURED", "尚未配置教务账号", moment)

        try:
            fetched = self._gateway.fetch(username, password)
            sessions = normalize(fetched.rows)
        except SchoolError as exc:
            return self._fail(run_id, exc.code, exc.user_message, moment)
        except NormalizationError:
            return self._fail(run_id, "PARSE_ERROR", "课表解析失败，已保留上次快照", moment)
        except Exception as exc:
            self._logger.exception("sync failed: %s", safe_message(exc))
            return self._fail(run_id, "UNEXPECTED_ERROR", "同步时发生未知错误，请稍后重试", moment)

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
            finished = _iso(moment)
            self._snapshots.finish_sync_run(
                run_id,
                finished_at=finished,
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
                    f"原因：{message}\n如果下次仍为空，将按空课表更新；否则会继续保留旧课表。",
                )
            return SyncResult(
                status="anomaly",
                message=message,
                course_count=0,
                change_count=0,
                error_code="EMPTY_RESULT",
            )

        changes = [empty_confirmed_event()]
        return self._complete_success(
            run_id=run_id,
            fetched=fetched,
            sessions=[],
            changes=changes,
            is_baseline=True,
            moment=moment,
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
        cloud_status = self._publish(fetched, sessions, finished)

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
            content = f"已切换到新学期 {term}，共 {len(sessions)} 门课程。\n" + format_change_message(
                changes, detected_at
            )
        else:
            title = f"课表变动 · {len(changes)} 处"
            content = format_change_message(changes, detected_at)

        if self._send_notification(title, content):
            self._settings.set("last_notified_change_set_hash", digest)
            self._snapshots.mark_changes_notified(snapshot_id, detected_at)

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

    def _publish(
        self,
        fetched: FetchedSchedule,
        sessions: list[CourseSession],
        finished: str,
    ) -> str:
        if self._publisher is None:
            return "skipped"

        interval = self._settings.get_int("sync_interval_days", 1)
        payload = {
            "schema_version": 1,
            "app_version": self._config.app_version,
            "synced_at": finished,
            "sync_interval_days": interval,
            "term": fetched.term,
            "first_day": fetched.first_day.isoformat(),
            "courses": [session.to_dict() for session in sessions],
            "changes": _changes_payload(
                self._snapshots.changes_for_term(fetched.term, limit=50)
            ),
            "calendar": [entry.to_dict() for entry in fetched.calendar],
            "period_times": [
                {"index": period.index, "start": period.start, "end": period.end}
                for period in PERIOD_TIMES
            ],
        }

        try:
            self._publisher.publish(payload)
        except Exception as exc:
            streak = self._settings.get_int("cloud_failure_streak", 0) + 1
            self._settings.set_int("cloud_failure_streak", streak)
            self._settings.set("last_cloud_error", safe_message(exc))
            if streak == 2:
                self._send_notification(
                    "云端快照未更新",
                    "连续两次发布失败，本地课表已正常同步。请检查 GitHub token 和 Gist 设置。",
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
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_sync_service.py -v
```

Expected: `9 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/sync_service.py backend/tests/test_sync_service.py
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "feat: sync schedules with change detection and failure guards"
```

---

### Task 9: Scheduler and dependency container

**Files:**
- Create: `backend/app/scheduler.py`, `backend/app/container.py`, `backend/tests/test_scheduler.py`, `backend/tests/test_container.py`

- [ ] **Step 1: Write failing scheduler and container tests**

```python
# backend/tests/test_scheduler.py
import asyncio
from datetime import datetime
from zoneinfo import ZoneInfo

from app.config import AppConfig
from app.scheduler import SyncScheduler
from app.sync_service import SyncBusyError

TZ = ZoneInfo("Asia/Shanghai")
NOW = datetime(2026, 10, 26, 9, 0, tzinfo=TZ)


class FakeService:
    def __init__(self):
        self.configured = True
        self.due = True
        self.busy = False
        self.calls = []

    def is_configured(self):
        return self.configured

    def is_due(self, now=None):
        return self.due

    async def sync(self, trigger="scheduled", *, now=None):
        if self.busy:
            raise SyncBusyError("busy")
        self.calls.append((trigger, now))
        return "success"


def make_scheduler(service, seconds=3600):
    config = AppConfig(scheduler_check_seconds=seconds)
    return SyncScheduler(service, config)


def test_tick_runs_due_sync():
    service = FakeService()
    scheduler = make_scheduler(service)

    assert asyncio.run(scheduler.tick(NOW)) is True
    assert service.calls == [("scheduled", NOW)]


def test_tick_skips_unconfigured_or_not_due():
    service = FakeService()
    service.configured = False
    assert asyncio.run(make_scheduler(service).tick(NOW)) is False

    service = FakeService()
    service.due = False
    assert asyncio.run(make_scheduler(service).tick(NOW)) is False
    assert service.calls == []


def test_tick_swallows_lock_conflict():
    service = FakeService()
    service.busy = True
    assert asyncio.run(make_scheduler(service).tick(NOW)) is False


def test_start_and_stop_loop():
    service = FakeService()
    scheduler = make_scheduler(service, seconds=0.01)

    async def scenario():
        scheduler.start()
        await asyncio.sleep(0.04)
        await scheduler.stop()

    asyncio.run(scenario())
    assert len(service.calls) >= 1
```

```python
# backend/tests/test_container.py
from app.config import AppConfig
from app.container import build_container


class FakeCredentials(dict):
    pass


def test_container_wires_dependencies(tmp_path):
    config = AppConfig(data_dir=tmp_path, scheduler_enabled=False)
    container = build_container(config, credentials=FakeCredentials())

    assert container.db.path == tmp_path / "next_class.db"
    assert container.sync_service._snapshots is container.snapshots
    assert container.sync_service._gateway is container.gateway
    assert container.scheduler._service is container.sync_service
```

- [ ] **Step 2: Run them and verify they fail**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_scheduler.py backend/tests/test_container.py -v
```

Expected: import errors for `app.scheduler` / `app.container`.

- [ ] **Step 3: Implement the scheduler**

```python
# backend/app/scheduler.py
import asyncio
import contextlib
import logging
from datetime import datetime

from .config import AppConfig
from .sync_service import SyncBusyError, SyncService


class SyncScheduler:
    def __init__(self, service: SyncService, config: AppConfig, logger: logging.Logger | None = None):
        self._service = service
        self._config = config
        self._logger = logger or logging.getLogger("next_class.scheduler")
        self._stop = asyncio.Event()
        self._task: asyncio.Task | None = None

    async def tick(self, now: datetime | None = None) -> bool:
        if not self._service.is_configured():
            return False
        if not self._service.is_due(now):
            return False
        try:
            await self._service.sync("scheduled", now=now)
        except SyncBusyError:
            return False
        return True

    async def run(self) -> None:
        while not self._stop.is_set():
            try:
                await self.tick()
            except Exception:
                self._logger.exception("scheduler tick failed")
            try:
                await asyncio.wait_for(
                    self._stop.wait(),
                    timeout=self._config.scheduler_check_seconds,
                )
            except TimeoutError:
                pass

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop.clear()
            self._task = asyncio.create_task(self.run())

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
```

- [ ] **Step 4: Implement the container**

```python
# backend/app/container.py
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
    gateway = gateway if gateway is not None else BitSchoolGateway(calendar_days=config.calendar_days)
    notifier = notifier if notifier is not None else PushPlusNotifier(
        lambda: credentials.get("pushplus_token")
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
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_scheduler.py backend/tests/test_container.py -v
```

Expected: `5 passed`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/scheduler.py backend/app/container.py backend/tests/test_scheduler.py backend/tests/test_container.py
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "feat: schedule due syncs and wire dependencies"
```

---

### Task 10: Local HTTP API, lifespan, and static hosting

**Files:**
- Modify: `backend/app/api.py`, `backend/app/main.py`
- Create: `backend/tests/test_api.py`

- [ ] **Step 1: Write failing API tests**

```python
# backend/tests/test_api.py
from datetime import date

from fastapi.testclient import TestClient

from app.api import create_app
from app.config import AppConfig
from app.container import build_container
from app.models import CalendarEntry, FetchedSchedule
from app.school_gateway import SchoolError

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


class FakeGateway:
    def __init__(self):
        self.raw = FetchedSchedule(
            term="2025-2026-1",
            first_day=date(2025, 9, 1),
            rows=[ROW],
            calendar=[CalendarEntry(date="2026-10-26", week=9, weekday=1)],
        )
        self.error = None

    def fetch(self, username, password):
        if self.error:
            raise self.error
        return self.raw


class FakeCredentials:
    def __init__(self):
        self.values = {}

    def get(self, key):
        return self.values.get(key)

    def set(self, key, value):
        self.values[key] = value

    def delete(self, key):
        self.values.pop(key, None)

    def has(self, key):
        return key in self.values


class FakeNotifier:
    def __init__(self):
        self.messages = []
        self.configured = False
        self.fail = False

    def is_configured(self):
        return self.configured

    def send(self, title, content):
        if self.fail:
            raise RuntimeError("push down")
        self.messages.append((title, content))


def make_app(tmp_path, gateway):
    config = AppConfig(
        data_dir=tmp_path,
        frontend_dir=tmp_path / "missing-dist",
        scheduler_enabled=False,
    )
    credentials = FakeCredentials()
    notifier = FakeNotifier()
    container = build_container(
        config,
        credentials=credentials,
        gateway=gateway,
        notifier=notifier,
    )
    return create_app(config, container), credentials, notifier


def test_status_and_dashboard_before_setup(tmp_path):
    app, _, _ = make_app(tmp_path, FakeGateway())
    with TestClient(app) as client:
        status = client.get("/api/status")
        assert status.status_code == 200
        assert status.json()["configured"] is False
        assert client.get("/api/dashboard").status_code == 404
        assert client.post("/api/sync").status_code == 400


def test_setup_school_syncs_and_then_enforces_cooldown(tmp_path):
    gateway = FakeGateway()
    app, credentials, _ = make_app(tmp_path, gateway)

    with TestClient(app) as client:
        response = client.post(
            "/api/setup/school",
            json={"username": " 20250001 ", "password": "pw"},
        )
        assert response.status_code == 200
        assert response.json()["configured"] is True
        assert credentials.get("school_username") == "20250001"
        assert credentials.get("school_password") == "pw"

        dashboard = client.get("/api/dashboard")
        assert dashboard.status_code == 200
        body = dashboard.json()
        assert body["courses"][0]["course_name"] == "高等数学"
        assert len(body["period_times"]) == 13
        assert body["term"] == "2025-2026-1"

        assert client.post("/api/sync").status_code == 429


def test_setup_school_failure_does_not_save_credentials(tmp_path):
    gateway = FakeGateway()
    gateway.error = SchoolError("LOGIN_FAILED", "登录失败")
    app, credentials, _ = make_app(tmp_path, gateway)

    with TestClient(app) as client:
        response = client.post(
            "/api/setup/school",
            json={"username": "20250001", "password": "bad"},
        )
        assert response.status_code == 502
        assert credentials.get("school_username") is None


def test_settings_validation_and_update(tmp_path):
    app, _, _ = make_app(tmp_path, FakeGateway())
    with TestClient(app) as client:
        current = client.get("/api/settings").json()
        assert current["sync_interval_days"] == 1

        updated = client.put(
            "/api/settings",
            json={"sync_interval_days": 3, "push_enabled": True},
        )
        assert updated.status_code == 200
        assert updated.json()["sync_interval_days"] == 3
        assert updated.json()["push_enabled"] is True

        invalid = client.put("/api/settings", json={"sync_interval_days": 4})
        assert invalid.status_code == 422


def test_pushplus_setup_and_test_notification(tmp_path):
    app, _, notifier = make_app(tmp_path, FakeGateway())
    notifier.configured = True

    with TestClient(app) as client:
        response = client.post(
            "/api/setup/pushplus",
            json={"token": "push-token", "test": True},
        )
        assert response.status_code == 200
        assert notifier.messages[0][0] == "下一节测试提醒"

        tested = client.post("/api/notifications/test")
        assert tested.status_code == 200
        assert len(notifier.messages) == 2


def test_test_notification_requires_configuration(tmp_path):
    app, _, _ = make_app(tmp_path, FakeGateway())
    with TestClient(app) as client:
        assert client.post("/api/notifications/test").status_code == 400
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_api.py -v
```

Expected: `create_app` does not accept `container` yet, and routes are missing.

- [ ] **Step 3: Replace `api.py` with the full local API**

```python
# backend/app/api.py
import json
from contextlib import asynccontextmanager
from math import ceil

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import AppConfig
from .container import Container, build_container
from .schedule import PERIOD_TIMES
from .security import CredentialError, redact
from .sync_service import SyncBusyError


class SchoolSetup(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class PushSetup(BaseModel):
    token: str = Field(min_length=1, max_length=256)
    test: bool = False


class SettingsUpdate(BaseModel):
    sync_interval_days: int | None = Field(default=None, ge=1, le=3)
    push_enabled: bool | None = None


def _container(request: Request) -> Container:
    container = getattr(request.app.state, "container", None)
    if container is None:
        raise HTTPException(status_code=500, detail="服务尚未初始化")
    return container


def _credential(container: Container, key: str) -> str | None:
    try:
        return container.credentials.get(key)
    except CredentialError:
        return None


def _status_payload(container: Container) -> dict:
    last_run = container.snapshots.latest_sync_run()
    next_due = container.sync_service.next_due_at()
    username = _credential(container, "school_username")
    password = _credential(container, "school_password")
    return {
        "configured": bool(username and password),
        "school_configured": bool(username and password),
        "school_username": username,
        "push_configured": bool(_credential(container, "pushplus_token")),
        "cloud_configured": False,
        "last_sync_at": container.settings.get("last_success_sync_at"),
        "last_attempt_at": container.settings.get("last_attempt_sync_at"),
        "next_due_at": next_due.isoformat(timespec="seconds"),
        "sync_status": last_run["status"] if last_run else None,
        "last_error": container.settings.get("last_sync_error"),
        "notification_error": container.settings.get("last_notification_error"),
        "cloud_status": last_run["cloud_publish_status"] if last_run else "skipped",
        "version": container.config.app_version,
    }


def _settings_payload(container: Container) -> dict:
    return {
        "sync_interval_days": container.settings.get_int("sync_interval_days", 1),
        "push_enabled": container.settings.get_bool("push_enabled", False),
        "school_configured": bool(
            _credential(container, "school_username")
            and _credential(container, "school_password")
        ),
        "push_configured": bool(_credential(container, "pushplus_token")),
        "cloud_configured": False,
    }


def _change_payload(row: dict) -> dict:
    try:
        details = json.loads(row.get("details_json") or "{}")
    except ValueError:
        details = {}
    return {
        "id": row["id"],
        "detected_at": row["detected_at"],
        "type": row["type"],
        "course_code": row["course_code"],
        "course_name": row["course_name"],
        "summary": row["summary"],
        "before": details.get("before"),
        "after": details.get("after"),
    }


def _dashboard_payload(container: Container) -> dict:
    snapshot = container.snapshots.latest()
    if snapshot is None:
        raise HTTPException(status_code=404, detail="还没有课表快照，请先完成同步")

    last_run = container.snapshots.latest_sync_run()
    next_due = container.sync_service.next_due_at()
    return {
        "schema_version": 1,
        "app_version": container.config.app_version,
        "synced_at": snapshot.fetched_at,
        "sync_interval_days": container.settings.get_int("sync_interval_days", 1),
        "term": snapshot.term,
        "first_day": snapshot.first_day,
        "courses": [session.to_dict() for session in snapshot.sessions],
        "changes": [
            _change_payload(row)
            for row in container.snapshots.changes_for_term(snapshot.term, limit=50)
        ],
        "calendar": [entry.to_dict() for entry in snapshot.calendar],
        "period_times": [
            {"index": period.index, "start": period.start, "end": period.end}
            for period in PERIOD_TIMES
        ],
        "sync_status": last_run["status"] if last_run else None,
        "last_attempt_at": container.settings.get("last_attempt_sync_at"),
        "next_due_at": next_due.isoformat(timespec="seconds"),
        "cloud_status": last_run["cloud_publish_status"] if last_run else "skipped",
        "last_error": container.settings.get("last_sync_error"),
        "configured": container.sync_service.is_configured(),
    }


def _sync_result(result) -> dict:
    return {
        "status": result.status,
        "message": result.message,
        "course_count": result.course_count,
        "change_count": result.change_count,
        "cloud_status": result.cloud_status,
        "error_code": result.error_code,
    }


def create_app(
    config: AppConfig | None = None,
    container: Container | None = None,
) -> FastAPI:
    config = config or AppConfig()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        active = getattr(app.state, "container", None) or build_container(config)
        active.db.initialize()
        if active.settings.get("app_schema_version") is None:
            active.settings.set("app_schema_version", "1")
        if active.settings.get("sync_interval_days") is None:
            active.settings.set_int("sync_interval_days", 1)
        app.state.container = active
        if config.scheduler_enabled:
            active.scheduler.start()
        try:
            yield
        finally:
            await active.scheduler.stop()

    app = FastAPI(title="下一节", version=config.app_version, lifespan=lifespan)
    if container is not None:
        app.state.container = container

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=422, content={"detail": "请求参数不正确"})

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/status")
    def status(request: Request) -> dict:
        return _status_payload(_container(request))

    @app.post("/api/setup/school")
    async def setup_school(payload: SchoolSetup, request: Request) -> dict:
        active = _container(request)
        username = payload.username.strip()
        if not username:
            raise HTTPException(status_code=422, detail="学号不能为空")
        try:
            result = await active.sync_service.sync(
                "manual",
                username=username,
                password=payload.password,
            )
        except SyncBusyError as exc:
            raise HTTPException(status_code=409, detail="同步正在进行中，请稍候") from exc
        if result.status == "failed":
            raise HTTPException(
                status_code=502,
                detail=result.message or "连接教务系统失败",
            )
        try:
            active.credentials.set("school_username", username)
            active.credentials.set("school_password", payload.password)
        except CredentialError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return {"status": result.status, "configured": True}

    @app.post("/api/setup/pushplus")
    def setup_pushplus(payload: PushSetup, request: Request) -> dict:
        active = _container(request)
        token = payload.token.strip()
        if not token:
            raise HTTPException(status_code=422, detail="PushPlus token 不能为空")
        try:
            active.credentials.set("pushplus_token", token)
        except CredentialError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        active.settings.set_bool("push_enabled", True)
        if payload.test:
            try:
                active.notifier.send(
                    "下一节测试提醒",
                    "如果你看到这条消息，微信提醒已经配置成功。",
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=502,
                    detail=redact(str(exc)) or "测试提醒发送失败",
                ) from exc
        return {"configured": True, "tested": payload.test}

    @app.post("/api/sync")
    async def sync_now(request: Request) -> dict:
        active = _container(request)
        if not active.sync_service.is_configured():
            raise HTTPException(status_code=400, detail="请先在设置中连接教务账号")
        remaining = active.sync_service.manual_cooldown_remaining()
        if remaining > 0:
            minutes = max(1, ceil(remaining / 60))
            raise HTTPException(
                status_code=429,
                detail=f"请等待 {minutes} 分钟后再同步",
            )
        try:
            result = await active.sync_service.sync("manual")
        except SyncBusyError as exc:
            raise HTTPException(status_code=409, detail="同步正在进行中，请稍候") from exc
        return _sync_result(result)

    @app.get("/api/dashboard")
    def dashboard(request: Request) -> dict:
        return _dashboard_payload(_container(request))

    @app.get("/api/settings")
    def get_settings(request: Request) -> dict:
        return _settings_payload(_container(request))

    @app.put("/api/settings")
    def update_settings(payload: SettingsUpdate, request: Request) -> dict:
        active = _container(request)
        if payload.sync_interval_days is not None:
            active.settings.set_int("sync_interval_days", payload.sync_interval_days)
        if payload.push_enabled is not None:
            active.settings.set_bool("push_enabled", payload.push_enabled)
        return _settings_payload(active)

    @app.post("/api/notifications/test")
    def test_notification(request: Request) -> dict:
        active = _container(request)
        if not active.notifier.is_configured():
            raise HTTPException(status_code=400, detail="请先配置 PushPlus token")
        try:
            active.notifier.send(
                "下一节测试提醒",
                "如果你看到这条消息，微信提醒已经配置成功。",
            )
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=redact(str(exc)) or "测试提醒发送失败",
            ) from exc
        return {"status": "sent"}

    if config.frontend_dir.is_dir():
        app.mount(
            "/",
            StaticFiles(directory=str(config.frontend_dir), html=True),
            name="frontend",
        )

    return app
```

- [ ] **Step 4: Wire logging in `main.py`**

```python
# backend/app/main.py
from .api import create_app
from .config import AppConfig
from .security import setup_logging

config = AppConfig()
setup_logging(config.data_dir)
app = create_app(config)
```

- [ ] **Step 5: Run the API tests and verify they pass**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_api.py -v
```

Expected: `6 passed`.

- [ ] **Step 6: Run the full backend suite**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests -v
```

Expected: all backend tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api.py backend/app/main.py backend/tests/test_api.py
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "feat: expose local setup, sync, dashboard, and settings API"
```

---

### Task 11: Launcher with automatic port selection and lifecycle scripts

**Files:**
- Create: `scripts/run_server.py`, `scripts/setup.ps1`, `scripts/start.ps1`, `scripts/stop.ps1`, `backend/tests/test_launcher.py`

- [ ] **Step 1: Write failing launcher tests**

```python
# backend/tests/test_launcher.py
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("run_server", ROOT / "scripts" / "run_server.py")
run_server = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(run_server)


def test_choose_port_prefers_17800(monkeypatch):
    monkeypatch.delenv("NEXT_CLASS_PORT", raising=False)
    monkeypatch.setattr(run_server, "port_available", lambda port: port == 17800)
    assert run_server.choose_port() == 17800


def test_explicit_port_conflict_aborts(monkeypatch):
    monkeypatch.setenv("NEXT_CLASS_PORT", "18000")
    monkeypatch.setattr(run_server, "port_available", lambda port: False)
    with pytest.raises(SystemExit):
        run_server.choose_port()


def test_existing_instance_requires_healthy_port(monkeypatch, tmp_path):
    runtime = tmp_path / "runtime.json"
    runtime.write_text(
        json.dumps({"port": 17800, "pid": 123, "url": "http://127.0.0.1:17800"}),
        encoding="utf-8",
    )
    monkeypatch.setattr(run_server, "RUNTIME", runtime)
    monkeypatch.setattr(run_server, "health", lambda port, timeout=1.0: True)
    assert run_server.existing_instance()["port"] == 17800

    monkeypatch.setattr(run_server, "health", lambda port, timeout=1.0: False)
    assert run_server.existing_instance() is None
```

- [ ] **Step 2: Run it and verify it fails**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_launcher.py -v
```

Expected: file-not-found error for `scripts/run_server.py`.

- [ ] **Step 3: Implement the launcher**

```python
# scripts/run_server.py
import argparse
import json
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
RUNTIME = ROOT / "data" / "runtime.json"
DEFAULT_PORT = 17800
TZ = ZoneInfo("Asia/Shanghai")

if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


def health(port: int, timeout: float = 1.0) -> bool:
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/api/health", timeout=timeout
        ) as response:
            return response.status == 200
    except Exception:
        return False


def read_runtime() -> dict | None:
    try:
        data = json.loads(RUNTIME.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or not isinstance(data.get("port"), int):
        return None
    return data


def existing_instance() -> dict | None:
    data = read_runtime()
    if data is not None and health(data["port"]):
        return data
    return None


def port_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def choose_port() -> int:
    raw = os.environ.get("NEXT_CLASS_PORT")
    if raw:
        try:
            port = int(raw)
        except ValueError as exc:
            raise SystemExit("NEXT_CLASS_PORT 必须是整数") from exc
        if not 1 <= port <= 65535:
            raise SystemExit("NEXT_CLASS_PORT 超出有效端口范围")
        if not port_available(port):
            raise SystemExit(f"端口 {port} 已被占用，未自动改端口")
        return port

    if port_available(DEFAULT_PORT):
        return DEFAULT_PORT
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def write_runtime(port: int) -> dict:
    RUNTIME.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "port": port,
        "pid": os.getpid(),
        "url": f"http://127.0.0.1:{port}",
        "started_at": datetime.now(TZ).isoformat(timespec="seconds"),
    }
    RUNTIME.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


def clear_runtime(pid: int) -> None:
    data = read_runtime()
    if data and data.get("pid") == pid:
        try:
            RUNTIME.unlink()
        except FileNotFoundError:
            pass


def open_when_ready(port: int, url: str) -> None:
    for _ in range(100):
        if health(port, timeout=0.3):
            webbrowser.open(url)
            return
        time.sleep(0.2)


def main() -> None:
    parser = argparse.ArgumentParser(description="启动下一节")
    parser.add_argument("--no-open", action="store_true", help="不自动打开浏览器")
    args = parser.parse_args()

    existing = existing_instance()
    if existing is not None:
        print(existing["url"])
        if not args.no_open:
            webbrowser.open(existing["url"])
        return

    port = choose_port()
    url = f"http://127.0.0.1:{port}"
    write_runtime(port)
    print(f"下一节运行在 {url}")
    if not args.no_open:
        threading.Thread(
            target=open_when_ready,
            args=(port, url),
            daemon=True,
        ).start()

    import uvicorn

    try:
        uvicorn.run("app.main:app", host="127.0.0.1", port=port, log_level="info")
    finally:
        clear_runtime(os.getpid())


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Add PowerShell setup/start/stop scripts**

```powershell
# scripts/setup.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    throw "需要 Python 3.13，请先安装并确保 py 可用"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "需要 Node.js，请先安装"
}

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    py -3.13 -m venv .venv
}

& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt

Push-Location frontend
try {
    if (Test-Path "package-lock.json") {
        npm ci
    } else {
        npm install
    }
    npm run build:local
} finally {
    Pop-Location
}

New-Item -ItemType Directory -Force -Path data | Out-Null
Write-Host "初始化完成。运行 scripts\start.ps1 启动下一节。"
```

```powershell
# scripts/start.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    throw "请先运行 scripts\setup.ps1"
}

& .\.venv\Scripts\python.exe scripts\run_server.py
```

```powershell
# scripts/stop.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $root "data\runtime.json"

if (-not (Test-Path $runtime)) {
    Write-Host "下一节未运行。"
    exit 0
}

$data = Get-Content $runtime -Raw | ConvertFrom-Json
$proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($data.pid)" -ErrorAction SilentlyContinue

if ($proc) {
    if ($proc.CommandLine -match "run_server\.py|uvicorn") {
        Stop-Process -Id $data.pid -Force
        Write-Host "已停止下一节。"
    } else {
        Write-Warning "PID $($data.pid) 不是下一节进程，未结束。"
    }
} else {
    Write-Host "进程已退出。"
}

Remove-Item $runtime -ErrorAction SilentlyContinue
```

- [ ] **Step 5: Run launcher tests**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests/test_launcher.py -v
```

Expected: `3 passed`.

- [ ] **Step 6: Smoke-test the real launcher on a temporary port**

Use a separate terminal or background process:

```bash
NEXT_CLASS_PORT=17899 ./.venv/Scripts/python.exe scripts/run_server.py --no-open
```

Then in another command:

```bash
curl -s http://127.0.0.1:17899/api/health
```

Expected: `{"status":"ok"}`. Stop the process, then verify `data/runtime.json` is removed.

- [ ] **Step 7: Commit**

```bash
git add scripts/run_server.py scripts/setup.ps1 scripts/start.ps1 scripts/stop.ps1 backend/tests/test_launcher.py
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "feat: add local launcher with automatic port selection"
```

---

### Task 12: Frontend scaffold, domain types, theme tokens, and preference storage

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/vitest.config.ts`, `frontend/index.html`, `frontend/src/test/setup.ts`, `frontend/src/types.ts`, `frontend/src/lib/theme.ts`, `frontend/src/lib/storage.ts`, `frontend/src/lib/__tests__/theme.test.ts`, `frontend/src/styles/themes.css`, `frontend/src/styles.css`

- [ ] **Step 1: Create frontend tooling**

```json
{
  "name": "next-class-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "build:local": "tsc --noEmit && vite build --outDir dist-local",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.53.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^22.15.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.4.1",
    "jsdom": "^26.1.0",
    "typescript": "~5.8.3",
    "vite": "^6.3.5",
    "vitest": "^3.2.4"
  }
}
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

```ts
// frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const mode = process.env.VITE_APP_MODE ?? 'local';

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/',
  build: {
    outDir: mode === 'cloud' ? 'dist-cloud' : 'dist-local',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.NEXT_CLASS_DEV_API ?? 'http://127.0.0.1:17800',
      },
    },
  },
});
```

```ts
// frontend/vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});
```

```ts
// frontend/src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

```html
<!-- frontend/index.html -->
<!doctype html>
<html lang="zh-CN" data-theme="warm">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="#F7F5EF" />
    <title>下一节</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Run the install and create the lockfile:

```bash
cd frontend
npm install
cd ..
```

Expected: `frontend/package-lock.json` is created, with no install errors.

- [ ] **Step 2: Add shared domain types and preference helpers**

```ts
// frontend/src/types.ts
export type TodayLayout = 'focus' | 'timeline' | 'compact';
export type WeekLayout = 'grid' | 'list';
export type ThemeName = 'warm' | 'fog';
export type SyncStatus = 'success' | 'failed' | 'anomaly' | 'running' | null;
export type CloudStatus = 'success' | 'failed' | 'skipped';

export type ChangeType =
  | 'added'
  | 'removed'
  | 'modified'
  | 'term_rollover'
  | 'term_start_changed'
  | 'empty_confirmed';

export interface PeriodTime {
  index: number;
  start: string;
  end: string;
}

export interface CourseSession {
  course_code: string;
  course_name: string;
  teacher: string;
  room: string;
  campus: string;
  weekday: number;
  start_period: number;
  end_period: number;
  weeks: number[];
  raw_time_text: string;
}

export interface CalendarEntry {
  date: string;
  week: number;
  weekday: number;
}

export interface ChangeRecord {
  id: number;
  detected_at: string;
  type: ChangeType;
  course_code: string | null;
  course_name: string | null;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface ScheduleSnapshot {
  schema_version: 1;
  app_version: string;
  synced_at: string;
  sync_interval_days: number;
  term: string;
  first_day: string;
  courses: CourseSession[];
  changes: ChangeRecord[];
  calendar: CalendarEntry[];
  period_times: PeriodTime[];
  sync_status?: SyncStatus;
  last_attempt_at?: string | null;
  next_due_at?: string | null;
  cloud_status?: CloudStatus;
  last_error?: string | null;
  configured?: boolean;
}
```

```ts
// frontend/src/lib/storage.ts
import { useState } from 'react';
import type { ThemeName, TodayLayout, WeekLayout } from '../types';

export const STORAGE_KEYS = {
  todayLayout: 'next-class.todayLayout',
  weekLayout: 'next-class.weekLayout',
  theme: 'next-class.theme',
  lastSeenChangeId: 'next-class.lastSeenChangeId',
} as const;

export function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A private-mode browser may reject writes; the in-memory choice still works.
  }
}

export function useStoredChoice<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = readStorage(key);
    return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  });

  return [
    value,
    (next: T) => {
      setValue(next);
      writeStorage(key, next);
    },
  ];
}

export function defaultWeekLayout(): WeekLayout {
  if (typeof window === 'undefined') return 'list';
  return window.matchMedia('(min-width: 900px)').matches ? 'grid' : 'list';
}

export function readLastSeenChangeId(): number {
  const value = Number(readStorage(STORAGE_KEYS.lastSeenChangeId) ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function writeLastSeenChangeId(id: number): void {
  writeStorage(STORAGE_KEYS.lastSeenChangeId, String(id));
}

export type { ThemeName, TodayLayout, WeekLayout };
```

```ts
// frontend/src/lib/theme.ts
import { useEffect, useState } from 'react';
import type { ThemeName } from '../types';
import { STORAGE_KEYS, readStorage, writeStorage } from './storage';

export function resolveTheme(value: string | null): ThemeName {
  return value === 'fog' ? 'fog' : 'warm';
}

export function getInitialTheme(): ThemeName {
  return resolveTheme(readStorage(STORAGE_KEYS.theme));
}

export function applyTheme(theme: ThemeName): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
  }
}

export function persistTheme(theme: ThemeName): void {
  writeStorage(STORAGE_KEYS.theme, theme);
  applyTheme(theme);
}

export function useTheme(): [ThemeName, (theme: ThemeName) => void] {
  const [theme, setTheme] = useState<ThemeName>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return [
    theme,
    (next: ThemeName) => {
      setTheme(next);
      persistTheme(next);
    },
  ];
}
```

- [ ] **Step 3: Write the theme test**

```ts
// frontend/src/lib/__tests__/theme.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, getInitialTheme, persistTheme, resolveTheme } from '../theme';
import { STORAGE_KEYS } from '../storage';

describe('theme preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to warm and rejects unknown values', () => {
    expect(resolveTheme(null)).toBe('warm');
    expect(resolveTheme('fog')).toBe('fog');
    expect(resolveTheme('purple')).toBe('warm');
    expect(getInitialTheme()).toBe('warm');
  });

  it('applies the data-theme attribute without reloading', () => {
    applyTheme('fog');
    expect(document.documentElement.dataset.theme).toBe('fog');
    applyTheme('warm');
    expect(document.documentElement.dataset.theme).toBe('warm');
  });

  it('persists the selected theme', () => {
    persistTheme('fog');
    expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('fog');
    expect(getInitialTheme()).toBe('fog');
  });
});
```

```ts
// frontend/src/lib/__tests__/storage.test.ts
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS, useStoredChoice } from '../storage';

describe('stored layout choices', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses the fallback without treating it as a user choice', () => {
    const { result } = renderHook(() =>
      useStoredChoice('next-class.testLayout', 'focus', ['focus', 'timeline'] as const),
    );
    expect(result.current[0]).toBe('focus');
    expect(localStorage.getItem('next-class.testLayout')).toBeNull();

    act(() => result.current[1]('timeline'));
    expect(result.current[0]).toBe('timeline');
    expect(localStorage.getItem('next-class.testLayout')).toBe('timeline');
  });

  it('restores a stored valid choice and ignores invalid values', () => {
    localStorage.setItem(STORAGE_KEYS.todayLayout, 'compact');
    const first = renderHook(() =>
      useStoredChoice(STORAGE_KEYS.todayLayout, 'focus', ['focus', 'timeline', 'compact'] as const),
    );
    expect(first.result.current[0]).toBe('compact');

    localStorage.setItem(STORAGE_KEYS.todayLayout, 'broken');
    const second = renderHook(() =>
      useStoredChoice(STORAGE_KEYS.todayLayout, 'focus', ['focus', 'timeline', 'compact'] as const),
    );
    expect(second.result.current[0]).toBe('focus');
  });
});
```

- [ ] **Step 4: Add semantic theme tokens**

```css
/* frontend/src/styles/themes.css */
:root,
[data-theme="warm"] {
  color-scheme: light;
  --bg: #f7f5ef;
  --surface: #ffffff;
  --text: #1d211e;
  --muted: #7c827b;
  --primary: #1f5c4a;
  --primary-soft: #dce9df;
  --hero-bg: #173f33;
  --hero-text: #f7f5ef;
  --hero-accent: #dff3b5;
  --alert: #c9772b;
  --alert-soft: #fbf0dd;
  --border: rgba(29, 33, 30, 0.08);
  --shadow: 0 18px 40px rgba(23, 63, 51, 0.12);
  --nav-bg: rgba(247, 245, 239, 0.92);
  --scrim: rgba(23, 31, 27, 0.42);
}

[data-theme="fog"] {
  color-scheme: light;
  --bg: #f4f6f7;
  --surface: #ffffff;
  --text: #17232e;
  --muted: #6b7a86;
  --primary: #244c6b;
  --primary-soft: #dce7ef;
  --hero-bg: #1b3a50;
  --hero-text: #f4f8fa;
  --hero-accent: #b9d9ee;
  --alert: #b85c3a;
  --alert-soft: #f7e7df;
  --border: rgba(23, 35, 46, 0.08);
  --shadow: 0 18px 40px rgba(27, 58, 80, 0.14);
  --nav-bg: rgba(244, 246, 247, 0.92);
  --scrim: rgba(18, 26, 34, 0.46);
}

@media (prefers-color-scheme: dark) {
  :root,
  [data-theme="warm"] {
    color-scheme: dark;
    --bg: #171a18;
    --surface: #232724;
    --text: #f2f0e9;
    --muted: #9aa39b;
    --primary: #a8e6c1;
    --primary-soft: #2e3a33;
    --hero-bg: #24352d;
    --hero-text: #f2f0e9;
    --hero-accent: #c9f5d8;
    --alert: #f0b35a;
    --alert-soft: #3a3124;
    --border: rgba(242, 240, 233, 0.08);
    --shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
    --nav-bg: rgba(23, 26, 24, 0.92);
    --scrim: rgba(0, 0, 0, 0.56);
  }

  [data-theme="fog"] {
    color-scheme: dark;
    --bg: #121a22;
    --surface: #1b2530;
    --text: #eaf2f7;
    --muted: #93a6b4;
    --primary: #8fc7e8;
    --primary-soft: #263a4a;
    --hero-bg: #152e42;
    --hero-text: #eaf2f7;
    --hero-accent: #b9d9ee;
    --alert: #e08a68;
    --alert-soft: #3a2a24;
    --border: rgba(234, 242, 247, 0.08);
    --shadow: 0 18px 40px rgba(0, 0, 0, 0.32);
    --nav-bg: rgba(18, 26, 34, 0.92);
    --scrim: rgba(0, 0, 0, 0.62);
  }
}
```

- [ ] **Step 5: Add base and component styles**

```css
/* frontend/src/styles.css */
* {
  box-sizing: border-box;
}

html,
body,
#root {
  min-height: 100%;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

button,
input,
select {
  font: inherit;
  color: inherit;
}

button {
  cursor: pointer;
}

button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}

h1,
h2,
h3,
p {
  margin: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.app-shell {
  width: min(100%, 920px);
  min-height: 100dvh;
  margin: 0 auto;
  padding-bottom: calc(84px + env(safe-area-inset-bottom));
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px 12px;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 9px;
}

.brand-name {
  font-size: 18px;
  font-weight: 750;
  letter-spacing: 0.02em;
}

.brand-caption {
  color: var(--muted);
  font-size: 12px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
  background: var(--surface);
  font-size: 12px;
  white-space: nowrap;
}

.status-chip.is-alert {
  color: var(--alert);
  border-color: color-mix(in srgb, var(--alert) 35%, transparent);
  background: var(--alert-soft);
}

.page {
  padding: 18px 18px 10px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.eyebrow {
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.04em;
}

.page-title {
  margin-top: 3px;
  font-size: clamp(26px, 6vw, 34px);
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.page-subtitle {
  margin-top: 6px;
  color: var(--muted);
  font-size: 13px;
}

.ghost-button,
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 10px 15px;
  border-radius: 13px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-weight: 650;
  text-decoration: none;
}

.ghost-button:hover,
.button:hover {
  border-color: color-mix(in srgb, var(--primary) 35%, var(--border));
}

.button-primary {
  color: var(--hero-text);
  background: var(--primary);
  border-color: var(--primary);
}

.button-primary:hover {
  filter: brightness(1.05);
}

.button-danger {
  color: var(--alert);
  border-color: color-mix(in srgb, var(--alert) 35%, var(--border));
  background: var(--alert-soft);
}

.button:disabled,
.ghost-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.hero-card {
  position: relative;
  overflow: hidden;
  min-height: 196px;
  padding: 22px;
  border-radius: 22px;
  background: var(--hero-bg);
  color: var(--hero-text);
  box-shadow: var(--shadow);
}

.hero-card::after {
  content: "";
  position: absolute;
  right: -40px;
  bottom: -64px;
  width: 210px;
  height: 210px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--hero-accent) 24%, transparent);
}

.hero-card.is-muted {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  box-shadow: none;
}

.hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hero-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.82;
}

.hero-time {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  opacity: 0.8;
}

.hero-course {
  margin-top: 22px;
  font-size: clamp(27px, 7vw, 40px);
  line-height: 1.08;
  letter-spacing: -0.04em;
}

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 14px;
  margin-top: 12px;
  font-size: 14px;
  opacity: 0.9;
}

.hero-countdown {
  margin-top: 24px;
  color: var(--hero-accent);
  font-size: 17px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.hero-card.is-muted .hero-countdown {
  color: var(--primary);
}

.hero-actions {
  margin-top: 18px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 24px 2px 10px;
}

.section-title {
  font-size: 15px;
  font-weight: 750;
  letter-spacing: -0.01em;
}

.muted {
  color: var(--muted);
}

.stack {
  display: grid;
  gap: 10px;
}

.course-list {
  display: grid;
  gap: 9px;
}

.course-row {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  min-height: 64px;
  padding: 12px;
  text-align: left;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 15px;
}

.course-row:hover {
  border-color: color-mix(in srgb, var(--primary) 30%, var(--border));
}

.course-row.is-current {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.course-time {
  min-width: 58px;
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.45;
}

.course-main {
  min-width: 0;
  flex: 1;
}

.course-name {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.course-meta {
  margin-top: 3px;
  color: var(--muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.course-status {
  flex: none;
  color: var(--primary);
  font-size: 11px;
  font-weight: 750;
}

.change-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  margin-bottom: 12px;
  padding: 11px 13px;
  text-align: left;
  color: var(--alert);
  background: var(--alert-soft);
  border: 1px solid color-mix(in srgb, var(--alert) 25%, transparent);
  border-radius: 14px;
  font-size: 13px;
  font-weight: 650;
}

.change-banner-badge {
  flex: none;
  min-width: 24px;
  padding: 3px 7px;
  border-radius: 999px;
  color: var(--alert-soft);
  background: var(--alert);
  text-align: center;
  font-size: 11px;
}

.timeline {
  display: grid;
  gap: 0;
  margin-top: 8px;
}

.timeline-row {
  display: grid;
  grid-template-columns: 58px 18px minmax(0, 1fr);
  gap: 8px;
  min-height: 76px;
}

.timeline-time {
  padding-top: 13px;
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  line-height: 1.35;
}

.timeline-rail {
  position: relative;
}

.timeline-rail::before {
  content: "";
  position: absolute;
  top: 18px;
  bottom: -18px;
  left: 8px;
  width: 1px;
  background: var(--border);
}

.timeline-dot {
  position: absolute;
  top: 17px;
  left: 4px;
  width: 9px;
  height: 9px;
  border: 2px solid var(--surface);
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 1px var(--primary);
}

.timeline-content {
  margin-bottom: 8px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 15px;
  background: var(--surface);
  text-align: left;
  color: var(--text);
}

.timeline-content.is-current {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.now-marker {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0 8px 76px;
  color: var(--alert);
  font-size: 11px;
  font-weight: 750;
}

.now-marker::after {
  content: "";
  height: 1px;
  flex: 1;
  background: var(--alert);
  opacity: 0.45;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
  margin-bottom: 16px;
}

.stat-card {
  min-height: 88px;
  padding: 13px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
}

.stat-label {
  color: var(--muted);
  font-size: 11px;
}

.stat-value {
  margin-top: 8px;
  font-size: 18px;
  font-weight: 750;
  line-height: 1.2;
  letter-spacing: -0.03em;
}

.stat-value.is-alert {
  color: var(--alert);
}

.week-strip {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 5px;
  margin: 4px 0 16px;
}

.week-day {
  min-width: 0;
  min-height: 58px;
  padding: 8px 2px;
  border: 1px solid transparent;
  border-radius: 13px;
  color: var(--muted);
  background: transparent;
  font-size: 11px;
  text-align: center;
}

.week-day strong {
  display: block;
  margin-top: 5px;
  color: var(--text);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.week-day.is-today {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-soft);
}

.week-day.has-course strong::after {
  content: "";
  display: block;
  width: 4px;
  height: 4px;
  margin: 4px auto 0;
  border-radius: 50%;
  background: var(--primary);
}

.bottom-nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  width: min(100%, 920px);
  margin: 0 auto;
  padding: 7px 10px calc(7px + env(safe-area-inset-bottom));
  background: var(--nav-bg);
  border-top: 1px solid var(--border);
  backdrop-filter: blur(18px);
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 52px;
  border: 0;
  border-radius: 13px;
  color: var(--muted);
  background: transparent;
  font-size: 11px;
  font-weight: 650;
}

.nav-item.is-active {
  color: var(--primary);
  background: var(--primary-soft);
}

.nav-glyph {
  font-size: 17px;
  line-height: 1;
}

.segmented {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}

.segmented button {
  min-height: 38px;
  padding: 7px 12px;
  border: 0;
  border-radius: 9px;
  color: var(--muted);
  background: transparent;
  font-size: 12px;
  font-weight: 650;
}

.segmented button.is-active {
  color: var(--text);
  background: var(--primary-soft);
}

.week-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.week-nav {
  display: flex;
  align-items: center;
  gap: 5px;
}

.week-label {
  min-width: 82px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
}

.week-grid-wrap {
  overflow-x: auto;
  padding-bottom: 8px;
  -webkit-overflow-scrolling: touch;
}

.week-grid {
  display: grid;
  grid-template-columns: 52px repeat(7, minmax(94px, 1fr));
  grid-template-rows: auto repeat(13, minmax(52px, auto));
  min-width: 760px;
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
  background: var(--surface);
}

.week-head {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 10px 4px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  background: var(--surface);
  font-size: 11px;
  text-align: center;
}

.week-head.is-today {
  color: var(--primary);
  background: var(--primary-soft);
  font-weight: 750;
}

.time-cell {
  position: sticky;
  left: 0;
  z-index: 1;
  display: grid;
  place-content: center;
  gap: 2px;
  padding: 4px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  background: var(--surface);
  font-size: 10px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.course-block {
  z-index: 2;
  margin: 3px;
  padding: 7px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--primary) 22%, transparent);
  border-radius: 10px;
  color: var(--text);
  background: var(--primary-soft);
  text-align: left;
  font-size: 11px;
  line-height: 1.25;
}

.course-block strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.course-block span {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.day-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 15px;
}

.day-chip {
  min-height: 62px;
  padding: 7px 2px;
  border: 1px solid var(--border);
  border-radius: 13px;
  color: var(--muted);
  background: var(--surface);
  font-size: 11px;
  text-align: center;
}

.day-chip strong {
  display: block;
  margin-top: 5px;
  color: var(--text);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.day-chip.is-selected {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.day-list {
  display: grid;
  gap: 8px;
}

.gap-row {
  padding: 4px 12px;
  color: var(--muted);
  font-size: 11px;
  text-align: center;
}

.changes-list {
  display: grid;
  gap: 18px;
}

.change-group-title {
  margin-bottom: 7px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
}

.change-group-items {
  display: grid;
  gap: 8px;
}

.change-item {
  display: flex;
  gap: 11px;
  padding: 13px;
  border: 1px solid var(--border);
  border-radius: 15px;
  background: var(--surface);
}

.change-type {
  flex: none;
  align-self: flex-start;
  min-width: 44px;
  padding: 3px 7px;
  border-radius: 7px;
  color: var(--primary);
  background: var(--primary-soft);
  font-size: 10px;
  font-weight: 750;
  text-align: center;
}

.change-type.is-removed {
  color: var(--alert);
  background: var(--alert-soft);
}

.change-body {
  min-width: 0;
  flex: 1;
}

.change-summary {
  font-size: 13px;
  line-height: 1.55;
}

.change-time {
  margin-top: 4px;
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.unread-dot {
  flex: none;
  width: 7px;
  height: 7px;
  margin-top: 7px;
  border-radius: 50%;
  background: var(--alert);
}

.empty-state,
.error-state {
  display: grid;
  justify-items: center;
  gap: 9px;
  padding: 42px 18px;
  color: var(--muted);
  text-align: center;
}

.empty-state strong,
.error-state strong {
  color: var(--text);
  font-size: 17px;
}

.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: var(--scrim);
}

.sheet {
  width: min(100%, 620px);
  max-height: 88dvh;
  overflow-y: auto;
  padding: 10px 18px calc(20px + env(safe-area-inset-bottom));
  border-radius: 22px 22px 0 0;
  background: var(--surface);
  box-shadow: 0 -18px 50px rgba(0, 0, 0, 0.2);
}

.sheet-handle {
  width: 38px;
  height: 4px;
  margin: 0 auto 14px;
  border-radius: 999px;
  background: var(--border);
}

.sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.sheet-title {
  font-size: 21px;
  letter-spacing: -0.03em;
}

.sheet-close {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface);
  font-size: 20px;
}

.sheet-meta {
  display: grid;
  gap: 8px;
  margin-top: 16px;
  color: var(--muted);
  font-size: 13px;
}

.sheet-meta strong {
  color: var(--text);
  font-weight: 650;
}

.layout-options {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

.layout-option {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  min-height: 76px;
  padding: 11px;
  border: 1px solid var(--border);
  border-radius: 15px;
  background: var(--surface);
  text-align: left;
}

.layout-option.is-active {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.layout-copy {
  flex: 1;
}

.layout-copy strong {
  display: block;
  font-size: 14px;
}

.layout-copy span {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
}

.layout-preview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  width: 54px;
  height: 44px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
}

.layout-preview span {
  border-radius: 3px;
  background: var(--primary);
  opacity: 0.28;
}

.layout-preview span:first-child {
  grid-column: 1 / -1;
  opacity: 0.6;
}

.layout-preview.is-focus span:nth-child(2) {
  grid-column: 1 / -1;
  height: 16px;
  opacity: 0.85;
}

.layout-preview.is-timeline {
  grid-template-columns: 12px 1fr;
}

.layout-preview.is-timeline span:first-child {
  grid-column: auto;
  grid-row: 1 / -1;
}

.layout-preview.is-compact {
  grid-template-columns: repeat(3, 1fr);
}

.layout-preview.is-compact span:first-child {
  grid-column: 1 / -1;
}

.form {
  display: grid;
  gap: 15px;
}

.form-field {
  display: grid;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 650;
}

.input,
.select {
  width: 100%;
  min-height: 46px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text);
  background: var(--surface);
}

.input::placeholder {
  color: var(--muted);
}

.form-hint {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}

.form-error {
  padding: 10px 12px;
  border-radius: 11px;
  color: var(--alert);
  background: var(--alert-soft);
  font-size: 12px;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}

.setup-shell {
  display: grid;
  align-content: center;
  min-height: 100dvh;
  padding: 28px 18px;
}

.setup-card {
  width: min(100%, 520px);
  margin: 0 auto;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 22px;
  background: var(--surface);
  box-shadow: var(--shadow);
}

.setup-title {
  margin-top: 10px;
  font-size: 28px;
  letter-spacing: -0.04em;
}

.setup-subtitle {
  margin-top: 8px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

.steps {
  display: flex;
  gap: 6px;
  margin: 20px 0;
}

.step-dot {
  height: 4px;
  flex: 1;
  border-radius: 999px;
  background: var(--border);
}

.step-dot.is-active {
  background: var(--primary);
}

.settings-page {
  display: grid;
  gap: 14px;
}

.settings-section {
  padding: 17px;
  border: 1px solid var(--border);
  border-radius: 17px;
  background: var(--surface);
}

.settings-section h3 {
  font-size: 15px;
  letter-spacing: -0.01em;
}

.settings-section .form {
  margin-top: 14px;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 44px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.settings-row:last-child {
  border-bottom: 0;
}

.settings-value {
  color: var(--muted);
  text-align: right;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.settings-value.is-ok {
  color: var(--primary);
}

.settings-value.is-alert {
  color: var(--alert);
}

.theme-picker {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin-top: 12px;
}

.theme-choice {
  display: grid;
  gap: 8px;
  min-height: 74px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--bg);
  text-align: left;
  font-size: 12px;
}

.theme-choice.is-active {
  border-color: var(--primary);
  box-shadow: inset 0 0 0 1px var(--primary);
}

.theme-swatch {
  display: flex;
  gap: 4px;
}

.theme-swatch span {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--border);
}

.theme-swatch .swatch-bg {
  background: var(--bg);
}

.theme-swatch .swatch-primary {
  background: var(--primary);
}

.theme-swatch .swatch-hero {
  background: var(--hero-bg);
}

.loading-screen {
  display: grid;
  place-items: center;
  gap: 12px;
  min-height: 100dvh;
  color: var(--muted);
  font-size: 13px;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (min-width: 720px) {
  .page {
    padding: 26px 28px 12px;
  }

  .topbar {
    padding-right: 28px;
    padding-left: 28px;
  }

  .hero-card {
    padding: 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 6: Run the theme test and type-check the current files**

```bash
cd frontend
npm run test -- src/lib/__tests__/theme.test.ts src/lib/__tests__/storage.test.ts
npx tsc --noEmit
cd ..
```

Expected: `5 passed`; TypeScript has no errors (the entry components are added in Task 16).

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/tsconfig.json frontend/vite.config.ts frontend/vitest.config.ts frontend/index.html frontend/src/test/setup.ts frontend/src/types.ts frontend/src/lib/theme.ts frontend/src/lib/storage.ts frontend/src/lib/__tests__/theme.test.ts frontend/src/lib/__tests__/storage.test.ts frontend/src/styles/themes.css frontend/src/styles.css
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "feat: add frontend scaffold, themes, and preference storage"
```

---

### Task 13: Schedule calculations and their tests

**Files:**
- Create: `frontend/src/lib/schedule.ts`, `frontend/src/lib/__tests__/schedule.test.ts`

- [ ] **Step 1: Write failing schedule tests**

```ts
// frontend/src/lib/__tests__/schedule.test.ts
import { describe, expect, it } from 'vitest';
import type { CourseSession, ScheduleSnapshot } from '../../types';
import {
  buildTodayModel,
  changeDateKey,
  coursesForDate,
  formatCountdown,
  groupChangesByDate,
  unreadChangeCount,
  weekDates,
  weekForDate,
} from '../schedule';

const PERIODS = [
  ['08:00', '08:45'],
  ['08:50', '09:35'],
  ['09:55', '10:40'],
  ['10:45', '11:30'],
  ['11:35', '12:20'],
  ['13:20', '14:05'],
  ['14:10', '14:55'],
  ['15:15', '16:00'],
  ['16:05', '16:50'],
  ['16:55', '17:40'],
  ['18:30', '19:15'],
  ['19:20', '20:05'],
  ['20:10', '20:55'],
].map(([start, end], index) => ({ index: index + 1, start, end }));

function course(overrides: Partial<CourseSession> = {}): CourseSession {
  return {
    course_code: 'MATH101',
    course_name: '高等数学',
    teacher: '李老师',
    room: 'A101',
    campus: '良乡',
    weekday: 1,
    start_period: 1,
    end_period: 2,
    weeks: [9],
    raw_time_text: '',
    ...overrides,
  };
}

function snapshot(overrides: Partial<ScheduleSnapshot> = {}): ScheduleSnapshot {
  return {
    schema_version: 1,
    app_version: '0.1.0',
    synced_at: '2026-10-26T08:00:00+08:00',
    sync_interval_days: 1,
    term: '2026-2027-1',
    first_day: '2026-08-31',
    courses: [
      course(),
      course({
        course_code: 'PHY101',
        course_name: '大学物理',
        room: 'B202',
        start_period: 3,
        end_period: 4,
      }),
    ],
    changes: [
      {
        id: 2,
        detected_at: '2026-10-26T08:00:00+08:00',
        type: 'modified',
        course_code: 'MATH101',
        course_name: '高等数学',
        summary: '高等数学：调整 教室 A101 → B202',
        before: null,
        after: null,
      },
      {
        id: 1,
        detected_at: '2026-10-25T08:00:00+08:00',
        type: 'added',
        course_code: 'PHY101',
        course_name: '大学物理',
        summary: '新增：周一 3-4 节 大学物理',
        before: null,
        after: null,
      },
    ],
    calendar: [{ date: '2026-10-26', week: 9, weekday: 1 }],
    period_times: PERIODS,
    ...overrides,
  };
}

describe('Shanghai date and week calculations', () => {
  it('uses the Asia/Shanghai date for the today view', () => {
    expect(weekForDate(snapshot(), '2026-10-26')).toEqual({
      week: 9,
      weekday: 1,
      estimated: false,
    });
  });

  it('falls back to first_day arithmetic and labels it estimated', () => {
    expect(weekForDate(snapshot({ calendar: [] }), '2026-10-26')).toEqual({
      week: 9,
      weekday: 1,
      estimated: true,
    });
  });

  it('builds Monday-to-Sunday dates for a week', () => {
    expect(weekDates('2026-08-31', 9)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });
});

describe('today state', () => {
  it('reports an ongoing class', () => {
    const model = buildTodayModel(
      snapshot(),
      new Date('2026-10-26T08:10:00+08:00'),
    );
    if (model.state.kind !== 'ongoing') throw new Error('expected ongoing');
    expect(model.state.course.course_code).toBe('MATH101');
    expect(model.sessions).toHaveLength(2);
  });

  it('reports the next class and a countdown', () => {
    const model = buildTodayModel(
      snapshot(),
      new Date('2026-10-26T09:40:00+08:00'),
    );
    if (model.state.kind !== 'upcoming') throw new Error('expected upcoming');
    expect(model.state.course.course_code).toBe('PHY101');
    expect(model.state.minutesUntil).toBe(15);
  });

  it('reports finished after the last class', () => {
    const model = buildTodayModel(
      snapshot(),
      new Date('2026-10-26T12:30:00+08:00'),
    );
    expect(model.state.kind).toBe('finished');
  });

  it('reports an empty day when no course matches the week', () => {
    const model = buildTodayModel(
      snapshot(),
      new Date('2026-10-27T09:00:00+08:00'),
    );
    expect(model.state.kind).toBe('empty');
    expect(model.sessions).toEqual([]);
  });

  it('filters courses by date and week', () => {
    expect(coursesForDate(snapshot(), '2026-10-26')).toHaveLength(2);
    expect(coursesForDate(snapshot({ courses: [course({ weeks: [8] })] }), '2026-10-26')).toHaveLength(0);
  });
});

describe('changes and formatting', () => {
  it('counts unread changes by id', () => {
    expect(unreadChangeCount(snapshot().changes, 1)).toBe(1);
    expect(unreadChangeCount(snapshot().changes, 2)).toBe(0);
  });

  it('groups changes by Shanghai date in descending order', () => {
    const groups = groupChangesByDate(snapshot().changes);
    expect(groups.map((group) => group.date)).toEqual(['2026-10-26', '2026-10-25']);
    expect(changeDateKey(snapshot().changes[0])).toBe('2026-10-26');
  });

  it('formats countdowns compactly', () => {
    expect(formatCountdown(1)).toBe('还有 1 分钟');
    expect(formatCountdown(25)).toBe('还有 25 分钟');
    expect(formatCountdown(60)).toBe('还有 1 小时');
    expect(formatCountdown(75)).toBe('还有 1 小时 15 分钟');
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

```bash
cd frontend
npm run test -- src/lib/__tests__/schedule.test.ts
cd ..
```

Expected: import error for `../schedule`.

- [ ] **Step 3: Implement schedule calculations**

```ts
// frontend/src/lib/schedule.ts
import type {
  CalendarEntry,
  ChangeRecord,
  CourseSession,
  PeriodTime,
  ScheduleSnapshot,
} from '../types';

const SHANGHAI = 'Asia/Shanghai';
const WEEKDAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export interface WeekInfo {
  week: number;
  weekday: number;
  estimated: boolean;
}

export type TodayState =
  | { kind: 'ongoing'; course: CourseSession; start: Date; end: Date }
  | {
      kind: 'upcoming';
      course: CourseSession;
      start: Date;
      end: Date;
      minutesUntil: number;
    }
  | { kind: 'finished' }
  | { kind: 'empty' };

export interface TodayModel {
  date: string;
  week: number;
  weekday: number;
  estimatedWeek: boolean;
  sessions: CourseSession[];
  state: TodayState;
}

export function dateKeyInShanghai(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function addDays(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  return Math.round((parseDateKey(end).getTime() - parseDateKey(start).getTime()) / 86_400_000);
}

export function weekdayOf(key: string): number {
  return ((parseDateKey(key).getUTCDay() + 6) % 7) + 1;
}

export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? '';
}

export function formatDateLabel(key: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(parseDateKey(key));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: SHANGHAI,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function weekForDate(snapshot: ScheduleSnapshot, date: string): WeekInfo {
  const direct = snapshot.calendar.find((entry) => entry.date === date);
  if (direct) {
    return { week: direct.week, weekday: direct.weekday, estimated: false };
  }
  return {
    week: Math.floor(daysBetween(snapshot.first_day, date) / 7) + 1,
    weekday: weekdayOf(date),
    estimated: true,
  };
}

export function weekDates(firstDay: string, week: number): string[] {
  const start = addDays(firstDay, (week - 1) * 7);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function compareSessions(a: CourseSession, b: CourseSession): number {
  return (
    a.weekday - b.weekday ||
    a.start_period - b.start_period ||
    a.course_code.localeCompare(b.course_code) ||
    a.room.localeCompare(b.room)
  );
}

export function sessionKey(session: CourseSession): string {
  return [
    session.course_code,
    session.weekday,
    session.start_period,
    session.end_period,
    session.weeks.join('.'),
    session.room,
    session.teacher,
  ].join('|');
}

export function coursesForDate(
  snapshot: ScheduleSnapshot,
  date: string,
): CourseSession[] {
  const info = weekForDate(snapshot, date);
  return snapshot.courses
    .filter((course) => course.weekday === info.weekday && course.weeks.includes(info.week))
    .sort(compareSessions);
}

export function coursesForWeek(
  snapshot: ScheduleSnapshot,
  week: number,
): CourseSession[] {
  return snapshot.courses
    .filter((course) => course.weeks.includes(week))
    .sort(compareSessions);
}

export function periodTime(snapshot: ScheduleSnapshot, index: number): PeriodTime {
  const period = snapshot.period_times.find((item) => item.index === index);
  if (!period) {
    throw new Error(`缺少第 ${index} 节的作息时间`);
  }
  return period;
}

export function dateTimeFor(date: string, clock: string): Date {
  return new Date(`${date}T${clock}:00+08:00`);
}

export function sessionStart(
  snapshot: ScheduleSnapshot,
  session: CourseSession,
  date: string,
): Date {
  return dateTimeFor(date, periodTime(snapshot, session.start_period).start);
}

export function sessionEnd(
  snapshot: ScheduleSnapshot,
  session: CourseSession,
  date: string,
): Date {
  return dateTimeFor(date, periodTime(snapshot, session.end_period).end);
}

export function buildTodayModel(
  snapshot: ScheduleSnapshot,
  now: Date,
): TodayModel {
  const date = dateKeyInShanghai(now);
  const info = weekForDate(snapshot, date);
  const sessions = coursesForDate(snapshot, date);
  const timed = sessions.map((course) => ({
    course,
    start: sessionStart(snapshot, course, date),
    end: sessionEnd(snapshot, course, date),
  }));

  const ongoing = timed.find(
    (item) => item.start.getTime() <= now.getTime() && now.getTime() < item.end.getTime(),
  );
  if (ongoing) {
    return {
      date,
      week: info.week,
      weekday: info.weekday,
      estimatedWeek: info.estimated,
      sessions,
      state: { kind: 'ongoing', ...ongoing },
    };
  }

  const upcoming = timed.find((item) => item.start.getTime() > now.getTime());
  if (upcoming) {
    const minutesUntil = Math.max(
      1,
      Math.ceil((upcoming.start.getTime() - now.getTime()) / 60_000),
    );
    return {
      date,
      week: info.week,
      weekday: info.weekday,
      estimatedWeek: info.estimated,
      sessions,
      state: { kind: 'upcoming', ...upcoming, minutesUntil },
    };
  }

  return {
    date,
    week: info.week,
    weekday: info.weekday,
    estimatedWeek: info.estimated,
    sessions,
    state: sessions.length > 0 ? { kind: 'finished' } : { kind: 'empty' },
  };
}

export function formatCountdown(minutes: number): string {
  if (minutes < 60) {
    return `还有 ${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `还有 ${hours} 小时 ${rest} 分钟` : `还有 ${hours} 小时`;
}

export function unreadChangeCount(changes: ChangeRecord[], lastSeenId: number): number {
  return changes.filter((change) => change.id > lastSeenId).length;
}

export function maxChangeId(changes: ChangeRecord[]): number {
  return changes.reduce((max, change) => Math.max(max, change.id), 0);
}

export function changeDateKey(change: ChangeRecord): string {
  return dateKeyInShanghai(new Date(change.detected_at));
}

export function groupChangesByDate(
  changes: ChangeRecord[],
): Array<{ date: string; items: ChangeRecord[] }> {
  const groups = new Map<string, ChangeRecord[]>();
  for (const change of changes) {
    const key = changeDateKey(change);
    const bucket = groups.get(key) ?? [];
    bucket.push(change);
    groups.set(key, bucket);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }));
}

export function changeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    added: '新增',
    removed: '取消',
    modified: '调整',
    term_rollover: '学期切换',
    term_start_changed: '起始日',
    empty_confirmed: '空课表',
  };
  return labels[type] ?? '变动';
}

export function currentWeek(snapshot: ScheduleSnapshot, date: string): number {
  return weekForDate(snapshot, date).week;
}

export function calendarEntryFor(
  snapshot: ScheduleSnapshot,
  date: string,
): CalendarEntry | undefined {
  return snapshot.calendar.find((entry) => entry.date === date);
}
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
cd frontend
npm run test -- src/lib/__tests__/schedule.test.ts
cd ..
```

Expected: `11 passed`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/schedule.ts frontend/src/lib/__tests__/schedule.test.ts
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "feat: calculate today, next class, weeks, and unread changes"
```

---

### Task 14: Shared shell and the three Today layouts

**Files:**
- Create: `frontend/src/shared/AppShell.tsx`, `frontend/src/shared/BottomNav.tsx`, `frontend/src/shared/StaleBadge.tsx`, `frontend/src/shared/Sheet.tsx`, `frontend/src/shared/TodayPage.tsx`, `frontend/src/shared/today/ChangeBanner.tsx`, `frontend/src/shared/today/TodayFocus.tsx`, `frontend/src/shared/today/TodayTimeline.tsx`, `frontend/src/shared/today/TodayCompact.tsx`, `frontend/src/shared/today/CourseDetailSheet.tsx`, `frontend/src/shared/today/LayoutSheet.tsx`, `frontend/src/shared/__tests__/today.test.tsx`
- Modify: `frontend/src/styles.css` (append button-reset and text-display rules)

- [ ] **Step 1: Write failing Today-layout tests**

```tsx
// frontend/src/shared/__tests__/today.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CourseSession, ScheduleSnapshot } from '../../types';
import { TodayPage } from '../TodayPage';
import { StaleBadge } from '../StaleBadge';
import { CourseDetailSheet } from '../today/CourseDetailSheet';
import { LayoutSheet } from '../today/LayoutSheet';

const COURSE: CourseSession = {
  course_code: 'MATH101',
  course_name: '高等数学',
  teacher: '李老师',
  room: 'A101',
  campus: '良乡',
  weekday: 1,
  start_period: 1,
  end_period: 2,
  weeks: [9],
  raw_time_text: '周一第1-2节{第9周}',
};

const PERIODS = [
  ['08:00', '08:45'],
  ['08:50', '09:35'],
  ['09:55', '10:40'],
  ['10:45', '11:30'],
  ['11:35', '12:20'],
  ['13:20', '14:05'],
  ['14:10', '14:55'],
  ['15:15', '16:00'],
  ['16:05', '16:50'],
  ['16:55', '17:40'],
  ['18:30', '19:15'],
  ['19:20', '20:05'],
  ['20:10', '20:55'],
].map(([start, end], index) => ({ index: index + 1, start, end }));

const SNAPSHOT: ScheduleSnapshot = {
  schema_version: 1,
  app_version: '0.1.0',
  synced_at: '2026-10-26T08:00:00+08:00',
  sync_interval_days: 1,
  term: '2026-2027-1',
  first_day: '2026-08-31',
  courses: [
    COURSE,
    { ...COURSE, course_code: 'PHY101', course_name: '大学物理', room: 'B202', start_period: 3, end_period: 4 },
  ],
  changes: [
    {
      id: 1,
      detected_at: '2026-10-26T08:00:00+08:00',
      type: 'modified',
      course_code: 'MATH101',
      course_name: '高等数学',
      summary: '高等数学：调整 教室 A101 → B202',
      before: null,
      after: null,
    },
  ],
  calendar: [{ date: '2026-10-26', week: 9, weekday: 1 }],
  period_times: PERIODS,
};

const NOW = new Date('2026-10-26T08:10:00+08:00');

function renderToday(
  layout: 'focus' | 'timeline' | 'compact',
  options: { now?: Date; snapshot?: ScheduleSnapshot } = {},
) {
  const onOpenCourse = vi.fn();
  const onOpenLayout = vi.fn();
  const onOpenChanges = vi.fn();
  const onGoWeek = vi.fn();
  render(
    <TodayPage
      snapshot={options.snapshot ?? SNAPSHOT}
      now={options.now ?? NOW}
      layout={layout}
      unreadCount={1}
      onOpenCourse={onOpenCourse}
      onOpenLayout={onOpenLayout}
      onOpenChanges={onOpenChanges}
      onGoWeek={onGoWeek}
    />,
  );
  return { onOpenCourse, onOpenLayout, onOpenChanges, onGoWeek };
}

describe('Today layouts', () => {
  it('renders focus mode with the ongoing class', async () => {
    const { onOpenCourse } = renderToday('focus');
    expect(screen.getByText('正在上')).toBeInTheDocument();
    expect(screen.getAllByText('高等数学').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: /正在上/ }));
    expect(onOpenCourse).toHaveBeenCalledWith(COURSE);
  });

  it('renders timeline mode and opens a course', async () => {
    const { onOpenCourse } = renderToday('timeline');
    expect(screen.getByText('今日概览')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /大学物理/ })[0]);
    expect(onOpenCourse).toHaveBeenCalledWith(
      expect.objectContaining({ course_code: 'PHY101' }),
    );
  });

  it('renders compact mode with summary blocks', () => {
    renderToday('compact');
    expect(screen.getByText('下一节')).toBeInTheDocument();
    expect(screen.getByText('今日节数')).toBeInTheDocument();
    expect(screen.getByText('变动数')).toBeInTheDocument();
  });

  it('connects the change banner and layout button', async () => {
    const { onOpenChanges, onOpenLayout } = renderToday('focus');
    await userEvent.click(screen.getByRole('button', { name: /1 条新变动/ }));
    expect(onOpenChanges).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '布局' }));
    expect(onOpenLayout).toHaveBeenCalled();
  });

  it('renders the finished state after the last class', () => {
    renderToday('focus', { now: new Date('2026-10-26T12:30:00+08:00') });
    expect(screen.getByText('今天的课结束了')).toBeInTheDocument();
  });

  it('renders the empty state when no course matches today', () => {
    renderToday('focus', {
      snapshot: { ...SNAPSHOT, courses: [] },
      now: new Date('2026-10-26T09:00:00+08:00'),
    });
    expect(screen.getByText('今天没课')).toBeInTheDocument();
  });

  it('marks stale snapshots in the header badge', () => {
    render(
      <StaleBadge
        snapshot={{ ...SNAPSHOT, synced_at: '2020-01-01T08:00:00+08:00' }}
      />,
    );
    expect(screen.getByText('数据可能已过期')).toBeInTheDocument();
  });
});

describe('sheets', () => {
  it('selects a Today layout', async () => {
    const onSelect = vi.fn();
    render(<LayoutSheet layout="focus" onSelect={onSelect} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /时间轴/ }));
    expect(onSelect).toHaveBeenCalledWith('timeline');
  });

  it('shows course details and closes with Escape', async () => {
    const onClose = vi.fn();
    render(<CourseDetailSheet course={COURSE} onClose={onClose} />);
    expect(screen.getByRole('heading', { name: '高等数学' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

```bash
cd frontend
npm run test -- src/shared/__tests__/today.test.tsx
cd ..
```

Expected: import errors for the shared components.

- [ ] **Step 3: Add shell, navigation, stale badge, and sheet primitives**

```tsx
// frontend/src/shared/BottomNav.tsx
export type PageKey = 'today' | 'week' | 'changes' | 'settings' | 'device';

interface BottomNavProps {
  page: PageKey;
  onChange: (page: PageKey) => void;
  cloudMode?: boolean;
}

const NAV_ITEMS = {
  today: { label: '今天', glyph: '今' },
  week: { label: '周课表', glyph: '周' },
  changes: { label: '变动', glyph: '变' },
  settings: { label: '设置', glyph: '设' },
  device: { label: '设备', glyph: '机' },
} as const;

export function BottomNav({ page, onChange, cloudMode = false }: BottomNavProps) {
  const keys: PageKey[] = cloudMode
    ? ['today', 'week', 'changes', 'device']
    : ['today', 'week', 'changes', 'settings'];

  return (
    <nav className="bottom-nav" aria-label="主导航">
      {keys.map((key) => {
        const item = NAV_ITEMS[key];
        return (
          <button
            key={key}
            type="button"
            className={`nav-item ${page === key ? 'is-active' : ''}`}
            aria-current={page === key ? 'page' : undefined}
            onClick={() => onChange(key)}
          >
            <span className="nav-glyph" aria-hidden="true">{item.glyph}</span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
```

```tsx
// frontend/src/shared/StaleBadge.tsx
import type { ScheduleSnapshot } from '../types';
import { formatDateTime } from '../lib/schedule';

export function StaleBadge({ snapshot }: { snapshot: ScheduleSnapshot | null }) {
  if (!snapshot) {
    return <span className="status-chip">尚未同步</span>;
  }
  const ageHours = (Date.now() - new Date(snapshot.synced_at).getTime()) / 3_600_000;
  const stale = ageHours > snapshot.sync_interval_days * 24 + 24;
  return (
    <span className={`status-chip ${stale ? 'is-alert' : ''}`}>
      {stale ? '数据可能已过期' : `同步于 ${formatDateTime(snapshot.synced_at)}`}
    </span>
  );
}
```

```tsx
// frontend/src/shared/AppShell.tsx
import type { ReactNode } from 'react';
import type { ScheduleSnapshot } from '../types';
import { BottomNav, type PageKey } from './BottomNav';
import { StaleBadge } from './StaleBadge';

interface AppShellProps {
  snapshot: ScheduleSnapshot | null;
  page: PageKey;
  onNavigate: (page: PageKey) => void;
  cloudMode?: boolean;
  statusChip?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  snapshot,
  page,
  onNavigate,
  cloudMode = false,
  statusChip,
  children,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">下一节</span>
          <span className="brand-caption">{cloudMode ? '只读快照' : '本地课表'}</span>
        </div>
        {statusChip ?? <StaleBadge snapshot={snapshot} />}
      </header>
      <main className="page">{children}</main>
      <BottomNav page={page} onChange={onNavigate} cloudMode={cloudMode} />
    </div>
  );
}
```

```tsx
// frontend/src/shared/Sheet.tsx
import { useEffect, useId, type ReactNode } from 'react';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Sheet({ title, onClose, children }: SheetProps) {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="sheet-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2 className="sheet-title" id={titleId}>{title}</h2>
          <button type="button" className="sheet-close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Add the Today page and its three presentation components**

```tsx
// frontend/src/shared/today/ChangeBanner.tsx
interface ChangeBannerProps {
  count: number;
  onClick: () => void;
}

export function ChangeBanner({ count, onClick }: ChangeBannerProps) {
  return (
    <button type="button" className="change-banner" onClick={onClick}>
      <span>有 {count} 条新变动</span>
      <span className="change-banner-badge">{count}</span>
    </button>
  );
}
```

```tsx
// frontend/src/shared/today/TodayFocus.tsx
import type { CourseSession, ScheduleSnapshot } from '../../types';
import {
  formatCountdown,
  periodTime,
  sessionKey,
  type TodayModel,
} from '../../lib/schedule';

interface TodayFocusProps {
  snapshot: ScheduleSnapshot;
  model: TodayModel;
  now: Date;
  onOpenCourse: (course: CourseSession) => void;
  onGoWeek: () => void;
}

export function TodayFocus({
  snapshot,
  model,
  now,
  onOpenCourse,
  onGoWeek,
}: TodayFocusProps) {
  const { state } = model;
  const course =
    state.kind === 'ongoing' || state.kind === 'upcoming' ? state.course : null;

  return (
    <>
      {course ? (
        <button
          type="button"
          className="hero-card"
          onClick={() => onOpenCourse(course)}
        >
          <div className="hero-top">
            <span className="hero-label">
              {state.kind === 'ongoing' ? '正在上' : '下一节'}
            </span>
            <span className="hero-time">
              {periodTime(snapshot, course.start_period).start} –{' '}
              {periodTime(snapshot, course.end_period).end}
            </span>
          </div>
          <div className="hero-course">{course.course_name}</div>
          <div className="hero-meta">
            <span>{course.room || '教室待定'}</span>
            <span>{course.teacher || '教师待定'}</span>
          </div>
          <div className="hero-countdown">
            {state.kind === 'ongoing'
              ? `还有 ${Math.max(1, Math.ceil((state.end.getTime() - now.getTime()) / 60_000))} 分钟下课`
              : state.kind === 'upcoming'
                ? formatCountdown(state.minutesUntil)
                : ''}
          </div>
        </button>
      ) : (
        <div className="hero-card is-muted">
          <div className="hero-top">
            <span className="hero-label">
              {state.kind === 'finished' ? '今天的课结束了' : '今天没课'}
            </span>
          </div>
          <div className="hero-course">
            {state.kind === 'finished' ? '慢一点，也很好' : '留一点空白给今天'}
          </div>
          <p className="hero-meta">
            {state.kind === 'finished'
              ? '所有课程都已结束，可以安心安排自己的时间。'
              : '今天没有排课，看看周课表或做点别的事。'}
          </p>
          <div className="hero-actions">
            <button type="button" className="button" onClick={onGoWeek}>
              查看周课表
            </button>
          </div>
        </div>
      )}

      <div className="section-head">
        <h3 className="section-title">今日时间轴</h3>
        <span className="muted">{model.sessions.length} 节</span>
      </div>
      {model.sessions.length === 0 ? (
        <div className="empty-state">
          <strong>今天没有课</strong>
          <span>可以打开周课表看看接下来的安排。</span>
        </div>
      ) : (
        <div className="timeline">
          {model.sessions.map((session) => {
            const isCurrent =
              state.kind === 'ongoing' && state.course === session;
            return (
              <div
                className="timeline-row"
                key={sessionKey(session)}
              >
                <div className="timeline-time">
                  {periodTime(snapshot, session.start_period).start}
                  <br />
                  {periodTime(snapshot, session.end_period).end}
                </div>
                <div className="timeline-rail">
                  <span className="timeline-dot" />
                </div>
                <button
                  type="button"
                  className={`timeline-content ${isCurrent ? 'is-current' : ''}`}
                  onClick={() => onOpenCourse(session)}
                >
                  <strong>{session.course_name}</strong>
                  <div className="course-meta">
                    {session.room || '教室待定'} · {session.teacher || '教师待定'}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
```

```tsx
// frontend/src/shared/today/TodayTimeline.tsx
import { Fragment } from 'react';
import type { CourseSession, ScheduleSnapshot } from '../../types';
import {
  formatCountdown,
  periodTime,
  sessionKey,
  type TodayModel,
} from '../../lib/schedule';

interface TodayTimelineProps {
  snapshot: ScheduleSnapshot;
  model: TodayModel;
  now: Date;
  onOpenCourse: (course: CourseSession) => void;
}

export function TodayTimeline({
  snapshot,
  model,
  now,
  onOpenCourse,
}: TodayTimelineProps) {
  const { state } = model;
  const nextCourse =
    state.kind === 'ongoing' || state.kind === 'upcoming' ? state.course : null;
  const nextLabel =
    state.kind === 'ongoing'
      ? '正在上'
      : state.kind === 'upcoming'
        ? formatCountdown(state.minutesUntil)
        : state.kind === 'finished'
          ? '已结束'
          : '无课';

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">下一节</div>
          <div className="stat-value">
            {nextCourse ? nextCourse.course_name : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">今日节数</div>
          <div className="stat-value">{model.sessions.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">现在</div>
          <div className="stat-value">{nextLabel}</div>
        </div>
      </div>

      <div className="section-head">
        <h3 className="section-title">今日概览</h3>
        <span className="muted">第 {model.week} 周</span>
      </div>
      {model.sessions.length === 0 ? (
        <div className="empty-state">
          <strong>今天没有课</strong>
          <span>去周课表看看这周的安排。</span>
        </div>
      ) : (
        <div className="timeline">
          {model.sessions.map((session) => {
            const marker =
              nextCourse === session
                ? state.kind === 'ongoing'
                  ? '正在上'
                  : state.kind === 'upcoming'
                    ? `下一节 · ${formatCountdown(state.minutesUntil)}`
                    : null
                : null;
            return (
              <Fragment key={sessionKey(session)}>
                {marker && <div className="now-marker">{marker}</div>}
                <div className="timeline-row">
                  <div className="timeline-time">
                    {periodTime(snapshot, session.start_period).start}
                    <br />
                    {periodTime(snapshot, session.end_period).end}
                  </div>
                  <div className="timeline-rail">
                    <span className="timeline-dot" />
                  </div>
                  <button
                    type="button"
                    className={`timeline-content ${nextCourse === session ? 'is-current' : ''}`}
                    onClick={() => onOpenCourse(session)}
                  >
                    <strong>{session.course_name}</strong>
                    <div className="course-meta">
                      {session.room || '教室待定'} · {session.teacher || '教师待定'}
                    </div>
                  </button>
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
      <p className="form-hint">现在时间：{now.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false })}</p>
    </>
  );
}
```

```tsx
// frontend/src/shared/today/TodayCompact.tsx
import type { CourseSession, ScheduleSnapshot } from '../../types';
import {
  coursesForDate,
  parseDateKey,
  periodTime,
  sessionKey,
  type TodayModel,
  weekDates,
  weekdayName,
} from '../../lib/schedule';
import { ChangeBanner } from './ChangeBanner';

interface TodayCompactProps {
  snapshot: ScheduleSnapshot;
  model: TodayModel;
  unreadCount: number;
  onOpenCourse: (course: CourseSession) => void;
  onOpenChanges: () => void;
}

export function TodayCompact({
  snapshot,
  model,
  unreadCount,
  onOpenCourse,
  onOpenChanges,
}: TodayCompactProps) {
  const dates = weekDates(snapshot.first_day, model.week);
  const next =
    model.state.kind === 'ongoing' || model.state.kind === 'upcoming'
      ? model.state.course
      : null;

  return (
    <>
      <div className="week-strip" aria-label="本周日期">
        {dates.map((date) => {
          const current = date === model.date;
          const count = coursesForDate(snapshot, date).length;
          return (
            <div
              className={`week-day ${current ? 'is-today' : ''} ${count > 0 ? 'has-course' : ''}`}
              key={date}
            >
              <span>{weekdayName(parseDateKey(date).getUTCDay() === 0 ? 7 : parseDateKey(date).getUTCDay())}</span>
              <strong>{parseDateKey(date).getUTCDate()}</strong>
            </div>
          );
        })}
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">下一节</div>
          <div className="stat-value">{next ? next.course_name : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">今日节数</div>
          <div className="stat-value">{model.sessions.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">变动数</div>
          <div className={`stat-value ${unreadCount > 0 ? 'is-alert' : ''}`}>
            {unreadCount}
          </div>
        </div>
      </div>

      {unreadCount > 0 && (
        <ChangeBanner count={unreadCount} onClick={onOpenChanges} />
      )}

      <div className="section-head">
        <h3 className="section-title">今天的课</h3>
        <span className="muted">{model.sessions.length} 节</span>
      </div>
      {model.sessions.length === 0 ? (
        <div className="empty-state">
          <strong>今天没有课</strong>
          <span>一屏看完，今天留给别的事。</span>
        </div>
      ) : (
        <div className="course-list">
          {model.sessions.map((session) => {
            const isCurrent =
              model.state.kind === 'ongoing' && model.state.course === session;
            return (
              <button
                type="button"
                className={`course-row ${isCurrent ? 'is-current' : ''}`}
                key={sessionKey(session)}
                onClick={() => onOpenCourse(session)}
              >
                <span className="course-time">
                  {periodTime(snapshot, session.start_period).start}
                  <br />
                  {periodTime(snapshot, session.end_period).end}
                </span>
                <span className="course-main">
                  <span className="course-name">{session.course_name}</span>
                  <span className="course-meta">
                    {session.room || '教室待定'} · {session.teacher || '教师待定'}
                  </span>
                </span>
                {isCurrent && <span className="course-status">正在上</span>}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 5: Add the Today page container, detail sheet, and layout sheet**

```tsx
// frontend/src/shared/TodayPage.tsx
import type { CourseSession, ScheduleSnapshot, TodayLayout } from '../types';
import { buildTodayModel, formatDateLabel } from '../lib/schedule';
import { ChangeBanner } from './today/ChangeBanner';
import { TodayCompact } from './today/TodayCompact';
import { TodayFocus } from './today/TodayFocus';
import { TodayTimeline } from './today/TodayTimeline';

interface TodayPageProps {
  snapshot: ScheduleSnapshot;
  now: Date;
  layout: TodayLayout;
  unreadCount: number;
  onOpenCourse: (course: CourseSession) => void;
  onOpenLayout: () => void;
  onOpenChanges: () => void;
  onGoWeek: () => void;
}

export function TodayPage({
  snapshot,
  now,
  layout,
  unreadCount,
  onOpenCourse,
  onOpenLayout,
  onOpenChanges,
  onGoWeek,
}: TodayPageProps) {
  const model = buildTodayModel(snapshot, now);

  return (
    <section className="today-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            {formatDateLabel(model.date)} · 第 {model.week} 周
            {model.estimatedWeek ? '（推算）' : ''}
          </p>
          <h2 className="page-title">今天</h2>
        </div>
        <button type="button" className="ghost-button" onClick={onOpenLayout}>
          布局
        </button>
      </header>

      {unreadCount > 0 && layout !== 'compact' && (
        <ChangeBanner count={unreadCount} onClick={onOpenChanges} />
      )}

      {layout === 'focus' && (
        <TodayFocus
          snapshot={snapshot}
          model={model}
          now={now}
          onOpenCourse={onOpenCourse}
          onGoWeek={onGoWeek}
        />
      )}
      {layout === 'timeline' && (
        <TodayTimeline
          snapshot={snapshot}
          model={model}
          now={now}
          onOpenCourse={onOpenCourse}
        />
      )}
      {layout === 'compact' && (
        <TodayCompact
          snapshot={snapshot}
          model={model}
          unreadCount={unreadCount}
          onOpenCourse={onOpenCourse}
          onOpenChanges={onOpenChanges}
        />
      )}
    </section>
  );
}
```

```tsx
// frontend/src/shared/today/CourseDetailSheet.tsx
import type { CourseSession } from '../../types';
import { Sheet } from '../Sheet';

interface CourseDetailSheetProps {
  course: CourseSession | null;
  onClose: () => void;
}

export function CourseDetailSheet({ course, onClose }: CourseDetailSheetProps) {
  if (!course) return null;

  return (
    <Sheet title={course.course_name} onClose={onClose}>
      <div className="sheet-meta">
        <div><strong>教师：</strong>{course.teacher || '未填写'}</div>
        <div><strong>教室：</strong>{course.room || '未填写'}</div>
        <div><strong>校区：</strong>{course.campus || '未填写'}</div>
        <div>
          <strong>周次：</strong>
          {course.weeks.length > 0 ? `第 ${course.weeks.join('、')} 周` : '未填写'}
        </div>
        {course.raw_time_text && (
          <div><strong>原始时间：</strong>{course.raw_time_text}</div>
        )}
      </div>
    </Sheet>
  );
}
```

```tsx
// frontend/src/shared/today/LayoutSheet.tsx
import type { TodayLayout } from '../../types';
import { Sheet } from '../Sheet';

interface LayoutSheetProps {
  layout: TodayLayout;
  onSelect: (layout: TodayLayout) => void;
  onClose: () => void;
}

const OPTIONS: Array<{
  value: TodayLayout;
  title: string;
  description: string;
  preview: string;
}> = [
  {
    value: 'focus',
    title: '聚焦下一节',
    description: '一眼看清下一节课、教室和倒计时。',
    preview: 'is-focus',
  },
  {
    value: 'timeline',
    title: '时间轴',
    description: '用一条时间线看今天的学习节奏。',
    preview: 'is-timeline',
  },
  {
    value: 'compact',
    title: '信息密度',
    description: '一屏扫完课程、概览和变动。',
    preview: 'is-compact',
  },
];

export function LayoutSheet({ layout, onSelect, onClose }: LayoutSheetProps) {
  return (
    <Sheet title="今天页布局" onClose={onClose}>
      <div className="layout-options">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`layout-option ${layout === option.value ? 'is-active' : ''}`}
            aria-pressed={layout === option.value}
            onClick={() => onSelect(option.value)}
          >
            <span className={`layout-preview ${option.preview}`} aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
            <span className="layout-copy">
              <strong>{option.title}</strong>
              <span>{option.description}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 6: Append the small style rules the new components need**

Add to the end of `frontend/src/styles.css`:

```css
.hero-card {
  width: 100%;
  border: 0;
  text-align: left;
  font: inherit;
}

.course-name,
.course-meta {
  display: block;
}

.stat-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-content strong {
  display: block;
  font-size: 14px;
}
```

- [ ] **Step 7: Run the Today tests and verify they pass**

```bash
cd frontend
npm run test -- src/shared/__tests__/today.test.tsx
npx tsc --noEmit
cd ..
```

Expected: `9 passed`. TypeScript should report no errors from these files; the entry components are added in Task 16.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/shared frontend/src/styles.css
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "feat: build shared shell and three today layouts"
```

---

### Task 15: Week grid/list views and the changes page

**Files:**
- Create: `frontend/src/shared/week/WeekPage.tsx`, `frontend/src/shared/week/WeekGrid.tsx`, `frontend/src/shared/week/WeekDayList.tsx`, `frontend/src/shared/changes/ChangesPage.tsx`, `frontend/src/shared/__tests__/week.test.tsx`, `frontend/src/shared/__tests__/changes.test.tsx`

- [ ] **Step 1: Write failing Week and Changes tests**

```tsx
// frontend/src/shared/__tests__/week.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CourseSession, ScheduleSnapshot } from '../../types';
import { WeekPage } from '../week/WeekPage';

const COURSE: CourseSession = {
  course_code: 'MATH101',
  course_name: '高等数学',
  teacher: '李老师',
  room: 'A101',
  campus: '良乡',
  weekday: 1,
  start_period: 3,
  end_period: 4,
  weeks: [9],
  raw_time_text: '',
};

const PERIODS = [
  ['08:00', '08:45'],
  ['08:50', '09:35'],
  ['09:55', '10:40'],
  ['10:45', '11:30'],
  ['11:35', '12:20'],
  ['13:20', '14:05'],
  ['14:10', '14:55'],
  ['15:15', '16:00'],
  ['16:05', '16:50'],
  ['16:55', '17:40'],
  ['18:30', '19:15'],
  ['19:20', '20:05'],
  ['20:10', '20:55'],
].map(([start, end], index) => ({ index: index + 1, start, end }));

const SNAPSHOT: ScheduleSnapshot = {
  schema_version: 1,
  app_version: '0.1.0',
  synced_at: '2026-10-26T08:00:00+08:00',
  sync_interval_days: 1,
  term: '2026-2027-1',
  first_day: '2026-08-31',
  courses: [COURSE],
  changes: [],
  calendar: [{ date: '2026-10-26', week: 9, weekday: 1 }],
  period_times: PERIODS,
};

const TODAY = '2026-10-26';

describe('Week page', () => {
  it('renders the grid with a spanning course block', () => {
    render(
      <WeekPage
        snapshot={SNAPSHOT}
        layout="grid"
        onLayoutChange={vi.fn()}
        onOpenCourse={vi.fn()}
        today={TODAY}
      />,
    );
    expect(screen.getByText('高等数学')).toBeInTheDocument();
    expect(screen.getByText('周三')).toBeInTheDocument();
    expect(screen.getByText('第 9 周')).toBeInTheDocument();
  });

  it('switches to the day list and navigates weeks', async () => {
    const onLayoutChange = vi.fn();
    render(
      <WeekPage
        snapshot={SNAPSHOT}
        layout="grid"
        onLayoutChange={onLayoutChange}
        onOpenCourse={vi.fn()}
        today={TODAY}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '单日' }));
    expect(onLayoutChange).toHaveBeenCalledWith('list');

    await userEvent.click(screen.getByRole('button', { name: '下一周' }));
    expect(screen.getByText('第 10 周')).toBeInTheDocument();
    expect(screen.queryByText('高等数学')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '本周' }));
    expect(screen.getByText('第 9 周')).toBeInTheDocument();
  });

  it('renders the selected day list with course details', () => {
    render(
      <WeekPage
        snapshot={SNAPSHOT}
        layout="list"
        onLayoutChange={vi.fn()}
        onOpenCourse={vi.fn()}
        today={TODAY}
      />,
    );
    expect(screen.getByText('高等数学')).toBeInTheDocument();
    expect(screen.getByText(/A101/)).toBeInTheDocument();
    expect(screen.getByText(/空档/)).toBeInTheDocument();
  });
});
```

```tsx
// frontend/src/shared/__tests__/changes.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChangeRecord } from '../../types';
import { ChangesPage } from '../changes/ChangesPage';

const CHANGES: ChangeRecord[] = [
  {
    id: 2,
    detected_at: '2026-10-26T08:00:00+08:00',
    type: 'modified',
    course_code: 'MATH101',
    course_name: '高等数学',
    summary: '高等数学：调整 教室 A101 → B202',
    before: null,
    after: null,
  },
  {
    id: 1,
    detected_at: '2026-10-25T08:00:00+08:00',
    type: 'added',
    course_code: 'PHY101',
    course_name: '大学物理',
    summary: '新增：周一 3-4 节 大学物理',
    before: null,
    after: null,
  },
];

describe('Changes page', () => {
  it('groups changes by date and marks the page read', () => {
    const onSeen = vi.fn();
    render(<ChangesPage changes={CHANGES} lastSeenId={0} onSeen={onSeen} />);
    expect(screen.getByText('10月26日周一')).toBeInTheDocument();
    expect(screen.getByText('调整')).toBeInTheDocument();
    expect(onSeen).toHaveBeenCalledWith(2);
  });

  it('shows unread dots only for unseen changes', () => {
    render(<ChangesPage changes={CHANGES} lastSeenId={1} onSeen={vi.fn()} />);
    expect(screen.getAllByLabelText('未读')).toHaveLength(1);
  });

  it('renders the empty state', () => {
    render(<ChangesPage changes={[]} lastSeenId={0} onSeen={vi.fn()} />);
    expect(screen.getByText('还没有检测到变动')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and verify they fail**

```bash
cd frontend
npm run test -- src/shared/__tests__/week.test.tsx src/shared/__tests__/changes.test.tsx
cd ..
```

Expected: import errors for WeekPage and ChangesPage.

- [ ] **Step 3: Implement the week grid and day list**

```tsx
// frontend/src/shared/week/WeekGrid.tsx
import type { CourseSession, ScheduleSnapshot } from '../../types';
import {
  coursesForWeek,
  periodTime,
  sessionKey,
  weekDates,
  weekdayName,
} from '../../lib/schedule';

interface WeekGridProps {
  snapshot: ScheduleSnapshot;
  week: number;
  today: string;
  onOpenCourse: (course: CourseSession) => void;
}

export function WeekGrid({ snapshot, week, today, onOpenCourse }: WeekGridProps) {
  const dates = weekDates(snapshot.first_day, week);
  const courses = coursesForWeek(snapshot, week);

  return (
    <div className="week-grid-wrap">
      <div className="week-grid" role="grid" aria-label={`第 ${week} 周课表`}>
        <div className="week-head" style={{ gridColumn: 1, gridRow: 1 }}>节次</div>
        {dates.map((date, index) => (
          <div
            key={date}
            className={`week-head ${date === today ? 'is-today' : ''}`}
            style={{ gridColumn: index + 2, gridRow: 1 }}
          >
            {weekdayName(index + 1)}
            <br />
            {Number(date.slice(8, 10))}
          </div>
        ))}
        {snapshot.period_times.map((period) => (
          <div
            className="time-cell"
            key={period.index}
            style={{ gridColumn: 1, gridRow: period.index + 1 }}
          >
            <span>{period.index}</span>
            <span>{period.start}</span>
          </div>
        ))}
        {courses.map((course) => (
          <button
            key={sessionKey(course)}
            type="button"
            className="course-block"
            style={{
              gridColumn: course.weekday + 1,
              gridRow: `${course.start_period + 1} / ${course.end_period + 2}`,
            }}
            onClick={() => onOpenCourse(course)}
          >
            <strong>{course.course_name}</strong>
            <span>{course.room || '教室待定'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

```tsx
// frontend/src/shared/week/WeekDayList.tsx
import { Fragment, useEffect, useState } from 'react';
import type { CourseSession, ScheduleSnapshot } from '../../types';
import {
  coursesForWeek,
  periodTime,
  sessionKey,
  weekDates,
  weekdayName,
  weekdayOf,
} from '../../lib/schedule';

interface WeekDayListProps {
  snapshot: ScheduleSnapshot;
  week: number;
  today: string;
  onOpenCourse: (course: CourseSession) => void;
}

export function WeekDayList({
  snapshot,
  week,
  today,
  onOpenCourse,
}: WeekDayListProps) {
  const dates = weekDates(snapshot.first_day, week);
  const [selected, setSelected] = useState(() =>
    dates.includes(today) ? today : dates[0],
  );

  useEffect(() => {
    setSelected(dates.includes(today) ? today : dates[0]);
  }, [week, today, snapshot.first_day]);

  const weekday = weekdayOf(selected);
  const sessions = coursesForWeek(snapshot, week)
    .filter((course) => course.weekday === weekday)
    .sort((a, b) => a.start_period - b.start_period);

  return (
    <>
      <div className="day-strip" aria-label={`第 ${week} 周日期`}>
        {dates.map((date) => (
          <button
            key={date}
            type="button"
            className={`day-chip ${selected === date ? 'is-selected' : ''}`}
            aria-pressed={selected === date}
            onClick={() => setSelected(date)}
          >
            {weekdayName(weekdayOf(date))}
            <strong>{Number(date.slice(8, 10))}</strong>
          </button>
        ))}
      </div>

      <div className="day-list">
        {sessions.length === 0 ? (
          <div className="empty-state">
            <strong>这一天没有课</strong>
            <span>换一天看看，或者享受这段空白。</span>
          </div>
        ) : (
          sessions.map((session, index) => {
            const previous = sessions[index - 1];
            const gapStart = previous ? previous.end_period + 1 : 1;
            const gapEnd = session.start_period - 1;
            return (
              <Fragment key={sessionKey(session)}>
                {gapEnd >= gapStart && (
                  <div className="gap-row">
                    第 {gapStart}-{gapEnd} 节 · 空档
                  </div>
                )}
                <button
                  type="button"
                  className="course-row"
                  onClick={() => onOpenCourse(session)}
                >
                  <span className="course-time">
                    {periodTime(snapshot, session.start_period).start}
                    <br />
                    {periodTime(snapshot, session.end_period).end}
                  </span>
                  <span className="course-main">
                    <span className="course-name">{session.course_name}</span>
                    <span className="course-meta">
                      {session.room || '教室待定'} · {session.teacher || '教师待定'}
                    </span>
                  </span>
                </button>
              </Fragment>
            );
          })
        )}
      </div>
    </>
  );
}
```

```tsx
// frontend/src/shared/week/WeekPage.tsx
import { useState } from 'react';
import type { CourseSession, ScheduleSnapshot, WeekLayout } from '../../types';
import { currentWeek } from '../../lib/schedule';
import { WeekDayList } from './WeekDayList';
import { WeekGrid } from './WeekGrid';

interface WeekPageProps {
  snapshot: ScheduleSnapshot;
  layout: WeekLayout;
  today: string;
  onLayoutChange: (layout: WeekLayout) => void;
  onOpenCourse: (course: CourseSession) => void;
}

export function WeekPage({
  snapshot,
  layout,
  today,
  onLayoutChange,
  onOpenCourse,
}: WeekPageProps) {
  const thisWeek = currentWeek(snapshot, today);
  const [week, setWeek] = useState(thisWeek);

  return (
    <section className="week-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{snapshot.term}</p>
          <h2 className="page-title">周课表</h2>
        </div>
        <div className="segmented" role="group" aria-label="周课表布局">
          <button
            type="button"
            className={layout === 'grid' ? 'is-active' : ''}
            aria-pressed={layout === 'grid'}
            onClick={() => onLayoutChange('grid')}
          >
            整周
          </button>
          <button
            type="button"
            className={layout === 'list' ? 'is-active' : ''}
            aria-pressed={layout === 'list'}
            onClick={() => onLayoutChange('list')}
          >
            单日
          </button>
        </div>
      </header>

      <div className="week-toolbar">
        <div className="week-nav">
          <button
            type="button"
            className="ghost-button"
            onClick={() => setWeek((value) => value - 1)}
            aria-label="上一周"
          >
            ‹
          </button>
          <span className="week-label">第 {week} 周</span>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setWeek((value) => value + 1)}
            aria-label="下一周"
          >
            ›
          </button>
        </div>
        <button type="button" className="ghost-button" onClick={() => setWeek(thisWeek)}>
          本周
        </button>
      </div>

      {layout === 'grid' ? (
        <WeekGrid
          snapshot={snapshot}
          week={week}
          today={today}
          onOpenCourse={onOpenCourse}
        />
      ) : (
        <WeekDayList
          snapshot={snapshot}
          week={week}
          today={today}
          onOpenCourse={onOpenCourse}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 4: Implement the changes page**

```tsx
// frontend/src/shared/changes/ChangesPage.tsx
import { useEffect } from 'react';
import type { ChangeRecord } from '../../types';
import {
  changeTypeLabel,
  formatDateLabel,
  formatDateTime,
  groupChangesByDate,
  maxChangeId,
} from '../../lib/schedule';

interface ChangesPageProps {
  changes: ChangeRecord[];
  lastSeenId: number;
  onSeen: (id: number) => void;
}

export function ChangesPage({ changes, lastSeenId, onSeen }: ChangesPageProps) {
  useEffect(() => {
    const newest = maxChangeId(changes);
    if (newest > lastSeenId) {
      onSeen(newest);
    }
  }, [changes, lastSeenId, onSeen]);

  const groups = groupChangesByDate(changes);

  return (
    <section className="changes-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">最近 50 条</p>
          <h2 className="page-title">变动</h2>
        </div>
      </header>

      {changes.length === 0 ? (
        <div className="empty-state">
          <strong>还没有检测到变动</strong>
          <span>应用会自动比对课表，发现变化后显示在这里。</span>
        </div>
      ) : (
        <div className="changes-list">
          {groups.map((group) => (
            <section key={group.date}>
              <h3 className="change-group-title">{formatDateLabel(group.date)}</h3>
              <div className="change-group-items">
                {group.items.map((change) => (
                  <article className="change-item" key={change.id}>
                    <span
                      className={`change-type ${change.type === 'removed' ? 'is-removed' : ''}`}
                    >
                      {changeTypeLabel(change.type)}
                    </span>
                    <div className="change-body">
                      <div className="change-summary">{change.summary}</div>
                      <div className="change-time">{formatDateTime(change.detected_at)}</div>
                    </div>
                    {change.id > lastSeenId && (
                      <span className="unread-dot" role="status" aria-label="未读" />
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Run the new tests and verify they pass**

```bash
cd frontend
npm run test -- src/shared/__tests__/week.test.tsx src/shared/__tests__/changes.test.tsx
cd ..
```

Expected: `6 passed`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/week frontend/src/shared/changes frontend/src/shared/__tests__/week.test.tsx frontend/src/shared/__tests__/changes.test.tsx
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "feat: add week grid, day list, and changes page"
```

---

### Task 16: Local API client, setup wizard, settings, and application entry

**Files:**
- Create: `frontend/src/data/types.ts`, `frontend/src/data/local.ts`, `frontend/src/data/__tests__/local.test.ts`, `frontend/src/local/SetupWizard.tsx`, `frontend/src/local/SettingsPage.tsx`, `frontend/src/local/LocalApp.tsx`, `frontend/src/local/__tests__/setup.test.tsx`, `frontend/src/App.tsx`, `frontend/src/main.tsx`
- Modify: `frontend/src/styles.css` (append theme-swatch rules)

- [ ] **Step 1: Write failing API-client and setup tests**

```ts
// frontend/src/data/__tests__/local.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../local';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('local API client', () => {
  it('loads status through the same-origin API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ configured: true, version: '0.1.0' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.status()).resolves.toEqual({
      configured: true,
      version: '0.1.0',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/status',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('posts sync through the same-origin API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ status: 'success', change_count: 0 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.sync();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sync',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('turns API errors into a readable ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(jsonResponse({ detail: '请等待 5 分钟后再同步' }, 429)),
      ),
    );

    await expect(api.sync()).rejects.toThrow('请等待 5 分钟后再同步');
    try {
      await api.sync();
    } catch (caught) {
      expect(caught).toBeInstanceOf(ApiError);
      expect((caught as ApiError).status).toBe(429);
    }
  });
});
```

```tsx
// frontend/src/local/__tests__/setup.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SetupWizard } from '../SetupWizard';

describe('SetupWizard', () => {
  it('validates the school form and advances to the push step', async () => {
    const schoolApi = vi.fn().mockResolvedValue({ status: 'success' });
    const onComplete = vi.fn();
    render(
      <SetupWizard
        onComplete={onComplete}
        schoolApi={schoolApi}
        pushApi={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '连接并同步' }));
    expect(screen.getByText('请填写学号和密码')).toBeInTheDocument();
    expect(schoolApi).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('学号'), '20250001');
    await userEvent.type(screen.getByLabelText('密码'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: '连接并同步' }));

    expect(await screen.findByText('微信提醒')).toBeInTheDocument();
    expect(schoolApi).toHaveBeenCalledWith('20250001', 'pw');
  });

  it('allows skipping push and completing setup', async () => {
    const onComplete = vi.fn();
    render(
      <SetupWizard
        onComplete={onComplete}
        schoolApi={vi.fn().mockResolvedValue({ status: 'success' })}
        pushApi={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText('学号'), '20250001');
    await userEvent.type(screen.getByLabelText('密码'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: '连接并同步' }));
    await screen.findByText('微信提醒');
    await userEvent.click(screen.getByRole('button', { name: '跳过' }));
    await userEvent.click(screen.getByRole('button', { name: '开始使用' }));

    expect(onComplete).toHaveBeenCalled();
  });

  it('saves and tests a PushPlus token', async () => {
    const pushApi = vi.fn().mockResolvedValue({ configured: true, tested: true });
    const onComplete = vi.fn();
    render(
      <SetupWizard
        onComplete={onComplete}
        schoolApi={vi.fn().mockResolvedValue({ status: 'success' })}
        pushApi={pushApi}
      />,
    );

    await userEvent.type(screen.getByLabelText('学号'), '20250001');
    await userEvent.type(screen.getByLabelText('密码'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: '连接并同步' }));
    await screen.findByText('微信提醒');
    await userEvent.type(screen.getByLabelText('PushPlus token'), 'push-token');
    await userEvent.click(screen.getByRole('button', { name: '保存并测试' }));

    expect(pushApi).toHaveBeenCalledWith('push-token', true);
    expect(await screen.findByText('配置完成')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and verify they fail**

```bash
cd frontend
npm run test -- src/data/__tests__/local.test.ts src/local/__tests__/setup.test.tsx
cd ..
```

Expected: import errors for the data client and SetupWizard.

- [ ] **Step 3: Implement the typed API client**

```ts
// frontend/src/data/types.ts
import type { CloudStatus, ScheduleSnapshot, SyncStatus } from '../types';

export interface AppStatus {
  configured: boolean;
  school_configured: boolean;
  school_username: string | null;
  push_configured: boolean;
  cloud_configured: boolean;
  last_sync_at: string | null;
  last_attempt_at: string | null;
  next_due_at: string | null;
  sync_status: SyncStatus;
  last_error: string | null;
  notification_error: string | null;
  cloud_status: CloudStatus;
  version: string;
}

export interface AppSettings {
  sync_interval_days: number;
  push_enabled: boolean;
  school_configured: boolean;
  push_configured: boolean;
  cloud_configured: boolean;
}

export interface SyncResult {
  status: 'success' | 'failed' | 'anomaly' | 'skipped';
  message: string;
  course_count: number;
  change_count: number;
  cloud_status: CloudStatus;
  error_code: string | null;
}

export type { ScheduleSnapshot };
```

```ts
// frontend/src/data/local.ts
import type { AppSettings, AppStatus, SyncResult } from './types';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });
  const payload = (await response.json().catch(() => null)) as
    | { detail?: unknown }
    | null;
  if (!response.ok) {
    const detail =
      payload && typeof payload.detail === 'string'
        ? payload.detail
        : `请求失败（HTTP ${response.status}）`;
    throw new ApiError(response.status, detail);
  }
  return payload as T;
}

export const api = {
  status: () => request<AppStatus>('/api/status'),
  dashboard: () => request<import('../types').ScheduleSnapshot>('/api/dashboard'),
  settings: () => request<AppSettings>('/api/settings'),
  updateSettings: (payload: {
    sync_interval_days?: number;
    push_enabled?: boolean;
  }) =>
    request<AppSettings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  setupSchool: (username: string, password: string) =>
    request<{ status: string; configured: boolean }>('/api/setup/school', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  setupPush: (token: string, test: boolean) =>
    request<{ configured: boolean; tested: boolean }>('/api/setup/pushplus', {
      method: 'POST',
      body: JSON.stringify({ token, test }),
    }),
  sync: () => request<SyncResult>('/api/sync', { method: 'POST' }),
  testNotification: () =>
    request<{ status: string }>('/api/notifications/test', { method: 'POST' }),
};
```

- [ ] **Step 4: Implement the setup wizard**

```tsx
// frontend/src/local/SetupWizard.tsx
import { useState, type FormEvent } from 'react';
import { api, messageFromError } from '../data/local';

interface SetupWizardProps {
  onComplete: () => void | Promise<void>;
  schoolApi?: (username: string, password: string) => Promise<unknown>;
  pushApi?: (token: string, test: boolean) => Promise<unknown>;
}

type Step = 'school' | 'push' | 'done';

export function SetupWizard({
  onComplete,
  schoolApi = api.setupSchool,
  pushApi = api.setupPush,
}: SetupWizardProps) {
  const [step, setStep] = useState<Step>('school');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submitSchool(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError('请填写学号和密码');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await schoolApi(username.trim(), password);
      setPassword('');
      setStep('push');
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function savePush(event: FormEvent) {
    event.preventDefault();
    if (!token.trim()) {
      setError('请输入 PushPlus token，或点击跳过');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await pushApi(token.trim(), true);
      setToken('');
      setStep('done');
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="setup-shell">
      <div className="setup-card">
        <p className="eyebrow">下一节 · 首次配置</p>
        <div className="steps" aria-hidden="true">
          <span className={`step-dot ${step !== 'school' ? 'is-active' : ''}`} />
          <span className={`step-dot ${step === 'push' || step === 'done' ? 'is-active' : ''}`} />
          <span className={`step-dot ${step === 'done' ? 'is-active' : ''}`} />
        </div>

        {step === 'school' && (
          <form className="form" onSubmit={submitSchool}>
            <div>
              <h1 className="setup-title">连接教务系统</h1>
              <p className="setup-subtitle">
                账号密码只保存在 Windows 凭据管理器，不会写入数据库或上传到云端。
              </p>
            </div>
            <label className="form-field">
              <span className="form-label">学号</span>
              <input
                className="input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                inputMode="numeric"
              />
            </label>
            <label className="form-field">
              <span className="form-label">密码</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="form-actions">
              <button type="submit" className="button button-primary" disabled={busy}>
                {busy ? '正在连接并同步…' : '连接并同步'}
              </button>
            </div>
            <p className="form-hint">
              首次同步会读取当前学期课表；应用只监听 127.0.0.1，不会暴露到局域网。
            </p>
          </form>
        )}

        {step === 'push' && (
          <form className="form" onSubmit={savePush}>
            <div>
              <h1 className="setup-title">微信提醒</h1>
              <p className="setup-subtitle">
                可选。配置 PushPlus 后，课表变动会合并成一条微信消息发给你。
              </p>
            </div>
            <label className="form-field">
              <span className="form-label">PushPlus token</span>
              <input
                className="input"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="off"
                placeholder="粘贴 PushPlus token"
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="form-actions">
              <button type="submit" className="button button-primary" disabled={busy}>
                {busy ? '正在发送测试…' : '保存并测试'}
              </button>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => setStep('done')}
              >
                跳过
              </button>
            </div>
            <p className="form-hint">
              测试提醒会立即发到微信。之后可以随时在设置页替换 token。
            </p>
          </form>
        )}

        {step === 'done' && (
          <div className="form">
            <div>
              <h1 className="setup-title">配置完成</h1>
              <p className="setup-subtitle">
                打开今天页就能看到下一节课。应用运行时会按设置间隔自动同步。
              </p>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={() => void onComplete()}
              >
                开始使用
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement the settings page**

```tsx
// frontend/src/local/SettingsPage.tsx
import { useEffect, useState, type FormEvent } from 'react';
import type { ThemeName } from '../types';
import type { AppSettings, AppStatus } from '../data/types';
import { api, messageFromError } from '../data/local';
import { formatDateTime } from '../lib/schedule';

interface SettingsPageProps {
  status: AppStatus;
  theme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
  onRelogin: () => void;
  onSync: () => Promise<void>;
  syncBusy: boolean;
  syncError: string;
}

export function SettingsPage({
  status,
  theme,
  onThemeChange,
  onRelogin,
  onSync,
  syncBusy,
  syncError,
}: SettingsPageProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.settings()
      .then(setSettings)
      .catch((caught) => setError(messageFromError(caught)));
  }, []);

  async function patch(payload: { sync_interval_days?: number; push_enabled?: boolean }) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setSettings(await api.updateSettings(payload));
      setNotice('设置已保存');
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function savePush(event: FormEvent) {
    event.preventDefault();
    if (!token.trim()) {
      setError('请输入新的 PushPlus token');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.setupPush(token.trim(), true);
      setToken('');
      setSettings(await api.settings());
      setNotice('PushPlus 已保存，测试提醒已发送');
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function testNotification() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.testNotification();
      setNotice('测试提醒已发送');
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(false);
    }
  }

  const syncStatusLabel =
    status.sync_status === 'success'
      ? '正常'
      : status.sync_status === 'anomaly'
        ? '异常'
        : status.sync_status === 'failed'
          ? '失败'
          : status.sync_status === 'running'
            ? '同步中'
            : '尚未同步';

  return (
    <section className="settings-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">本地管理端</p>
          <h2 className="page-title">设置</h2>
        </div>
      </header>

      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-hint">{notice}</p>}

      <section className="settings-section">
        <h3>账号</h3>
        <div className="settings-row">
          <span>学号</span>
          <span className="settings-value">{status.school_username ?? '未配置'}</span>
        </div>
        <div className="settings-row">
          <span>连接状态</span>
          <span className={`settings-value ${status.school_configured ? 'is-ok' : 'is-alert'}`}>
            {status.school_configured ? '已连接' : '需要配置'}
          </span>
        </div>
        <div className="form-actions">
          <button type="button" className="button" onClick={onRelogin}>
            重新登录
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>同步</h3>
        <div className="settings-row">
          <span>自动同步间隔</span>
          <select
            className="select"
            style={{ maxWidth: 150 }}
            aria-label="自动同步间隔"
            value={settings?.sync_interval_days ?? 1}
            disabled={!settings || busy}
            onChange={(event) =>
              void patch({ sync_interval_days: Number(event.target.value) })
            }
          >
            <option value={1}>每 1 天</option>
            <option value={2}>每 2 天</option>
            <option value={3}>每 3 天</option>
          </select>
        </div>
        <div className="settings-row">
          <span>上次成功同步</span>
          <span className="settings-value">
            {status.last_sync_at ? formatDateTime(status.last_sync_at) : '—'}
          </span>
        </div>
        <div className="settings-row">
          <span>下次到期</span>
          <span className="settings-value">
            {status.next_due_at ? formatDateTime(status.next_due_at) : '—'}
          </span>
        </div>
        <div className="settings-row">
          <span>同步状态</span>
          <span className={`settings-value ${status.sync_status === 'failed' || status.sync_status === 'anomaly' ? 'is-alert' : 'is-ok'}`}>
            {syncStatusLabel}
          </span>
        </div>
        {status.last_error && <p className="form-error">{status.last_error}</p>}
        {syncError && <p className="form-error">{syncError}</p>}
        <div className="form-actions">
          <button
            type="button"
            className="button button-primary"
            disabled={syncBusy}
            onClick={() => void onSync()}
          >
            {syncBusy ? '正在同步…' : '立即同步'}
          </button>
        </div>
        <p className="form-hint">手动同步有 5 分钟冷却；电脑关机或应用未运行时不会同步。</p>
      </section>

      <section className="settings-section">
        <h3>微信提醒</h3>
        <div className="settings-row">
          <span>PushPlus</span>
          <span className={`settings-value ${settings?.push_configured ? 'is-ok' : 'is-alert'}`}>
            {settings?.push_configured ? '已配置' : '未配置'}
          </span>
        </div>
        <div className="settings-row">
          <span>变动提醒</span>
          <button
            type="button"
            className="button"
            disabled={!settings || busy}
            onClick={() => void patch({ push_enabled: !settings?.push_enabled })}
          >
            {settings?.push_enabled ? '已启用' : '已停用'}
          </button>
        </div>
        {status.notification_error && (
          <p className="form-error">{status.notification_error}</p>
        )}
        <form className="form" onSubmit={savePush}>
          <label className="form-field">
            <span className="form-label">PushPlus token</span>
            <input
              className="input"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
              placeholder={settings?.push_configured ? '输入新 token 可替换' : '粘贴 PushPlus token'}
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="button button-primary" disabled={busy}>
              保存并测试
            </button>
            <button
              type="button"
              className="button"
              disabled={busy || !settings?.push_configured}
              onClick={() => void testNotification()}
            >
              发送测试提醒
            </button>
          </div>
          <p className="form-hint">token 只保存在 Windows 凭据管理器，不会回显完整值。</p>
        </form>
      </section>

      <section className="settings-section">
        <h3>主题</h3>
        <div className="theme-picker">
          <button
            type="button"
            className={`theme-choice ${theme === 'warm' ? 'is-active' : ''}`}
            data-theme-choice="warm"
            aria-pressed={theme === 'warm'}
            onClick={() => onThemeChange('warm')}
          >
            <span className="theme-swatch" aria-hidden="true">
              <span className="swatch-bg" />
              <span className="swatch-primary" />
              <span className="swatch-hero" />
            </span>
            暖纸
          </button>
          <button
            type="button"
            className={`theme-choice ${theme === 'fog' ? 'is-active' : ''}`}
            data-theme-choice="fog"
            aria-pressed={theme === 'fog'}
            onClick={() => onThemeChange('fog')}
          >
            <span className="theme-swatch" aria-hidden="true">
              <span className="swatch-bg" />
              <span className="swatch-primary" />
              <span className="swatch-hero" />
            </span>
            雾蓝
          </button>
        </div>
        <p className="form-hint">深色模式始终跟随系统，不提供手动深浅开关。</p>
      </section>

      <section className="settings-section">
        <h3>关于</h3>
        <div className="settings-row">
          <span>版本</span>
          <span className="settings-value">{status.version}</span>
        </div>
        <div className="settings-row">
          <span>数据与凭据</span>
          <span className="settings-value">课表在 data 目录；密码与 token 在 Windows 凭据管理器</span>
        </div>
        <p className="form-hint">
          应用只监听 127.0.0.1。云端只读快照不是本地核心的一部分，将在后续阶段加入。
        </p>
      </section>
    </section>
  );
}
```

- [ ] **Step 6: Implement the local application shell**

```tsx
// frontend/src/local/LocalApp.tsx
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { CourseSession, ScheduleSnapshot, TodayLayout, WeekLayout } from '../types';
import type { AppStatus } from '../data/types';
import { api, messageFromError } from '../data/local';
import {
  dateKeyInShanghai,
  unreadChangeCount,
} from '../lib/schedule';
import {
  readLastSeenChangeId,
  STORAGE_KEYS,
  useStoredChoice,
  writeLastSeenChangeId,
  defaultWeekLayout,
} from '../lib/storage';
import { useTheme } from '../lib/theme';
import { AppShell } from '../shared/AppShell';
import { type PageKey } from '../shared/BottomNav';
import { TodayPage } from '../shared/TodayPage';
import { WeekPage } from '../shared/week/WeekPage';
import { ChangesPage } from '../shared/changes/ChangesPage';
import { CourseDetailSheet } from '../shared/today/CourseDetailSheet';
import { LayoutSheet } from '../shared/today/LayoutSheet';
import { SetupWizard } from './SetupWizard';
import { SettingsPage } from './SettingsPage';

export function LocalApp() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot | null>(null);
  const [page, setPage] = useState<PageKey>('today');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [course, setCourse] = useState<CourseSession | null>(null);
  const [layoutSheet, setLayoutSheet] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [lastSeenId, setLastSeenId] = useState(readLastSeenChangeId);

  const [todayLayout, setTodayLayout] = useStoredChoice<TodayLayout>(
    STORAGE_KEYS.todayLayout,
    'focus',
    ['focus', 'timeline', 'compact'] as const,
  );
  const [weekLayout, setWeekLayout] = useStoredChoice<WeekLayout>(
    STORAGE_KEYS.weekLayout,
    defaultWeekLayout(),
    ['grid', 'list'] as const,
  );
  const [theme, setTheme] = useTheme();

  const refresh = useCallback(async () => {
    setLoadError('');
    try {
      const nextStatus = await api.status();
      setStatus(nextStatus);
      if (nextStatus.configured) {
        setSnapshot(await api.dashboard());
      } else {
        setSnapshot(null);
      }
    } catch (caught) {
      setLoadError(messageFromError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const handleSync = useCallback(async () => {
    setSyncBusy(true);
    setSyncError('');
    try {
      const result = await api.sync();
      if (result.status === 'failed' || result.status === 'anomaly') {
        setSyncError(result.message);
      }
      await refresh();
    } catch (caught) {
      setSyncError(messageFromError(caught));
    } finally {
      setSyncBusy(false);
    }
  }, [refresh]);

  const markSeen = useCallback((id: number) => {
    setLastSeenId(id);
    writeLastSeenChangeId(id);
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <span className="spinner" aria-hidden="true" />
        正在加载…
      </div>
    );
  }

  if (loadError && !status) {
    return (
      <div className="error-state">
        <strong>无法连接本地服务</strong>
        <span>{loadError}</span>
        <button type="button" className="button" onClick={() => void refresh()}>
          重试
        </button>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="error-state">
        <strong>无法读取本地状态</strong>
        <span>请稍后重试，或重新启动下一节。</span>
        <button type="button" className="button" onClick={() => void refresh()}>
          重试
        </button>
      </div>
    );
  }

  if (!status.configured || showSetup) {
    return (
      <SetupWizard
        onComplete={async () => {
          setShowSetup(false);
          await refresh();
        }}
      />
    );
  }

  const unread = snapshot ? unreadChangeCount(snapshot.changes, lastSeenId) : 0;
  const today = dateKeyInShanghai(now);

  let content: ReactNode = null;
  if (!snapshot) {
    content = (
      <div className="empty-state">
        <strong>还没有课表快照</strong>
        <span>连接教务系统后会自动同步一次；也可以点下方按钮手动同步。</span>
        {syncError && <p className="form-error">{syncError}</p>}
        <button
          type="button"
          className="button button-primary"
          disabled={syncBusy}
          onClick={() => void handleSync()}
        >
          {syncBusy ? '正在同步…' : '立即同步'}
        </button>
      </div>
    );
  } else if (page === 'week') {
    content = (
      <WeekPage
        snapshot={snapshot}
        layout={weekLayout}
        today={today}
        onLayoutChange={setWeekLayout}
        onOpenCourse={setCourse}
      />
    );
  } else if (page === 'changes') {
    content = (
      <ChangesPage
        changes={snapshot.changes}
        lastSeenId={lastSeenId}
        onSeen={markSeen}
      />
    );
  } else if (page === 'settings') {
    content = (
      <SettingsPage
        status={status}
        theme={theme}
        onThemeChange={setTheme}
        onRelogin={() => setShowSetup(true)}
        onSync={handleSync}
        syncBusy={syncBusy}
        syncError={syncError}
      />
    );
  } else {
    content = (
      <TodayPage
        snapshot={snapshot}
        now={now}
        layout={todayLayout}
        unreadCount={unread}
        onOpenCourse={setCourse}
        onOpenLayout={() => setLayoutSheet(true)}
        onOpenChanges={() => setPage('changes')}
        onGoWeek={() => setPage('week')}
      />
    );
  }

  return (
    <>
      <AppShell snapshot={snapshot} page={page} onNavigate={setPage}>
        {loadError && <p className="form-error">{loadError}</p>}
        {syncError && page !== 'settings' && (
          <p className="form-error">{syncError}</p>
        )}
        {content}
      </AppShell>
      {course && <CourseDetailSheet course={course} onClose={() => setCourse(null)} />}
      {layoutSheet && (
        <LayoutSheet
          layout={todayLayout}
          onSelect={(next) => {
            setTodayLayout(next);
            setLayoutSheet(false);
          }}
          onClose={() => setLayoutSheet(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 7: Add the entry components and swatch rules**

```tsx
// frontend/src/App.tsx
import { LocalApp } from './local/LocalApp';

export function App() {
  return <LocalApp />;
}
```

```tsx
// frontend/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/themes.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Append to `frontend/src/styles.css`:

```css
.theme-choice[data-theme-choice="warm"] .swatch-bg {
  background: #f7f5ef;
}

.theme-choice[data-theme-choice="warm"] .swatch-primary {
  background: #1f5c4a;
}

.theme-choice[data-theme-choice="warm"] .swatch-hero {
  background: #173f33;
}

.theme-choice[data-theme-choice="fog"] .swatch-bg {
  background: #f4f6f7;
}

.theme-choice[data-theme-choice="fog"] .swatch-primary {
  background: #244c6b;
}

.theme-choice[data-theme-choice="fog"] .swatch-hero {
  background: #1b3a50;
}
```

- [ ] **Step 8: Run frontend tests, type-check, and build**

```bash
cd frontend
npm run test
npx tsc --noEmit
npm run build:local
cd ..
```

Expected: all frontend tests pass; TypeScript has no errors; `frontend/dist-local/index.html` exists.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/data frontend/src/local frontend/src/App.tsx frontend/src/main.tsx frontend/src/styles.css
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "feat: connect local API, setup wizard, settings, and app entry"
```

---

### Task 17: Fixture server, browser smoke tests, and README

**Files:**
- Create: `scripts/dev_fixture_server.py`, `frontend/playwright.config.ts`, `frontend/e2e/smoke.spec.ts`, `README.md`
- Modify: `.gitignore`

- [ ] **Step 1: Ignore Playwright artifacts**

Append to `.gitignore`:

```text
frontend/playwright-report/
frontend/test-results/
```

- [ ] **Step 2: Add a fixture server that serves the built local app**

```python
# scripts/dev_fixture_server.py
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist-local"
TZ = ZoneInfo("Asia/Shanghai")

PERIODS = [
    (1, "08:00", "08:45"),
    (2, "08:50", "09:35"),
    (3, "09:55", "10:40"),
    (4, "10:45", "11:30"),
    (5, "11:35", "12:20"),
    (6, "13:20", "14:05"),
    (7, "14:10", "14:55"),
    (8, "15:15", "16:00"),
    (9, "16:05", "16:50"),
    (10, "16:55", "17:40"),
    (11, "18:30", "19:15"),
    (12, "19:20", "20:05"),
    (13, "20:10", "20:55"),
]


def session(code, name, weekday, start, end, room, weeks=(9,)):
    return {
        "course_code": code,
        "course_name": name,
        "teacher": "测试老师",
        "room": room,
        "campus": "良乡",
        "weekday": weekday,
        "start_period": start,
        "end_period": end,
        "weeks": list(weeks),
        "raw_time_text": "",
    }


def fixture_snapshot():
    now = datetime.now(TZ)
    today = now.date()
    first_day = today - timedelta(days=today.weekday() + 7 * 8)
    week = 9
    today_weekday = today.weekday() + 1
    calendar = []
    for offset in range(14):
        day = today + timedelta(days=offset)
        calendar.append(
            {
                "date": day.isoformat(),
                "week": (day - first_day).days // 7 + 1,
                "weekday": day.weekday() + 1,
            }
        )

    courses = [
        session("TODAY101", "今日测试课", today_weekday, 1, 2, "A101"),
        session("MATH101", "高等数学", 1, 3, 4, "综教 A101"),
        session("PHY101", "大学物理", 3, 5, 6, "理教 B202"),
        session("CS101", "程序设计基础", 5, 7, 8, "实验楼 201"),
    ]
    changes = [
        {
            "id": 2,
            "detected_at": now.isoformat(timespec="seconds"),
            "type": "modified",
            "course_code": "PHY101",
            "course_name": "大学物理",
            "summary": "大学物理：调整 教室 理教 B202 → 理教 B203",
            "before": None,
            "after": None,
        },
        {
            "id": 1,
            "detected_at": (now - timedelta(days=1)).isoformat(timespec="seconds"),
            "type": "added",
            "course_code": "TODAY101",
            "course_name": "今日测试课",
            "summary": "新增：今日 1-2 节 今日测试课 · A101",
            "before": None,
            "after": None,
        },
    ]
    return {
        "schema_version": 1,
        "app_version": "0.1.0",
        "synced_at": now.isoformat(timespec="seconds"),
        "sync_interval_days": 1,
        "term": "2026-2027-1",
        "first_day": first_day.isoformat(),
        "courses": courses,
        "changes": changes,
        "calendar": calendar,
        "period_times": [
            {"index": index, "start": start, "end": end}
            for index, start, end in PERIODS
        ],
        "sync_status": "success",
        "last_attempt_at": now.isoformat(timespec="seconds"),
        "next_due_at": (now + timedelta(days=1)).isoformat(timespec="seconds"),
        "cloud_status": "skipped",
        "last_error": None,
        "configured": True,
    }


app = FastAPI(title="下一节 fixture")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/status")
def status():
    snapshot = fixture_snapshot()
    return {
        "configured": True,
        "school_configured": True,
        "school_username": "20250001",
        "push_configured": False,
        "cloud_configured": False,
        "last_sync_at": snapshot["synced_at"],
        "last_attempt_at": snapshot["last_attempt_at"],
        "next_due_at": snapshot["next_due_at"],
        "sync_status": "success",
        "last_error": None,
        "notification_error": None,
        "cloud_status": "skipped",
        "version": "0.1.0",
    }


@app.get("/api/settings")
def settings():
    return {
        "sync_interval_days": 1,
        "push_enabled": False,
        "school_configured": True,
        "push_configured": False,
        "cloud_configured": False,
    }


@app.get("/api/dashboard")
def dashboard():
    return fixture_snapshot()


if DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(DIST), html=True), name="frontend")
else:
    @app.get("/")
    def missing_build():
        return {"detail": "请先在 frontend 运行 npm run build:local"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=17999)
    args = parser.parse_args()
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Add Playwright configuration and smoke tests**

```ts
// frontend/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:17999',
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
  },
  webServer: {
    command: '../.venv/Scripts/python.exe ../scripts/dev_fixture_server.py --port 17999',
    url: 'http://127.0.0.1:17999/api/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

```ts
// frontend/e2e/smoke.spec.ts
import { expect, test } from '@playwright/test';

test('mobile local app: today layouts, week layouts, changes, and theme', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今天' })).toBeVisible();

  await page.getByRole('button', { name: '布局' }).click();
  await page.getByRole('button', { name: /信息密度/ }).click();
  await expect(page.getByText('今日节数')).toBeVisible();

  await page.getByRole('button', { name: '布局' }).click();
  await page.getByRole('button', { name: /时间轴/ }).click();
  await expect(page.getByText('今日概览')).toBeVisible();

  await page.getByRole('button', { name: '周课表' }).click();
  await expect(page.getByRole('heading', { name: '周课表' })).toBeVisible();
  await page.getByRole('button', { name: '单日' }).click();
  await expect(page.locator('.day-strip')).toBeVisible();
  await page.getByRole('button', { name: '整周' }).click();
  await expect(page.locator('.week-grid')).toBeVisible();

  await page.getByRole('button', { name: '变动' }).click();
  await expect(page.getByRole('heading', { name: '变动' })).toBeVisible();
  await expect(page.getByText(/调整/).first()).toBeVisible();

  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '雾蓝' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'fog');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'fog');
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '暖纸' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'warm');
});

test.describe('desktop week default', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('defaults to the grid layout', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '周课表' }).click();
    await expect(page.locator('.week-grid')).toBeVisible();
  });
});

test.describe('system dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('uses the dark token set without a manual toggle', async ({ page }) => {
    await page.goto('/');
    const background = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    );
    expect(background).toBe('#171a18');
  });
});
```

- [ ] **Step 4: Write the README**

````markdown
# 下一节

北京理工大学个人课表工具：从教务系统自动同步课表，打开就能看到今天和下一节；课表变化时通过 PushPlus 发一条微信提醒。

这是单用户、本地优先的工具。本地服务只监听 `127.0.0.1`，不开放局域网；课表和设置存本机 SQLite，密码、token 只进 Windows 凭据管理器。

## 环境

- Windows 10/11
- Python 3.13（`py -3.13` 可用）
- Node.js 20+
- 能访问北理工统一身份认证和教务系统（校园网或 WebVPN）

## 初始化

在项目根目录 PowerShell 中运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

脚本会创建 `.venv`、安装后端依赖、安装前端依赖并构建 `frontend\dist-local`，同时创建 `data` 目录。

## 启动与停止

```powershell
scripts\start.ps1
```

启动器会：

- 如果已有健康的下一节实例，直接打开它，不启动第二个进程；
- 否则默认尝试 `127.0.0.1:17800`；被占用时向系统申请一个空闲端口；
- 若设置了 `NEXT_CLASS_PORT`，则只使用该端口，被占用时报错，不自动改端口；
- 把实际端口和 PID 写入 `data\runtime.json`，然后打开浏览器。

```powershell
scripts\stop.ps1
```

如果 PowerShell 执行策略阻止脚本，改用 `powershell -ExecutionPolicy Bypass -File scripts\start.ps1`（停止同理）。停止脚本只会结束 `data\runtime.json` 指向且命令行匹配本应用的进程，不会杀占用端口的其他程序。

## 首次配置

1. 输入学号和密码，点击“连接并同步”。密码只发给本机服务，再写入 Windows 凭据管理器。
2. 可选填 PushPlus token 并发送测试提醒；也可以跳过。
3. 完成后进入今天页。布局按钮可切换三种今天布局；周课表页可切换整周/单日。

如果 keyring 不可用，应用会明确报错并停止保存敏感信息，不会退化成明文文件。

## 同步规则

- 默认每 1 天同步一次，可在设置中改为 1/2/3 天。
- 应用启动时若已到期会补同步；运行期间每小时做一次轻量到期检查。
- 自动同步失败按 1h → 3h → 6h → 12h → 24h 退避，成功后重置。
- 手动同步绕过到期时间，但有 5 分钟冷却。
- 电脑关机或应用未运行时不会同步；页面会显示最后同步时间。
- 教务系统返回空课表时，第一次保留旧快照并提醒；连续第二次才按空课表更新。

## 隐私与安全

- 本地服务只绑定 `127.0.0.1`，无 CORS、无 LAN/PIN。
- 学号密码、PushPlus token 存在 Windows 凭据管理器；SQLite、日志、前端产物中不保存这些值。
- 日志轮转 1 MB × 3，写入前对密码、token、Cookie、Authorization、URL 查询参数脱敏。
- 课表数据在 `data\next_class.db`；日志在 `data\app.log`。
- 云端只读快照（加密 Gist + GitHub Pages）是下一份实现计划的范围；本计划不包含云端凭据或上传。

## 开发

后端：

```bash
./.venv/Scripts/python.exe -m pytest backend/tests -v
```

前端：

```bash
cd frontend
npm run test
npm run build:local
```

本地开发时先启动后端：

```bash
./.venv/Scripts/python.exe scripts/run_server.py --no-open
```

再启动 Vite（默认代理到 `http://127.0.0.1:17800`）：

```bash
cd frontend
npm run dev
```

浏览器冒烟测试：

```bash
cd frontend
npx playwright install chromium
npm run build:local
npm run e2e
```

冒烟测试使用假数据服务 `scripts/dev_fixture_server.py`，不会访问真实教务系统，也不需要账号密码。

## 主要依赖

- 后端：FastAPI、Uvicorn、Pydantic、httpx、keyring、cryptography、pytest、pytest-asyncio、BIT-Login-Python。
- 前端：React、Vite、TypeScript、Vitest、React Testing Library、Playwright。
- 版本由 `backend/requirements.txt` 和 `frontend/package-lock.json` 锁定。

## 数据来源与署名

课表抓取依赖开源项目 [BIT-Login-Python](https://github.com/BIT101-dev/BIT-Login-Python)，固定 commit `5d537ca6123b405666b82eabc2328b8f4c70b6ca`，作为依赖安装，不复制其源码。感谢 BIT101 社区。

本项目是个人工具，与北京理工大学官方无关。使用前请确认符合学校账号与数据使用规定，不要分享自己的学号、密码或 token。

## 已知限制

- 需要校园网或 WebVPN；遇到短信验证码时 V1 不支持交互式验证。
- GitHub 可达性、PushPlus 配额、教务系统接口变更都可能影响使用。
- 电脑关机期间不会产生新的同步或提醒。
````

- [ ] **Step 5: Run all verification commands**

```bash
./.venv/Scripts/python.exe -m pytest backend/tests -v

cd frontend
npm run test
npx tsc --noEmit
npm run build:local
npx playwright install chromium
npm run e2e
cd ..
```

Expected:

- all backend tests pass;
- all Vitest tests pass;
- TypeScript has no errors;
- `frontend/dist-local/index.html` exists;
- Playwright smoke tests pass (mobile layouts, desktop grid default, dark tokens).

If Playwright is unavailable in the environment, record that explicitly; do not claim the browser smoke test passed.

- [ ] **Step 6: Run the real launcher smoke test**

```bash
NEXT_CLASS_PORT=17899 ./.venv/Scripts/python.exe scripts/run_server.py --no-open
```

In another command:

```bash
curl -s http://127.0.0.1:17899/api/health
```

Expected: `{"status":"ok"}`. Confirm `data/runtime.json` contains `17899`; stop the process and confirm the file is removed.

- [ ] **Step 7: Commit**

```bash
git add .gitignore scripts/dev_fixture_server.py frontend/playwright.config.ts frontend/e2e README.md
git -c user.name="白泽" -c user.email="minikirincat@outlook.com" commit -m "docs: add local fixture, browser smoke tests, and setup guide"
```
