import { describe, expect, it } from 'vitest'

import { addMonthsISO, histogram, mean, quantile, stdev } from './stats'

describe('mean / stdev', () => {
  it('基本值', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5)
    expect(stdev([2, 2, 2])).toBe(0)
    expect(stdev([1, 3])).toBeCloseTo(1)
  })
  it('空陣列回 0', () => {
    expect(mean([])).toBe(0)
    expect(stdev([])).toBe(0)
  })
})

describe('quantile', () => {
  it('中位數與四分位（線性內插）', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([0, 10], 0.25)).toBe(2.5)
  })
  it('邊界與空陣列', () => {
    expect(quantile([5, 1, 3], 0)).toBe(1)
    expect(quantile([5, 1, 3], 1)).toBe(5)
    expect(quantile([], 0.5)).toBe(0)
  })
})

describe('histogram', () => {
  it('等寬分格、總數守恆', () => {
    const bins = histogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)
    expect(bins).toHaveLength(5)
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(11)
    expect(bins[0]!.x0).toBe(0)
    expect(bins[4]!.x1).toBe(10)
    // 最後一格含上界
    expect(bins[4]!.count).toBeGreaterThanOrEqual(2)
  })
  it('全相同值 → 單格', () => {
    expect(histogram([3, 3, 3], 10)).toEqual([{ x0: 3, x1: 3, count: 3 }])
  })
  it('空輸入 → 空', () => {
    expect(histogram([], 5)).toEqual([])
  })
})

describe('addMonthsISO', () => {
  it('加月維持日', () => {
    expect(addMonthsISO('2024-01-15', 6)).toBe('2024-07-15')
    expect(addMonthsISO('2024-01-15', 12)).toBe('2025-01-15')
    expect(addMonthsISO('2024-11-30', 3)).toBe('2025-03-02') // 2 月無 30 → 溢位
  })
})
