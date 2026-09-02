import pytest

from twse_pipeline.factors import FACTORS, compute_all, total_return


def test_total_return_simple():
    # 21 個點：頭尾差 10% → 20 日動能 = 10
    series = [100.0] * 20 + [110.0]
    assert total_return(series, 20) == pytest.approx(10.0)


def test_total_return_needs_lookback_plus_one():
    assert total_return([100.0] * 20, 20) is None  # 只有 20 點，需 21
    assert total_return([100.0] * 21, 20) == pytest.approx(0.0)


def test_total_return_skip_offsets_the_end():
    # 索引 0..251，值 = 100 + i。need = 251，start = series[-251] = series[1] = 101
    # skip=20 → end = series[-21] = series[231] = 331 → (331/101 - 1) * 100
    series = [100.0 + i for i in range(252)]
    expected = (series[-21] / series[-251] - 1) * 100
    assert total_return(series, 250, skip=20) == pytest.approx(expected)


def test_mom121_is_250d_return_skipping_last_20d():
    # 釘死 12-1 動能語意：回看 250 交易日、跳過最近 20 日
    series = [100.0 + i for i in range(300)]
    assert FACTORS["mom121"](series) == total_return(series, 250, skip=20)


def test_compute_all_returns_all_registered_keys():
    result = compute_all([100.0] * 300)
    assert set(result) == set(FACTORS)


def test_total_return_zero_start_returns_none():
    # start (series[-21]) 落在 0.0 上 → 避免除以零，回 None
    assert total_return([0.0] * 6 + [1.0] * 20, 20) is None
