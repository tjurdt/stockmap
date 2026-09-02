/**
 * 載入並驗證 data/latest.json —— 前端唯一資料契約。
 *
 * 規則：
 *  - 只信任 snapshot 的欄位；不在瀏覽器直連證交所。
 *  - 這裡的 zod schema 是前端的事實來源；它必須與 schema/snapshot.schema.json 對齊
 *    （由 data.contract.test.ts 檢查欄位名一致）。管線端另用該 JSON Schema 驗證。
 */
import { z } from 'zod'

const nullableNumber = z.number().finite().nullable()

export const stockSchema = z.object({
  code: z.string().regex(/^\d{4}$/),
  name: z.string().min(1),
  close: nullableNumber,
  chgPct: nullableNumber,
  mcap: nullableNumber,
  value: nullableNumber,
  pe: nullableNumber,
  pb: nullableNumber,
  dy: nullableNumber,
  mom20: nullableNumber,
  mom60: nullableNumber,
  mom121: nullableNumber,
})

export const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  generatedAt: z.string(),
  histLen: z.number().int().nonnegative(),
  universeRankedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  stocks: z.array(stockSchema).min(1),
})

export type Stock = z.infer<typeof stockSchema>
export type Snapshot = z.infer<typeof snapshotSchema>

export class SnapshotError extends Error {
  readonly reason: unknown

  constructor(message: string, reason?: unknown) {
    super(message)
    this.name = 'SnapshotError'
    this.reason = reason
  }
}

const url = (name: string) => `${import.meta.env.BASE_URL}${name}?t=${Date.now()}`

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(url(path))
  if (!res.ok) throw new SnapshotError(`HTTP ${res.status} 讀取 ${path}`)
  return res.json()
}

/**
 * 載入當日快照。正式資料讀不到時，開發環境退回 public/demo/latest.json，
 * 正式環境直接拋 SnapshotError（由呼叫端顯示明確錯誤，不靜默顯示垃圾）。
 */
export async function loadSnapshot(): Promise<Snapshot> {
  try {
    return snapshotSchema.parse(await fetchJson('data/latest.json'))
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('正式快照讀取失敗，改用 demo fixture：', err)
      return snapshotSchema.parse(await fetchJson('demo/latest.json'))
    }
    throw err instanceof SnapshotError ? err : new SnapshotError('快照驗證失敗', err)
  }
}
