"""append data/history/factors-YYYY.jsonl —— 每交易日一列全因子快照，供回測 / 因子績效。

append-only、依年份分檔，對 git 友善（不像 latest.json 每天整檔重寫）。
"""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema

from .config import Constituent
from .factors import compute_all
from .paths import HISTORY_DIR, HISTORY_SCHEMA
from .prices import PriceHistory
from .sources.twse import Row
from .util import num

SCHEMA_VERSION = 1


def build_history_row(
    date: str,
    universe: list[Constituent],
    day_by_code: dict[str, Row],
    val_by_code: dict[str, Row],
    history: PriceHistory,
) -> dict:
    stocks = []
    for c in universe:
        day, val = day_by_code.get(c.code, {}), val_by_code.get(c.code, {})
        adj = history.adj_series(c.code)
        close = num(day.get("ClosingPrice"))
        factors = compute_all(adj)
        stocks.append(
            {
                "code": c.code,
                "close": close,
                "adjClose": adj[-1] if adj else None,
                "mcap": round(close * c.shares_m / 100, 2) if close is not None else None,
                "pe": num(val.get("PEratio")),
                "pb": num(val.get("PBratio")),
                "dy": num(val.get("DividendYield")),
                "mom20": _r(factors["mom20"]),
                "mom60": _r(factors["mom60"]),
                "mom121": _r(factors["mom121"]),
            }
        )
    return {"schemaVersion": SCHEMA_VERSION, "date": date, "stocks": stocks}


def _r(v: float | None) -> float | None:
    return round(v, 3) if v is not None else None


def validate_history_row(row: dict) -> None:
    schema = json.loads(HISTORY_SCHEMA.read_text("utf-8"))
    jsonschema.validate(row, schema)


def rebuild_from_prices(
    universe: list[Constituent], history: PriceHistory, *, history_dir: Path = HISTORY_DIR
) -> int:
    """用回填好的價格序列，整檔重建 data/history/factors-YYYY.jsonl。

    PE/PB/DY 無歷史資料 → null（每日管線之後會為新日期補上）。回傳寫入的總列數。
    """
    per_code = {}
    for c in universe:
        dates, adj, raw = history.series(c.code)
        per_code[c.code] = (dates, adj, raw, {d: i for i, d in enumerate(dates)})

    all_dates = sorted({d for dates, *_ in per_code.values() for d in dates})
    by_year: dict[str, list[str]] = {}
    for date in all_dates:
        stocks = []
        for c in universe:
            dates, adj, raw, idx = per_code[c.code]
            i = idx.get(date)
            if i is None:
                continue
            factors = compute_all(adj[: i + 1])
            stocks.append(
                {
                    "code": c.code,
                    "close": raw[i],
                    "adjClose": adj[i],
                    "mcap": round(raw[i] * c.shares_m / 100, 2),
                    "pe": None,
                    "pb": None,
                    "dy": None,
                    "mom20": _r(factors["mom20"]),
                    "mom60": _r(factors["mom60"]),
                    "mom121": _r(factors["mom121"]),
                }
            )
        if not stocks:
            continue
        row = {"schemaVersion": SCHEMA_VERSION, "date": date, "stocks": stocks}
        validate_history_row(row)
        by_year.setdefault(date[:4], []).append(
            json.dumps(row, ensure_ascii=False, separators=(",", ":"))
        )

    history_dir.mkdir(parents=True, exist_ok=True)
    total = 0
    for year, lines in by_year.items():
        (history_dir / f"factors-{year}.jsonl").write_text("\n".join(lines) + "\n", "utf-8")
        total += len(lines)
    return total


def append_history_row(row: dict, history_dir: Path = HISTORY_DIR) -> bool:
    """append 一列。若日期不晚於當年度（或前一年度）檔案最後一列，略過並回傳 False。"""
    validate_history_row(row)
    history_dir.mkdir(parents=True, exist_ok=True)
    path = history_dir / f"factors-{row['date'][:4]}.jsonl"

    last = _last_row_date(path) or _last_row_date(
        history_dir / f"factors-{int(row['date'][:4]) - 1}.jsonl"
    )
    if last and row["date"] <= last:
        return False

    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
    return True


def _last_row_date(path: Path) -> str | None:
    if not path.exists():
        return None
    lines = [ln for ln in path.read_text("utf-8").splitlines() if ln.strip()]
    return json.loads(lines[-1]).get("date") if lines else None
