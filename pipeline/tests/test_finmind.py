from twse_pipeline.sources import finmind


def test_fetch_recent_quotes_picks_common_latest_date(monkeypatch):
    data = {
        "2330": [
            {"date": "2026-09-01", "close": 2440.0, "spread": 5.0, "Trading_money": 1e11},
            {"date": "2026-09-02", "close": 2385.0, "spread": -55.0, "Trading_money": 9e10},
        ],
        "2317": [
            # 2317 少了 09-02 → 交易日應退回大家都有的 09-01
            {"date": "2026-09-01", "close": 256.0, "spread": 1.0, "Trading_money": 5e9},
        ],
    }
    monkeypatch.setattr(finmind, "_get", lambda ds, code, s, e: data[code])

    trading_date, rows = finmind.fetch_recent_quotes(["2330", "2317"], throttle_s=0)
    assert trading_date == "2026-09-02"
    # 只有 2330 有 09-02
    assert set(rows) == {"2330"}
    assert rows["2330"]["ClosingPrice"] == "2385.0"
    assert rows["2330"]["Change"] == "-55.0"


def test_fetch_recent_quotes_empty(monkeypatch):
    monkeypatch.setattr(finmind, "_get", lambda *a: [])
    assert finmind.fetch_recent_quotes(["2330"], throttle_s=0) == ("", {})
