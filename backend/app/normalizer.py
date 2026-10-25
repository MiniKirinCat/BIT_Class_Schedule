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
