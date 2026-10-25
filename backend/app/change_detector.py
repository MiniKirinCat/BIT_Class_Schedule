import hashlib
import json
from collections import defaultdict
from datetime import datetime

from .models import ChangeEvent, CourseSession
from .schedule import format_periods, format_session_label, format_weekday, weeks_label


def _fingerprint(
    kind: str,
    course_code: str | None,
    summary: str,
    before: dict | None = None,
    after: dict | None = None,
) -> str:
    raw = json.dumps(
        {
            "type": kind,
            "course_code": course_code or "",
            "summary": summary,
            "before": before,
            "after": after,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _event(kind: str, course_code: str | None, course_name: str | None, summary: str, before: dict | None = None, after: dict | None = None) -> ChangeEvent:
    return ChangeEvent(kind, course_code, course_name, summary, before, after, _fingerprint(kind, course_code, summary, before, after))


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
    return f"{format_session_label(new)} {new.course_name}：调整 " + "；".join(parts)


def _session_summary(prefix: str, session: CourseSession) -> str:
    text = f"{prefix}：{format_session_label(session)} {session.course_name}"
    if session.room:
        text += f" · {session.room}"
    if session.weeks:
        text += f"（{weeks_label(session.weeks)}）"
    return text


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
                f"学期起始日 {previous_first_day} → {current_first_day}，请留意周次",
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
    for session in removed:
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
            summary = _session_summary("取消", old)
            events.append(_event("removed", old.course_code, old.course_name, summary, old.to_dict(), None))

    for new in added:
        if id(new) in matched_added_ids:
            continue
        summary = _session_summary("新增", new)
        events.append(_event("added", new.course_code, new.course_name, summary, None, new.to_dict()))

    unique = {event.fingerprint: event for event in events}
    return sorted(unique.values(), key=lambda e: (e.type, e.course_code or "", e.summary))


def empty_confirmed_event() -> ChangeEvent:
    summary = "课表连续两次为空，已按空课表更新"
    return _event("empty_confirmed", None, None, summary)


def change_set_hash(changes: list[ChangeEvent]) -> str:
    if not changes:
        return ""
    raw = "\n".join(sorted(change.fingerprint for change in changes))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def format_change_message(changes: list[ChangeEvent], detected_at: str) -> str:
    when = datetime.fromisoformat(detected_at).strftime("%m-%d %H:%M")
    lines = [f"{index + 1}. {change.summary}" for index, change in enumerate(changes[:5])]
    if len(changes) > 5:
        lines.append(f"……共 {len(changes)} 处")
    return f"检测于 {when}\n" + "\n".join(lines)
