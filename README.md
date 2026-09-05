# 台股動力投資 · 因子視覺化網站

純靜態前端 + GitHub Actions 排程抓取，避開瀏覽器直連證交所的 CORS 問題。

```
pipeline/   Python 資料管線（抓 TWSE OpenAPI、維護還原權值序列、算動能因子、動態重排名單）
web/        Vite + React + TS 前端
worker/     即時報價 proxy（Cloudflare Worker，選用）
schema/     契約與設定的單一事實來源（universe / snapshot / history）
data/       管線產出，由 Actions commit（勿手改）
docs/       架構與擴充 playbook
```

## Workflows

| Workflow | 觸發 | 作用 |
| --- | --- | --- |
| `fetch-twse` | 每交易日 14:00 / 18:00 TPE + 隔日補 | 收盤價（FinMind 為主）、更新序列、產出 `data/latest.json` + append `data/history/` |
| `backfill` | 手動 | 一次性回填約 5 年歷史（價 + 配息 + PE/PB/DY + 歷史股數）。需 `FINMIND_TOKEN` secret |
| `rank-universe` | 每週一 16:00 TPE | 依全市場市值重排前 60 名單，新進榜股自動回填 |
| `deploy` | push / 上述資料 workflow 完成後 | build 前端 + 併入 `data/` → GitHub Pages |
| `ci` | PR / push | web + pipeline + schema + worker 檢查 |
| `notify` | 每交易日 19:00 TPE | 依 `OPERATOR_PLAN` secret 算操作訊號，寄每日提醒信（見下） |
| `data-freshness` | 每日 11:00 TPE | `data/` 停擺超過 4 天就開 issue |
| `deploy-worker` | push `worker/**`（需設定）| 部署盤中報價 proxy |

**`FINMIND_TOKEN`**：整個 universe 的 `backfill` 會超過 FinMind 免費未登入的小時額度。
到 [finmindtrade.com](https://finmindtrade.com) 免費註冊拿 token，設成 repo secret `FINMIND_TOKEN`。
（撞到額度時 `backfill` 會保留 `data/history/_backfill` 快取，重跑續抓。）

架構、契約邊界、計算分工見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
給 AI 協作與日常開發的規則見 [CLAUDE.md](CLAUDE.md)。

## 本機開發

```bash
# 前端
cd web && npm ci && npm run dev        # http://localhost:5173，讀不到正式資料時退回 public/demo/

# 管線
python -m pip install -e "pipeline[dev]"
pytest pipeline
python -m twse_pipeline.daily          # 實抓一次，覆寫 data/（會打外部 API）
```

## 部署（GitHub）

1. **Settings → Pages → Source** 選 **GitHub Actions**（不是「main 分支根目錄」）。
2. **Settings → Actions → General → Workflow permissions** 選 **Read and write**（`fetch-twse` 要 commit 資料）。
3. Actions 頁面手動觸發一次 `backfill`（回填約一年歷史，動能欄位立刻有值）。
4. （選）手動觸發 `rank-universe` 讓名單即時反映當前市值；否則每週一自動跑。
5. `deploy` workflow 會在每次 push 到 `main`、或資料 workflow 完成後 build 前端並部署。

若跳過 `backfill`：首次部署時歷史序列只有 1 筆，動能欄位顯示 `—`，約 21 個交易日後 `近月動能`
才出現、250 日後 `12-1 動能` 才完整。

### 每日操作提醒信（`notify` workflow）

網站「操作計畫」頁：選好策略（因子 / 檔數 / 停損 / 多空過濾在回測頁調）、設上線日與「每月幾號 /
每週幾」換股、填目前持股 → 按「複製設定 JSON」。設定同時存在瀏覽器，但每晚寄信的**單一事實來源**
是 GitHub secret。需在 **Settings → Secrets and variables → Actions** 設四個 secret：

| Secret | 內容 |
| --- | --- |
| `OPERATOR_PLAN` | 「操作計畫」頁複製出來的 JSON（格式：`schema/operator_plan.schema.json`） |
| `MAIL_USERNAME` | 寄件 Gmail 位址 |
| `MAIL_PASSWORD` | 該 Gmail 的**應用程式密碼**（需先開兩步驟驗證，非登入密碼） |
| `MAIL_TO` | 收件人 email |

改策略 / 換股後重新複製 JSON、更新 `OPERATOR_PLAN` 即可（約每月一次）。信件內容：明天是否換股 +
買賣清單、停損警示、大盤多空與轉變、目標持股排名與損益。缺 `OPERATOR_PLAN` 時 `notify` 不寄信。
可在 Actions 頁手動觸發 `notify` 測試。

### 盤中報價

`worker/` 的 Cloudflare Worker 已部署（`stockmap-quote.tjurdt.workers.dev`），前端內建此網址，
交易時段自動出現「盤中報價」開關。資料為 Yahoo Finance，約 15–20 分鐘延遲。
細節與換帳號方式見 [worker/README.md](worker/README.md)。

## 需要人工維護

- `schema/universe.json`：成分股名單與在外流通股數（百萬股）。除權/增資後要更新股數，否則市值偏差。
- 動能已用 `TWT49U` 除權除息表做還原調整；該端點欄位名變動時，管線會印警告並跳過當日調整。

## 加功能

- 加因子 → [docs/ADDING_A_FACTOR.md](docs/ADDING_A_FACTOR.md)
- 加頁面 → [docs/ADDING_A_PAGE.md](docs/ADDING_A_PAGE.md)

僅供研究，不構成投資建議。
