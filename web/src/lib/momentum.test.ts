import { describe, expect, it } from 'vitest'

import { MOM_WINDOWS, momentumFields, momentumPct } from './momentum'

// MOM_WINDOWS ↔ pipeline factors.py 的對齊由 pipeline/tests/test_factor_alignment.py 檢查
// （前端 tsconfig 不吃 node 型別，讀不了 .py）。

describe('momentumPct', () => {
  it('用 series[-(lookback+1)] 到 series[-(1+skip)] 算報酬', () => {
    const s = [100, 101, 102, 103, 104, 105]
    expect(momentumPct(s, 5, 0)).toBeCloseTo((105 / 100 - 1) * 100, 6)
    expect(momentumPct(s, 3, 1)).toBeCloseTo((104 / 102 - 1) * 100, 6)
  })

  it('長度不足回 null', () => {
    expect(momentumPct([100, 101], 5, 0)).toBeNull()
    expect(momentumPct([100, 101, 102], 3, 0)).toBeNull()
  })
})

describe('MOM_WINDOWS', () => {
  it('就是 factors.py 的三個內建動能窗（對齊檢查見 pipeline/tests/test_factor_alignment.py）', () => {
    expect(MOM_WINDOWS).toEqual({
      mom20: { lookback: 20, skip: 0 },
      mom60: { lookback: 60, skip: 0 },
      mom121: { lookback: 250, skip: 20 },
    })
  })
})

describe('momentumFields', () => {
  it('序列不足時各欄位各自回 null', () => {
    const s = Array.from({ length: 70 }, (_, i) => 100 + i)
    const f = momentumFields(s)
    expect(f.mom20).not.toBeNull()
    expect(f.mom60).not.toBeNull()
    expect(f.mom121).toBeNull() // 需要 251 筆
  })
})
