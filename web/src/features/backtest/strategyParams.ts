/** 策略設定 ↔ URL query（讓回測頁「產生操作訊號」帶著設定跳過去）。 */
import type { MetricKey } from '../../lib/metrics'
import type { BacktestConfig } from './engine'

export type StrategyParams = Required<
  Pick<
    BacktestConfig,
    | 'factor'
    | 'topN'
    | 'poolTopN'
    | 'rebalance'
    | 'weighting'
    | 'execLagDays'
    | 'stopType'
    | 'stopPct'
    | 'regime'
    | 'regimeDays'
  >
>

export const DEFAULT_PARAMS: StrategyParams = {
  factor: 'm121',
  topN: 5,
  poolTopN: 50,
  rebalance: 'M',
  weighting: 'equal',
  execLagDays: 1,
  stopType: 'none',
  stopPct: 20,
  regime: 'off',
  regimeDays: 200,
}

export function encodeParams(p: StrategyParams): string {
  return new URLSearchParams({
    factor: p.factor,
    topN: String(p.topN),
    pool: String(p.poolTopN),
    rebal: p.rebalance,
    weight: p.weighting,
    lag: String(p.execLagDays),
    stop: p.stopType,
    stopPct: String(p.stopPct),
    regime: p.regime,
    regimeDays: String(p.regimeDays),
  }).toString()
}

export function decodeParams(qs: string): StrategyParams {
  const q = new URLSearchParams(qs)
  const num = (k: string, d: number) => {
    const v = Number(q.get(k))
    return Number.isFinite(v) && v > 0 ? v : d
  }
  return {
    factor: (q.get('factor') as MetricKey) || DEFAULT_PARAMS.factor,
    topN: num('topN', DEFAULT_PARAMS.topN),
    poolTopN: num('pool', DEFAULT_PARAMS.poolTopN),
    rebalance: q.get('rebal') === 'W' ? 'W' : 'M',
    weighting: q.get('weight') === 'mcap' ? 'mcap' : 'equal',
    execLagDays: q.get('lag') === '0' ? 0 : 1,
    stopType:
      q.get('stop') === 'fixed' || q.get('stop') === 'trailing'
        ? (q.get('stop') as 'fixed' | 'trailing')
        : 'none',
    stopPct: num('stopPct', DEFAULT_PARAMS.stopPct),
    regime:
      q.get('regime') === 'ma' || q.get('regime') === 'mom'
        ? (q.get('regime') as 'ma' | 'mom')
        : 'off',
    regimeDays: num('regimeDays', DEFAULT_PARAMS.regimeDays),
  }
}
