/**
 * 盤中 / 最新報價 —— 透過 Cloudflare Worker proxy 抓 Yahoo Finance（見 worker/）。
 * 盤中約 15–20 分鐘延遲（TWSE 官方 MIS 端點會擋 Cloudflare 機房 IP，只能退而求其次）。
 *
 * 這份報價有兩個用途：
 *  1. 盤中：把價 / 漲跌 / 市值疊到收盤快照上（`lib/overlay.ts`）。
 *  2. 盤後到管線入庫前（台股 13:30 收盤、data/ 常晚上才更新）：當作「今天的暫定收盤」，
 *     由 `lib/liveRow.ts` 補成一列暫定的當日因子列，讓排名 / 動能 / 回測 / 操作計畫
 *     不會停在昨天。
 *
 * VITE_QUOTE_URL=off 時整個功能停用（前端不顯示開關）。
 */
import { z } from 'zod'

const quoteSchema = z.object({
  code: z.string(),
  price: z.number().finite().nullable(),
  prevClose: z.number().finite().nullable(),
  time: z.string().nullable(),
  date: z.string().nullable(),
})

const responseSchema = z.object({
  quotes: z.array(quoteSchema),
  fetchedAt: z.string(),
})

export type LiveQuote = z.infer<typeof quoteSchema>

// 已部署的 proxy（見 worker/）。
// VITE_QUOTE_URL 未設定或空字串 → 用預設；設成網址 → 用你自己的 worker；設成 "off" → 停用「即時」。
const DEFAULT_QUOTE_URL = 'https://stockmap-quote.tjurdt.workers.dev/quote'
const configured = (import.meta.env.VITE_QUOTE_URL ?? '').trim()
export const QUOTE_URL: string = configured === 'off' ? '' : configured || DEFAULT_QUOTE_URL
export const liveAvailable = QUOTE_URL !== ''

/** worker 端每次請求的代號上限（舊版 worker 是 50）。選股池可能有 60 檔 → 前端分批。 */
const BATCH = 40

export async function fetchLiveQuotes(codes: string[]): Promise<Map<string, LiveQuote>> {
  if (!QUOTE_URL) throw new Error('盤中報價未設定')
  const batches: string[][] = []
  for (let i = 0; i < codes.length; i += BATCH) batches.push(codes.slice(i, i + BATCH))
  const results = await Promise.all(
    batches.map(async (batch) => {
      const res = await fetch(`${QUOTE_URL}?codes=${batch.join(',')}`, {
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`盤中報價 HTTP ${res.status}`)
      return responseSchema.parse(await res.json()).quotes
    }),
  )
  return new Map(
    results
      .flat()
      .filter((q) => q.code)
      .map((q) => [q.code, q]),
  )
}

const TPE_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
})

interface TpeNow {
  /** YYYY-MM-DD（台北） */
  date: string
  /** 當地時間的分鐘數（0–1439） */
  minutes: number
  /** 0 = 週日 … 6 = 週六 */
  weekday: number
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** 把任一時刻換算成台北當地的日期 / 時間。 */
export function taipei(now: Date = new Date()): TpeNow {
  const p = Object.fromEntries(TPE_PARTS.formatToParts(now).map((x) => [x.type, x.value]))
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    weekday: Math.max(0, WEEKDAYS.indexOf(p.weekday ?? '')),
  }
}

/** 一筆報價對應的台股交易日（YYYY-MM-DD，台北時區）。worker 沒給 date 就用 time 推。 */
export function quoteTradingDate(q: LiveQuote): string | null {
  const date =
    q.date && /^\d{8}$/.test(q.date)
      ? `${q.date.slice(0, 4)}-${q.date.slice(4, 6)}-${q.date.slice(6)}`
      : q.date
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const parsed = new Date(`${date}T00:00:00Z`)
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date) return date
  }
  if (!q.time) return null
  const t = new Date(q.time)
  return Number.isNaN(t.getTime()) ? null : taipei(t).date
}

/** 一批報價裡最新的交易日（沒有可用報價 → null）。 */
export function quotesTradingDate(quotes: Map<string, LiveQuote>): string | null {
  let best: string | null = null
  for (const [code, q] of quotes) {
    if (code !== q.code || q.price == null || !Number.isFinite(q.price) || q.price <= 0) continue
    const d = quoteTradingDate(q)
    if (d && (best == null || d > best)) best = d
  }
  return best
}

/** Only the newest quoted trading day may extend official data. */
export function selectLiveQuotes(
  quotes: Map<string, LiveQuote>,
  officialDate: string | null,
): Map<string, LiveQuote> {
  const date = quotesTradingDate(quotes)
  if (!date || (officialDate != null && date <= officialDate)) return new Map()
  return new Map(
    [...quotes].filter(
      ([code, q]) =>
        code === q.code &&
        q.price != null &&
        Number.isFinite(q.price) &&
        q.price > 0 &&
        quoteTradingDate(q) === date,
    ),
  )
}

export type MarketPhase = 'pre' | 'open' | 'closed'

/**
 * 台北時間的市場階段。
 *  pre    平日 08:00–09:00（快開盤，先抓一次讓昨收就位）
 *  open   平日 09:00–14:00（13:30 收盤，多留 30 分鐘等 Yahoo 落定）
 *  closed 其餘（含週末 / 國定假日 —— 假日照樣抓得到「最近一個交易日的收盤」）
 */
export function marketPhase(now: Date = new Date()): MarketPhase {
  const { minutes, weekday } = taipei(now)
  if (weekday === 0 || weekday === 6) return 'closed'
  if (minutes >= 9 * 60 && minutes <= 14 * 60) return 'open'
  if (minutes >= 8 * 60 && minutes < 9 * 60) return 'pre'
  return 'closed'
}

/** 盤中（含收盤後緩衝）。保留舊名字給既有呼叫端。 */
export function isMarketHours(now: Date = new Date()): boolean {
  return marketPhase(now) === 'open'
}
