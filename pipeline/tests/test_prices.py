from twse_pipeline.prices import PriceHistory


def test_record_appends_and_dedups_same_day():
    h = PriceHistory()
    assert h.record("2330", "2026-09-01", 1000.0) is True
    assert h.record("2330", "2026-09-01", 1000.0) is False  # 同日重複
    assert h.adj_series("2330") == [1000.0]
    assert h.last_date("2330") == "2026-09-01"


def test_adjustment_factor_backfills_history():
    h = PriceHistory()
    h.record("2330", "2026-09-01", 100.0)
    h.record("2330", "2026-09-02", 102.0)
    # 除權息：factor 0.9 套用在「新增當日之前」的所有 adj
    h.record("2330", "2026-09-03", 95.0, adj_factor=0.9)
    assert h.adj_series("2330") == [90.0, 91.8, 95.0]
    assert h.to_dict()["2330"]["raw"] == [100.0, 102.0, 95.0]  # raw 不受還原影響


def test_cap_truncates_oldest():
    h = PriceHistory()
    for i in range(10):
        h.record("2330", f"2026-01-{i + 1:02d}", float(i), cap=5)
    assert h.adj_series("2330") == [5.0, 6.0, 7.0, 8.0, 9.0]
    assert h.max_len() == 5


def test_roundtrip_save_load(tmp_path):
    h = PriceHistory()
    h.record("2330", "2026-09-01", 100.0)
    p = tmp_path / "prices.json"
    h.save(p)
    assert PriceHistory.load(p).adj_series("2330") == [100.0]


def test_load_missing_file_is_empty(tmp_path):
    h = PriceHistory.load(tmp_path / "nope.json")
    assert h.max_len() == 0
