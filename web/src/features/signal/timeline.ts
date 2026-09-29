/**
 * 日期時間軸 —— 把「訊號日 / 成交日 / 最短持有」這些日期規則攤成一張交易日甘特圖。
 * 純函式，由 `report.ts::buildOperatorReport` 呼叫、結果放在 `report.timeline`；頁面只負責畫。
 *
 * 日期語意（與 `engine.runBacktest` 一致，`engine.test.ts`「日期語意」那組測試釘住）：
 *   - 排程換股：每月第 N 個交易日（每週星期 N）= **訊號日**，用當天收盤排名；
 *     再過 `execLagDays` 個交易日 = **成交日**，同一天收盤賣舊買新。
 *   - 最短持有：買進（成交）當天 = 第 0 天；第 N 個交易日收盤起可成為動能換股的訊號日，
 *     再過 `swapLag` 個交易日成交。排程換股沒換掉的續抱股不歸零。
 */
import {
  addTradingDays,
  isTradingDay,
  nextTradingDay,
  prevTradingDay,
  tradingDaysBetween,
} from '../../lib/calendar'
import { nextRebalanceDate, type Rebalance } from '../backtest/engine'

/** 今天以前最多畫幾個交易日（買進日更早 → 左側截斷） */
const PAST_MAX = 25
/** 今天以後最多畫幾個交易日 */
const FUTURE_MAX = 45

export interface TimelineDay {
  date: string
  /** 第一欄或跨月 → 顯示月份 */
  monthStart: boolean
  isToday: boolean
  future: boolean
  /** 與前一欄之間跳過的平日休市日（週末不列） */
  holidaysBefore: string[]
  /** 排程換股：訊號日 / 成交日 / 兩者同一天（execLagDays = 0） */
  schedule: 'signal' | 'trade' | 'both' | null
}

export type TimelineCellKind =
  | 'none' // 還沒買 / 已預計換掉
  | 'entry' // 買進日（第 0 天）
  | 'locked' // 最短持有期內：動能換股擋住
  | 'ready' // 第 N 天：最早可成為動能換股訊號日
  | 'free' // 已過最短持有：隨時可能因動能換股出場
  | 'held' // 沒開動能換股：單純持有
  | 'sell' // 預計在排程換股成交日被換掉（依目前排名）

export interface TimelineCell {
  kind: TimelineCellKind
  /** 持有第幾個交易日（買進日 = 0）；未持有 = null */
  heldDay: number | null
}

export interface TimelineRow {
  code: string
  name: string
  entryDate: string
  /** 買進日早於畫面起點 */
  clipped: boolean
  /** 最早可成為動能換股訊號日（= 買進日 + N 個交易日）；沒開動能換股 = null */
  swapSignalFrom: string | null
  /** 對應的最早成交日 */
  swapTradeFrom: string | null
  cells: TimelineCell[]
}

export interface Timeline {
  days: TimelineDay[]
  rows: TimelineRow[]
  /** 畫面範圍內的排程換股（訊號日 → 成交日） */
  schedule: { signal: string; trade: string }[]
  execLagDays: number
  swapEnabled: boolean
  minHoldDays: number
  swapLagDays: number
}

export interface TimelineInput {
  asOfDate: string
  holidays: Set<string>
  rebalance: Rebalance
  rebalanceDay: number
  execLagDays: number
  swapEnabled: boolean
  minHoldDays: number
  swapLagDays: number
  /** inTargets = false → 依目前排名，下次排程換股會被換掉 */
  holdings: { code: string; name: string; entryDate: string; inTargets: boolean }[]
}

const shift = (d: string, n: number, holidays: Set<string>): string => {
  let out = d
  for (let i = 0; i < Math.abs(n); i++)
    out = n > 0 ? nextTradingDay(out, holidays) : prevTradingDay(out, holidays)
  return out
}

/** `from` 起（含）的平日休市日，直到 `to`（不含）。 */
function holidaysBetween(from: string, to: string, holidays: Set<string>): string[] {
  const out: string[] = []
  const d = new Date(`${from}T00:00:00Z`)
  for (d.setUTCDate(d.getUTCDate() + 1); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const s = d.toISOString().slice(0, 10)
    if (s >= to) break
    if (holidays.has(s) && d.getUTCDay() % 6 !== 0) out.push(s)
  }
  return out
}

