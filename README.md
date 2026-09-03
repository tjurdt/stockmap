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
| `fetch-twse` | 每交易日 15:40 TPE | 抓當日收盤、更新序列、產出 `data/latest.json` |
| `backfill` | 手動 | 一次性回填約一年歷史（FinMind 原始價 + 配息還原） |
| `rank-universe` | 每週一 16:00 TPE | 依全市場市值重排前 20 名單，新進榜股自動回填 |
| `deploy` | push / 上述資料 workflow 完成後 | build 前端 + 併入 `data/` → GitHub Pages |
| `ci` | PR / push | web + pipeline + schema 檢查 |
| `deploy-worker` | push `worker/**`（需設定）| 部署即時報價 proxy |

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
