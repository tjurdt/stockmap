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
| `OPERATOR_PLAN` (secret) | 網站「操作計畫」頁 | `notify` workflow（`web/scripts/operator-report.ts`） | `schema/operator_plan.schema.json` ↔ `web/src/lib/plan.ts` (zod) |
| `data/baselines.jsonl` | `twse_pipeline.baselines` | 回測圖表 / regime / 空頭反 1 | `schema/baselines.schema.json` ↔ `web/src/lib/baselines.ts`（twiiTR / e0050 / e00632r）|
| `data/calendar.json` | `twse_pipeline.calendar`（TWSE holidaySchedule）| 換股時點、下一個交易日 | `schema/calendar.schema.json` ↔ `web/src/lib/calendar.ts` |

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

## 兩份名單

| 檔 | 產生者 | 內容 | 消費者 |
| --- | --- | --- | --- |
| `schema/universe.json` | `universe_rank`（**每交易日盤後**）| 市值**前 60**（`TOP_N`），進出場門檻 `KEEP_UNTIL_RANK=70` | `daily` 的 `latest.json`（`stocks` 再依當日收盤市值重排）、前端顯示前 `displayCount`(20) 檔 |
| `schema/backtest_universe.json` | `universe_history`（手動、每 3–6 月）| 過去 N 年**每週市值前 60 的聯集**（~100–140 檔）；解決存活者偏誤 | `backfill` deep 的 `factors-*.jsonl` |

`universe_history` 對過去 N 年每個週五打一次 TWSE `MI_INDEX`（一次給全市場收盤），用現在的股數粗估市值
排名取前 60 聯集 —— 快、只打 TWSE，邊界誤差被「取 60 不取 50」的緩衝吸收。沒有此檔時 `backfill` 退回
`universe.json`。

## 歷史回填

`twse_pipeline.backfill`（deep，用 `backtest_universe`）每檔抓 FinMind：`TaiwanStockPrice`（原始收盤）、
`TaiwanStockDividend`（配息/除息日）、`TaiwanStockPER`（PE/PB/DY 歷史）、`TaiwanStockShareholding`
（歷史已發行股數）。`build_adjusted_series` 自行算還原因子（鏡射 `adjustments.py` 的 `ref/before`），
建出約 5 年還原權值序列。`history.rebuild_from_prices` 用它 + **歷史股數**（前向填補）算逐日 point-in-time
市值，整檔重寫 `data/history/factors-YYYY.jsonl`。`data/prices.json` 只留顯示 universe、最近 400 日（每日算動能）。
撞 FinMind 額度會保留 `data/history/_backfill` 快取，重跑續抓。

## 回測

`web/src/features/backtest/engine.ts` —— 純函式：每個再平衡日 (1) 依**當日** point-in-time 市值取前
`poolTopN` 大為選股池 (2) 池內依所選因子（`METRICS[key].betterWhen` 決定方向）排名取前 `topN` 檔，
等權 / 市值權重持有 (3) 隨還原價每日變動，`execLagDays` 個交易日後才成交，扣交易成本；可設固定/移動停損
（出場後持有現金到下次再平衡）。多空過濾判定空頭時 `bearHolding` = 現金或元大台灣50反1（`00632R`，
用 `baselines` 的 `e00632r` 逐日報酬，2014-10 前退回現金）。基準 = 同一選股池等權；另可疊
`data/baselines.jsonl` 的加權報酬指數 / 0050 / 00632R（`lib/baselines.ts` 正規化到起點 = 1）。
資料源 `loadAllFactorHistory()`。

**鎖定比較**（`compare.ts`，localStorage，最多 4 組）：各自用目前時間區間重算、疊圖 + `CompareTable`。
**滾動報酬**（`lib/rolling.ts`）：從完整歷史的權益曲線切出每個「往後 N 個月」視窗（逐月推進），
`RollingChart` + 摘要統計，衡量「連續獲利能力」。
**側欄**：`components/controls/`（`CycleField` 循環選單 / `StepperField` / `Section` 收合），
`.panelWrap` 在 ≤820px 收合成「⚙ 設定」（純 CSS，`useMediaQuery` 供其他地方用）。
`daily` / `backfill` 每次重建 `data/baselines.jsonl`（FinMind `TaiwanStockTotalReturnIndex` + 0050 還原）。
限制：`backtest_universe` 覆蓋「過去 N 年曾進市值前 60」；再往前、或這 N 年都沒進過前 60 的股票不在其中。
`universe_history` 之後、下次 backfill 之前的新日期，因子列只含顯示 universe(60)（下次 backfill 補回）。
前約 1 年 mom121 為 null。

## 操作計畫與每日提醒信

`engine.ts` 的換股時點由 `rebalanceDay` 決定（`M`：每月**第 N 個交易日**，1 = 月初第一個；
`W`：每週星期幾）。`rebalanceDates`（回測，交易日直接來自 factor history）與 `isRebalanceDay` /
`nextRebalanceDate`（即時 / 提醒信，用 `data/calendar.json` 的休市日）共用同一套邏輯。
「跟上線日同順位」= `tradingDayOrdinal(startDate)`，讓實單和回測對齊。

`web/src/features/signal/report.ts` 的 `buildOperatorReport(history, baselines, plan, names, opts)`
是純函式，吃一份操作計畫（策略 + 上線日 + 交易日誌推算出的持股）吐出「到今天為止該知道的一切」，
包含兩個給人看的結論欄位：

- `verdict` —— 明天要不要動手、一句話結論 + 補充（網站大字、提醒信主旨共用）。
- `swapWatch` —— 手上最弱的是哪檔、挑戰者要達到多少因子值、最快哪天換得動（最短持有到期）。

