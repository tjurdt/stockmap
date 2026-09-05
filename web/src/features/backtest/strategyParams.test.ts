import { describe, expect, it } from 'vitest'

import { decodeParams, DEFAULT_PARAMS, encodeParams } from './strategyParams'

describe('strategyParams', () => {
  it('encode → decode 還原', () => {
    const p = {
      factor: 'm20' as const,
      topN: 3,
      poolTopN: 40,
      rebalance: 'W' as const,
      rebalanceDay: 3,
      weighting: 'mcap' as const,
      execLagDays: 0,
      stopType: 'trailing' as const,
      stopPct: 15,
      regime: 'ma' as const,
      regimeDays: 120,
      regimeExit: 'immediate' as const,
    }
    expect(decodeParams(encodeParams(p))).toEqual(p)
  })

  it('缺參數用預設值', () => {
    expect(decodeParams('')).toEqual(DEFAULT_PARAMS)
    expect(decodeParams('?factor=pe')).toEqual({ ...DEFAULT_PARAMS, factor: 'pe' })
  })

  it('非法值退回預設', () => {
    const d = decodeParams('?topN=-1&rebal=X&stop=weird&regime=nope&rebalDay=99')
    expect(d.topN).toBe(DEFAULT_PARAMS.topN)
    expect(d.rebalance).toBe('M')
    expect(d.rebalanceDay).toBe(28) // clamp 到 1–28
    expect(d.stopType).toBe('none')
    expect(d.regime).toBe('off')
  })
})
