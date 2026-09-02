/**
 * 即時報價 —— 透過 Cloudflare Worker proxy 抓 TWSE MIS 盤中 API（見 worker/）。
 *
 * VITE_QUOTE_URL 未設定時整個功能停用（前端不顯示「即時」開關）。
 * 資料是 TWSE 自己的延遲（約 20 秒），非逐筆即時。
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

export const QUOTE_URL: string | undefined = import.meta.env.VITE_QUOTE_URL
export const liveAvailable = Boolean(QUOTE_URL)

export async function fetchLiveQuotes(codes: string[]): Promise<Map<string, LiveQuote>> {
  if (!QUOTE_URL) throw new Error('VITE_QUOTE_URL 未設定')
  const res = await fetch(`${QUOTE_URL}?codes=${codes.join(',')}`)
  if (!res.ok) throw new Error(`即時報價 HTTP ${res.status}`)
  const { quotes } = responseSchema.parse(await res.json())
  return new Map(quotes.filter((q) => q.code).map((q) => [q.code, q]))
}

/** 台股盤中：週一~五 09:00–13:35（Asia/Taipei）。 */
export function isMarketHours(now: Date = new Date()): boolean {
  const tpe = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
  const day = tpe.getDay()
  if (day === 0 || day === 6) return false
  const mins = tpe.getHours() * 60 + tpe.getMinutes()
  return mins >= 9 * 60 && mins <= 13 * 60 + 35
}
