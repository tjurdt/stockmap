/** 數值格式化工具。 */

export const NA = '—'

export function fixed(digits: number) {
  return (v: number): string => v.toFixed(digits)
}

/** 依量級自動選小數位（軸刻度標籤用）。 */
export function tickLabel(v: number): string {
  const a = Math.abs(v)
  if (a >= 1000) return v.toFixed(0)
  if (a >= 10) return v.toFixed(1)
  return v.toFixed(2)
}

export function formatOrNA(v: number | null | undefined, fmt: (v: number) => string): string {
  return v == null || !Number.isFinite(v) ? NA : fmt(v)
}
