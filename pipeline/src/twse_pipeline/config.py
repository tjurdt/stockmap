"""成分股設定。

schema/universe.json          — 市值前 60，由 universe_rank 每週重排。前端顯示前 displayCount 檔。
schema/backtest_universe.json — 過去 N 年曾進市值前段的股票聯集，由 universe_history 產生（可選）。
                                回測選股池用；沒有此檔就退回 universe.json。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from .paths import BACKTEST_UNIVERSE, UNIVERSE_SCHEMA


@dataclass(frozen=True)
class Constituent:
    code: str
    name: str
    shares_m: float  # 在外流通股數（百萬股）


def load_universe(path: Path | None = None) -> list[Constituent]:
    raw = json.loads((path or UNIVERSE_SCHEMA).read_text("utf-8"))
    return [
        Constituent(c["code"], c["name"], float(c["sharesOutstandingM"]))
        for c in raw["constituents"]
    ]


def load_backtest_universe() -> list[Constituent]:
    """回測用選股池；沒有 backtest_universe.json 就用 universe.json。"""
    if BACKTEST_UNIVERSE.exists():
        return load_universe(BACKTEST_UNIVERSE)
    return load_universe()


def _meta(path: Path | None = None) -> dict:
    return json.loads((path or UNIVERSE_SCHEMA).read_text("utf-8"))


def universe_ranked_at(path: Path | None = None) -> str | None:
    return _meta(path).get("rankedAt")


UNIVERSE: list[Constituent] = load_universe()  # 市值前 60（前端顯示）
CODES: frozenset[str] = frozenset(c.code for c in UNIVERSE)
RANKED_AT: str | None = universe_ranked_at()
DISPLAY_COUNT: int = int(_meta().get("displayCount", 20))  # 前端顯示前 N 檔
