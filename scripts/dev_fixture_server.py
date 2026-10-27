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
        "cloud_pages_url": None,
        "cloud_gist_id": None,
        "cloud_last_publish_at": None,
        "cloud_last_error": None,
        "cloud_qr_ready": False,
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
        "cloud_pages_url": None,
        "cloud_gist_id": None,
        "cloud_last_publish_at": None,
        "cloud_last_error": None,
        "cloud_qr_ready": False,
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
