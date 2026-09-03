# 加一個頁面 / feature

每個功能自成一個 `web/src/features/<name>/` 資料夾。不要把新頁面塞進既有 feature。

## 結構慣例

```
web/src/features/<name>/
  <Name>Page.tsx        # route 進入點：拉資料、組合子元件、處理 loading/error
  <子元件>.tsx          # 只屬於這個 feature 的 UI
  <name>.module.css     # 這個 feature 的樣式（用 tokens.css 的變數）
  <name>.test.tsx       # 子元件 / 純邏輯的測試
  engine.worker.ts      # （回測類）重運算放 worker，別卡主執行緒
```

只有被 **兩個以上** feature 用到的東西才上提：純函式 → `lib/`、UI 元件 → `components/`、
React hook → `hooks/`。

## 步驟

1. 建資料夾與 `<Name>Page.tsx`。資料用現成 hook：

   ```tsx
   import { useSnapshot } from '../../hooks/useSnapshot'      // 當日快照
   import { useAsync } from '../../hooks/useAsync'            // 任意 async 載入器
   import { loadFactorHistory } from '../../lib/history'      // 因子歷史（回測）
   ```

   一律處理三種狀態：`loading` / `error` / `ready`。

2. 掛 route：`web/src/routes.tsx` 加 `{ path: '/<name>', element: <NamePage /> }`。

3. 導覽列：`web/src/components/Layout.tsx` 的 `NAV` 陣列加一筆（若要出現在頂部）。

4. 指標一律經 `METRICS` / `metricValue`（`web/src/lib/metrics.ts`），不要自己 hardcode 欄位名或格式。

5. 色彩、字級一律用 `web/src/styles/tokens.css` 的 CSS 變數。

6. `cd web && npm run check` 全綠再送 PR。

## 頁面現況

| Route | 檔案 | 狀態 |
| --- | --- | --- |
| `/`（因子散佈圖） | `features/scatter/` | 完成；含即時 overlay + 報價清單 |
| `/backtest` | `features/backtest/` | 完成：橫斷面因子排名回測（`engine.ts`：point-in-time 市值選股池 + 因子排名 + `EquityChart`） |
| `/ranking` | `features/ranking/RankingPage.tsx` | 雛型；可加：切換排序因子、多因子綜合評分、分位數上色 |
| `/stock/:code` | `features/stock/StockPage.tsx` | 雛型；可加：還原價走勢圖（`@visx/shape` LinePath + `loadFactorHistory`） |

`data/history/factors-YYYY.jsonl`（`loadAllFactorHistory()` 讀全部年度）是回測與個股走勢的資料來源。
即時報價相關：`lib/live.ts`、`lib/overlay.ts`、`hooks/useLiveQuotes.ts`。
回測引擎 `features/backtest/engine.ts` 目前跑主執行緒（資料量小）；歷史若拉到十幾年再搬 web worker。
