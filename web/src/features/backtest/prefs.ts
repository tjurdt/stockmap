/**
 * 回測頁設定的記憶 —— 存這台裝置的 localStorage，切走再回來還在。
 *
 * 開啟回測頁時的設定來源（`initialStrategy`）：
 *   1. URL query（分享連結）
 *   2. 這台裝置上次的回測設定
 *   3. 操作計畫的策略（新裝置第一次打開，不要給使用者看不相干的預設值）
 *   4. 預設值
 */
import { DEFAULT_COSTS, type TradeCosts } from '../../lib/costs'
import type { DistMode } from './distribution'
import { DEFAULT_PARAMS, decodeParams, type StrategyParams } from './strategyParams'

const KEY = 'stockmap:backtest.v1'

/**
 * 成本預設值的版本。舊版記憶裡的費率是當時的預設值、不是使用者自己的選擇，
 * 版本不符就換成 `DEFAULT_COSTS`；之後使用者手動改的會帶著新版本存回去。
 */
export const COST_REV = 2

export interface BacktestPrefs {
  params: StrategyParams
  feeBps: number
  taxBps: number
  costRev: number
  startMonth: string
  endMonth: string
  refs: { twii: boolean; e0050: boolean; e00632r: boolean }
  distMonths: number
  distMode: DistMode
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

/** 記憶裡的交易成本；沒有或是舊版預設值 → 預設成本。 */
export function costsOf(stored: Partial<BacktestPrefs> | null): TradeCosts {
  return stored?.costRev === COST_REV && stored.feeBps != null && stored.taxBps != null
    ? { feeBps: stored.feeBps, taxBps: stored.taxBps }
    : DEFAULT_COSTS
}

/** 開啟回測頁時要顯示哪一組策略（優先序見檔頭）。 */
export function initialStrategy(
  search: string,
  stored: Partial<BacktestPrefs> | null,
  plan: StrategyParams | null,
): StrategyParams {
  if (search) return decodeParams(search)
  if (stored?.params) return { ...DEFAULT_PARAMS, ...stored.params }
  return plan ?? DEFAULT_PARAMS
}
