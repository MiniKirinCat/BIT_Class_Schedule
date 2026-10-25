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
    assert exc.value.__cause__ is None


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


def test_fetch_courses_failure_is_wrapped_without_cause():
    def fail_courses(session):
        raise RuntimeError("cookie=SESSION=secret")

    gateway = BitSchoolGateway(
        login=lambda u, p: object(),
        fetch_courses=fail_courses,
        fetch_calendar=lambda s, t, d: [],
        today=lambda: date(2026, 10, 25),
    )
    with pytest.raises(SchoolError) as exc:
        gateway.fetch("20250001", "pw")
    assert exc.value.code == "FETCH_FAILED"
    assert "secret" not in str(exc.value)
    assert exc.value.__cause__ is None


def test_invalid_first_day_is_data_error():
    gateway = BitSchoolGateway(
        login=lambda u, p: object(),
        fetch_courses=lambda s: {
            "term": "2025-2026-1",
            "firstDay": "not-a-date",
            "data": [],
        },
        fetch_calendar=lambda s, t, d: [],
    )
    with pytest.raises(SchoolError) as exc:
        gateway.fetch("20250001", "pw")
    assert exc.value.code == "DATA_ERROR"


def test_missing_term_is_data_error():
    gateway = BitSchoolGateway(
        login=lambda u, p: object(),
        fetch_courses=lambda s: {"firstDay": "2025-09-01", "data": []},
        fetch_calendar=lambda s, t, d: [],
    )
    with pytest.raises(SchoolError) as exc:
        gateway.fetch("20250001", "pw")
    assert exc.value.code == "DATA_ERROR"


def test_calendar_entry_rejects_malformed_payloads():
    day = date(2026, 10, 25)
    assert calendar_entry_from_payload({"datas": []}, day) is None
    assert calendar_entry_from_payload(
        {"datas": {"rqzhzcjc": {"rows": ["bad"]}}}, day
    ) is None
    assert calendar_entry_from_payload(
        {"datas": {"rqzhzcjc": {"rows": []}}}, day
    ) is None


def test_calendar_entry_falls_back_on_invalid_xqj():
    entry = calendar_entry_from_payload(
        {"datas": {"rqzhzcjc": {"rows": [{"ZC": "9", "XQJ": 99}]}}},
        date(2026, 10, 25),
    )
    assert entry == CalendarEntry(date="2026-10-25", week=9, weekday=7)


def test_calendar_days_is_configurable():
    seen = []

    def fetch_calendar(session, term, dates):
        seen.extend(dates)
        return []

    gateway = BitSchoolGateway(
        login=lambda u, p: object(),
        fetch_courses=lambda s: RAW,
        fetch_calendar=fetch_calendar,
        today=lambda: date(2026, 10, 25),
        calendar_days=3,
    )
    gateway.fetch("u", "p")
    assert seen == [date(2026, 10, 25), date(2026, 10, 26), date(2026, 10, 27)]


def test_falsy_injected_callables_are_respected():
    class FalsyLogin:
        def __bool__(self):
            return False

        def __call__(self, username, password):
            return object()

    gateway = BitSchoolGateway(
        login=FalsyLogin(),
        fetch_courses=lambda s: RAW,
        fetch_calendar=lambda s, t, d: [],
        today=lambda: date(2026, 10, 25),
    )
    result = gateway.fetch("u", "p")
    assert result.term == "2025-2026-1"
