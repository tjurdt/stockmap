import { describe, expect, it } from 'vitest'

import { median, niceTicks, padExtent, positiveOnly } from './scales'

describe('niceTicks', () => {
  it('produces round 1/2/5 steps covering the range', () => {
    const ticks = niceTicks(0, 100, 5)
    expect(ticks[0]).toBe(0)
    expect(ticks).toEqual([0, 20, 40, 60, 80, 100]) // step 20 = round 1/2/5 × 10^n
    expect(ticks.at(-1)!).toBeGreaterThanOrEqual(100)
  })

  it('handles a degenerate range without throwing', () => {
    expect(() => niceTicks(5, 5)).not.toThrow()
  })
})

describe('median', () => {
  it('odd length', () => {
    expect(median([3, 1, 2])).toBe(2)
  })
  it('even length averages the middle two', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
  it('throws on empty', () => {
    expect(() => median([])).toThrow()
  })
})

describe('padExtent', () => {
  it('pads 10% each side', () => {
    expect(padExtent(0, 10)).toEqual([-1, 11])
  })
  it('falls back to a non-zero pad when lo === hi', () => {
    const [lo, hi] = padExtent(5, 5)
    expect(lo).toBeLessThan(5)
    expect(hi).toBeGreaterThan(5)
  })
})

describe('positiveOnly', () => {
  it('drops non-positive values (invalid on a log axis)', () => {
    expect(positiveOnly([-1, 0, 2, 3])).toEqual([2, 3])
  })
})
