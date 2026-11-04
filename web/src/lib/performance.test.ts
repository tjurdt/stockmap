import { describe, expect, it } from 'vitest'

import type { BaselineRow } from './baselines'
import { tradeCash } from './costs'
import { buildPerformance, modifiedDietz, xirr, type PriceRow } from './performance'
import type { Trade } from './trades'

let seq = 0
const t = (
  date: string,
  code: string,
  side: 'buy' | 'sell',
  shares: number,
  price: number,
): Trade => ({ id: `t${String(seq++).padStart(3, '0')}`, date, code, side, shares, price })

const noCost = { feeBps: 0, taxBps: 0 }

const rows = (closes: Record<string, Record<string, number>>): PriceRow[] =>
  Object.entries(closes).map(([date, m]) => ({
    date,
    stocks: Object.entries(m).map(([code, close]) => ({ code, close })),
  }))

const flatBench = (dates: string[]): BaselineRow[] =>
  dates.map((date) => ({ date, twiiTR: 100, e0050: 100 }))

describe('tradeCash 對齊券商成交明細', () => {
  it.each([
    ['1303', 250, 235, 58_773],
    ['1303', 180, 236.5, 42_586],
    ['3653', 10, 6800, 68_027],
    ['3653', 10, 6835, 68_377],
  ])('買進 %s %i 股 @%f → 實付 %i', (code, shares, price, net) => {
    expect(tradeCash({ code, side: 'buy', shares, price }).net).toBe(net)
  })

  it.each([
    ['3653', 10, 6135, 24, 184, 61_142],
    ['3653', 10, 6240, 24, 187, 62_189],
    ['1303', 430, 255.5, 43, 329, 109_493],
  ])('賣出 %s %i 股 @%f → 手續費 %i、稅 %i、實收 %i', (code, shares, price, fee, tax, net) => {
    expect(tradeCash({ code, side: 'sell', shares, price })).toMatchObject({ fee, tax, net })
  })

  it('ETF 賣出只課 0.1%', () => {
    expect(tradeCash({ code: '0050', side: 'sell', shares: 1000, price: 100 }).tax).toBe(100)
  })
})

describe('modifiedDietz / xirr', () => {
  it('期初一次投入 → 等於單純報酬率', () => {
    const flows = [{ date: '2026-01-01', amount: 100 }]
    expect(modifiedDietz(flows, 110, '2026-12-31')).toBeCloseTo(0.1)
  })

  it('期中才加碼的錢只算一半權重', () => {
    const flows = [
      { date: '2026-01-01', amount: 100 },
      { date: '2026-01-11', amount: 100 },
    ]
    // 總共 20 天，第二筆在場 10 天 → 平均本金 150
    expect(modifiedDietz(flows, 215, '2026-01-21')).toBeCloseTo(15 / 150)
  })

  it('xirr：滿一年賺 10% → 年化 10%', () => {
    const r = xirr([{ date: '2025-01-01', amount: 100 }], 110, '2026-01-01')
    expect(r).toBeCloseTo(0.1, 4)
  })
})

