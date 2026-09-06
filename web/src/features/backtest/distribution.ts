/**
 * 報酬分布的取樣 —— 純函式。
 *
 * `aligned`（預設）：對「每月第 N 個交易日換股」的每個相位跑一次，**只從換股日當進場點**
 *                    取視窗報酬、合起來。最貼近實務（你會在換股日進場），不隨你設的換股日變。
 * `all`：對每個相位、**每個交易日**都當進場點。樣本最多、分布最平滑，一樣不隨換股日變。
 * `follow`：只用目前設定的換股日，每個交易日當進場點。看你這一組設定的分布。
 */
import { alignNormalized, type BaselineRow } from '../../lib/baselines'
import type { HistoryRow } from '../../lib/history'
import { dailyWindowOutcomes, type WindowOutcome } from '../../lib/rolling'
import { rebalanceDates, runBacktest, withCustomMomentum, type BacktestConfig } from './engine'

export type DistMode = 'aligned' | 'all' | 'follow'

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
  const hist = withCustomMomentum(history, cfg) // 自訂動能只算一次
  const days = mode === 'follow' ? [cfg.rebalanceDay ?? 1] : phases(cfg)
  const out: WindowOutcome[] = []
  // 完整歷史的日期序列不受 rebalanceDay 影響 → 對照序列只需對齊一次
  let refs: Record<string, (number | null)[] | null> | null = null
  for (const d of days) {
    const r = runBacktest(hist, { ...cfg, momDays: 0, rebalanceDay: d }, baselines)
    if (!refs) {
      refs = {
        大盤: alignNormalized(baselines, r.dates, 'twiiTR'),
        '0050': alignNormalized(baselines, r.dates, 'e0050'),
      }
    }
    let starts: number[] | undefined
    if (mode === 'aligned') {
      const rebalSet = rebalanceDates(r.dates, cfg.rebalance, d)
      starts = r.dates.map((dt, i) => (rebalSet.has(dt) ? i : -1)).filter((i) => i >= 0)
    }
    out.push(...dailyWindowOutcomes(r.dates, r.equity, r.benchmark, windowMonths, refs, starts))
  }
  return out
}
