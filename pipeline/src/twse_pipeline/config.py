"""從 schema/universe.json 讀成分股設定 —— 成分股名單與在外流通股數的唯一事實來源。"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from .paths import UNIVERSE_SCHEMA


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


def _meta(path: Path | None = None) -> dict:
    return json.loads((path or UNIVERSE_SCHEMA).read_text("utf-8"))


def universe_ranked_at(path: Path | None = None) -> str | None:
    return _meta(path).get("rankedAt")


UNIVERSE: list[Constituent] = load_universe()  # 市值前 60（回測選股池）
CODES: frozenset[str] = frozenset(c.code for c in UNIVERSE)
RANKED_AT: str | None = universe_ranked_at()
DISPLAY_COUNT: int = int(_meta().get("displayCount", 20))  # 前端顯示前 N 檔
