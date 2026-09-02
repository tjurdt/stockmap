# stockmap 即時報價 proxy（Cloudflare Worker）

瀏覽器被 CORS 擋在 TWSE MIS 盤中 API 外。這個 worker 在 Cloudflare 邊緣代理該端點並加上 CORS
header，讓前端可以在「即時」模式下抓盤中報價。資料仍是 TWSE 自己的延遲（約 20 秒），非逐筆。

## 已部署

目前跑在 `https://stockmap-quote.tjurdt.workers.dev/quote`，前端 `web/src/lib/live.ts` 的
`DEFAULT_QUOTE_URL` 直接指向它，所以「即時」開關預設就會出現，不需要設任何 GitHub variable。

CORS 允許來源見 `src/index.ts` 的 `DEFAULT_ALLOWED`（GitHub Pages + localhost）。要改 Pages 網址，
在 `wrangler.toml` 加 `[vars] ALLOWED_ORIGIN = "https://新網址"` 再重新部署。

## 重新部署 / 改到別的帳號

```bash
cd worker            # 一定要在這個目錄，不是 C:\Users\你
npm install
npx wrangler login   # 開瀏覽器登入免費 Cloudflare 帳號
npx wrangler deploy  # 輸出你的 worker 網址
```

換帳號時：改 `web/src/lib/live.ts` 的 `DEFAULT_QUOTE_URL`（或設 repo variable
`VITE_QUOTE_URL`），並在 dashboard 註冊一個 workers.dev 子網域
（Workers → 右上 Subdomain）。

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
