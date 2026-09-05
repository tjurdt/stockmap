/**
 * 滾動視窗報酬 —— 從一條權益曲線切出「每一個為期 N 個月」的區間報酬，看策略的
 * 「連續獲利能力」（不同進場時點的表現分布）。純函式。
 */

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
