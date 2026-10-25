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
