/** 依數值排名 —— 純函式。空值（null / 非有限數）一律沉底，不當成「最小」。 */

export interface RankInput {
  code: string
  name: string
  value: number | null
}

export interface RankedRow extends RankInput {
  /** 名次（1 起）。空值也給一個名次（接在有值的後面），只是不代表真的排名。 */
  rank: number
  /** 分位數，1 = 最好、0 = 最差；空值為 null（不參與分位數）。 */
  percentile: number | null
}

export function rankByValue(rows: RankInput[], betterWhen: 'high' | 'low'): RankedRow[] {
  const valued = rows.filter(
    (r): r is RankInput & { value: number } => r.value != null && Number.isFinite(r.value),
  )
  const unvalued = rows.filter((r) => r.value == null || !Number.isFinite(r.value))
  const dir = betterWhen === 'high' ? -1 : 1
  valued.sort((a, b) => dir * (a.value - b.value))

  const n = valued.length
  const ranked = valued.map((r, i) => ({
    ...r,
    rank: i + 1,
    percentile: n > 1 ? 1 - i / (n - 1) : 1,
  }))
  const rest = unvalued.map((r, i) => ({ ...r, rank: n + i + 1, percentile: null }))
  return [...ranked, ...rest]
}
