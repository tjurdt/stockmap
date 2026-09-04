"""建立回測用的「歷史選股池」—— 過去 N 年，每週最後一個交易日市值前 M 大的股票聯集。

解決存活者偏誤：`universe_rank` 只看「現在」的前 60；本模組把「當年曾經夠大、現在掉出去」的
股票也收進來，回測時再用當日市值 point-in-time 篩前 50。

  python -m twse_pipeline.universe_history            # 寫 schema/backtest_universe.json
  python -m twse_pipeline.universe_history --years 3 --top 60

候選名單用「現在的股數 × 當日收盤」粗估市值排名（快、只打 TWSE）；取前 M（>50 的緩衝）再聯集，
邊界誤差被緩衝吸收。回測的實際排名由 backfill 抓的歷史股數決定，才是精準的。
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import date, timedelta

from .config import Constituent
from .paths import BACKTEST_UNIVERSE
from .sources.twse import fetch_company_info, fetch_market_close
from .universe_rank import names_by_code, shares_by_code

_THROTTLE_S = 2.5


def week_end_dates(years: int, *, today: date | None = None) -> list[date]:
    """過去 years 年每一週的週五（星期五），由舊到新。"""
    end = today or date.today()
    start = end - timedelta(days=365 * years)
    d = start + timedelta(days=(4 - start.weekday()) % 7)  # 第一個 >= start 的週五
    out: list[date] = []
    while d <= end:
        out.append(d)
        d += timedelta(days=7)
    return out


def closes_on_or_before(
    target: date, *, back: int = 4, throttle_s: float = _THROTTLE_S
) -> dict[str, float]:
    """target 當天的全市場收盤；遇假日往前找，最多 back 天。"""
    for i in range(back):
        closes = fetch_market_close((target - timedelta(days=i)).strftime("%Y%m%d"))
        if closes:
            return closes
        time.sleep(throttle_s)
    return {}


def build_candidate_codes(
    dates: list[date],
    shares: dict[str, float],
    *,
    top_m: int,
    throttle_s: float = _THROTTLE_S,
) -> set[str]:
    candidates: set[str] = set()
    for i, d in enumerate(dates):
        if i:
            time.sleep(throttle_s)
        closes = closes_on_or_before(d, throttle_s=throttle_s)
        if not closes:
            print(f"  {d}: 無資料，略過", file=sys.stderr)
            continue
        mcap = [(c, closes[c] * s) for c, s in shares.items() if c in closes]
        mcap.sort(key=lambda x: -x[1])
        top = [c for c, _ in mcap[:top_m]]
        candidates.update(top)
        print(f"  {d}: 前 {top_m} = {top[:5]}… (累計候選 {len(candidates)})", flush=True)
    return candidates


def build_universe(years: int, top_m: int) -> list[Constituent]:
    company = fetch_company_info()
    shares = shares_by_code(company)
    names = names_by_code(company)

    dates = week_end_dates(years)
    codes = build_candidate_codes(dates, shares, top_m=top_m)
    codes &= set(shares)  # 只留現在還有股數資料的（現在還上市）

    # 依「現在市值」排序 —— 讓 backtest_universe.json 也是市值序（方便閱讀）
    latest = closes_on_or_before(date.today())
    codes_sorted = sorted(
        codes,
        key=lambda c: latest.get(c, 0.0) * shares.get(c, 0.0),
        reverse=True,
    )
    return [Constituent(c, names.get(c, c), round(shares[c], 3)) for c in codes_sorted]


def write(constituents: list[Constituent], years: int, top_m: int) -> None:
    payload = {
        "$comment": (
            f"回測選股池 — 過去 {years} 年每週市值前 {top_m} 大的聯集，"
            "由 twse_pipeline.universe_history 產生，勿手改。"
            "sharesOutstandingM = 目前已發行普通股數（百萬股）。"
        ),
        "builtAt": date.today().isoformat(),
        "years": years,
        "constituents": [
            {"code": c.code, "name": c.name, "sharesOutstandingM": c.shares_m} for c in constituents
        ],
    }
    BACKTEST_UNIVERSE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", "utf-8")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="建立回測歷史選股池")
    ap.add_argument("--years", type=int, default=3)
    ap.add_argument("--top", type=int, default=60, help="每週取前 M（>50 的緩衝）")
    args = ap.parse_args(argv)

    constituents = build_universe(args.years, args.top)
    if len(constituents) < 50:
        print(f"錯誤：只聚出 {len(constituents)} 檔，資料異常，不覆寫。", file=sys.stderr)
        return 1
    write(constituents, args.years, args.top)
    print(f"寫入 {len(constituents)} 檔到 {BACKTEST_UNIVERSE.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
