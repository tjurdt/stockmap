"""FinMind 開放資料 client。歷史回填 + 每日收盤（TWSE OpenAPI 的 STOCK_DAY_ALL 常慢一天）。

免費版免 token（額度低，未登入約 300 req/hr）；設 FINMIND_TOKEN 環境變數可提高額度。
"""

from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, timedelta

BASE = "https://api.finmindtrade.com/api/v4/data"
_UA = "stockmap-pipeline/0.1 (+https://github.com/tjurdt/stockmap)"


@dataclass(frozen=True)
class Dividend:
    ex_date: str  # 除息/除權交易日 YYYY-MM-DD
    cash: float  # 現金股利（元/股）
    stock: float  # 股票股利（元/股，面額 10）


def _get(dataset: str, data_id: str, start: str, end: str) -> list[dict]:
    params = {"dataset": dataset, "data_id": data_id, "start_date": start, "end_date": end}
    token = os.environ.get("FINMIND_TOKEN")
    if token:
        params["token"] = token
    url = f"{BASE}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310 (固定 https 端點)
        payload = json.loads(r.read().decode("utf-8"))
    if payload.get("status") != 200:
        raise RuntimeError(f"FinMind {dataset}/{data_id}: {payload.get('msg')}")
    return payload.get("data", [])


def fetch_prices(code: str, start: str, end: str) -> list[tuple[str, float]]:
    """原始（未還原）日收盤，由舊到新的 (date, close)。"""
    out = [
        (r["date"], float(r["close"]))
        for r in _get("TaiwanStockPrice", code, start, end)
        if isinstance(r.get("close"), (int, float)) and r["close"] > 0
    ]
    out.sort()
    return out


def fetch_valuation_history(code: str, start: str, end: str) -> dict[str, dict[str, float | None]]:
    """每日本益比 / 股價淨值比 / 殖利率。回傳 {date: {"pe":..,"pb":..,"dy":..}}。"""
    out: dict[str, dict[str, float | None]] = {}
    for r in _get("TaiwanStockPER", code, start, end):
        out[r["date"]] = {
            "pe": _num(r.get("PER")),
            "pb": _num(r.get("PBR")),
            "dy": _num(r.get("dividend_yield")),
        }
    return out


def _num(v: object) -> float | None:
    try:
        f = float(v)  # type: ignore[arg-type]
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


def fetch_dividends(code: str, start: str, end: str) -> list[Dividend]:
    """區間內的除權除息事件，由舊到新。"""
    out: list[Dividend] = []
    for r in _get("TaiwanStockDividend", code, start, end):
        ex = r.get("CashExDividendTradingDate") or r.get("StockExDividendTradingDate") or ""
        if not ex:
            continue
        cash = _f(r.get("CashEarningsDistribution")) + _f(r.get("CashStatutorySurplus"))
        stock = _f(r.get("StockEarningsDistribution")) + _f(r.get("StockStatutorySurplus"))
        if cash or stock:
            out.append(Dividend(ex, cash, stock))
    out.sort(key=lambda d: d.ex_date)
    return out


def fetch_recent_quotes(
    codes: list[str], *, lookback_days: int = 10, throttle_s: float = 1.0
) -> tuple[str, dict[str, dict]]:
    """抓每檔最近幾天的日線，取最新一個「所有股都有」的交易日。

    回傳 (trading_date, {code: {ClosingPrice, Change, TradeValue}})，欄位名對齊
    STOCK_DAY_ALL 讓 snapshot.build_stock_row 直接吃。抓不到任何資料回 ("", {})。
    """
    end = date.today()
    start = (end - timedelta(days=lookback_days)).isoformat()
    last_row: dict[str, dict] = {}
    for i, code in enumerate(codes):
        if i:
            time.sleep(throttle_s)
        rows = _get("TaiwanStockPrice", code, start, end.isoformat())
        rows = [r for r in rows if isinstance(r.get("close"), (int, float)) and r["close"] > 0]
        if rows:
            last_row[code] = max(rows, key=lambda r: r["date"])

    if not last_row:
        return "", {}
    trading_date = max(r["date"] for r in last_row.values())
    out = {
        code: {
            "ClosingPrice": str(r["close"]),
            "Change": str(r.get("spread", "")),
            "TradeValue": str(r.get("Trading_money", "")),
        }
        for code, r in last_row.items()
        if r["date"] == trading_date
    }
    return trading_date, out


def _f(v: object) -> float:
    try:
        return float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
