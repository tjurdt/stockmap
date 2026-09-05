/**
 * 台股交易日曆 —— data/calendar.json（平日但市場休市的日期）。
 *
 * 用來算「下一個台股交易日」與「每月第 N 個交易日」。日曆沒涵蓋的年份 → 退回「只看週末」。
 * 全部純函式，holidays 傳 Set<string>（ISO 日期）。
 */
import { z } from 'zod'

const calendarSchema = z.object({
  generatedAt: z.string(),
  years: z.array(z.number().int()),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
})

export interface TradingCalendar {
  holidays: Set<string>
  years: number[]
}

export async function loadCalendar(): Promise<TradingCalendar | null> {
  const base = import.meta.env.BASE_URL
  for (const path of [
    `${base}data/calendar.json`,
    ...(import.meta.env.DEV ? [`${base}demo/calendar.json`] : []),
  ]) {
    const res = await fetch(path)
    if (res.status === 404) continue
    if (!res.ok) throw new Error(`HTTP ${res.status} 讀取 calendar`)
    if (res.headers.get('content-type')?.includes('text/html')) continue
    const parsed = calendarSchema.parse(await res.json())
    return { holidays: new Set(parsed.holidays), years: parsed.years }
  }
  return null
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const parse = (s: string) => new Date(`${s}T00:00:00Z`)

export function isTradingDay(day: string, holidays: Set<string>): boolean {
  const wd = parse(day).getUTCDay()
  return wd !== 0 && wd !== 6 && !holidays.has(day)
}

export function nextTradingDay(from: string, holidays: Set<string>): string {
  const d = parse(from)
  do {
    d.setUTCDate(d.getUTCDate() + 1)
  } while (!isTradingDay(iso(d), holidays))
  return iso(d)
}

export function prevTradingDay(from: string, holidays: Set<string>): string {
  const d = parse(from)
  do {
    d.setUTCDate(d.getUTCDate() - 1)
  } while (!isTradingDay(iso(d), holidays))
  return iso(d)
}

/** 某月所有交易日（ISO），由早到晚。month 為 1–12。 */
export function tradingDaysInMonth(year: number, month: number, holidays: Set<string>): string[] {
  const out: string[] = []
  const d = new Date(Date.UTC(year, month - 1, 1))
  while (d.getUTCMonth() === month - 1) {
    const s = iso(d)
    if (isTradingDay(s, holidays)) out.push(s)
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/** 該月第 n 個交易日（n 從 1 起）；該月交易日不足 n 個 → 取最後一個。 */
export function nthTradingDayOfMonth(
  year: number,
  month: number,
  n: number,
  holidays: Set<string>,
): string {
  const days = tradingDaysInMonth(year, month, holidays)
  return days[Math.min(Math.max(1, Math.round(n)), days.length) - 1] ?? days[days.length - 1]!
}

/** `day` 是它所在月份的第幾個交易日（1 起）；`day` 非交易日 → 取其後第一個交易日的順位。 */
export function tradingDayOrdinal(day: string, holidays: Set<string>): number {
  const d = parse(day)
  const days = tradingDaysInMonth(d.getUTCFullYear(), d.getUTCMonth() + 1, holidays)
  const idx = days.findIndex((x) => x >= day)
  return idx < 0 ? days.length : idx + 1
}
