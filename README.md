# 台股動力投資 · 因子視覺化網站

純靜態前端 + GitHub Actions 排程抓取，避開瀏覽器直連證交所的 CORS 問題。

```
pipeline/   Python 資料管線（抓 TWSE OpenAPI、維護還原權值序列、算動能因子）
web/        Vite + React + TS 前端
schema/     契約與設定的單一事實來源（universe / snapshot / history）
data/       管線產出，由 Actions commit（勿手改）
docs/       架構與擴充 playbook
```

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
3. Actions 頁面手動觸發一次 `fetch-twse`，確認 `data/latest.json` 產生。
4. `deploy` workflow 會在每次 push 到 `main` 時 build 前端並部署。

首次部署時歷史序列只有 1 筆，動能欄位顯示 `—`；約 21 個交易日後 `近月動能` 出現，250 日後 `12-1 動能` 才完整。

## 需要人工維護

- `schema/universe.json`：成分股名單與在外流通股數（百萬股）。除權/增資後要更新股數，否則市值偏差。
- 動能已用 `TWT49U` 除權除息表做還原調整；該端點欄位名變動時，管線會印警告並跳過當日調整。

## 加功能

- 加因子 → [docs/ADDING_A_FACTOR.md](docs/ADDING_A_FACTOR.md)
- 加頁面 → [docs/ADDING_A_PAGE.md](docs/ADDING_A_PAGE.md)

僅供研究，不構成投資建議。
