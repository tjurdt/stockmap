/** 使用者實際持股 —— 存在瀏覽器 localStorage（每台裝置各自一份，不上傳）。 */
import { useCallback, useState } from 'react'

export interface Position {
  code: string
  shares: number
  entryPrice: number
  entryDate: string // YYYY-MM-DD
}

const KEY = 'stockmap:holdings.v1'

function read(): Position[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr)
      ? arr.filter(
          (p) =>
            typeof p?.code === 'string' &&
            typeof p?.shares === 'number' &&
            typeof p?.entryPrice === 'number',
        )
      : []
  } catch {
    return []
  }
}

export function useHoldings() {
  const [holdings, setHoldings] = useState<Position[]>(read)

  const save = useCallback((next: Position[]) => {
    setHoldings(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* 私密視窗 / 停用儲存 → 至少這個 session 還在 */
    }
  }, [])

  return [holdings, save] as const
}
