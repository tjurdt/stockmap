"""台股盤後資料管線。

模組分工：
  paths      — repo 內路徑定位
  util       — 純資料轉換小工具（數值解析、民國日期、模糊欄位比對）
  config     — 從 schema/universe.json 讀成分股設定
  sources.twse — TWSE OpenAPI 原始 client（server-to-server，無 CORS）
  prices     — 還原權值價格序列 store
  factors    — 動能等因子（純函式 + registry）
  snapshot   — 組 data/latest.json + schema 驗證
  history    — append data/history/factors-YYYY.jsonl（回測資料來源）
  daily      — 每日進入點，串起上面所有步驟
"""

__all__ = ["__version__"]
__version__ = "0.1.0"
