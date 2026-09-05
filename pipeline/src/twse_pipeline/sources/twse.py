"""臺灣證券交易所 API client。在 GitHub Actions 上 server-to-server 請求，無 CORS 限制。

端點：
  STOCK_DAY_ALL — 每日收盤行情（收盤價、漲跌、成交金額、Date）
  BWIBBU_ALL    — 本益比 / 股價淨值比 / 殖利率
  TWT49U        — 除權除息計算結果表（用來算還原因子）
  t187ap03_L    — 全上市公司基本資料（已發行股數、公司簡稱；用於動態排名）
  MI_INDEX      — 指定歷史日期的全市場收盤（www.twse.com.tw，用於 point-in-time 市值排名）
  holidaySchedule — 當年度證券市場開休市日曆
"""

from __future__ import annotations

import json
import urllib.request

BASE = "https://openapi.twse.com.tw/v1"
EP_DAY = f"{BASE}/exchangeReport/STOCK_DAY_ALL"
EP_VALUATION = f"{BASE}/exchangeReport/BWIBBU_ALL"
EP_EXRIGHT = f"{BASE}/exchangeReport/TWT49U"
EP_COMPANY = f"{BASE}/opendata/t187ap03_L"
EP_HOLIDAYS = f"{BASE}/holidaySchedule/holidaySchedule"
EP_MI_INDEX = "https://www.twse.com.tw/exchangeReport/MI_INDEX"

_UA = "Mozilla/5.0 (stockmap-pipeline +https://github.com/tjurdt/stockmap)"
Row = dict[str, str]


def _get_json(url: str, *, timeout: int = 45) -> object:
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (固定 https 端點)
        return json.loads(r.read().decode("utf-8"))


def _get(url: str, *, timeout: int = 45) -> list[Row]:
    out = _get_json(url, timeout=timeout)
    return out if isinstance(out, list) else []


def fetch_day_all() -> list[Row]:
    return _get(EP_DAY)


def fetch_valuation_all() -> list[Row]:
    return _get(EP_VALUATION)


def fetch_exright() -> list[Row]:
    return _get(EP_EXRIGHT)


def fetch_company_info() -> list[Row]:
    return _get(EP_COMPANY)


def fetch_holiday_schedule() -> list[Row]:
    """當年度開休市日曆。每列 {Name, Date（民國 YYYMMDD）, Weekday, Description}。"""
    return _get(EP_HOLIDAYS)


def fetch_market_close(yyyymmdd: str) -> dict[str, float]:
    """指定日期全市場（排除權證/牛熊證）收盤價 {code: close}。非交易日回空 dict。"""
    url = f"{EP_MI_INDEX}?response=json&date={yyyymmdd}&type=ALLBUT0999"
    payload = _get_json(url)
    if not isinstance(payload, dict) or payload.get("stat") != "OK":
        return {}
    out: dict[str, float] = {}
    for table in payload.get("tables", []):
        fields = table.get("fields", [])
        if "證券代號" not in fields or "收盤價" not in fields:
            continue
        ci, pi = fields.index("證券代號"), fields.index("收盤價")
        for row in table.get("data", []):
            code = str(row[ci]).strip()
            if len(code) == 4 and code[0] in "123456789":
                try:
                    price = float(str(row[pi]).replace(",", ""))
                except ValueError:
                    continue
                if price > 0:
                    out[code] = price
    return out