兩處消費：操作計畫頁 `/plan`（`features/planner/`）與每晚提醒信
（`web/scripts/operator-report.ts`，`npm run report`，以 `tsx` 執行、讀 committed `data/` +
`OPERATOR_PLAN` env、寫 `web/tmp/email.{html,txt}`）。舊的 `/signal` 頁已併入 `/plan`（保留轉址）。

**規則優先序**（`runBacktest` 的迴圈順序，`report.ts` 檔頭也寫了同一份）：
停損 → `regimeExit='immediate'` 轉空清空 → **排程換股日** → 動能換股。
`swapMinHoldDays` 只是動能換股的閘門；排程換股日一到就照當日排名整批換，最短持有擋不住。
`pipeline` 無關，但 `report.test.ts` 有測試釘住這個先後順序。

計畫本身不 commit（含持股成本）：網站端存 localStorage（含逐筆交易日誌 `lib/trades.ts`，
持股 / 加權成本 / 這一段持有的起算日都由它推算），寄信端存 GitHub secret `OPERATOR_PLAN`。
`notify` workflow 每交易日 19:00 TPE 跑腳本、用 `dawidd6/action-send-mail` + Gmail SMTP 寄出；
缺 secret 就不寄。

## 報價與「暫定當日資料」

純靜態站被 CORS 擋在報價來源外。`worker/`（Cloudflare Worker）在邊緣代理 **Yahoo Finance v8 chart**
（`<code>.TW`）並加 CORS header —— TWSE 官方 MIS 端點（20 秒延遲）會擋 Cloudflare 機房 IP（回 520），
只能改用 Yahoo，盤中約 15–20 分鐘延遲。回傳含 `date`（該筆報價所屬的台股交易日，台北時區）。

台股 13:30 收盤，但 `data/` 要等 `fetch-twse` 抓到、commit、`deploy` 重建 Pages 才會更新（常是晚上）。
若只在交易時段抓報價，**收盤到入庫之間整個下午都會退回前一天**。所以：

- `lib/live.ts::marketPhase` 分 `open`（平日 09:00–14:00）/ `pre` / `closed`；
  `hooks/useLiveQuotes` 盤中 20 秒、盤後 10 分鐘各抓一次（假日照抓 —— 抓到的是最近一個交易日收盤）。
- `lib/liveRow.ts::withProvisionalRow` 在報價日期**晚於**因子歷史最後一列時，補一列暫定當日列：
  價 / 還原價 / 市值 / PE / PB 依「現價 ÷ 前一列收盤」等比例推算（殖利率成反比），
  動能依補完的還原價序列用 `lib/momentum.ts` 重算（公式同 `factors.py`）。沒報價的個股原值往後帶。
- `hooks/useLiveMarket` 是唯一入口，回測頁 / 操作計畫頁都吃它；散佈圖與排行榜走
  `hooks/useLiveSnapshot`（只載最近 ~300 列歷史，不必抓整段）。
- 誤差：除權息當日的還原價會有一天誤差；`data/` 若落後好幾個交易日，只會補「最新報價那天」那一列，
  中間缺的交易日不會補回來。UI 一律用 `freshnessLabel` 標示「暫定 / 官方資料到哪天」。

`VITE_QUOTE_URL=off` 可停用；不設則用內建的 worker 網址。

## 資料管線的韌性（抓不到就自動重試）

「今天資料沒更新」在這個專案有四種原因，各有各的保險：

| 原因 | 保險 |
| --- | --- |
| 排程沒被觸發（整點是 GitHub 尖峰，會被丟棄） | cron 排在 `13,43`，13:13–21:43 TPE 每 30 分鐘一次 |
| 來源還沒更新（TWSE / FinMind 慢） | `twse_pipeline.daily` 自行判斷後 `return 0` 跳過，不寫舊資料；下一輪再試 |
| 來源暫時性錯誤（5xx / 逾時） | `sources/twse.py::_get_json` 重試 3 次、backoff 2s→8s（`test_twse_retry.py`） |
| 兩個 workflow 同時 push → non-fast-forward | commit 後 `git pull --rebase --autostash` 再 push，重試 3 次（四個會寫 `data/` 的 workflow 都有；因此 checkout 用 `fetch-depth: 0`） |

真的連續失敗好幾天時，`data-freshness`（每日 11:00 TPE）會開 issue。
前端則因為有暫定當日列，使用者看到的仍是當天的數字，只是標示為暫定。

**新進榜個股**：`rank-universe` 偵測到 `added` 就跑 `backfill --codes`（FinMind，`LOOKBACK_DAYS`
≈ 5 年、截到 `CAP` = 400 個交易日），所以新股進榜當天就有完整的 20/60/250 日動能，不必等累積。
這一步失敗（例如 FinMind 額度）會讓整個 job 失敗 → `schema/universe.json` **不會被 commit**，
下一輪重新偵測、重新回填；設 `FINMIND_TOKEN` secret 可大幅降低額度問題。
注意 `backfill --codes` 只補 `prices.json`，`data/history/*.jsonl` 的歷史列要等季度的
`universe-history` 深度重建 —— 所以前端補暫定當日列時，動能算不出來要保留管線的值，不能洗成 null
（`lib/liveRow.ts`）。

## 已知取捨

- `data/prices.json` 每日整檔重寫再 commit → git 歷史會隨時間長大（序列上限 400 日，單檔約 50–80 KB）。
  若日後困擾，改成 append-only 或定期 squash。`data/history/*.jsonl` 已是 append-only，無此問題。
- 前端用 hash router（`/#/ranking`）因為 GitHub Pages 無 SPA rewrite。
- 動能 `mom121` 定義：回看 250 交易日、跳過最近 20 日的報酬率（近似 12-1 月動能）。見 `factors.py` 測試。