describe('buildPerformance', () => {
  it('沒有紀錄 → null', () => {
    expect(buildPerformance([], [], [])).toBeNull()
  })

  it('賣出的錢拿去買，不夠的才算新投入', () => {
    const p = buildPerformance(
      [
        t('2026-01-02', '1111', 'buy', 10, 100),
        t('2026-01-05', '1111', 'sell', 10, 110),
        t('2026-01-05', '2222', 'buy', 10, 150),
      ],
      rows({ '2026-01-02': { 1111: 100 }, '2026-01-05': { 1111: 110, 2222: 150 } }),
      flatBench(['2026-01-02', '2026-01-05']),
      noCost,
    )!
    expect(p.flows).toEqual([
      { date: '2026-01-02', amount: 1000 },
      { date: '2026-01-05', amount: 400 },
    ])
    expect(p.contributed).toBe(1400)
    expect(p.endValue).toBe(1500)
    expect(p.pl).toBe(100)
  })

  it('TWR 不受加碼金額影響：股價漲 80%，但大部分錢買在高點 → TWR 賺、實際虧', () => {
    const p = buildPerformance(
      [t('2026-01-02', '1111', 'buy', 1, 100), t('2026-01-12', '1111', 'buy', 99, 200)],
      rows({
        '2026-01-02': { 1111: 100 },
        '2026-01-12': { 1111: 200 },
        '2026-01-22': { 1111: 180 },
      }),
      flatBench(['2026-01-02']),
      noCost,
    )!
    // 股價 100 → 180，策略本身 +80%；但大部分錢在 200 才進場，實際是虧的
    expect(p.twr).toBeCloseTo(0.8)
    expect(p.pl).toBeLessThan(0)
    expect(p.mwr).toBeLessThan(0)
  })

  it('空手時現金留在帳上，TWR 不動', () => {
    const p = buildPerformance(
      [t('2026-01-02', '1111', 'buy', 10, 100), t('2026-01-05', '1111', 'sell', 10, 120)],
      rows({
        '2026-01-02': { 1111: 100 },
        '2026-01-05': { 1111: 120 },
        '2026-01-06': { 1111: 50 },
      }),
      flatBench(['2026-01-02']),
      noCost,
    )!
    expect(p.twr).toBeCloseTo(0.2)
    expect(p.cash).toBe(1200)
    expect(p.marketValue).toBe(0)
  })

  it('同金流比較：後投入的錢只吃到後面那段大盤報酬', () => {
    const p = buildPerformance(
      [t('2026-01-02', '1111', 'buy', 1, 100), t('2026-01-05', '2222', 'buy', 1, 100)],
      rows({
        '2026-01-02': { 1111: 100 },
        '2026-01-05': { 1111: 100, 2222: 100 },
        '2026-01-06': { 1111: 100, 2222: 100 },
      }),
      [
        { date: '2026-01-02', twiiTR: 100 },
        { date: '2026-01-05', twiiTR: 200 },
        { date: '2026-01-06', twiiTR: 300 },
      ],
      noCost,
    )!
    const b = p.benchmarks.find((x) => x.key === 'twiiTR')!
    // 第一筆 100 元買 1 單位、第二筆 100 元買 0.5 單位 → 1.5 × 300
    expect(b.endValue).toBeCloseTo(450)
    expect(b.periodReturn).toBeCloseTo(2)
    expect(b.index).toEqual([1, 2, 3])
  })

  it('實際案例：對得上券商已實現損益', () => {
    const p = buildPerformance(
      [
        t('2026-09-07', '1303', 'buy', 250, 235),
        t('2026-09-11', '1303', 'buy', 180, 236.5),
        t('2026-10-01', '1303', 'sell', 430, 255.5),
        t('2026-10-01', '3653', 'buy', 10, 6800),
        t('2026-10-02', '3653', 'buy', 10, 6835),
        t('2026-11-04', '3653', 'sell', 10, 6135),
        t('2026-11-04', '3653', 'sell', 10, 6240),
      ],
      [],
      [],
    )!
    expect(p.pl).toBe(-4_939)
    expect(p.contributed).toBe(58_773 + 42_586 + 26_911)
    expect(p.endValue).toBe(123_331)
    expect(p.segments.map((s) => [s.code, s.pl])).toEqual([
      ['3653', -13_073],
      ['1303', 8_134],
    ])
  })

  it('賣超過持股只算到持有部分', () => {
    const p = buildPerformance(
      [t('2026-01-02', '1111', 'buy', 10, 100), t('2026-01-05', '1111', 'sell', 99, 100)],
      [],
      [],
      noCost,
    )!
    expect(p.endValue).toBe(1000)
  })

  it('滿一年才給年化', () => {
    const short = buildPerformance([t('2026-01-02', '1111', 'buy', 1, 100)], [], [], noCost)!
    expect(short.annualized).toBeNull()
    const long = buildPerformance(
      [t('2025-01-02', '1111', 'buy', 1, 100)],
      rows({ '2025-01-02': { 1111: 100 }, '2026-01-02': { 1111: 110 } }),
      [],
      noCost,
    )!
    expect(long.annualized).toBeCloseTo(0.1, 3)
  })
})
