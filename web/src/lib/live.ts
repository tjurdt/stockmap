/**
 * 盤中報價 —— 透過 Cloudflare Worker proxy 抓 Yahoo Finance（見 worker/）。
 * 盤中約 15–20 分鐘延遲（TWSE 官方 MIS 端點會擋 Cloudflare 機房 IP，只能退而求其次）。
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

/** worker 單次上限 50 檔 → 超過就分批打、合併。 */
const BATCH = 45

export async function fetchLiveQuotes(codes: string[]): Promise<Map<string, LiveQuote>> {
  if (!QUOTE_URL) throw new Error('盤中報價未設定')
  const batches: string[][] = []
  for (let i = 0; i < codes.length; i += BATCH) batches.push(codes.slice(i, i + BATCH))
  const results = await Promise.all(
    batches.map(async (b) => {
      const res = await fetch(`${QUOTE_URL}?codes=${b.join(',')}`)
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

/**
 * 台股「價格還在跳動」的時段：週一~五 09:00–14:00（Asia/Taipei）。
 * 只用來決定輪詢快慢 —— 盤後 `useLiveQuotes` 仍會抓（Yahoo 會回最近一次收盤）。
 */
export function isMarketHours(now: Date = new Date()): boolean {
  const tpe = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
  const day = tpe.getDay()
  if (day === 0 || day === 6) return false
  const mins = tpe.getHours() * 60 + tpe.getMinutes()
  return mins >= 9 * 60 && mins <= 14 * 60
}
