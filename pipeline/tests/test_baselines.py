from twse_pipeline import baselines


def test_build_rows_merges_and_rounds(monkeypatch):
    monkeypatch.setattr(
        baselines,
        "fetch_total_return_index",
        lambda i, s, e: [("2026-09-01", 100.0), ("2026-09-02", 110.017)],
    )
    monkeypatch.setattr(
        baselines, "fetch_prices", lambda c, s, e: [("2026-09-01", 50.0), ("2026-09-03", 52.0)]
    )
    monkeypatch.setattr(baselines, "fetch_dividends", lambda c, s, e: [])

    rows = baselines.build_rows()
    by_date = {r["date"]: r for r in rows}
    assert by_date["2026-09-01"] == {"date": "2026-09-01", "twiiTR": 100.0, "e0050": 50.0}
    assert by_date["2026-09-02"]["twiiTR"] == 110.02  # 四捨五入到 2 位
    assert "twiiTR" not in by_date["2026-09-03"]  # 指數沒這天
    assert by_date["2026-09-03"]["e0050"] == 52.0
