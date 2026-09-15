/** 使用者實際持股的型別 —— 持股本身現在由交易日誌推算（見 `lib/trades.ts`）。 */

export interface Position {
  code: string
  shares: number
  entryPrice: number
  entryDate: string // YYYY-MM-DD
}

/** 舊「操作訊號」頁（已併入 /plan）用過的 localStorage key。 */
const LEGACY_KEY = 'stockmap:holdings.v1'

/**
 * 讀舊版持股清單，供第一次開新版時遷移成交易日誌。
 * 讀不到 / 格式不對就回空陣列（不讓壞資料擋住頁面）。
 */
export function readLegacyHoldings(): Position[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return []
    const arr: unknown = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (p): p is Position =>
        typeof p?.code === 'string' &&
        /^\d{4}$/.test(p.code) &&
        typeof p?.shares === 'number' &&
        p.shares > 0 &&
        typeof p?.entryPrice === 'number' &&
        p.entryPrice > 0 &&
        typeof p?.entryDate === 'string',
    )
  } catch {
    return []
  }
}
