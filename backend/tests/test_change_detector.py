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
