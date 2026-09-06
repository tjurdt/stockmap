/**
 * 滾動視窗報酬 —— 從一條權益曲線切出「每一個為期 N 個月」的區間報酬，看策略的
 * 「連續獲利能力」（不同進場時點的表現分布）。純函式。
 */
import { addMonthsISO, mean, quantile, stdev } from './stats'

export interface RollingWindow {
  /** 視窗起始月 YYYY-MM */
  start: string
  /** 視窗結束月 YYYY-MM */
  end: string
  ret: number
  benchRet: number
}

/** 月 → 該月在 dates 裡第一個 index。 */
function monthFirstIndex(dates: string[]): Map<string, number> {
  const m = new Map<string, number>()
  dates.forEach((d, i) => {
    const key = d.slice(0, 7)
    if (!m.has(key)) m.set(key, i)
  })
  return m
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number) as [number, number]
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
}

export function rollingWindowReturns(
  dates: string[],
  equity: number[],
  benchmark: number[],
  windowMonths: number,
): RollingWindow[] {
  if (dates.length < 2 || windowMonths < 1) return []
  const firstIdx = monthFirstIndex(dates)
  const months = [...firstIdx.keys()].sort()
  const out: RollingWindow[] = []

  for (const m0 of months) {
    const lastMonth = addMonths(m0, windowMonths - 1)
    if (!firstIdx.has(lastMonth)) break // 視窗最後一個月沒資料 → 更晚的起點也不行
    const startIdx = firstIdx.get(m0)!
    const endIdx = (firstIdx.get(addMonths(m0, windowMonths)) ?? dates.length) - 1
    if (endIdx <= startIdx) continue
    const ratio = (arr: number[]) => (arr[startIdx]! > 0 ? arr[endIdx]! / arr[startIdx]! - 1 : 0)
    out.push({ start: m0, end: lastMonth, ret: ratio(equity), benchRet: ratio(benchmark) })
  }
  return out
}

/**
 * 逐交易日起點的持有結果分布 —— 「隨便挑一天進場、抱滿 N 個月」的所有可能結果。
 * 從單一 equity 曲線切片（重疊視窗，非獨立樣本），拿來看分布形狀 / 中位數 / 期望值。
 *
 * @param refs  額外對照序列（已對齊 dates、正規化到起點）；key = 顯示名（如「大盤」「0050」）。
 *              缺值以 null 表示，該視窗就不列入該對照的統計。
 */
export interface WindowOutcome {
  /** 進場日 YYYY-MM-DD */
  start: string
  /** 出場日 YYYY-MM-DD */
  end: string
  ret: number
  benchRet: number
  /** 每個對照序列同期報酬（該序列在起點或終點缺值 → null） */
  refRets: Record<string, number | null>
}

export function dailyWindowOutcomes(
  dates: string[],
  equity: number[],
  benchmark: number[],
  windowMonths: number,
  refs: Record<string, (number | null)[] | null> = {},
): WindowOutcome[] {
  if (dates.length < 2 || windowMonths < 1) return []
  const out: WindowOutcome[] = []
  const refKeys = Object.keys(refs)

  // 對每個起點，二分找「不晚於 start + windowMonths 個月」的最後一個交易日當出場日
  for (let i = 0; i < dates.length; i++) {
    const cutoff = addMonthsISO(dates[i]!, windowMonths)
    if (dates[dates.length - 1]! < cutoff) break // 更晚的起點也湊不滿一個視窗
    let lo = i
    let hi = dates.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (dates[mid]! <= cutoff) lo = mid
      else hi = mid - 1
    }
    const endIdx = lo
    if (endIdx <= i) continue
    const ratio = (arr: number[] | (number | null)[]): number | null => {
      const a = arr[i]
      const b = arr[endIdx]
      return a != null && a > 0 && b != null ? b / a - 1 : null
    }
    const refRets: Record<string, number | null> = {}
    for (const k of refKeys) refRets[k] = refs[k] ? ratio(refs[k]!) : null
    out.push({
      start: dates[i]!,
      end: dates[endIdx]!,
      ret: ratio(equity) ?? 0,
      benchRet: ratio(benchmark) ?? 0,
      refRets,
    })
  }
  return out
}

export interface OutcomeSummary {
  n: number
  median: number
  /** 期望值（平均） */
  mean: number
  stdev: number
  positivePct: number
  /** 中位數超額（相對「選股池等權」基準） */
  medianExcessBench: number
  meanExcessBench: number
  /** 每個對照序列的中位數超額（策略中位數 − 該對照中位數，只算兩邊都有值的視窗） */
  medianExcess: Record<string, number>
}

export function summarizeOutcomes(rows: WindowOutcome[]): OutcomeSummary {
  if (rows.length === 0) {
    return {
      n: 0,
      median: 0,
      mean: 0,
      stdev: 0,
      positivePct: 0,
      medianExcessBench: 0,
      meanExcessBench: 0,
      medianExcess: {},
    }
  }
  const rets = rows.map((r) => r.ret)
  const excessBench = rows.map((r) => r.ret - r.benchRet)
  const medianExcess: Record<string, number> = {}
  for (const k of Object.keys(rows[0]!.refRets)) {
    const paired = rows.filter((r) => r.refRets[k] != null)
    if (paired.length) {
      medianExcess[k] =
        quantile(
          paired.map((r) => r.ret),
          0.5,
        ) -
        quantile(
          paired.map((r) => r.refRets[k]!),
          0.5,
        )
    }
  }
  return {
    n: rows.length,
    median: quantile(rets, 0.5),
    mean: mean(rets),
    stdev: stdev(rets),
    positivePct: rows.filter((r) => r.ret > 0).length / rows.length,
    medianExcessBench: quantile(excessBench, 0.5),
    meanExcessBench: mean(excessBench),
    medianExcess,
  }
}

export interface RollingSummary {
  n: number
  positivePct: number
  median: number
  best: number
  worst: number
  beatBenchPct: number
  avgExcess: number
}

export function summarizeRolling(rows: RollingWindow[]): RollingSummary {
  if (rows.length === 0) {
    return { n: 0, positivePct: 0, median: 0, best: 0, worst: 0, beatBenchPct: 0, avgExcess: 0 }
  }
  const rets = rows.map((r) => r.ret).sort((a, b) => a - b)
  const mid = rets.length >> 1
  const median = rets.length % 2 ? rets[mid]! : (rets[mid - 1]! + rets[mid]!) / 2
  return {
    n: rows.length,
    positivePct: rows.filter((r) => r.ret > 0).length / rows.length,
    median,
    best: rets[rets.length - 1]!,
    worst: rets[0]!,
    beatBenchPct: rows.filter((r) => r.ret > r.benchRet).length / rows.length,
    avgExcess: rows.reduce((s, r) => s + (r.ret - r.benchRet), 0) / rows.length,
  }
}
