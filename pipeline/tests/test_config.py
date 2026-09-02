from twse_pipeline.config import CODES, UNIVERSE, load_universe


def test_universe_loads_from_schema_file():
    assert len(UNIVERSE) == 20
    assert UNIVERSE[0].code == "2330"
    assert UNIVERSE[0].name == "台積電"
    assert UNIVERSE[0].shares_m == 25930


def test_codes_matches_universe():
    assert frozenset(c.code for c in UNIVERSE) == CODES
    assert all(len(c) == 4 and c.isdigit() for c in CODES)


def test_load_universe_is_pure(tmp_path):
    p = tmp_path / "u.json"
    p.write_text(
        '{"constituents":[{"code":"0050","name":"元大台灣50","sharesOutstandingM":1}]}', "utf-8"
    )
    u = load_universe(p)
    assert len(u) == 1 and u[0].code == "0050"
