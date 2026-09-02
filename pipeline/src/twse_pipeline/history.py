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


def append_history_row(row: dict, history_dir: Path = HISTORY_DIR) -> bool:
    """append 一列。若當年度檔案最後一列已是同一天，略過並回傳 False。"""
    validate_history_row(row)
    history_dir.mkdir(parents=True, exist_ok=True)
    path = history_dir / f"factors-{row['date'][:4]}.jsonl"

    if path.exists():
        lines = path.read_text("utf-8").splitlines()
        if lines and json.loads(lines[-1]).get("date") == row["date"]:
            return False

    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
    return True
