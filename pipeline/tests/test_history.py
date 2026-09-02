from twse_pipeline.config import Constituent
from twse_pipeline.history import append_history_row, build_history_row, validate_history_row
from twse_pipeline.prices import PriceHistory

UNIVERSE = [Constituent("2330", "台積電", 25930)]


def _day(close):
    return {"Code": "2330", "ClosingPrice": str(close), "Change": "0", "TradeValue": "0"}


def _row():
    return build_history_row(
        "2026-09-02", UNIVERSE, {"2330": _day(1000)}, {"2330": {}}, PriceHistory()
    )


def test_history_row_passes_schema():
    validate_history_row(_row())


def test_append_history_row_dedups_same_day(tmp_path):
    assert append_history_row(_row(), tmp_path) is True
    assert append_history_row(_row(), tmp_path) is False
    lines = (tmp_path / "factors-2026.jsonl").read_text("utf-8").splitlines()
    assert len(lines) == 1
