# 台股市值前 20 大 · 因子散佈圖

純靜態頁面 + GitHub Actions 排程抓取，避開瀏覽器直連證交所的 CORS 問題。

## 架構

```
GitHub Actions (每交易日 15:40 TPE)
  └─ scripts/fetch_twse.py   伺服器對伺服器，無 CORS 限制
       ├─ data/prices.json   逐日累積的還原權值序列（保留 400 日）
       └─ data/latest.json   前端讀取的快照
GitHub Pages
  └─ index.html              同源 fetch ./data/latest.json
```

## 部署

1. 建 repo，把這些檔案放進去。
2. Settings → Pages → Source 選 `main` 分支根目錄。
3. Settings → Actions → General → Workflow permissions 選 **Read and write**（腳本要 commit 資料）。
4. Actions 頁面手動觸發一次 `fetch-twse`，確認 `data/latest.json` 產生。

首次部署時歷史序列只有 1 筆，動能欄位會顯示 `—`；累積約 21 個交易日後 `近月動能` 出現，250 日後 `12-1 動能` 才完整。若想立刻有值，另外補跑歷史回填（見下）。

## 需要維護的地方

- `scripts/fetch_twse.py` 的 `UNIVERSE`：成分股名單與在外流通股數（百萬股）。名單不會自動重排，股數在除權增資後要更新，否則市值會偏差。
- 動能已用 `TWT49U` 除權除息表做還原調整；若該端點欄位名變動，腳本會印警告並跳過當日調整，序列會出現跳空。

## 歷史回填（選用）

`STOCK_DAY_ALL` 只有當日資料。要一次補齊 250 日，需改抓 per-stock 的
`https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=YYYYMMDD01&stockNo=XXXX`，
每檔每月一次請求（20 檔 × 12 個月 = 240 次），務必加 sleep 節流。這在 Actions 上跑沒有 CORS 問題，
但屬於一次性任務，建議寫成獨立的 `workflow_dispatch` job，不要放進每日排程。
