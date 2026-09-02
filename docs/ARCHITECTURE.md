# 架構

## 為什麼長這樣

瀏覽器直連臺灣證交所會被 CORS 擋，而且拿不到歷史序列（算不了動能）。因此：

- **資料在 GitHub Actions 上 server-to-server 抓**，逐日累積成還原權值序列，算好因子，寫成 JSON commit 回 repo。
- **前端是純靜態站**，同源讀那份 JSON，只負責視覺化。沒有伺服器、沒有資料庫、沒有 API 金鑰、零主機成本。

## 資料流

```
┌─ GitHub Actions: fetch-twse (每交易日 15:40 TPE) ──────────────┐
│  python -m twse_pipeline.daily                                 │
│    sources.twse   抓 STOCK_DAY_ALL / BWIBBU_ALL / TWT49U       │
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

## 已知取捨

- `data/prices.json` 每日整檔重寫再 commit → git 歷史會隨時間長大（序列上限 400 日，單檔約 50–80 KB）。
  若日後困擾，改成 append-only 或定期 squash。`data/history/*.jsonl` 已是 append-only，無此問題。
- 前端用 hash router（`/#/ranking`）因為 GitHub Pages 無 SPA rewrite。
- 動能 `mom121` 定義：回看 250 交易日、跳過最近 20 日的報酬率（近似 12-1 月動能）。見 `factors.py` 測試。
