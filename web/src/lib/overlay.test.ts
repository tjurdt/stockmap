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
const asOf = '2026-09-01'

describe('applyLive', () => {
  it('overrides close, recomputes chgPct and scales mcap; keeps momentum', () => {
    const s = applyLive([base], new Map([['2330', q({})]]), asOf)[0]!
    expect(s.close).toBe(1100)
    expect(s.chgPct).toBeCloseTo(10)
    expect(s.mcap).toBeCloseTo(27500) // 25000 * 1100/1000
    expect(s.mom121).toBe(5) // 動能不動
  })

  it('leaves a stock untouched when no quote or null price', () => {
    expect(applyLive([base], new Map(), asOf)[0]).toBe(base)
    expect(applyLive([base], new Map([['2330', q({ price: null })]]), asOf)[0]).toBe(base)
  })

  it.each([null, 0, -1, NaN, Infinity])(
    'does not reuse yesterday change with prevClose=%s',
    (prevClose) => {
      const s = applyLive([base], new Map([['2330', q({ prevClose })]]), asOf)[0]!
      expect(s.close).toBe(1100)
      expect(s.chgPct).toBeNull()
    },
  )

  it.each(['2026-08-31', '2026-09-01'])(
    'keeps the official close over a quote dated %s',
    (date) => {
      expect(applyLive([base], new Map([['2330', q({ date })]]), asOf)[0]).toBe(base)
    },
  )

  it('rejects undated quotes', () => {
    expect(applyLive([base], new Map([['2330', q({ date: null, time: null })]]), asOf)[0]).toBe(
      base,
    )
  })

  it('reranks the market-cap pool without changing the snapshot', () => {
    const other = { ...base, code: '2317', mcap: 26000 }
    const input = [other, base]
    const result = applyLive(input, new Map([['2330', q({})]]), asOf)
    expect(result.map((s) => s.code)).toEqual(['2330', '2317'])
    expect(input[0]).toBe(other)
    expect(result[1]!.chgPct).toBeNull()
    expect(result[0]!.value).toBeNull()
  })
})

describe('applyLive + momentumFrom', () => {
  const row = {
    schemaVersion: 1 as const,
    date: '2026-09-10',
    stocks: [
      {
        code: '2330',
        close: 1100,
        adjClose: 1100,
        mcap: 27500,
        pe: 22,
        pb: 5.5,
        dy: 1.8,
        mom20: 13,
        mom60: 14,
        mom121: 15,
      },
    ],
  }

  it('動能 / 估值改用暫定當日列的值', () => {
    const s = applyLive([base], new Map([['2330', q({ date: row.date })]]), asOf, row)[0]!
    expect(s.close).toBe(1100)
    expect(s.mom121).toBe(15)
    expect(s.pe).toBe(22)
    expect(s.dy).toBe(1.8)
  })

  it('沒報價但有暫定列 → 仍更新動能', () => {
    const s = applyLive([base], new Map(), asOf, row)[0]!
    expect(s.mom20).toBe(13)
    expect(s.close).toBe(1000)
  })

  it('does not replace newer official factors with an older provisional row', () => {
    expect(applyLive([base], new Map(), row.date, row)[0]).toBe(base)
  })
})
