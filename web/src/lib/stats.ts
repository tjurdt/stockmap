/**
 * 統計小工具 —— 純函式。分布圖 / 摘要用。
 * 已有的 `median` / `niceTicks` 在 `scales.ts`；這裡放它沒有的。
 */

/** 算術平均。空陣列回 0。 */
export function mean(values: readonly number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

/** 母體標準差。空陣列回 0。 */
export function stdev(values: readonly number[]): number {
  if (values.length === 0) return 0
  const m = mean(values)
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length)
}

/**
 * 分位數（線性內插）。`q` 介於 0–1。輸入不必先排序。
 * 空陣列回 0。
 */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const pos = Math.min(Math.max(q, 0), 1) * (s.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return lo === hi ? s[lo]! : s[lo]! + (s[hi]! - s[lo]!) * (pos - lo)
}

export interface Bin {
  /** 區間下界（含） */
  x0: number
  /** 區間上界（不含，最後一格含） */
  x1: number
  count: number
}

/**
 * 報酬率直方圖（0.1 = 10%）：以 0 為分界，間距為 1 / 2 / 5 × 10^n 個百分點。
 * binCount 是目標格數；實際採 20–50 格，窄分布以至少 1% 的間距補齊範圍。
 */
export function histogram(values: readonly number[], binCount = 30): Bin[] {
  const samples = values.filter(Number.isFinite)
  if (samples.length === 0) return []
  const target = Number.isFinite(binCount) ? Math.max(20, Math.min(50, Math.round(binCount))) : 30
  let lo = 0
  let hi = 0
  for (const v of samples) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (!Number.isFinite((hi - lo) * 100)) return []

  // Remove arithmetic noise at nonzero boundaries without turning a tiny loss into 0%.
  const position = (v: number, step: number): number => {
    const p = (v * 100) / step
    const nearest = Math.round(p)
    return nearest !== 0 && Math.abs(p - nearest) <= 8 * Number.EPSILON * Math.max(1, Math.abs(p))
      ? nearest
      : p
  }
  const extent = (step: number): [number, number] => [
    Math.floor(position(lo, step)),
    Math.max(1, Math.ceil(position(hi, step))),
  ]
  let step = 1
  let bestDistance = Infinity
  const maxPower = Math.max(0, Math.ceil(Math.log10((hi - lo) * 100 || 1)))
  for (let power = 0; power <= maxPower; power++) {
    for (const factor of [1, 2, 5]) {
      const candidate = factor * 10 ** power
      const [first, last] = extent(candidate)
      const count = last - first
      if (count >= 20 && count <= 50 && Math.abs(count - target) < bestDistance) {
        step = candidate
        bestDistance = Math.abs(count - target)
      }
    }
  }

  let [first, last] = extent(step)
  const padding = Math.max(0, 20 - (last - first))
  if (lo === 0 && hi > 0) last += padding
  else if (lo < 0 && hi === 0) first -= padding
  else {
    first -= Math.floor(padding / 2)
    last += Math.ceil(padding / 2)
  }
  const n = last - first
  const bins: Bin[] = Array.from({ length: n }, (_, i) => ({
    x0: ((first + i) * step) / 100,
    x1: ((first + i + 1) * step) / 100,
    count: 0,
  }))
  for (const v of samples) {
    const idx = Math.max(0, Math.min(n - 1, Math.floor(position(v, step)) - first))
    bins[idx]!.count++
  }
  return bins
}

/** ISO 日期（YYYY-MM-DD）加 n 個月，維持日；月底溢位交給 Date 正規化。 */
export function addMonthsISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1 + n, d))
  return dt.toISOString().slice(0, 10)
}
