import { describe, expect, it } from 'vitest'

import type { Stock } from './data'
import type { LiveQuote } from './live'
import { applyLive } from './overlay'

const base: Stock = {
  code: '2330',
  name: '台積電',
  close: 1000,
  chgPct: 1,
  mcap: 25000,
  value: 500,
  pe: 20,
  pb: 5,
  dy: 2,
  mom20: 3,
  mom60: 4,
  mom121: 5,
}

const q = (over: Partial<LiveQuote>): LiveQuote => ({
  code: '2330',
  price: 1100,
  prevClose: 1000,
  time: '10:00:00',
  date: '20260902',
  ...over,
})

describe('applyLive', () => {
  it('overrides close, recomputes chgPct and scales mcap; keeps momentum', () => {
    const s = applyLive([base], new Map([['2330', q({})]]))[0]!
    expect(s.close).toBe(1100)
    expect(s.chgPct).toBeCloseTo(10)
    expect(s.mcap).toBeCloseTo(27500) // 25000 * 1100/1000
    expect(s.mom121).toBe(5) // 動能不動
  })

  it('leaves a stock untouched when no quote or null price', () => {
    expect(applyLive([base], new Map())[0]).toBe(base)
    expect(applyLive([base], new Map([['2330', q({ price: null })]]))[0]).toBe(base)
  })

  it('falls back to snapshot chgPct when prevClose missing', () => {
    const s = applyLive([base], new Map([['2330', q({ prevClose: null })]]))[0]!
    expect(s.chgPct).toBe(1)
  })
})
