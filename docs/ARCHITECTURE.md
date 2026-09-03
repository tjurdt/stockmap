# 架構

## 為什麼長這樣

瀏覽器直連臺灣證交所會被 CORS 擋，而且拿不到歷史序列（算不了動能）。因此：

- **資料在 GitHub Actions 上 server-to-server 抓**，逐日累積成還原權值序列，算好因子，寫成 JSON commit 回 repo。
- **前端是純靜態站**，同源讀那份 JSON，只負責視覺化。沒有伺服器、沒有資料庫、沒有 API 金鑰、零主機成本。

## 資料流

```
┌─ GitHub Actions: fetch-twse (每交易日 14:00 / 18:00 TPE + 隔日補) ─┐
│  python -m twse_pipeline.daily                                 │
│    sources.finmind  收盤價（TWSE STOCK_DAY_ALL 常慢一天，作備援）│
│    sources.twse     BWIBBU_ALL 估值 / TWT49U 除權息            │
│    prices         更新 data/prices.json（還原權值序列，留 400 日）│
│    factors        算 mom20 / mom60 / mom121                     │
│    snapshot       寫 data/latest.json（schema 驗證後）           │
│    history        append data/history/factors-YYYY.jsonl        │
│  git commit data/ && git push                                   │
└───────────────────────────────────────────────────────────────┘
                          │ push to main
                          ▼
┌─ GitHub Actions: deploy ──────────────────────────────────────┐
│  npm run build  (VITE_BASE=/stockmap/)                         │
│  cp -r data web/dist/data                                       │
│  actions/deploy-pages                                           │
└───────────────────────────────────────────────────────────────┘
                          │
                          ▼
              GitHub Pages  (https://<user>.github.io/stockmap/)
              前端 fetch ./data/latest.json + ./data/history/*.jsonl
```

## 契約邊界

| 檔案 | 產生者 | 消費者 | 定義 |
| --- | --- | --- | --- |
| `data/latest.json` | `twse_pipeline.snapshot` | 前端所有頁面 | `schema/snapshot.schema.json` ↔ `web/src/lib/data.ts` (zod) |
| `data/history/factors-YYYY.jsonl` | `twse_pipeline.history` | 回測 / 因子績效 | `schema/history.schema.json` ↔ `web/src/lib/history.ts` (zod) |
| `schema/universe.json` | 人工維護 | `twse_pipeline.config` | 成分股 + 在外流通股數 |
| `data/prices.json` | `twse_pipeline.prices` | 只有管線自己（算動能） | 內部格式，前端不讀 |

改契約的規則：**加欄位**往後相容，schema 與 zod 兩邊都加即可。**改/刪欄位**是破壞性變更，
必須 bump `schemaVersion`，並在前端處理舊版本（或接受舊部署短暫壞掉）。
`web/src/lib/data.contract.test.ts` 會在兩邊欄位名不一致時讓 CI 紅燈。

## 計算分工：Python 管線 vs. 前端

| 放哪 | 什麼 | 為什麼 |
| --- | --- | --- |
| **Python 管線** | 所有需要歷史序列的因子（動能、波動、beta…）、還原權值調整、任何「每日跑一次就好」的重運算 | 有完整序列、有測試、算一次存起來 |
| **前端主執行緒** | 讀 snapshot、排序、篩選、畫圖、切換座標軸 | 輕量、純顯示 |
| **前端 web worker** | 互動式回測（使用者調參數即時重算權益曲線） | 重、會卡 UI，隔離到 worker；資料來源是 `data/history/*.jsonl` |

新的「重」功能預設放管線。只有當它依賴使用者即時輸入、無法預先算好時，才放 web worker。

## 動態名單

`schema/universe.json` 由 `twse_pipeline.universe_rank` 每週一重排：抓 `STOCK_DAY_ALL`（全市場收盤）+
`opendata/t187ap03_L`（全上市公司已發行股數）→ 算每檔市值 → 取 **前 60**（`TOP_N`）。前端頁面只顯示
前 `displayCount`（20）檔，其餘供回測的選股池。**進出場門檻**（`KEEP_UNTIL_RANK=70`）讓邊界股不會每週被換掉。
名單有變時 `rank-universe` workflow 對新進榜股跑部分 `backfill`；被踢出的股票在下次 `daily` 由
`PriceHistory.prune` 清掉。

## 歷史回填

`twse_pipeline.backfill`（整個 universe，`deep=True`）每檔抓 FinMind：`TaiwanStockPrice`（原始收盤）、
`TaiwanStockDividend`（配息/除息日）、`TaiwanStockPER`（PE/PB/DY 歷史）、`TaiwanStockShareholding`
（歷史已發行股數）。`build_adjusted_series` 自行算還原因子（鏡射 `adjustments.py` 的 `ref/before`），
建出約 5 年還原權值序列。`history.rebuild_from_prices` 用它 + 歷史股數（前向填補）算**逐日 point-in-time
市值**，整檔重寫 `data/history/factors-YYYY.jsonl`（回測用）；`data/prices.json` 只留最近 400 日（每日算動能）。

## 回測

`web/src/features/backtest/engine.ts` —— 純函式：每個再平衡日 (1) 依當日市值取前 `poolTopN` 大為選股池
(2) 池內依所選因子（`METRICS[key].betterWhen` 決定方向）排名取前 `topN` 檔，等權 / 市值權重持有
(3) 隨還原價每日變動，下個再平衡日換股，扣交易成本。基準 = 同一選股池等權（每日再平衡）。
資料源 `loadAllFactorHistory()`（讀 `data/history/` 全部年度）。
限制：候選 universe 是「目前」前 60，早期曾進榜但已掉出前 60 的股票不在其中；前 ~1 年 mom121 為 null。

## 盤中報價

純靜態站被 CORS 擋在報價來源外。`worker/`（Cloudflare Worker）在邊緣代理 **Yahoo Finance v8 chart**
（`<code>.TW`）並加 CORS header —— TWSE 官方 MIS 端點（20 秒延遲）會擋 Cloudflare 機房 IP（回 520），
只能改用 Yahoo，盤中約 15–20 分鐘延遲。前端 `lib/live.ts` 在交易時段每 20 秒輪詢，
`lib/overlay.ts` 只把盤中價疊到 `close`/`chgPct`/`mcap`，動能維持收盤值（需完整序列）。
`VITE_QUOTE_URL=off` 可停用；不設則用內建的 worker 網址。

## 已知取捨

- `data/prices.json` 每日整檔重寫再 commit → git 歷史會隨時間長大（序列上限 400 日，單檔約 50–80 KB）。
  若日後困擾，改成 append-only 或定期 squash。`data/history/*.jsonl` 已是 append-only，無此問題。
- 前端用 hash router（`/#/ranking`）因為 GitHub Pages 無 SPA rewrite。
- 動能 `mom121` 定義：回看 250 交易日、跳過最近 20 日的報酬率（近似 12-1 月動能）。見 `factors.py` 測試。
