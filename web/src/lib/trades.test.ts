import { describe, expect, it } from 'vitest'

import { buildLedger, tradesFromPositions, type Trade } from './trades'

let seq = 0
const t = (
  date: string,
  code: string,
  side: 'buy' | 'sell',
  shares: number,
  price: number,
): Trade => ({
  id: `t${seq++}`,
  date,
  code,
  side,
  shares,
  price,
})

describe('buildLedger', () => {
  it('單純買進 → 一筆持股', () => {
    const { positions, realized } = buildLedger([t('2026-09-01', '2330', 'buy', 1000, 1000)])
    expect(positions).toHaveLength(1)
    expect(positions[0]).toMatchObject({
      code: '2330',
      shares: 1000,
      entryPrice: 1000,
      entryDate: '2026-09-01',
    })
    expect(realized).toBe(0)
  })

  it('加碼 → 加權平均成本，持有起算日不變', () => {
    const { positions } = buildLedger([
      t('2026-09-01', '2330', 'buy', 1000, 1000),
      t('2026-09-10', '2330', 'buy', 1000, 1200),
    ])
    expect(positions[0]!.entryPrice).toBeCloseTo(1100)
    expect(positions[0]!.shares).toBe(2000)
    expect(positions[0]!.entryDate).toBe('2026-09-01')
    expect(positions[0]!.lastBuyDate).toBe('2026-09-10')
  })

  it('部分賣出 → 認列已實現損益，成本不變', () => {
    const { positions, realized } = buildLedger([
      t('2026-09-01', '2330', 'buy', 2000, 1000),
      t('2026-09-10', '2330', 'sell', 1000, 1100),
    ])
    expect(realized).toBeCloseTo(100_000)
    expect(positions[0]!.shares).toBe(1000)
    expect(positions[0]!.entryPrice).toBeCloseTo(1000)
    expect(positions[0]!.entryDate).toBe('2026-09-01')
  })

  it('賣光再買回 → 持有天數重新起算', () => {
    const { positions, realized } = buildLedger([
      t('2026-09-01', '2330', 'buy', 1000, 1000),
      t('2026-09-10', '2330', 'sell', 1000, 900),
      t('2026-09-20', '2330', 'buy', 1000, 950),
    ])
    expect(realized).toBeCloseTo(-100_000)
    expect(positions[0]!.entryDate).toBe('2026-09-20')
    expect(positions[0]!.entryPrice).toBeCloseTo(950)
  })

  it('賣光 → 不留持股', () => {
    const { positions } = buildLedger([
      t('2026-09-01', '2330', 'buy', 1000, 1000),
      t('2026-09-10', '2330', 'sell', 1000, 1100),
    ])
    expect(positions).toHaveLength(0)
  })

  it('不依輸入順序，一律依成交日排序', () => {
    const { positions } = buildLedger([
      t('2026-09-10', '2330', 'sell', 1000, 1100),
      t('2026-09-01', '2330', 'buy', 2000, 1000),
    ])
    expect(positions[0]!.shares).toBe(1000)
  })

  it('賣超過持股 → 只認到持有的部分；沒持股的賣出忽略', () => {
    const { positions, realized } = buildLedger([
      t('2026-09-01', '2330', 'buy', 1000, 1000),
      t('2026-09-10', '2330', 'sell', 5000, 1100),
      t('2026-09-11', '2317', 'sell', 1000, 100),
    ])
    expect(positions).toHaveLength(0)
    expect(realized).toBeCloseTo(100_000)
  })

  it('略過不合法的紀錄', () => {
    const { positions } = buildLedger([
      t('2026-09-01', 'ABCD', 'buy', 1000, 100),
      t('2026-09-01', '2330', 'buy', 0, 100),
      t('2026-09-01', '2317', 'buy', 1000, 0),
    ])
    expect(positions).toHaveLength(0)
  })
})

describe('tradesFromPositions', () => {
  it('舊持股清單 → 等值的買進紀錄', () => {
    const trades = tradesFromPositions([
      { code: '2330', shares: 1000, entryPrice: 1000, entryDate: '2026-09-01' },
    ])
    expect(buildLedger(trades).positions[0]).toMatchObject({
      code: '2330',
      shares: 1000,
      entryPrice: 1000,
      entryDate: '2026-09-01',
    })
  })
})