export function buildTimeline(input: TimelineInput): Timeline {
  const { asOfDate, holidays, holdings } = input
  const lag = Math.max(0, Math.round(input.execLagDays))
  const swapLag = Math.max(0, Math.round(input.swapLagDays))
  const minHold = Math.max(0, Math.round(input.minHoldDays))

  const swapSignalFrom = (entry: string) =>
    input.swapEnabled ? addTradingDays(entry, minHold, holidays) : null
  const swapTradeFrom = (entry: string) => {
    const s = swapSignalFrom(entry)
    return s ? addTradingDays(s, swapLag, holidays) : null
  }

  // 範圍：最早買進日（或今天前幾天）→ 下一次排程成交日 / 最晚的最短持有成交日之後
  const pastFloor = shift(asOfDate, -PAST_MAX, holidays)
  const earliest = [
    asOfDate,
    shift(asOfDate, -5, holidays),
    ...holdings.map((h) => h.entryDate),
  ].sort()[0]!
  const start = earliest < pastFloor ? pastFloor : earliest

  const nextSignal = nextRebalanceDate(asOfDate, input.rebalance, input.rebalanceDay, holidays)
  const ends = [
    shift(asOfDate, 5, holidays),
    addTradingDays(nextSignal, lag, holidays),
    ...holdings.map((h) => swapTradeFrom(h.entryDate) ?? asOfDate),
  ].sort()
  const futureCap = shift(asOfDate, FUTURE_MAX, holidays)
  const endRaw = shift(ends.at(-1)!, 2, holidays)
  const end = endRaw > futureCap ? futureCap : endRaw

  const dates: string[] = []
  // 起點若是非交易日（例如買進日填了假日）→ 從其後第一個交易日開始
  const first = isTradingDay(start, holidays) ? start : nextTradingDay(start, holidays)
  for (let d = first; d <= end; d = nextTradingDay(d, holidays)) dates.push(d)

  // 範圍內（含範圍前一個）的排程換股
  const schedule: Timeline['schedule'] = []
  let sig = nextRebalanceDate(
    prevTradingDay(dates[0] ?? asOfDate, holidays),
    input.rebalance,
    input.rebalanceDay,
    holidays,
  )
  for (let guard = 0; sig <= end && guard < 30; guard++) {
    schedule.push({ signal: sig, trade: addTradingDays(sig, lag, holidays) })
    sig = nextRebalanceDate(sig, input.rebalance, input.rebalanceDay, holidays)
  }
  const signalSet = new Set(schedule.map((s) => s.signal))
  const tradeSet = new Set(schedule.map((s) => s.trade))
  // 下次排程換股的成交日（依目前排名，掉出名單的持股會在這天被賣）
  const nextTrade = schedule.find((s) => s.signal >= nextSignal)?.trade ?? null

  const days: TimelineDay[] = dates.map((date, i) => {
    const s = signalSet.has(date)
    const t = tradeSet.has(date)
    return {
      date,
      monthStart: i === 0 || date.slice(0, 7) !== dates[i - 1]!.slice(0, 7),
      isToday: date === asOfDate,
      future: date > asOfDate,
      holidaysBefore: i === 0 ? [] : holidaysBetween(dates[i - 1]!, date, holidays),
      schedule: s && t ? 'both' : s ? 'signal' : t ? 'trade' : null,
    }
  })

  const rows: TimelineRow[] = holdings.map((h) => {
    const from = swapSignalFrom(h.entryDate)
    const firstIdx = dates.findIndex((d) => d >= h.entryDate)
    // 持有天數 = 買進日（不含）到該日（含）的交易日數，與 report.heldDays 同算法
    const offset = firstIdx < 0 ? 0 : tradingDaysBetween(h.entryDate, dates[firstIdx]!, holidays)
    let sold = false
    const cells = dates.map<TimelineCell>((d, i) => {
      if (firstIdx < 0 || i < firstIdx || sold) return { kind: 'none', heldDay: null }
      const n = offset + (i - firstIdx)
      if (!h.inTargets && nextTrade && d === nextTrade) {
        sold = true
        return { kind: 'sell', heldDay: n }
      }
      if (n === 0) return { kind: 'entry', heldDay: 0 }
      if (!from) return { kind: 'held', heldDay: n }
      if (d < from) return { kind: 'locked', heldDay: n }
      if (d === from) return { kind: 'ready', heldDay: n }
      return { kind: 'free', heldDay: n }
    })
    return {
      code: h.code,
      name: h.name,
      entryDate: h.entryDate,
      clipped: dates.length > 0 && h.entryDate < dates[0]!,
      swapSignalFrom: from,
      swapTradeFrom: swapTradeFrom(h.entryDate),
      cells,
    }
  })

  return {
    days,
    rows,
    schedule: schedule.filter((s) => s.trade >= (dates[0] ?? '') && s.signal <= end),
    execLagDays: lag,
    swapEnabled: input.swapEnabled,
    minHoldDays: minHold,
    swapLagDays: swapLag,
  }
}
