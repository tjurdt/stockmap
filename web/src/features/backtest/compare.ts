/** 鎖定的比較策略 —— 存 localStorage，最多 4 組。曲線一律用「目前頁面時間區間」重算。 */
import { useCallback, useState } from 'react'

import type { StrategyParams } from './strategyParams'

export interface LockedStrategy {
  id: string
  label: string
  params: StrategyParams
}

export const MAX_LOCKED = 4
const KEY = 'stockmap:compare.v1'

/** 兩組策略參數是否等價（用來去重）。 */
export function sameParams(a: StrategyParams, b: StrategyParams): boolean {
  const keys = Object.keys(a) as (keyof StrategyParams)[]
  return keys.every((k) => a[k] === b[k])
}

function read(): LockedStrategy[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.slice(0, MAX_LOCKED) : []
  } catch {
    return []
  }
}

function write(list: LockedStrategy[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* 私密視窗 */
  }
}

export function useLockedStrategies() {
  const [locked, setLocked] = useState<LockedStrategy[]>(read)

  const save = useCallback((next: LockedStrategy[]) => {
    setLocked(next)
    write(next)
  }, [])

  const add = useCallback((params: StrategyParams, label: string) => {
    setLocked((cur) => {
      if (cur.length >= MAX_LOCKED || cur.some((l) => sameParams(l.params, params))) return cur
      const next = [...cur, { id: crypto.randomUUID(), label, params }]
      write(next)
      return next
    })
  }, [])

  const remove = useCallback((id: string) => {
    setLocked((cur) => {
      const next = cur.filter((l) => l.id !== id)
      write(next)
      return next
    })
  }, [])

  const clear = useCallback(() => save([]), [save])

  return { locked, add, remove, clear }
}
