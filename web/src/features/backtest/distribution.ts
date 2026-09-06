/**
 * 報酬分布的取樣 —— 純函式。
 *
 * `follow`：用目前設定的換股日，只變「進場日」。
 * `all`：把「每月第 N 個交易日換股」的所有相位（N=1..20）各跑一次回測、把視窗報酬合起來，
 *        分布就不再受「你剛好選第幾個交易日」這個隨意選擇影響。
 */
import { alignNormalized, type BaselineRow } from '../../lib/baselines'
import type { HistoryRow } from '../../lib/history'
import { dailyWindowOutcomes, type WindowOutcome } from '../../lib/rolling'
import { runBacktest, type BacktestConfig } from './engine'

export type DistMode = 'follow' | 'all'

/** 每月最多約 20 個交易日；每週 1..5。 */
function phases(cfg: BacktestConfig): number[] {
  return cfg.rebalance === 'W' ? [1, 2, 3, 4, 5] : Array.from({ length: 20 }, (_, i) => i + 1)
}

export function distributionOutcomes(
  history: HistoryRow[],
  cfg: BacktestConfig,
  baselines: BaselineRow[],
  windowMonths: number,
  mode: DistMode,
): WindowOutcome[] {
  if (history.length < 2) return []
  const days = mode === 'all' ? phases(cfg) : [cfg.rebalanceDay ?? 1]
  const out: WindowOutcome[] = []
  // 完整歷史的日期序列不受 rebalanceDay 影響 → 對照序列只需對齊一次
  let refs: Record<string, (number | null)[] | null> | null = null
  for (const d of days) {
    const r = runBacktest(history, { ...cfg, rebalanceDay: d }, baselines)
    if (!refs) {
      refs = {
        大盤: alignNormalized(baselines, r.dates, 'twiiTR'),
        '0050': alignNormalized(baselines, r.dates, 'e0050'),
      }
    }
    out.push(...dailyWindowOutcomes(r.dates, r.equity, r.benchmark, windowMonths, refs))
  }
  return out
}
