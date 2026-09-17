/**
 * 使用者自訂指標庫 —— 只存在瀏覽器 localStorage（每台裝置一份），純粹是 UI 端「選一個存過的
 * 公式」的便利清單。回測 / 操作計畫的設定本身不依賴這個庫（公式內嵌在設定物件裡，見
 * `features/backtest/engine.ts` 的 `customFormula`），刪掉這裡的項目不影響已經用過它的設定。
 */
import { z } from 'zod'

import { parseFormula } from './formula'

export const customIndicatorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  formula: z.string().min(1),
  betterWhen: z.enum(['high', 'low']),
})

export type CustomIndicator = z.infer<typeof customIndicatorSchema>

const KEY = 'stockmap:customIndicators.v1'

export function listCustomIndicators(): CustomIndicator[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = z.array(customIndicatorSchema).safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

function write(list: CustomIndicator[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* 私密視窗 / 停用儲存 → 至少這個 session 還在 */
  }
}

/** 公式語法無效就不存，回 false。 */
export function upsertCustomIndicator(def: CustomIndicator): boolean {
  if (!parseFormula(def.formula).ok) return false
  const list = listCustomIndicators()
  const i = list.findIndex((x) => x.id === def.id)
  if (i >= 0) list[i] = def
  else list.push(def)
  write(list)
  return true
}

export function deleteCustomIndicator(id: string): void {
  write(listCustomIndicators().filter((x) => x.id !== id))
}

export function newCustomIndicatorId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `ci-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
