"""一次性歷史回填：用 FinMind 原始收盤 + 配息自行還原，建立約一年的還原權值序列。

每日管線（twse_pipeline.daily）仍以 TWSE 為主；本模組只在初次啟用或有新股進榜時跑。

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
from .sources.finmind import Dividend, fetch_dividends, fetch_prices

LOOKBACK_DAYS = 570  # 日曆日；≈ 390 交易日，> mom121 需要的 250
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


def backfill(codes: list[str] | None, *, existing: PriceHistory | None = None) -> PriceHistory:
    hist = existing if existing is not None else PriceHistory()
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
        hist.set_series(code, dates[-CAP:], adj[-CAP:], raw_close[-CAP:])
        print(f"  {code}: {len(dates)} 交易日, {len(divs)} 次除息, adj[-1]={adj[-1]}")
    return hist


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="歷史回填")
    ap.add_argument("--codes", default="", help="逗號分隔股票代號；空 = 整個 universe")
    args = ap.parse_args(argv)
    codes = [c.strip() for c in args.codes.split(",") if c.strip()] or None

    # 部分回填時保留其他股的既有序列；整個 universe 回填則從空的開始
    existing = PriceHistory.load(PRICES_JSON) if codes else None
    hist = backfill(codes, existing=existing)
    hist.prune({c.code for c in UNIVERSE})
    hist.save(PRICES_JSON)

    rows = rebuild_from_prices(UNIVERSE, hist)
    print(f"回填完成，序列最長 {hist.max_len()} 交易日，重建 factor history {rows} 列")
    return 0


if __name__ == "__main__":
    sys.exit(main())
