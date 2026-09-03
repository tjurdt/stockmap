"""一次性歷史回填：用 FinMind 原始收盤 + 配息自行還原，建立多年還原權值序列。

寫兩份：
  data/prices.json          — 截斷到最近 CAP 個交易日（每日管線算動能用）
  data/history/factors-*.jsonl — 完整區間（回測用）

每日管線（twse_pipeline.daily）以 FinMind + TWSE 為主；本模組只在初次啟用或有新股進榜時跑。

  python -m twse_pipeline.backfill                # 整個 universe
  python -m twse_pipeline.backfill --codes 2330,2317
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import date, timedelta

from .config import UNIVERSE
from .history import rebuild_from_prices
from .paths import PRICES_JSON
from .prices import CAP, PriceHistory
from .sources.finmind import (
    Dividend,
    fetch_dividends,
    fetch_prices,
    fetch_valuation_history,
)

Valuation = dict[str, dict[str, dict[str, float | None]]]

LOOKBACK_DAYS = 1830  # 日曆日 ≈ 5 年（回測要夠長；前 ~1 年 mom121 會是 null）
_THROTTLE_S = 1.5


def build_adjusted_series(
    raw: list[tuple[str, float]], dividends: list[Dividend]
) -> tuple[list[str], list[float], list[float]]:
    """raw：由舊到新的 (date, close)。回傳 (dates, adj, raw_close)。

    遇到除息交易日 d：ref = (prev_close - cash) / (1 + stock/10)，factor = ref / prev_close，
    把 d 之前所有 adj 乘上 factor（鏡射 adjustments.py 的 ref/before）。
    序列最後一天無後續除息 → adj[-1] == raw[-1]，天然接回每日管線。
    """
    div_by_date: dict[str, Dividend] = {}
    for dv in dividends:
        prev = div_by_date.get(dv.ex_date)
        div_by_date[dv.ex_date] = (
            Dividend(dv.ex_date, prev.cash + dv.cash, prev.stock + dv.stock) if prev else dv
        )

    dates: list[str] = []
    adj: list[float] = []
    raw_close: list[float] = []
    prev_close: float | None = None
    for d, close in raw:
        div = div_by_date.get(d)
        if div and prev_close and prev_close > 0:
            ref = (prev_close - div.cash) / (1 + div.stock / 10)
            factor = ref / prev_close
            adj = [round(p * factor, 6) for p in adj]
        dates.append(d)
        adj.append(close)
        raw_close.append(close)
        prev_close = close
    return dates, adj, raw_close


def backfill(
    codes: list[str] | None, *, existing: PriceHistory | None = None, with_valuation: bool = False
) -> tuple[PriceHistory, Valuation]:
    hist = existing if existing is not None else PriceHistory()
    valuation: Valuation = {}
    end = date.today()
    start = (end - timedelta(days=LOOKBACK_DAYS)).isoformat()
    targets = codes or [c.code for c in UNIVERSE]

    for i, code in enumerate(targets):
        if i:
            time.sleep(_THROTTLE_S)
        raw = fetch_prices(code, start, end.isoformat())
        time.sleep(_THROTTLE_S)
        if not raw:
            print(f"  {code}: FinMind 無資料，略過", file=sys.stderr)
            continue
        divs = fetch_dividends(code, start, end.isoformat())
        dates, adj, raw_close = build_adjusted_series(raw, divs)
        hist.set_series(code, dates, adj, raw_close)  # 完整區間，不截斷
        note = ""
        if with_valuation:
            time.sleep(_THROTTLE_S)
            valuation[code] = fetch_valuation_history(code, start, end.isoformat())
            note = f", 估值 {len(valuation[code])} 天"
        print(f"  {code}: {len(dates)} 交易日, {len(divs)} 次除息{note}, adj[-1]={adj[-1]}")
    return hist, valuation


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="歷史回填")
    ap.add_argument("--codes", default="", help="逗號分隔股票代號；空 = 整個 universe")
    args = ap.parse_args(argv)
    codes = [c.strip() for c in args.codes.split(",") if c.strip()] or None

    if codes:
        # 部分回填（新進榜股）：只更新 prices.json，歷史 factor 由每日管線往後補
        existing = PriceHistory.load(PRICES_JSON)
        full, _ = backfill(codes, existing=existing)
        full.prune({c.code for c in UNIVERSE})
        full.capped(CAP).save(PRICES_JSON)
        print(f"部分回填完成：{codes}（factor history 不重建）")
        return 0

    # 整個 universe：完整區間重建 factor history（含 PE/PB/DY）+ 截斷寫 prices.json
    full, valuation = backfill(None, with_valuation=True)
    full.prune({c.code for c in UNIVERSE})
    rows = rebuild_from_prices(UNIVERSE, full, valuation=valuation)
    full.capped(CAP).save(PRICES_JSON)
    print(f"回填完成，完整序列 {full.max_len()} 交易日，重建 factor history {rows} 列")
    return 0


if __name__ == "__main__":
    sys.exit(main())
