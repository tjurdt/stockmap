"""市場參照基準 → data/baselines.jsonl（每列 {date, twiiTR, e0050}）。

  twiiTR — 發行量加權股價報酬指數（大盤含息），FinMind
  e0050  — 元大台灣50 還原權值收盤（含息），FinMind 原始價 + 配息自行還原

回測圖表把策略 / 基準 / 這兩條都正規化到起點 = 1 來比較。每次 daily / backfill 重建整檔
（~1300 列、~40 KB，只有最後一列會變，git delta 友善）。
"""

from __future__ import annotations

import json
from datetime import date, timedelta

from .backfill import LOOKBACK_DAYS, build_adjusted_series
from .paths import DATA_DIR
from .sources.finmind import fetch_dividends, fetch_prices, fetch_total_return_index

BASELINES_JSONL = DATA_DIR / "baselines.jsonl"


def build_rows(*, lookback_days: int = LOOKBACK_DAYS) -> list[dict]:
    end = date.today().isoformat()
    start = (date.today() - timedelta(days=lookback_days)).isoformat()

    twii = dict(fetch_total_return_index("TAIEX", start, end))

    raw = fetch_prices("0050", start, end)
    divs = fetch_dividends("0050", start, end)
    dates, adj, _ = build_adjusted_series(raw, divs)
    e0050 = dict(zip(dates, adj, strict=True))

    all_dates = sorted(set(twii) | set(e0050))
    rows: list[dict] = []
    for d in all_dates:
        row: dict[str, object] = {"date": d}
        if d in twii:
            row["twiiTR"] = round(twii[d], 2)
        if d in e0050:
            row["e0050"] = round(e0050[d], 4)
        if len(row) > 1:
            rows.append(row)
    return rows


def rebuild_baselines() -> int:
    rows = build_rows()
    BASELINES_JSONL.parent.mkdir(parents=True, exist_ok=True)
    BASELINES_JSONL.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows) + "\n",
        "utf-8",
    )
    return len(rows)


if __name__ == "__main__":
    print(f"baselines: {rebuild_baselines()} 列")
