import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Callable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .models import CalendarEntry, FetchedSchedule
from .security import redact

try:
    TZ = ZoneInfo("Asia/Shanghai")
except ZoneInfoNotFoundError:
    # Windows 的 Python 未内置 IANA 时区库；中国无夏令时，固定 +08:00 等价。
    TZ = timezone(timedelta(hours=8), "Asia/Shanghai")
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
    datas = payload.get("datas") if isinstance(payload, dict) else None
    block = datas.get("rqzhzcjc") if isinstance(datas, dict) else None
    if isinstance(block, dict):
        rows = block.get("rows", [])
    elif isinstance(block, list):
        rows = block
    else:
        rows = []
    if isinstance(rows, dict):
        rows = [rows]
    if not isinstance(rows, list) or not rows:
        return None

    row = rows[0]
    if not isinstance(row, dict):
        return None
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


def _default_fetch_calendar(
    session, term: str, dates: list[date]
) -> list[CalendarEntry]:
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
            logger.info(
                "日历切片 %s 获取失败：%s",
                day.isoformat(),
                redact(str(exc))[:120],
            )
    return entries


class BitSchoolGateway:
    def __init__(
        self,
        *,
        login: Callable[[str, str], object] | None = None,
        fetch_courses: Callable[[object], dict] | None = None,
        fetch_calendar: (
            Callable[[object, str, list[date]], list[CalendarEntry]] | None
        ) = None,
        today: Callable[[], date] | None = None,
        calendar_days: int = 14,
    ):
        self._login = login if login is not None else _default_login
        self._fetch_courses = (
            fetch_courses if fetch_courses is not None else _default_fetch_courses
        )
        self._fetch_calendar = (
            fetch_calendar if fetch_calendar is not None else _default_fetch_calendar
        )
        self._today = today if today is not None else (lambda: datetime.now(TZ).date())
        self._calendar_days = calendar_days

    def fetch(self, username: str, password: str) -> FetchedSchedule:
        try:
            session = self._login(username, password)
        except SchoolError:
            raise
        except Exception:
            raise SchoolError(
                "LOGIN_FAILED", "登录教务系统失败，请检查账号密码或网络"
            ) from None

        try:
            raw = self._fetch_courses(session)
        except Exception:
            raise SchoolError("FETCH_FAILED", "读取课表失败，请稍后重试") from None

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
        days = [
            start + timedelta(days=index) for index in range(self._calendar_days)
        ]
        try:
            calendar = self._fetch_calendar(session, term, days)
        except Exception as exc:
            logger.info("日历切片整体获取失败：%s", redact(str(exc))[:120])
            calendar = []
        if not isinstance(calendar, list):
            calendar = []

        return FetchedSchedule(
            term=term,
            first_day=first_day,
            rows=rows,
            calendar=calendar,
        )
