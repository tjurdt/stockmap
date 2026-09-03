"""動態市值前 N 大重排。

用 STOCK_DAY_ALL（全市場收盤）+ t187ap03_L（全上市公司已發行股數）算每檔市值，取前 N。
進出場門檻：現有成員名次 ≤ keep_until_rank 就保留，避免邊界股每週來回跳。

  python -m twse_pipeline.universe_rank            # 重排並寫回 schema/universe.json
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime

from .config import UNIVERSE, Constituent
from .paths import TPE, UNIVERSE_SCHEMA
from .sources.twse import Row, fetch_company_info, fetch_day_all
from .util import num

# universe = 市值前 60（回測選股池的上限 + 緩衝）；前端顯示前 DISPLAY_COUNT 檔
TOP_N = 60
KEEP_UNTIL_RANK = 70
DISPLAY_COUNT = 20
_SHARES_KEY = "已發行普通股數或TDR原股發行股數"


@dataclass(frozen=True)
class RankResult:
    constituents: list[Constituent]
    added: list[str]
    removed: list[str]
    ranked_at: str


def shares_by_code(company_rows: list[Row]) -> dict[str, float]:
    out: dict[str, float] = {}
    for r in company_rows:
        code = r.get("公司代號", "")
        s = num(r.get(_SHARES_KEY))
        if len(code) == 4 and code.isdigit() and s and s > 0:
            out[code] = s / 1e6  # 百萬股
    return out


def names_by_code(company_rows: list[Row]) -> dict[str, str]:
    return {
        r["公司代號"]: (r.get("公司簡稱") or r["公司代號"]).strip().rstrip("*") or r["公司代號"]
        for r in company_rows
        if r.get("公司代號")
    }


def rank(
    day_by_code: dict[str, Row],
    shares: dict[str, float],
    names: dict[str, str],
    *,
    current: list[str],
    top_n: int = TOP_N,
    keep_until_rank: int = KEEP_UNTIL_RANK,
) -> RankResult:
    mcap: dict[str, float] = {}
    for code, sh in shares.items():
        close = num(day_by_code.get(code, {}).get("ClosingPrice"))
        if close and close > 0:
            mcap[code] = close * sh / 100  # 億元

    ranked = sorted(mcap, key=lambda c: mcap[c], reverse=True)
    rank_of = {code: i + 1 for i, code in enumerate(ranked)}
    inf = len(ranked) + 1

    keep = [c for c in current if rank_of.get(c, inf) <= keep_until_rank]
    if len(keep) > top_n:  # 罕見：太多現任擠在門檻內，留名次最前的
        keep = sorted(keep, key=lambda c: rank_of[c])[:top_n]
    fill = [c for c in ranked if c not in keep][: top_n - len(keep)]
    selected = sorted([*keep, *fill], key=lambda c: rank_of[c])

    prev = set(current)
    now = set(selected)
    return RankResult(
        constituents=[Constituent(c, names.get(c, c), round(shares[c], 3)) for c in selected],
        added=sorted(now - prev),
        removed=sorted(prev - now),
        ranked_at=datetime.now(TPE).date().isoformat(),
    )


def write_universe(result: RankResult, path=UNIVERSE_SCHEMA) -> None:
    payload = {
        "$comment": (
            f"台股市值前 {TOP_N} 大 — 由 twse_pipeline.universe_rank 每週重排，勿手改。"
            f"前端顯示前 displayCount 檔；其餘供回測選股池。"
            "sharesOutstandingM = 已發行普通股數（百萬股）。"
        ),
        "rankedAt": result.ranked_at,
        "displayCount": DISPLAY_COUNT,
        "constituents": [
            {"code": c.code, "name": c.name, "sharesOutstandingM": c.shares_m}
            for c in result.constituents
        ],
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", "utf-8")


def main() -> int:
    day_rows = fetch_day_all()
    day_by_code = {r["Code"]: r for r in day_rows if r.get("Code")}
    company_rows = fetch_company_info()

    result = rank(
        day_by_code,
        shares_by_code(company_rows),
        names_by_code(company_rows),
        current=[c.code for c in UNIVERSE],
    )
    if len(result.constituents) < DISPLAY_COUNT:
        print(f"錯誤：只排出 {len(result.constituents)} 檔（資料不足），不覆寫。", file=sys.stderr)
        return 1

    write_universe(result)
    print(f"重排 {result.ranked_at}：{[c.code for c in result.constituents]}")
    print(f"  新增 {result.added or '無'} / 移除 {result.removed or '無'}")

    if out := os.environ.get("GITHUB_OUTPUT"):
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"added={','.join(result.added)}\n")
            f.write(f"changed={'true' if result.added or result.removed else 'false'}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
