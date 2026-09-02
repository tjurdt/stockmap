"""每日盤後進入點：python -m twse_pipeline.daily （或 console script `twse-daily`）。

流程：
  1. 抓 STOCK_DAY_ALL / BWIBBU_ALL
  2. 交易日以 API 回報的 Date 為準（非執行機時鐘 —— 假日 API 會回上一交易日的舊資料）
  3. 抓除權息表算還原因子，更新價格序列
  4. 產出 data/latest.json（schema 驗證後才寫）
  5. append data/history/factors-YYYY.jsonl
"""

from __future__ import annotations

import sys
from datetime import datetime

from .adjustments import fetch_adjustment_factors
from .config import CODES, UNIVERSE
from .history import append_history_row, build_history_row
from .paths import LATEST_JSON, PRICES_JSON, TPE
from .prices import PriceHistory
from .snapshot import build_snapshot, write_snapshot
from .sources.twse import Row, fetch_day_all, fetch_valuation_all
from .util import num, roc_to_iso


def _resolve_trading_date(day_by_code: dict[str, Row]) -> str | None:
    dates = {roc_to_iso(r.get("Date")) for r in day_by_code.values()} - {None}
    if len(dates) != 1:
        print(f"警告：回傳日期不一致 {dates}，跳過。", file=sys.stderr)
        return None
    return dates.pop()


def main() -> int:
    day_rows = fetch_day_all()
    day_by_code = {r["Code"]: r for r in day_rows if r.get("Code") in CODES}
    val_by_code = {r["Code"]: r for r in fetch_valuation_all() if r.get("Code") in CODES}

    if not day_by_code:
        print("休市或資料尚未更新，跳過。")
        return 0

    today = _resolve_trading_date(day_by_code)
    if today is None:
        return 1
    print(f"交易日：{today}（executed {datetime.now(TPE).date().isoformat()}）")

    factors = fetch_adjustment_factors(CODES)

    history = PriceHistory.load(PRICES_JSON)
    for c in UNIVERSE:
        close = num(day_by_code.get(c.code, {}).get("ClosingPrice"))
        if close is None:
            continue
        history.record(c.code, today, close, adj_factor=factors.get(c.code))
    history.prune(set(CODES))  # 移除已被踢出名單的股票
    history.save(PRICES_JSON)

    snapshot = build_snapshot(today, UNIVERSE, day_by_code, val_by_code, history)
    write_snapshot(snapshot, LATEST_JSON)

    row = build_history_row(today, UNIVERSE, day_by_code, val_by_code, history)
    appended = append_history_row(row)

    print(
        f"{today}: 寫入 {len(snapshot['stocks'])} 檔，序列長度 {snapshot['histLen']}，"
        f"history {'appended' if appended else 'skipped (同日)'}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
