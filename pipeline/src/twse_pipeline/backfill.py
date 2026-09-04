"""一次性歷史回填：用 FinMind 原始收盤 + 配息自行還原，建立多年還原權值序列。

寫兩份：
  data/prices.json          — 截斷到最近 CAP 個交易日（每日管線算動能用）
  data/history/factors-*.jsonl — 完整區間（回測用）

FinMind 免費版有小時額度；整個 universe（~60 檔 × 4 種資料）會超量。每檔抓完就寫進
data/history/_backfill/<code>.json 當快取，碰到 402 時中斷、印訊息，重跑會從中斷處續抓。
設 FINMIND_TOKEN（免費註冊）額度會高很多。

  python -m twse_pipeline.backfill                # 整個 universe（可重跑續抓）
  python -m twse_pipeline.backfill --codes 2330   # 部分（新進榜股）
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import date, timedelta

from .config import UNIVERSE, load_backtest_universe
from .history import rebuild_from_prices
from .paths import HISTORY_DIR, PRICES_JSON
from .prices import CAP, PriceHistory
from .sources.finmind import (
    Dividend,
    RateLimited,
    fetch_dividends,
    fetch_prices,
    fetch_shares_history,
    fetch_valuation_history,
)

Valuation = dict[str, dict[str, dict[str, float | None]]]
Shares = dict[str, dict[str, float]]

LOOKBACK_DAYS = 1830  # 日曆日 ≈ 5 年（回測要夠長；前 ~1 年 mom121 會是 null）
_THROTTLE_S = 1.5
_CACHE_DIR = HISTORY_DIR / "_backfill"


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


def _fetch_one(code: str, start: str, end: str, *, deep: bool) -> dict:
    raw = fetch_prices(code, start, end)
    time.sleep(_THROTTLE_S)
    if not raw:
        return {}
    divs = fetch_dividends(code, start, end)
    dates, adj, raw_close = build_adjusted_series(raw, divs)
    out: dict = {"dates": dates, "adj": adj, "raw": raw_close}
    if deep:
        time.sleep(_THROTTLE_S)
        out["valuation"] = fetch_valuation_history(code, start, end)
        # 歷史股數（TaiwanStockShareholding）：大型股變動極小，額度吃緊時可略過，
        # rebuild 會退回用 universe 的現值算市值。設 FINMIND_TOKEN 時才抓。
        if os.environ.get("FINMIND_TOKEN"):
            time.sleep(_THROTTLE_S)
            out["shares"] = fetch_shares_history(code, start, end)
    return out


def backfill(codes: list[str], *, deep: bool) -> tuple[dict[str, dict], bool]:
    """抓 codes，每檔完成即寫入 _backfill 快取；回傳 ({code: payload}, complete?)。

    complete=False 表示碰到 FinMind 額度上限而中斷（快取已保留，重跑可續）。
    """
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache: dict[str, dict] = {}
    for p in _CACHE_DIR.glob("*.json"):
        cache[p.stem] = json.loads(p.read_text("utf-8"))

    end = date.today().isoformat()
    start = (date.today() - timedelta(days=LOOKBACK_DAYS)).isoformat()

    for i, code in enumerate(codes):
        if code in cache:
            continue
        if i:
            time.sleep(_THROTTLE_S)
        try:
            payload = _fetch_one(code, start, end, deep=deep)
        except RateLimited as e:
            print(f"  {e}\n  已抓 {len(cache)}/{len(codes)} 檔，稍後重跑此指令可續抓。")
            return cache, False
        if not payload:
            print(f"  {code}: FinMind 無資料，略過", file=sys.stderr)
            continue
        cache[code] = payload
        (_CACHE_DIR / f"{code}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")), "utf-8"
        )
        note = (
            f", 估值 {len(payload['valuation'])} / 股數 {len(payload['shares'])} 天" if deep else ""
        )
        print(f"  {code}: {len(payload['dates'])} 交易日{note}", flush=True)

    return cache, True


def _clear_cache() -> None:
    for p in _CACHE_DIR.glob("*.json"):
        p.unlink()
    if _CACHE_DIR.exists():
        _CACHE_DIR.rmdir()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="歷史回填")
    ap.add_argument("--codes", default="", help="逗號分隔股票代號；空 = 整個回測 universe")
    args = ap.parse_args(argv)
    only = [c.strip() for c in args.codes.split(",") if c.strip()]

    if only:
        # 部分回填（新進榜股）：更新 prices.json，factor history 由每日管線往後補
        cache, _ = backfill(only, deep=False)
        hist = PriceHistory.load(PRICES_JSON)
        for code in only:
            if code in cache:
                d = cache[code]
                hist.set_series(code, d["dates"], d["adj"], d["raw"])
        hist.prune({c.code for c in UNIVERSE})
        hist.capped(CAP).save(PRICES_JSON)
        _clear_cache()
        print(f"部分回填完成：{only}")
        return 0

    # 整個回測 universe：完整區間重建 factor history（含 PE/PB/DY + 歷史股數）
    bt_universe = load_backtest_universe()  # 有 backtest_universe.json 就用它，否則 universe.json
    keep = {c.code for c in bt_universe}
    cache, complete = backfill([c.code for c in bt_universe], deep=True)
    if not complete:
        return 0  # 快取已保留，晚點重跑

    full = PriceHistory()
    valuation: Valuation = {}
    shares: Shares = {}
    for code, d in cache.items():
        full.set_series(code, d["dates"], d["adj"], d["raw"])
        valuation[code] = d.get("valuation", {})
        shares[code] = d.get("shares", {})
    full.prune(keep)

    rows = rebuild_from_prices(bt_universe, full, valuation=valuation, shares=shares)
    daily_prices = full.capped(CAP)  # prices.json 只給每日管線算動能 → 顯示 universe 就夠
    daily_prices.prune({c.code for c in UNIVERSE})
    daily_prices.save(PRICES_JSON)
    _clear_cache()
    print(f"回填完成，回測 universe {len(bt_universe)} 檔，重建 factor history {rows} 列")
    return 0


if __name__ == "__main__":
    sys.exit(main())
