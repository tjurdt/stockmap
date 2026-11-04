/**
 * 實際績效 —— 純函式。每次投入的金額都不一樣時，「賺幾 %」要分兩個問題回答：
 *
 *  - **時間加權報酬（TWR）**：每天的漲跌幅連乘，跟你投入多少無關 → 衡量「策略 / 選股本身」，
 *    可以直接跟大盤同期報酬、回測報酬比。
 *  - **資金加權報酬（Modified Dietz）**：損益 ÷ 期間平均投入資金 → 衡量「我的錢實際賺了幾 %」，
 *    晚投入的錢只算它在場內的那段時間。
 *
 * 再加「同金流比較」：同樣的錢、同樣的日子改買大盤，到今天值多少。這是最公平的比法。
 *
 * 現金流怎麼來：帳本只有買賣紀錄，所以由它反推 ——
 * 賣出的錢留在帳上當現金，買進先用現金，不夠才算「新投入」。同一天先賣後買。
 * 帳上現金算在總資產裡、報酬為 0（空手也是策略的一部分）。
 */
import type { BaselineRow } from './baselines'
import { DEFAULT_COSTS, tradeCash, type TradeCosts } from './costs'
import type { Trade } from './trades'

export interface PriceRow {
  date: string
  stocks: { code: string; close: number | null }[]
}

export type BenchmarkKey = 'twiiTR' | 'e0050'

export interface BenchmarkResult {
  key: BenchmarkKey
  label: string
  /** 同期報酬（第一筆投入日收盤 → 最後一天） */
  periodReturn: number
  /** 同樣的錢、同樣的日子改買它，現在值多少 */
  endValue: number
  /** 同金流損益（元） */
  pl: number
  /** 對齊 `dates`，起點 = 1 */
  index: (number | null)[]
}

export interface PositionSegment {
  code: string
  /** 第一筆買進 */
  startDate: string
  /** 賣光那天；還沒賣光 = null */
  endDate: string | null
  /** 投入（含手續費） */
  cost: number
  /** 收回（扣手續費與稅；還沒賣光的部分用最新收盤估） */
  proceeds: number
  pl: number
  ret: number
  /** 同一批錢同時間買大盤的報酬；缺資料 = null */
  benchRet: number | null
}

export interface PerformanceReport {
  firstDate: string
  asOf: string
  /** 累計新投入的本金 */
  contributed: number
  /** 現在的總資產（現金 + 持股市值） */
  endValue: number
  cash: number
  marketValue: number
  /** 淨損益（已扣手續費與稅） */
  pl: number
  feesPaid: number
  taxPaid: number
  /** 時間加權報酬（期間，非年化） */
  twr: number
  /** 資金加權報酬（期間，非年化） */
  mwr: number
  /** 滿一年才有意義的年化資金加權報酬（XIRR）；不滿一年 = null */
  annualized: number | null
  flows: { date: string; amount: number }[]
  dates: string[]
  /** 對齊 `dates`，起點 = 1 */
  twrIndex: number[]
  benchmarks: BenchmarkResult[]
  segments: PositionSegment[]
}

const DAY = 86_400_000
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY

/** 同一天先賣後買（賣的錢才能拿去買）；其餘照日期、id。 */
function ordered(trades: Trade[]): Trade[] {
  return [...trades].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.side === b.side ? 0 : a.side === 'sell' ? -1 : 1) ||
      a.id.localeCompare(b.id),
  )
}

/** 資金加權報酬：損益 ÷ 依在場時間加權的平均本金。 */
export function modifiedDietz(
  flows: { date: string; amount: number }[],
  endValue: number,
  asOf: string,
): number {
  if (!flows.length) return 0
  const total = daysBetween(flows[0]!.date, asOf)
  const contributed = flows.reduce((s, f) => s + f.amount, 0)
  const weighted = flows.reduce(
    (s, f) => s + f.amount * (total > 0 ? daysBetween(f.date, asOf) / total : 1),
    0,
  )
  return weighted > 0 ? (endValue - contributed) / weighted : 0
}

