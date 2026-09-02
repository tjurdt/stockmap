from twse_pipeline.config import CODES, RANKED_AT, UNIVERSE, load_universe


def test_universe_has_20_valid_constituents():
    # schema/universe.json 由 twse_pipeline.universe_rank 產生，內容會變 —— 只驗結構
    assert len(UNIVERSE) == 20
    assert all(len(c.code) == 4 and c.code.isdigit() for c in UNIVERSE)
    assert all(c.name and c.shares_m > 0 for c in UNIVERSE)
    assert "2330" in CODES  # 台積電永遠在市值前 20


def test_ranked_at_is_iso_date_or_none():
    assert RANKED_AT is None or len(RANKED_AT) == 10


def test_codes_matches_universe():
    assert frozenset(c.code for c in UNIVERSE) == CODES


def test_load_universe_is_pure(tmp_path):
    p = tmp_path / "u.json"
    p.write_text(
        '{"constituents":[{"code":"0050","name":"元大台灣50","sharesOutstandingM":1}]}', "utf-8"
    )
    u = load_universe(p)
    assert len(u) == 1 and u[0].code == "0050"
