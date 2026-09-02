#!/usr/bin/env python3
"""
每個交易日盤後抓取 TWSE OpenAPI，維護還原權值價格序列並計算動能因子。

輸出：
  data/prices.json  — 逐日累積的價格序列（含除權息調整因子）
  data/latest.json  — 前端讀取的快照（同源，無 CORS 問題）

在 GitHub Actions 上跑，伺服器對伺服器請求沒有 CORS 限制。
"""
import json
import pathlib
import sys
import urllib.request
from datetime import datetime, timezone, timedelta

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
TPE = timezone(timedelta(hours=8))

BASE = "https://openapi.twse.com.tw/v1"
EP_DAY = f"{BASE}/exchangeReport/STOCK_DAY_ALL"      # 每日收盤行情
EP_VAL = f"{BASE}/exchangeReport/BWIBBU_ALL"          # PE / PB / 殖利率
EP_XD = f"{BASE}/exchangeReport/TWT49U"               # 除權除息計算結果表

# 市值前 20 大；sh = 在外流通股數（百萬股），除權增資後需更新
UNIVERSE = [
    ("2330", "台積電", 25930), ("2317", "鴻海", 13861), ("2454", "聯發科", 1601),
    ("2308", "台達電", 2598), ("2382", "廣達", 3864), ("2891", "中信金", 19900),
    ("2882", "國泰金", 14900), ("2881", "富邦金", 14150), ("2412", "中華電", 7757),
    ("3711", "日月光投控", 4360), ("2303", "聯電", 12494), ("2886", "兆豐金", 14700),
    ("2884", "玉山金", 16600), ("1216", "統一", 5681), ("2892", "第一金", 14300),
    ("3231", "緯創", 2920), ("2002", "中鋼", 15731), ("2357", "華碩", 743),
    ("3034", "聯詠", 608), ("2345", "智邦", 559),
]
CODES = {c for c, _, _ in UNIVERSE}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "twse-scatter/1.0"})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read().decode("utf-8"))


def num(v):
    try:
        return float(str(v).replace(",", "").strip())
    except (ValueError, AttributeError):
        return None


def pick(row, *needles):
    """TWT49U 的欄位名在中英文之間變動過，用關鍵字模糊比對取值。"""
    for k, v in row.items():
        if all(n in k for n in needles):
            return num(v)
    return None


def adjustment_factors():
    """除權息當日的還原因子 = 參考價 / 除權息前收盤價。抓不到就回傳空 dict。"""
    try:
        rows = get(EP_XD)
    except Exception as e:
        print(f"  warn: 無法取得除權息表 ({e})，本日不做還原調整", file=sys.stderr)
        return {}
    out = {}
    for r in rows:
        code = r.get("Code") or r.get("股票代號")
        if code not in CODES:
            continue
        before = pick(r, "前收盤價") or pick(r, "除權息前")
        ref = pick(r, "參考價")
        if before and ref and before > 0:
            out[code] = ref / before
            print(f"  除權息 {code}: factor={out[code]:.6f}")
    return out


def load(path, default):
    p = DATA / path
    return json.loads(p.read_text("utf-8")) if p.exists() else default


def momentum(series, lookback, skip=0):
    """series: 由舊到新的還原價 list。skip=1 時為 (lookback-1) 動能。"""
    need = lookback + 1
    if len(series) < need:
        return None
    end = series[-1 - skip]
    start = series[-need]
    return (end / start - 1) * 100 if start else None


def main():
    DATA.mkdir(exist_ok=True)
    today = datetime.now(TPE).date().isoformat()

    day = {r["Code"]: r for r in get(EP_DAY) if r.get("Code") in CODES}
    val = {r["Code"]: r for r in get(EP_VAL) if r.get("Code") in CODES}
    if not day:
        print("休市或資料尚未更新，跳過。")
        return 0

    factors = adjustment_factors()

    # prices.json = {"2330": {"dates": [...], "adj": [...], "raw": [...]}, ...}
    hist = load("prices.json", {})

    for code, name, _sh in UNIVERSE:
        d = day.get(code)
        if not d:
            continue
        close = num(d.get("ClosingPrice"))
        if close is None:
            continue
        h = hist.setdefault(code, {"dates": [], "adj": [], "raw": []})
        if h["dates"] and h["dates"][-1] == today:
            continue  # 同日重複執行，不重複寫入

        # 除權息當日：把過去所有還原價乘上因子，讓序列連續
        f = factors.get(code)
        if f and h["adj"]:
            h["adj"] = [round(p * f, 6) for p in h["adj"]]

        h["dates"].append(today)
        h["raw"].append(close)
        h["adj"].append(close)

        # 只留最近 400 個交易日
        for k in ("dates", "adj", "raw"):
            h[k] = h[k][-400:]

    (DATA / "prices.json").write_text(
        json.dumps(hist, ensure_ascii=False, separators=(",", ":")), "utf-8"
    )

    stocks = []
    for code, name, sh in UNIVERSE:
        d, v = day.get(code, {}), val.get(code, {})
        close = num(d.get("ClosingPrice"))
        chg = num(d.get("Change"))
        tv = num(d.get("TradeValue"))
        adj = hist.get(code, {}).get("adj", [])
        prev = close - chg if close is not None and chg is not None else None
        stocks.append({
            "code": code, "name": name,
            "close": close,
            "chgPct": round(chg / prev * 100, 4) if prev else None,
            "mcap": round(close * sh / 100, 2) if close is not None else None,  # 億元
            "value": round(tv / 1e8, 4) if tv is not None else None,            # 億元
            "pe": num(v.get("PEratio")),
            "pb": num(v.get("PBratio")),
            "dy": num(v.get("DividendYield")),
            "mom20": round(momentum(adj, 20), 3) if momentum(adj, 20) is not None else None,
            "mom60": round(momentum(adj, 60), 3) if momentum(adj, 60) is not None else None,
            "mom121": round(momentum(adj, 250, skip=20), 3) if momentum(adj, 250, skip=20) is not None else None,
        })

    (DATA / "latest.json").write_text(json.dumps({
        "asOf": today,
        "generatedAt": datetime.now(TPE).isoformat(timespec="seconds"),
        "histLen": max((len(h["adj"]) for h in hist.values()), default=0),
        "stocks": stocks,
    }, ensure_ascii=False, indent=1), "utf-8")

    print(f"{today}: 寫入 {len(stocks)} 檔，序列長度 {max((len(h['adj']) for h in hist.values()), default=0)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
