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
  it.each([
    [-0.37, 2.43],
    [-0.8, 5.2],
    [-0.6, 14.4],
    [0.001, 0.002],
    [-0.002, -0.001],
    [0, 0],
    [3, 3],
    [-0.3, -0.3],
  ])('uses 20–50 zero-aligned bins for [%s, %s]', (lo, hi) => {
    const values = Array.from({ length: 101 }, (_, i) => lo + ((hi - lo) * i) / 100)
    const bins = histogram(values)
    expect(bins.length).toBeGreaterThanOrEqual(20)
    expect(bins.length).toBeLessThanOrEqual(50)
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(values.length)
    expect(bins.some((b) => b.x0 === 0)).toBe(true)
    expect(bins.some((b) => b.x0 < 0 && b.x1 > 0)).toBe(false)
    expect(bins[0]!.x0).toBeLessThanOrEqual(lo)
    expect(bins.at(-1)!.x1).toBeGreaterThanOrEqual(hi)
    const step = (bins[0]!.x1 - bins[0]!.x0) * 100
    expect(step).toBeCloseTo(Math.round(step), 10)
    expect(step).toBeGreaterThanOrEqual(1 - 1e-10)
    const normalized = step / 10 ** Math.floor(Math.log10(step + 1e-10))
    expect([1, 2, 5].some((s) => Math.abs(s - normalized) < 1e-10)).toBe(true)
    for (const b of bins) {
      expect(b.x1 - b.x0).toBeCloseTo(step / 100, 10)
      expect(b.x0 * 100).toBeCloseTo(Math.round(b.x0 * 100), 10)
    }
  })

  it.each([
    [-0.37, 2.43, 0.1],
    [-0.8, 5.2, 0.2],
    [-0.6, 14.4, 0.5],
  ])('selects a readable width for [%s, %s]', (lo, hi, width) => {
    const bins = histogram([lo, hi])
    expect(bins[0]!.x1 - bins[0]!.x0).toBeCloseTo(width)
  })

  it('places exact boundaries on the right, keeps tiny losses negative, and includes the maximum', () => {
    const bins = histogram([-0.1, -1e-15, 0, 0.01, 0.03, 0.3 - 0.2, 0.2])
    expect(bins.find((b) => b.x0 === 0)!.count).toBe(1)
    expect(bins.find((b) => b.x1 === 0)!.count).toBe(1)
    expect(bins.find((b) => b.x0 === 0.01)!.count).toBe(1)
    expect(bins.find((b) => b.x0 === 0.03)!.count).toBe(1)
    expect(bins.find((b) => b.x0 === 0.1)!.count).toBe(1)
    expect(bins.at(-1)!.count).toBe(1)
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(7)
  })

  it('ignores non-finite values and bounds invalid target counts', () => {
    expect(histogram([NaN, Infinity, -Infinity])).toEqual([])
    expect(histogram([-Number.MAX_VALUE, Number.MAX_VALUE])).toEqual([])
    expect(histogram([0, 0.1, NaN], NaN).reduce((s, b) => s + b.count, 0)).toBe(2)
    for (const target of [-1, 1, 1000, Infinity]) {
      const bins = histogram([-1, 10], target)
      expect(bins.length).toBeGreaterThanOrEqual(20)
      expect(bins.length).toBeLessThanOrEqual(50)
    }
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
