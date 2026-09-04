from datetime import date

from twse_pipeline import universe_history as uh


def test_week_end_dates_are_fridays_within_window():
    dates = uh.week_end_dates(1, today=date(2026, 9, 4))
    assert all(d.weekday() == 4 for d in dates)  # 全是週五
    assert dates == sorted(dates)
    assert 50 <= len(dates) <= 54
    assert dates[-1] <= date(2026, 9, 4)
    assert dates[0] >= date(2025, 9, 4)


def test_build_candidate_codes_unions_weekly_top_m(monkeypatch):
    # 兩個週五：第一週 A/B/C 最大，第二週 C/D/E 最大 → top_m=3 聯集 = {A..E}
    week1 = {"1001": 100, "1002": 90, "1003": 80, "1004": 10, "1005": 5}
    week2 = {"1001": 5, "1002": 10, "1003": 80, "1004": 90, "1005": 100}
    seq = iter([week1, week2])
    monkeypatch.setattr(uh, "fetch_market_close", lambda d: next(seq))

    shares = {c: 1.0 for c in week1}
    codes = uh.build_candidate_codes(
        [date(2026, 1, 2), date(2026, 1, 9)], shares, top_m=3, throttle_s=0
    )
    assert codes == {"1001", "1002", "1003", "1004", "1005"}


def test_closes_on_or_before_steps_back_over_holidays(monkeypatch):
    calls = iter([{}, {}, {"1001": 100.0, "1002": 50.0}])  # 前 2 天假日
    monkeypatch.setattr(uh, "fetch_market_close", lambda d: next(calls))
    got = uh.closes_on_or_before(date(2026, 1, 2), throttle_s=0)
    assert got == {"1001": 100.0, "1002": 50.0}
