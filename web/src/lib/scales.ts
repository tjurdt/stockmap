/** 座標軸 / 統計小工具 —— 純函式，從原 index.html 抽出以便測試。 */

/** 產生「漂亮」的刻度值（1 / 2 / 5 × 10^n）。 */
export function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || 1
  const step = Math.pow(10, Math.floor(Math.log10(span / n)))
  const err = span / n / step
  const s = step * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1)
  const out: number[] = []
  for (let t = Math.ceil(lo / s) * s; t <= hi + 1e-9; t += s) {
    out.push(Number(t.toFixed(10)))
  }
  return out
}

/** 中位數。輸入不可為空。 */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('median() of empty array')
  const s = [...values].sort((p, q) => p - q)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** 給定資料範圍，往兩側各留 10% 邊界。 */
export function padExtent(lo: number, hi: number, frac = 0.1): [number, number] {
  const p = (hi - lo || Math.abs(hi) || 1) * frac
  return [lo - p, hi + p]
}

export const log10 = (v: number): number => Math.log10(v)

/** 對數軸下有效的點：值必須 > 0。 */
export function positiveOnly(values: readonly number[]): number[] {
  return values.filter((v) => v > 0)
}
