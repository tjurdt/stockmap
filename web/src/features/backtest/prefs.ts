/**
 * 回測頁設定的記憶 —— 存這台裝置的 localStorage，切走再回來還在。
 * URL query（從 /plan 或分享連結帶來的）優先於記憶。
 */
import type { StrategyParams } from './strategyParams'

const KEY = 'stockmap:backtest.v1'

export interface BacktestPrefs {
  params: StrategyParams
  feeBps: number
  taxBps: number
  startMonth: string
  endMonth: string
  refs: { twii: boolean; e0050: boolean; e00632r: boolean }
  distMonths: number
  windowMonths: number
}

export function readBacktestPrefs(): Partial<BacktestPrefs> | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    return p && typeof p === 'object' ? (p as Partial<BacktestPrefs>) : null
  } catch {
    return null
  }
}

export function writeBacktestPrefs(p: BacktestPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* 私密視窗 / 停用儲存 */
  }
}