/** 年化資金加權報酬（XIRR，二分法）。解不出來回 null。 */
export function xirr(
  flows: { date: string; amount: number }[],
  endValue: number,
  asOf: string,
): number | null {
  if (!flows.length) return null
  const t0 = flows[0]!.date
  const npv = (r: number) =>
    endValue / (1 + r) ** (daysBetween(t0, asOf) / 365) -
    flows.reduce((s, f) => s + f.amount / (1 + r) ** (daysBetween(t0, f.date) / 365), 0)
  let lo = -0.99
  let hi = 100
  if (npv(lo) * npv(hi) > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (npv(lo) * npv(mid) <= 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

/** 同樣的現金流改買某個淨值序列，到 asOf 值多少。序列查不到值 = null。 */
export function sameFlowValue(
  flows: { date: string; amount: number }[],
  at: (date: string) => number | null,
  asOf: string,
): number | null {
  const end = at(asOf)
  if (end == null) return null
  let units = 0
  for (const f of flows) {
    const px = at(f.date)
    if (px == null || px <= 0) return null
    units += f.amount / px
  }
  return units * end
}

/** 某 baseline 欄位的「截至某日最新值」查詢（缺值往前補）。 */
function asOfLookup(rows: BaselineRow[], key: BenchmarkKey): (date: string) => number | null {
  const pts = rows
    .filter((r) => r[key] != null)
    .map((r) => [r.date, r[key]!] as const)
    .sort((a, b) => a[0].localeCompare(b[0]))
  return (date) => {
    let lo = 0
    let hi = pts.length - 1
    let ans = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (pts[mid]![0] <= date) {
        ans = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    return ans >= 0 ? pts[ans]![1] : null
  }
}

function buildSegments(
  list: Trade[],
  costs: TradeCosts,
  lastClose: (code: string) => number | null,
  asOf: string,
  bench: (date: string) => number | null,
): PositionSegment[] {
  interface Open {
    code: string
    startDate: string
    shares: number
    cost: number
    proceeds: number
    /** 同一批錢買大盤的單位數 */
    units: number
    unitsCost: number
  }
  const open = new Map<string, Open>()
  const out: PositionSegment[] = []
  const finish = (o: Open, endDate: string | null, proceeds: number) => {
    const end = bench(endDate ?? asOf)
    out.push({
      code: o.code,
      startDate: o.startDate,
      endDate,
      cost: o.cost,
      proceeds,
      pl: proceeds - o.cost,
      ret: o.cost > 0 ? proceeds / o.cost - 1 : 0,
      benchRet: end != null && o.unitsCost > 0 ? (o.units * end) / o.unitsCost - 1 : null,
    })
  }
  for (const t of list) {
    const cur = open.get(t.code)
    if (t.side === 'buy') {
      const { net } = tradeCash(t, costs)
      const idx = bench(t.date)
      const o = cur ?? {
        code: t.code,
        startDate: t.date,
        shares: 0,
        cost: 0,
        proceeds: 0,
        units: 0,
        unitsCost: 0,
      }
      o.shares += t.shares
      o.cost += net
      if (idx != null) {
        o.units += net / idx
        o.unitsCost += net
      }
      open.set(t.code, o)
      continue
    }
    if (!cur) continue
    const qty = Math.min(t.shares, cur.shares)
    cur.proceeds += tradeCash({ ...t, shares: qty }, costs).net
    cur.shares -= qty
    if (cur.shares <= 1e-9) {
      open.delete(t.code)
      finish(cur, t.date, cur.proceeds)
    }
  }
  for (const o of open.values()) {
    const px = lastClose(o.code)
    finish(o, null, o.proceeds + (px ?? 0) * o.shares)
  }
  return out.sort((a, b) => b.startDate.localeCompare(a.startDate))
}

const BENCHMARKS: [BenchmarkKey, string][] = [
  ['twiiTR', '大盤（含息）'],
  ['e0050', '0050（含息）'],
]

/**
 * @param trades    交易日誌
 * @param rows      收盤價來源（含暫定當日列）
 * @param baselines 大盤 / 0050 還原序列
 */
export function buildPerformance(
  trades: Trade[],
  rows: PriceRow[],
  baselines: BaselineRow[],
  costs: TradeCosts = DEFAULT_COSTS,
): PerformanceReport | null {
  const list = ordered(trades.filter((t) => t.shares > 0 && t.price > 0))
  if (!list.length) return null
  const firstDate = list[0]!.date

  const codes = new Set(list.map((t) => t.code))
  const closes = new Map<string, Map<string, number>>()
  for (const c of codes) closes.set(c, new Map())
  for (const r of rows)
    for (const s of r.stocks)
      if (s.close != null && codes.has(s.code)) closes.get(s.code)!.set(r.date, s.close)

  const dates = [
    ...new Set([
      ...rows.map((r) => r.date).filter((d) => d >= firstDate),
      ...list.map((t) => t.date),
    ]),
  ].sort()
  const asOf = dates.at(-1)!

  const shares = new Map<string, number>()
  const lastPx = new Map<string, number>()
  const flows: { date: string; amount: number }[] = []
  const twrIndex: number[] = []
  let cash = 0
  let feesPaid = 0
  let taxPaid = 0
  let prevValue = 0
  let index = 1
  let k = 0

  for (const date of dates) {
    // 成交前的總資產：舊部位用當天第一筆成交價（沒成交的用收盤）—— 在成交那一刻切開子區間，
    // 當天的漲跌才不會被算到新投入的錢上
    const firstTradePx = new Map<string, number>()
    for (let j = k; j < list.length && list[j]!.date === date; j++) {
      if (!firstTradePx.has(list[j]!.code)) firstTradePx.set(list[j]!.code, list[j]!.price)
    }
    let preValue = cash
    for (const [code, qty] of shares) {
      const px = firstTradePx.get(code) ?? closes.get(code)?.get(date) ?? lastPx.get(code) ?? 0
      preValue += qty * px
    }

    let inflow = 0
    for (; k < list.length && list[k]!.date === date; k++) {
      const t = list[k]!
      lastPx.set(t.code, t.price)
      const held = shares.get(t.code) ?? 0
      if (t.side === 'sell') {
        const qty = Math.min(t.shares, held)
        if (qty <= 0) continue
        const c = tradeCash({ ...t, shares: qty }, costs)
        shares.set(t.code, held - qty)
        cash += c.net
        feesPaid += c.fee
        taxPaid += c.tax
      } else {
        const c = tradeCash(t, costs)
        shares.set(t.code, held + t.shares)
        feesPaid += c.fee
        if (c.net > cash) {
          inflow += c.net - cash
          cash = 0
        } else cash -= c.net
      }
    }
    if (inflow > 0) flows.push({ date, amount: inflow })

    let marketValue = 0
    for (const [code, qty] of shares) {
      const px = closes.get(code)?.get(date)
      if (px != null) lastPx.set(code, px)
      marketValue += qty * (lastPx.get(code) ?? 0)
    }
    const value = cash + marketValue
    if (prevValue > 0) index *= preValue / prevValue
    const base = preValue + inflow
    if (base > 0) index *= value / base
    twrIndex.push(index)
    prevValue = value
  }

  const contributed = flows.reduce((s, f) => s + f.amount, 0)
  const endValue = prevValue
  const marketValue = endValue - cash

  const benchmarks: BenchmarkResult[] = []
  for (const [key, label] of BENCHMARKS) {
    const at = asOfLookup(baselines, key)
    const start = at(firstDate)
    const end = at(asOf)
    if (start == null || end == null) continue
    const value = sameFlowValue(flows, at, asOf) ?? 0
    benchmarks.push({
      key,
      label,
      periodReturn: end / start - 1,
      endValue: value,
      pl: value - contributed,
      index: dates.map((d) => {
        const v = at(d)
        return v == null ? null : v / start
      }),
    })
  }

  const spanDays = daysBetween(firstDate, asOf)
  return {
    firstDate,
    asOf,
    contributed,
    endValue,
    cash,
    marketValue,
    pl: endValue - contributed,
    feesPaid,
    taxPaid,
    twr: index - 1,
    mwr: modifiedDietz(flows, endValue, asOf),
    annualized: spanDays >= 365 ? xirr(flows, endValue, asOf) : null,
    flows,
    dates,
    twrIndex,
    benchmarks,
    segments: buildSegments(
      list,
      costs,
      (c) => lastPx.get(c) ?? null,
      asOf,
      asOfLookup(baselines, 'twiiTR'),
    ),
  }
}
