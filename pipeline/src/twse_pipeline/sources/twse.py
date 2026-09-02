"""臺灣證券交易所 OpenAPI client。在 GitHub Actions 上 server-to-server 請求，無 CORS 限制。

端點：
  STOCK_DAY_ALL — 每日收盤行情（收盤價、漲跌、成交金額、Date）
  BWIBBU_ALL    — 本益比 / 股價淨值比 / 殖利率
  TWT49U        — 除權除息計算結果表（用來算還原因子）
"""

from __future__ import annotations

import json
import urllib.request

BASE = "https://openapi.twse.com.tw/v1"
EP_DAY = f"{BASE}/exchangeReport/STOCK_DAY_ALL"
EP_VALUATION = f"{BASE}/exchangeReport/BWIBBU_ALL"
EP_EXRIGHT = f"{BASE}/exchangeReport/TWT49U"

_UA = "stockmap-pipeline/0.1 (+https://github.com/tjurdt/stockmap)"
Row = dict[str, str]


def _get(url: str, *, timeout: int = 45) -> list[Row]:
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (固定 https 端點)
        return json.loads(r.read().decode("utf-8"))


def fetch_day_all() -> list[Row]:
    return _get(EP_DAY)


def fetch_valuation_all() -> list[Row]:
    return _get(EP_VALUATION)


def fetch_exright() -> list[Row]:
    return _get(EP_EXRIGHT)
