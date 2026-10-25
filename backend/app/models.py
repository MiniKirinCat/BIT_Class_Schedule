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
