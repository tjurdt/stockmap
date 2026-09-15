import { describe, expect, it } from 'vitest'

import { isMarketHours, marketPhase, quoteTradingDate, quotesTradingDate } from './live'

// 用固定 UTC 時刻推算 Asia/Taipei（UTC+8，台灣不實施日光節約）
const at = (iso: string) => new Date(iso)

describe('marketPhase', () => {
  it('open 在週三 10:00 TPE', () => {
    expect(marketPhase(at('2026-09-02T02:00:00Z'))).toBe('open')
    expect(isMarketHours(at('2026-09-02T02:00:00Z'))).toBe(true)
  })

  it('open 在週三 13:50 TPE（收盤後緩衝內，Yahoo 資料落定）', () => {
    expect(marketPhase(at('2026-09-02T05:50:00Z'))).toBe('open')
  })

  it('pre 在週三 08:30 TPE（開盤前）', () => {
    expect(marketPhase(at('2026-09-02T00:30:00Z'))).toBe('pre')
  })

  it('closed 在週三 14:30 TPE（盤後 —— 這段時間官方資料還沒進來，要靠報價補）', () => {
    expect(marketPhase(at('2026-09-02T06:30:00Z'))).toBe('closed')
    expect(isMarketHours(at('2026-09-02T06:30:00Z'))).toBe(false)
  })

  it('closed 在週六', () => {
    expect(marketPhase(at('2026-09-05T02:00:00Z'))).toBe('closed')
  })
})

describe('quoteTradingDate', () => {
  const q = (over: Partial<Parameters<typeof quoteTradingDate>[0]>) => ({
    code: '2330',
    price: 100,
    prevClose: 99,
    time: null,
    date: null,
    ...over,
  })

  it('優先用 worker 給的 date（YYYY-MM-DD / YYYYMMDD 都收）', () => {
    expect(quoteTradingDate(q({ date: '2026-09-10' }))).toBe('2026-09-10')
    expect(quoteTradingDate(q({ date: '20260910' }))).toBe('2026-09-10')
  })

  it('沒有 date 就用 time 換算成台北日期', () => {
    // 05:00Z = 13:00 台北同日
    expect(quoteTradingDate(q({ time: '2026-09-10T05:00:00Z' }))).toBe('2026-09-10')
    // 21:00Z = 隔天 05:00 台北（美股時段的殘值；仍換成台北日）
    expect(quoteTradingDate(q({ time: '2026-09-10T21:00:00Z' }))).toBe('2026-09-11')
  })

  it('都沒有 → null', () => {
    expect(quoteTradingDate(q({}))).toBeNull()
    expect(quoteTradingDate(q({ time: 'not a date' }))).toBeNull()
  })

  it('quotesTradingDate 取最新、忽略沒價格的', () => {
    const m = new Map([
      ['2330', q({ time: '2026-09-09T05:00:00Z' })],
      ['2317', q({ time: '2026-09-10T05:00:00Z' })],
      ['2454', q({ price: null, time: '2026-09-11T05:00:00Z' })],
    ])
    expect(quotesTradingDate(m)).toBe('2026-09-10')
  })
})
