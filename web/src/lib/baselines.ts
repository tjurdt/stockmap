/** data/baselines.jsonl —— 大盤報酬指數 + 0050 還原，供回測圖表當市場參照。 */
import { z } from 'zod'

const rowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  twiiTR: z.number().finite().positive().optional(),
  e0050: z.number().finite().positive().optional(),
})

export type BaselineRow = z.infer<typeof rowSchema>

export async function loadBaselines(): Promise<BaselineRow[]> {
  const base = import.meta.env.BASE_URL
  for (const path of [
    `${base}data/baselines.jsonl`,
    ...(import.meta.env.DEV ? [`${base}demo/baselines.jsonl`] : []),
  ]) {
    const res = await fetch(path)
    if (res.status === 404) continue
    if (!res.ok) throw new Error(`HTTP ${res.status} 讀取 baselines`)
    return res.text().then((t) =>
      t
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => rowSchema.parse(JSON.parse(l))),
    )
  }
  return []
}

/**
 * 把某個 baseline 欄位對齊到給定日期序列並正規化到起點 = 1。
 * 缺值往前補（forward-fill）；起點之前沒有值就回全 undefined。
 */
export function alignNormalized(
  rows: BaselineRow[],
  dates: string[],
  key: 'twiiTR' | 'e0050',
): (number | null)[] | null {
  const byDate = new Map<string, number>()
  for (const r of rows) if (r[key] != null) byDate.set(r.date, r[key]!)
  if (byDate.size === 0) return null

  const sorted = [...byDate.keys()].sort()
  const valueAsOf = (d: string): number | null => {
    // 二分找 <= d 的最後一個
    let lo = 0
    let hi = sorted.length - 1
    let ans = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid]! <= d) {
        ans = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    return ans >= 0 ? byDate.get(sorted[ans]!)! : null
  }

  const base = valueAsOf(dates[0]!)
  if (base == null) return null
  return dates.map((d) => {
    const v = valueAsOf(d)
    return v == null ? null : v / base
  })
}
