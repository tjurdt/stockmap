import pytest
from jsonschema import ValidationError

from twse_pipeline.config import Constituent
from twse_pipeline.prices import PriceHistory
from twse_pipeline.snapshot import build_snapshot, build_stock_row, validate_snapshot

UNIVERSE = [Constituent("2330", "台積電", 25930), Constituent("2317", "鴻海", 13861)]


def _day(code, close, change, value):
    return {
        "Code": code,
        "ClosingPrice": str(close),
        "Change": str(change),
        "TradeValue": str(value),
    }


def _val(code):
    return {"Code": code, "PEratio": "28.3", "PBratio": "9.8", "DividendYield": "0.9"}


def test_build_stock_row_computes_derived_fields():
    row = build_stock_row(UNIVERSE[0], _day("2330", 1000, 20, 5e10), _val("2330"), [])
    assert row["mcap"] == pytest.approx(1000 * 25930 / 100)
    assert row["value"] == pytest.approx(500.0)
    assert row["chgPct"] == pytest.approx(20 / 980 * 100, rel=1e-4)
    assert row["mom20"] is None  # 序列不足


def test_build_snapshot_passes_schema():
    day_by_code = {"2330": _day("2330", 1000, 20, 5e10), "2317": _day("2317", 200, -2, 1e9)}
    val_by_code = {"2330": _val("2330"), "2317": _val("2317")}
    snap = build_snapshot("2026-09-02", UNIVERSE, day_by_code, val_by_code, PriceHistory())
    validate_snapshot(snap)  # 不拋例外即通過
    assert snap["schemaVersion"] == 1
    assert len(snap["stocks"]) == 2


def test_validate_snapshot_rejects_bad_data():
    bad = {
        "schemaVersion": 1,
        "asOf": "not-a-date",
        "generatedAt": "2026-09-02T00:00:00+08:00",
        "histLen": 0,
        "stocks": [],
    }
    with pytest.raises(ValidationError):
        validate_snapshot(bad)
