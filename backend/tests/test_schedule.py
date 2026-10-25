from app.models import CourseSession
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
