from twse_pipeline import calendar as cal


def test_roc_to_iso():
    assert cal._roc_to_iso("1150101") == "2026-01-01"
    assert cal._roc_to_iso("1151009") == "2026-10-09"
    assert cal._roc_to_iso("bad") is None


def test_is_market_closed():
    assert cal._is_market_closed({"Name": "中華民國開國紀念日"}) is True
    assert cal._is_market_closed({"Name": "市場無交易，僅辦理結算交割作業"}) is True
    assert cal._is_market_closed({"Name": "國曆新年開始交易日"}) is False
    assert cal._is_market_closed({"Name": "農曆春節前最後交易日"}) is False


def test_parse_holidays_filters_weekends_and_trading_days():
    rows = [
        {"Name": "中華民國開國紀念日", "Date": "1150101"},  # 週四 → 留
        {"Name": "國曆新年開始交易日", "Date": "1150102"},  # 交易日 → 去
        {"Name": "農曆除夕及春節", "Date": "1150215"},  # 週日 → 去（週末）
        {"Name": "農曆除夕及春節", "Date": "1150216"},  # 週一 → 留
    ]
    assert cal.parse_holidays(rows) == ["2026-01-01", "2026-02-16"]


def test_build_calendar_merges_known(monkeypatch):
    monkeypatch.setattr(
        cal, "fetch_holiday_schedule", lambda: [{"Name": "端午節", "Date": "1150619"}]
    )
    monkeypatch.setattr(cal, "KNOWN_HOLIDAYS", ("2027-01-01",))
    out = cal.build_calendar()
    assert "2026-06-19" in out["holidays"]
    assert "2027-01-01" in out["holidays"]
    assert out["years"] == [2026, 2027]
