/**
 * stockmap 即時報價 proxy —— Cloudflare Worker。
 *
 * 瀏覽器被 CORS 擋在 TWSE MIS 盤中 API 外；這個 worker 在邊緣代理該端點並加上 CORS header。
 * 資料仍是 TWSE 自己的延遲（約 20 秒），非逐筆。
 *
 *   GET /quote?codes=2330,2317,2454
 *   → { quotes: [{ code, price, prevClose, time, date }], fetchedAt }
 */

const MIS = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp'

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
  if (reqOrigin && (allow.includes(reqOrigin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(reqOrigin))) {
    return reqOrigin
  }
  return allow[0] ?? '*'
}

interface MisRow {
  c?: string // 股票代號
  z?: string // 最近成交價（收盤後為當日收盤；無成交為 '-'）
  y?: string // 昨收
  t?: string // 時間 HH:MM:SS
  d?: string // 日期 YYYYMMDD
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

    const cache = caches.default
    const cacheKey = new Request(url.toString())
    const cached = await cache.match(cacheKey)
    if (cached) return withHeaders(cached, cors)

    const exCh = codes.map((c) => `tse_${c}.tw`).join('|')
    const upstream = `${MIS}?ex_ch=${encodeURIComponent(exCh)}&json=1&delay=0&_=${Date.now()}`
    let rows: MisRow[]
    try {
      const res = await fetch(upstream, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://mis.twse.com.tw/stock/' },
      })
      if (!res.ok) return json({ error: `upstream ${res.status}` }, 502, cors)
      rows = ((await res.json()) as { msgArray?: MisRow[] }).msgArray ?? []
    } catch (e) {
      return json({ error: `upstream ${String(e)}` }, 502, cors)
    }

    const quotes = rows.map((r) => ({
      code: r.c ?? '',
      price: n(r.z) ?? n(r.y),
      prevClose: n(r.y),
      time: r.t ?? null,
      date: r.d ?? null,
    }))

    const out = json({ quotes, fetchedAt: new Date().toISOString() }, 200, {
      ...cors,
      'Cache-Control': 'public, max-age=15',
    })
    await cache.put(cacheKey, out.clone())
    return out
  },
}

function n(s: string | undefined): number | null {
  const v = parseFloat(s ?? '')
  return Number.isFinite(v) ? v : null
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}

function withHeaders(res: Response, headers: Record<string, string>): Response {
  const r = new Response(res.body, res)
  for (const [k, v] of Object.entries(headers)) r.headers.set(k, v)
  return r
}
