# stockmap 即時報價 proxy（Cloudflare Worker）

瀏覽器被 CORS 擋在 TWSE MIS 盤中 API 外。這個 worker 在 Cloudflare 邊緣代理該端點並加上 CORS
header，讓前端可以在「即時」模式下抓盤中報價。資料仍是 TWSE 自己的延遲（約 20 秒），非逐筆。

## 部署（一次性）

```bash
cd worker
npm install
npx wrangler login              # 開瀏覽器登入免費 Cloudflare 帳號
npx wrangler deploy             # 部署，輸出類似 https://stockmap-quote.<你的子網域>.workers.dev
```

部署後：

1. 編輯 `wrangler.toml` 的 `ALLOWED_ORIGIN`，改成你的 Pages origin（例如 `https://tjurdt.github.io`），
   再 `npx wrangler deploy` 一次。
2. 到 GitHub repo → Settings → Secrets and variables → Actions → **Variables** 新增
   `VITE_QUOTE_URL = https://stockmap-quote.<你的子網域>.workers.dev/quote`
3. 下次 `deploy` workflow 跑完，前端就會出現「即時」開關。

## 自動部署（選用）

設好這兩個 repo secret 後，push 到 `worker/**` 會自動部署（見
`.github/workflows/deploy-worker.yml`）：

- `CLOUDFLARE_API_TOKEN` — Cloudflare dashboard → My Profile → API Tokens → 用 "Edit Cloudflare Workers" 範本
- `CLOUDFLARE_ACCOUNT_ID` — Workers 頁面右側

並把 repo variable `DEPLOY_WORKER` 設為 `true`。

## 本機測試

```bash
npx wrangler dev
curl "http://localhost:8787/quote?codes=2330,2317"
```
