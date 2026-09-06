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
 * 等寬直方圖。`binCount` 為格數（>=1）。所有值相同 → 單一格。
 */
export function histogram(values: readonly number[], binCount: number): Bin[] {
  const n = Math.max(1, Math.round(binCount))
  if (values.length === 0) return []
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (lo === hi) return [{ x0: lo, x1: hi, count: values.length }]
  const width = (hi - lo) / n
  const bins: Bin[] = Array.from({ length: n }, (_, i) => ({
    x0: lo + i * width,
    x1: lo + (i + 1) * width,
    count: 0,
  }))
  for (const v of values) {
    const idx = Math.min(n - 1, Math.floor((v - lo) / width))
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
