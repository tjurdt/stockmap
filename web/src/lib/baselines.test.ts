import { describe, expect, it } from 'vitest'

import { alignNormalized, type BaselineRow } from './baselines'

const rows: BaselineRow[] = [
  { date: '2026-01-05', twiiTR: 100, e0050: 50 },
  { date: '2026-01-07', twiiTR: 110 }, // e0050 缺這天
  { date: '2026-01-09', twiiTR: 121, e0050: 55 },
]

describe('alignNormalized', () => {
  it('正規化到起點 = 1，缺值往前補', () => {
    const dates = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09']
    expect(alignNormalized(rows, dates, 'twiiTR')).toEqual([1, 1, 1.1, 1.1, 1.21])
  })

  it('e0050 缺的那天用前一個有值的補', () => {
    const dates = ['2026-01-05', '2026-01-07', '2026-01-09']
    expect(alignNormalized(rows, dates, 'e0050')).toEqual([1, 1, 1.1])
  })

  it('沒有資料回 null', () => {
    expect(alignNormalized([], ['2026-01-05'], 'twiiTR')).toBeNull()
  })

  it('起點早於所有資料 → null', () => {
    expect(alignNormalized(rows, ['2025-12-01', '2026-01-05'], 'twiiTR')).toBeNull()
  })
})
