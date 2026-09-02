/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 即時報價 proxy 端點（Cloudflare Worker）。未設定則停用「即時」功能。見 worker/README.md。 */
  readonly VITE_QUOTE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
