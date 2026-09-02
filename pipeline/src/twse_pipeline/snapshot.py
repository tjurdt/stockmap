"""組 data/latest.json —— 前端唯一資料契約 —— 並在寫檔前用 JSON Schema 驗證。"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import jsonschema

from .config import RANKED_AT, Constituent
from .factors import compute_all
from .paths import SNAPSHOT_SCHEMA, TPE
from .prices import PriceHistory
from .sources.twse import Row
from .util import num

SCHEMA_VERSION = 1


def build_stock_row(c: Constituent, day: Row, val: Row, adj_series: list[float]) -> dict:
    close = num(day.get("ClosingPrice"))
    chg = num(day.get("Change"))
    trade_value = num(day.get("TradeValue"))
    prev = close - chg if close is not None and chg is not None else None
    chg_pct = round(chg / prev * 100, 4) if chg is not None and prev else None
    factors = compute_all(adj_series)
    return {
        "code": c.code,
        "name": c.name,
        "close": close,
        "chgPct": chg_pct,
        "mcap": round(close * c.shares_m / 100, 2) if close is not None else None,  # 億元
        "value": round(trade_value / 1e8, 4) if trade_value is not None else None,  # 億元
        "pe": num(val.get("PEratio")),
        "pb": num(val.get("PBratio")),
        "dy": num(val.get("DividendYield")),
        "mom20": _r(factors["mom20"], 3),
        "mom60": _r(factors["mom60"], 3),
        "mom121": _r(factors["mom121"], 3),
    }


def _r(v: float | None, digits: int) -> float | None:
    return round(v, digits) if v is not None else None


def build_snapshot(
    as_of: str,
    universe: list[Constituent],
    day_by_code: dict[str, Row],
    val_by_code: dict[str, Row],
    history: PriceHistory,
) -> dict:
    stocks = [
        build_stock_row(
            c, day_by_code.get(c.code, {}), val_by_code.get(c.code, {}), history.adj_series(c.code)
        )
        for c in universe
    ]
    snapshot = {
        "schemaVersion": SCHEMA_VERSION,
        "asOf": as_of,
        "generatedAt": datetime.now(TPE).isoformat(timespec="seconds"),
        "histLen": history.max_len(),
        "stocks": stocks,
    }
    if RANKED_AT:
        snapshot["universeRankedAt"] = RANKED_AT
    return snapshot


def validate_snapshot(snapshot: dict) -> None:
    schema = json.loads(SNAPSHOT_SCHEMA.read_text("utf-8"))
    jsonschema.validate(snapshot, schema)


def write_snapshot(snapshot: dict, path: Path) -> None:
    validate_snapshot(snapshot)  # 驗證失敗會拋例外 → Actions 紅燈，不推壞資料
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1), "utf-8")
