/**
 * 載入 data/history/factors-YYYY.jsonl —— 每交易日一列全因子快照。
 * 回測 / 因子績效的資料來源。重計算邏輯應放進 web worker，不阻塞主執行緒。
 */
import { z } from 'zod'

const nullableNumber = z.number().finite().nullable()

export const historyStockSchema = z.object({
  code: z.string().regex(/^\d{4}$/),
  close: nullableNumber,
  adjClose: nullableNumber,
  mcap: nullableNumber,
  pe: nullableNumber,
  pb: nullableNumber,
  dy: nullableNumber,
  mom20: nullableNumber,
  mom60: nullableNumber,
  mom121: nullableNumber,
})

export const historyRowSchema = z.object({
  schemaVersion: z.literal(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stocks: z.array(historyStockSchema).min(1),
})

export type HistoryRow = z.infer<typeof historyRowSchema>

export function parseHistoryJsonl(text: string): HistoryRow[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => historyRowSchema.parse(JSON.parse(l)))
}

/** 載入指定年度的因子歷史。檔案不存在時回空陣列；開發環境退回 public/demo。 */
export async function loadFactorHistory(year: number): Promise<HistoryRow[]> {
  const base = import.meta.env.BASE_URL
  for (const path of [
    `${base}data/history/factors-${year}.jsonl`,
    ...(import.meta.env.DEV ? [`${base}demo/history/factors-${year}.jsonl`] : []),
  ]) {
    const res = await fetch(path)
    if (res.status === 404) continue
    if (!res.ok) throw new Error(`HTTP ${res.status} 讀取 factor history ${year}`)
    return parseHistoryJsonl(await res.text())
  }
  return []
}

/** 載入所有可用年度的因子歷史（往回找到第一個空缺為止），依日期排序。 */
export async function loadAllFactorHistory(): Promise<HistoryRow[]> {
  const thisYear = new Date().getFullYear()
  const years = await Promise.all(
    Array.from({ length: 8 }, (_, i) => thisYear - i).map((y) => loadFactorHistory(y)),
  )
  const rows = years.flat()
  rows.sort((a, b) => a.date.localeCompare(b.date))
  return rows
}
