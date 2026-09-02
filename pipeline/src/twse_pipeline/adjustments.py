"""除權息還原因子。factor = 參考價 / 除權息前收盤價。"""

from __future__ import annotations

import sys
from collections.abc import Iterable

from .sources.twse import Row, fetch_exright
from .util import pick


def factors_from_rows(rows: Iterable[Row], codes: frozenset[str]) -> dict[str, float]:
    out: dict[str, float] = {}
    for r in rows:
        code = r.get("Code") or r.get("股票代號")
        if code not in codes:
            continue
        before = pick(r, "前收盤價") or pick(r, "除權息前")
        ref = pick(r, "參考價")
        if before and ref and before > 0:
            out[code] = ref / before
    return out


def fetch_adjustment_factors(codes: frozenset[str]) -> dict[str, float]:
    """抓 TWT49U 並算還原因子。抓不到就印警告回空 dict（當日不做還原調整）。"""
    try:
        rows = fetch_exright()
    except Exception as e:  # noqa: BLE001 — 任何失敗都應降級而非中斷整條管線
        print(f"  warn: 無法取得除權息表 ({e})，本日不做還原調整", file=sys.stderr)
        return {}
    factors = factors_from_rows(rows, codes)
    for code, f in factors.items():
        print(f"  除權息 {code}: factor={f:.6f}")
    return factors
