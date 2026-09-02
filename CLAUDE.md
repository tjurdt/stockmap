# CLAUDE.md

台股動力投資的視覺化網站。純靜態前端 + GitHub Actions 資料管線，無伺服器、無後端 DB。

## 專案地圖

| 目錄 | 內容 | 語言 |
| --- | --- | --- |
| `web/` | 前端（Vite + React + TS，唯一的 JS app） | TypeScript |
| `pipeline/` | 盤後資料管線（可安裝套件 `twse_pipeline`） | Python 3.12 |
| `schema/` | 契約與設定的單一事實來源 | JSON |
| `data/` | 管線產出、由 Actions commit（**勿手改**） | JSON / JSONL |
| `docs/` | 架構與擴充 playbook | Markdown |

資料流：`Actions cron → pipeline 抓 TWSE OpenAPI → 寫 data/ → commit → deploy.yml build web + 併入 data/ → GitHub Pages`。詳見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 指令

前端（在 `web/`）：

```
npm run dev          # 本機開發（讀 data/latest.json，讀不到就退回 public/demo/latest.json）
npm run check        # lint + format:check + typecheck + test（送 PR 前跑這個）
npm run build        # tsc -b && vite build
```

管線（在 repo 根）：

```
python -m pip install -e "pipeline[dev]"
pytest pipeline
ruff check pipeline && ruff format --check pipeline && mypy pipeline/src
python -m twse_pipeline.daily        # 實際抓資料並覆寫 data/（會打外部 API）
python schema/validate.py            # 驗證 data/ 符合 schema/
```

## 不變式（改動前先讀）

1. **`data/latest.json` 是前端唯一資料契約。** 前端不在瀏覽器直連證交所。欄位只能往後相容地加；
   破壞性變更要 bump `schemaVersion`（`schema/snapshot.schema.json` + `web/src/lib/data.ts` + 管線）。
2. **成分股與在外流通股數只在 `schema/universe.json`。** 別在別處再寫一份。
3. **因子數學只在 `pipeline/src/twse_pipeline/factors.py`，而且要有測試。** 前端只視覺化算好的值。
4. **因子 key 三處對齊**：`factors.py` 的 `FACTORS`、`schema/snapshot.schema.json`、
   `web/src/lib/metrics.ts` 的 `METRICS`。
5. **前端 zod schema 與 JSON Schema 對齊**：`web/src/lib/data.contract.test.ts` 會在 drift 時失敗。
6. 每個 lib 純函式（`web/src/lib/`、`twse_pipeline/util.py`、`factors.py`）都應有對應測試。

## 擴充

- 加因子 → [docs/ADDING_A_FACTOR.md](docs/ADDING_A_FACTOR.md)
- 加頁面 / feature → [docs/ADDING_A_PAGE.md](docs/ADDING_A_PAGE.md)

## 慣例

- 台股慣例：**漲=紅（`--up`）、跌=綠（`--down`）**。色碼一律用 `web/src/styles/tokens.css` 的變數。
- 前端每個 feature 自成 `web/src/features/<name>/`，共用邏輯才上提到 `lib/` / `components/` / `hooks/`。
- Python：ruff（line-length 100）+ mypy。前端：oxlint + prettier（no semi, single quote, width 100）。
