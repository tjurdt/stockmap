"""每日盤後進入點：python -m twse_pipeline.daily （或 console script `twse-daily`）。

流程：
  1. 收盤價：TWSE STOCK_DAY_ALL（一次抓全部）為主；它落後時退回逐檔 FinMind
  2. 本益比/淨值比/殖利率：TWSE BWIBBU_ALL
  3. 交易日以資料來源回報的日期為準（非執行機時鐘）
  4. 抓除權息表算還原因子，更新價格序列
  5. 產出 data/latest.json（schema 驗證後才寫）+ append data/history/factors-YYYY.jsonl
"""

from __future__ import annotations

import sys
from datetime import date, datetime, timedelta

from .adjustments import fetch_adjustment_factors
from .config import CODES, UNIVERSE
from .history import append_history_row, build_history_row
from .paths import LATEST_JSON, PRICES_JSON, TPE
from .prices import PriceHistory
from .snapshot import build_snapshot, write_snapshot
from .sources.finmind import fetch_prices, fetch_recent_quotes
from .sources.twse import Row, fetch_day_all, fetch_valuation_all
from .util import num, roc_to_iso


def _twse_day() -> tuple[str, dict[str, Row]]:
    """STOCK_DAY_ALL → (trading_date, {code: row})。日期不一致或無資料回 ("", {})。"""
    rows = {r["Code"]: r for r in fetch_day_all() if r.get("Code") in CODES}
    dates = {roc_to_iso(r.get("Date")) for r in rows.values()} - {None}
    if len(dates) != 1:
        return "", {}
    return dates.pop() or "", rows


def _finmind_is_ahead(tw_date: str) -> bool:
    """用單一檔 (2330) 探 FinMind 最新交易日；比 TWSE 新就代表 TWSE 落後。"""
    try:
        lo = (date.today() - timedelta(days=10)).isoformat()
        probe = fetch_prices("2330", lo, date.today().isoformat())
        return bool(probe) and probe[-1][0] > tw_date
    except Exception:  # noqa: BLE001
        return False


def _resolve_close_source() -> tuple[str, dict[str, Row]]:
    tw_date, tw = _twse_day()

    if not tw or _finmind_is_ahead(tw_date):
        try:
            fm_date, fm = fetch_recent_quotes(sorted(CODES))
            if fm and (not tw_date or fm_date >= tw_date):
                return fm_date, fm
        except Exception as e:  # noqa: BLE001 — FinMind 掛掉就用 TWSE
            print(f"  warn: FinMind 逐檔取得失敗 ({e})", file=sys.stderr)

    return tw_date, tw


def main() -> int:
    today, day_by_code = _resolve_close_source()
    if not day_by_code:
        print("休市或資料尚未更新，跳過。")
        return 0

    val_by_code = {r["Code"]: r for r in fetch_valuation_all() if r.get("Code") in CODES}
    print(
        f"交易日：{today}（executed {datetime.now(TPE).date().isoformat()}，{len(day_by_code)} 檔）"
    )

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
        f"history {'appended' if appended else 'skipped'}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
