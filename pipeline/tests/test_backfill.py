import pytest

from twse_pipeline.backfill import build_adjusted_series
from twse_pipeline.sources.finmind import Dividend


def _raw(*closes: float) -> list[tuple[str, float]]:
    return [(f"2026-01-{i + 1:02d}", c) for i, c in enumerate(closes)]


def test_no_dividend_adj_equals_raw():
    dates, adj, raw = build_adjusted_series(_raw(100, 101, 102), [])
    assert adj == [100, 101, 102]
    assert raw == [100, 101, 102]
    assert dates[-1] == "2026-01-03"


def test_cash_dividend_backfills_prior_days_only():
    # 除息日 2026-01-04：前收 100、現金 4 → factor 0.96
    raw = _raw(100, 100, 100, 96, 98)
    div = [Dividend("2026-01-04", cash=4.0, stock=0.0)]
    dates, adj, raw_close = build_adjusted_series(raw, div)
    assert adj == [96, 96, 96, 96, 98]
    assert raw_close == [100, 100, 100, 96, 98]
    assert adj[-1] == raw_close[-1]  # 天然接回每日管線


def test_stock_dividend_uses_par_10():
    # 配股 1 元/股 = 0.1 股/股 → ref = prev / 1.1
    raw = _raw(110, 100, 100)
    _, adj, _ = build_adjusted_series(raw, [Dividend("2026-01-02", cash=0.0, stock=1.0)])
    assert adj[0] == pytest.approx(110 / 1.1)
    assert adj[1:] == [100, 100]


def test_same_day_dividends_merge():
    raw = _raw(100, 100, 96)
    divs = [Dividend("2026-01-03", 2.0, 0.0), Dividend("2026-01-03", 2.0, 0.0)]
    _, adj, _ = build_adjusted_series(raw, divs)
    assert adj[0] == pytest.approx(96.0)  # (100-4)/100 = 0.96


def test_split_makes_series_continuous():
    # 2026-01-03 一拆四：前一天 200、當天 ~50。分割前的 adj 應除以 4。
    raw = _raw(200, 200, 51, 52)
    _, adj, raw_close = build_adjusted_series(raw, [], splits=[("2026-01-03", 4.0)])
    assert adj[:2] == [50.0, 50.0]  # 200 / 4
    assert adj[2:] == [51, 52]
    assert raw_close == [200, 200, 51, 52]  # raw 不動
    assert adj[-1] == raw_close[-1]


def test_split_and_dividend_same_day_combine():
    # 同一天：現金股利 1（factor 0.98，以拆分前 50 元計）+ 一拆二
    raw = _raw(50, 24)
    _, adj, _ = build_adjusted_series(
        raw, [Dividend("2026-01-02", cash=1.0, stock=0.0)], splits=[("2026-01-02", 2.0)]
    )
    assert adj[0] == pytest.approx(50 * (49 / 50) * 0.5)  # 24.5
