/** 策略設定 ↔ URL query（讓回測頁「產生操作訊號」帶著設定跳過去）。 */
import type { MetricKey } from '../../lib/metrics'
import type { BacktestConfig } from './engine'

export type StrategyParams = Required<
  Pick<
    BacktestConfig,
    | 'factor'
    | 'momDays'
    | 'momSkip'
    | 'topN'
    | 'poolTopN'
    | 'rebalance'
    | 'rebalanceDay'
    | 'weighting'
    | 'execLagDays'
    | 'stopType'
    | 'stopPct'
    | 'stopMaDays'
    | 'stopExecNext'
    | 'swapOnBetter'
    | 'swapMargin'
    | 'swapMinHoldDays'
    | 'swapExecNext'
    | 'regime'
    | 'regimeDays'
    | 'regimeExit'
    | 'bearHolding'
  >
>

export const DEFAULT_PARAMS: StrategyParams = {
  factor: 'm121',
  momDays: 0,
  momSkip: 0,
  topN: 5,
  poolTopN: 50,
  rebalance: 'M',
  rebalanceDay: 1,
  weighting: 'equal',
  execLagDays: 1,
  stopType: 'none',
  stopPct: 20,
  stopMaDays: 20,
  stopExecNext: false,
  swapOnBetter: false,
  swapMargin: 15,
  swapMinHoldDays: 10,
  swapExecNext: true,
  regime: 'off',
  regimeDays: 200,
  regimeExit: 'rebalance',
  bearHolding: 'cash',
}

export function encodeParams(p: StrategyParams): string {
  return new URLSearchParams({
    factor: p.factor,
    momDays: String(p.momDays),
    momSkip: String(p.momSkip),
    topN: String(p.topN),
    pool: String(p.poolTopN),
    rebal: p.rebalance,
    rebalDay: String(p.rebalanceDay),
    weight: p.weighting,
    lag: String(p.execLagDays),
    stop: p.stopType,
    stopPct: String(p.stopPct),
    stopMaDays: String(p.stopMaDays),
    stopExecNext: p.stopExecNext ? '1' : '0',
    swap: p.swapOnBetter ? '1' : '0',
    swapMargin: String(p.swapMargin),
    swapHold: String(p.swapMinHoldDays),
    swapExec: p.swapExecNext ? '1' : '0',
    regime: p.regime,
    regimeDays: String(p.regimeDays),
    regimeExit: p.regimeExit,
    bear: p.bearHolding,
  }).toString()
}

export function decodeParams(qs: string): StrategyParams {
  const q = new URLSearchParams(qs)
  const num = (k: string, d: number) => {
    const v = Number(q.get(k))
    return Number.isFinite(v) && v > 0 ? v : d
  }
  const numNonNeg = (k: string, d: number) => {
    const raw = q.get(k)
    if (raw == null) return d
    const v = Number(raw)
    return Number.isFinite(v) && v >= 0 ? v : d
  }
  return {
    factor: (q.get('factor') as MetricKey) || DEFAULT_PARAMS.factor,
    momDays: numNonNeg('momDays', DEFAULT_PARAMS.momDays),
    momSkip: numNonNeg('momSkip', DEFAULT_PARAMS.momSkip),
    topN: num('topN', DEFAULT_PARAMS.topN),
    poolTopN: num('pool', DEFAULT_PARAMS.poolTopN),
    rebalance: q.get('rebal') === 'W' ? 'W' : 'M',
    rebalanceDay: Math.min(23, Math.max(1, num('rebalDay', DEFAULT_PARAMS.rebalanceDay))),
    weighting: q.get('weight') === 'mcap' ? 'mcap' : 'equal',
    execLagDays: q.get('lag') === '0' ? 0 : 1,
    stopType: (['fixed', 'trailing', 'daily', 'ma'] as const).includes(
      q.get('stop') as 'fixed' | 'trailing' | 'daily' | 'ma',
    )
      ? (q.get('stop') as 'fixed' | 'trailing' | 'daily' | 'ma')
      : 'none',
    stopPct: num('stopPct', DEFAULT_PARAMS.stopPct),
    stopMaDays: num('stopMaDays', DEFAULT_PARAMS.stopMaDays),
    stopExecNext: q.get('stopExecNext') === '1',
    swapOnBetter: q.get('swap') === '1',
    swapMargin: numNonNeg('swapMargin', DEFAULT_PARAMS.swapMargin),
    swapMinHoldDays: numNonNeg('swapHold', DEFAULT_PARAMS.swapMinHoldDays),
    swapExecNext: q.get('swapExec') !== '0',
    regime:
      q.get('regime') === 'ma' || q.get('regime') === 'mom'
        ? (q.get('regime') as 'ma' | 'mom')
        : 'off',
    regimeDays: num('regimeDays', DEFAULT_PARAMS.regimeDays),
    regimeExit: q.get('regimeExit') === 'immediate' ? 'immediate' : 'rebalance',
    bearHolding: q.get('bear') === 'inverse' ? 'inverse' : 'cash',
  }
}
