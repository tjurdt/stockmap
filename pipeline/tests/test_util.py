from twse_pipeline.util import num, pick, roc_to_iso


def test_num_parses_commas_and_whitespace():
    assert num("1,234.5") == 1234.5
    assert num("  42 ") == 42.0
    assert num(7) == 7.0


def test_num_returns_none_on_garbage():
    assert num("--") is None
    assert num("") is None
    assert num(None) is None


def test_roc_to_iso():
    assert roc_to_iso("1150902") == "2026-09-02"
    assert roc_to_iso("1000101") == "2011-01-01"  # 民國 100 年
    assert roc_to_iso(1150902) == "2026-09-02"


def test_roc_to_iso_rejects_bad_input():
    assert roc_to_iso("abc") is None
    assert roc_to_iso("115090") is None  # 太短
    assert roc_to_iso("") is None


def test_pick_fuzzy_matches_columns():
    row = {"除權息前收盤價": "100", "除權息參考價": "95"}
    assert pick(row, "前收盤價") == 100.0
    assert pick(row, "參考價") == 95.0
    assert pick(row, "不存在") is None
