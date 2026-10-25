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
