import { describe, expect, it } from 'vitest'

import { DEFAULT_COSTS } from '../../lib/costs'
import { COST_REV, costsOf, initialStrategy } from './prefs'
import { DEFAULT_PARAMS, encodeParams, toStrategyParams } from './strategyParams'

const mine = { ...DEFAULT_PARAMS, factor: 'm60' as const, topN: 1 }
const tuned = { ...DEFAULT_PARAMS, factor: 'm20' as const, topN: 3 }

describe('initialStrategy', () => {
  it('分享連結優先', () => {
    const r = initialStrategy(`?${encodeParams(tuned)}`, { params: mine }, mine)
    expect(r.topN).toBe(3)
  })

  it('沒有 query → 留在上次的回測設定，不被操作計畫蓋掉', () => {
    expect(initialStrategy('', { params: tuned }, mine).topN).toBe(3)
  })

  it('這台裝置沒記憶 → 用操作計畫，不是預設值', () => {
    expect(initialStrategy('', null, mine)).toEqual(mine)
  })

  it('都沒有才用預設值', () => {
    expect(initialStrategy('', null, null)).toEqual(DEFAULT_PARAMS)
  })

  it('舊記憶缺欄位時補預設值', () => {
    const { takeProfitPct: _omit, ...old } = tuned
    expect(initialStrategy('', { params: old as typeof tuned }, null).takeProfitPct).toBe(0)
  })
})

describe('costsOf', () => {
  it('舊版記憶的費率是當時的預設值 → 換成現在的預設', () => {
    expect(costsOf({ feeBps: 4, taxBps: 30 })).toEqual(DEFAULT_COSTS)
  })

  it('同版本的費率是使用者自己改的 → 保留', () => {
    expect(costsOf({ feeBps: 7, taxBps: 10, costRev: COST_REV })).toEqual({ feeBps: 7, taxBps: 10 })
  })

  it('預設費率對齊 2.8 折手續費與 0.3% 證交稅', () => {
    expect(DEFAULT_COSTS).toEqual({ feeBps: 3.99, taxBps: 30 })
  })
})

describe('toStrategyParams', () => {
  it('補齊省略欄位後與 DEFAULT_PARAMS 同一組 key', () => {
    const p = toStrategyParams({
      factor: 'm60',
      topN: 1,
      rebalance: 'M',
      weighting: 'equal',
      costBps: 0,
    })
    expect(Object.keys(p).sort()).toEqual(Object.keys(DEFAULT_PARAMS).sort())
  })
})
