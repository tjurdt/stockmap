"""因子計算 —— 全部是純函式。前端只視覺化這裡算好的值，不重算。

新增因子時見 docs/ADDING_A_FACTOR.md：在此加純函式 + FACTORS 註冊 + 對應測試，
再到 schema/snapshot.schema.json 與 web/src/lib/metrics.ts 用相同 key 對映。
"""

from __future__ import annotations

from collections.abc import Callable, Sequence

Series = Sequence[float]


def total_return(series: Series, lookback: int, skip: int = 0) -> float | None:
    """還原價序列（由舊到新）的區間報酬率 (%)。

    lookback = 觀察的交易日數；skip = 跳過最近幾個交易日（12-1 動能用 skip=20）。
    序列長度不足 lookback+1 時回 None。
    """
    need = lookback + 1
    if len(series) < need:
        return None
    end = series[-1 - skip]
    start = series[-need]
    return (end / start - 1) * 100 if start else None


# key 必須與 schema/snapshot.schema.json 及 web/src/lib/metrics.ts 一致
FACTORS: dict[str, Callable[[Series], float | None]] = {
    "mom20": lambda s: total_return(s, 20),
    "mom60": lambda s: total_return(s, 60),
    "mom121": lambda s: total_return(s, 250, skip=20),
}


def compute_all(series: Series) -> dict[str, float | None]:
    return {key: fn(series) for key, fn in FACTORS.items()}
