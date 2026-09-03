/**
 * stockmap 盤中報價 proxy —— Cloudflare Worker。
 *
 * 瀏覽器被 CORS 擋在報價來源外；這個 worker 在邊緣代理並加上 CORS header。
 * 來源：Yahoo Finance v8 chart（`<code>.TW`）。TWSE 官方 MIS 端點會擋 Cloudflare 機房 IP，
 * 故改用 Yahoo —— 盤中約 15–20 分鐘延遲。
 *
 *   GET /quote?codes=2330,2317,2454
 *   → { quotes: [{ code, price, prevClose, time, date }], fetchedAt }
 */

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart'

export interface Env {
  /** 逗號分隔的允許來源。留空 = 內建清單（GitHub Pages + localhost）。設 "*" = 全開。 */
  ALLOWED_ORIGIN?: string
}

const DEFAULT_ALLOWED = ['https://tjurdt.github.io']

/** 依請求 Origin 決定回什麼 Access-Control-Allow-Origin。 */
function resolveOrigin(reqOrigin: string | null, env: Env): string {
  const configured = (env.ALLOWED_ORIGIN ?? '').trim()
  if (configured === '*') return '*'
  const allow = configured ? configured.split(',').map((s) => s.trim()) : DEFAULT_ALLOWED
  if (
    reqOrigin &&
    (allow.includes(reqOrigin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(reqOrigin))
  ) {
    return reqOrigin
  }
  return allow[0] ?? '*'
}

interface Quote {
  code: string
  price: number | null
  prevClose: number | null
  time: string | null
  date: string | null
}

async function yahooQuote(code: string): Promise<Quote | null> {
  try {
    const res = await fetch(`${YAHOO}/${code}.TW?interval=1d&range=1d`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      cf: { cacheTtl: 15, cacheEverything: true },
    })
    if (!res.ok) return null
    const j = (await res.json()) as {
      chart?: { result?: Array<{ meta?: Record<string, unknown> }> }
    }
    const m = j.chart?.result?.[0]?.meta
    if (!m || typeof m.regularMarketPrice !== 'number') return null
    const prev =
      typeof m.chartPreviousClose === 'number'
        ? m.chartPreviousClose
        : typeof m.previousClose === 'number'
          ? m.previousClose
          : null
    const t = typeof m.regularMarketTime === 'number' ? m.regularMarketTime : null
    return {
      code,
      price: m.regularMarketPrice,
      prevClose: prev,
      time: t ? new Date(t * 1000).toISOString() : null,
      date: null,
    }
  } catch {
    return null
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors: Record<string, string> = {
      'Access-Control-Allow-Origin': resolveOrigin(req.headers.get('Origin'), env),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      Vary: 'Origin',
    }
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

    const url = new URL(req.url)
    if (url.pathname !== '/quote') {
      return new Response('not found', { status: 404, headers: cors })
    }

    const codes = (url.searchParams.get('codes') ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter((c) => /^\d{4}$/.test(c))
      .slice(0, 50)
    if (codes.length === 0) return json({ error: 'codes required' }, 400, cors)

    const quotes = (await Promise.all(codes.map(yahooQuote))).filter(
      (q): q is Quote => q !== null,
    )

    return json({ quotes, fetchedAt: new Date().toISOString() }, 200, {
      ...cors,
      'Cache-Control': 'public, max-age=15',
    })
  },
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}
