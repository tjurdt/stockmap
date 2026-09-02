from twse_pipeline.adjustments import factors_from_rows

CODES = frozenset({"2330", "2317"})


def test_factors_from_rows_english_and_chinese_columns():
    rows = [
        {"Code": "2330", "除權息前收盤價": "100", "除權息參考價": "90"},
        {"股票代號": "2317", "前收盤價": "50", "參考價": "48"},
        {"Code": "9999", "除權息前收盤價": "10", "除權息參考價": "9"},  # 不在 universe
    ]
    factors = factors_from_rows(rows, CODES)
    assert factors["2330"] == 0.9
    assert round(factors["2317"], 4) == 0.96
    assert "9999" not in factors


def test_factors_from_rows_skips_incomplete():
    rows = [{"Code": "2330", "除權息參考價": "90"}]  # 缺前收盤價
    assert factors_from_rows(rows, CODES) == {}
