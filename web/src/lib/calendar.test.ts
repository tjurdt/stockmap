import { describe, expect, it } from 'vitest'

import {
  isTradingDay,
  nextTradingDay,
  nthTradingDayOfMonth,
  prevTradingDay,
  tradingDayOrdinal,
  tradingDaysInMonth,
} from './calendar'

// 2026 農曆春節 2/16–2/20 + 2/12、2/13 休市（2/14、2/15 週末）
const H = new Set([
  '2026-01-01',
  '2026-02-12',
  '2026-02-13',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-02-19',
  '2026-02-20',
  '2026-02-27',
])

describe('calendar', () => {
  it('isTradingDay：週末與假日為 false', () => {
    expect(isTradingDay('2026-02-11', H)).toBe(true) // 週三
    expect(isTradingDay('2026-02-14', H)).toBe(false) // 週六
    expect(isTradingDay('2026-02-16', H)).toBe(false) // 春節
    expect(isTradingDay('2026-01-01', H)).toBe(false) // 元旦
  })

  it('nextTradingDay：跳過整個春節連假', () => {
    expect(nextTradingDay('2026-02-11', H)).toBe('2026-02-23') // 下一個是 2/23 週一
    expect(nextTradingDay('2026-02-26', H)).toBe('2026-03-02') // 2/27 補假、2/28-3/1 週末
  })

  it('prevTradingDay', () => {
    expect(prevTradingDay('2026-02-23', H)).toBe('2026-02-11')
  })

  it('tradingDaysInMonth：2026-02 排除連假與週末', () => {
    const days = tradingDaysInMonth(2026, 2, H)
    expect(days[0]).toBe('2026-02-02')
    expect(days).not.toContain('2026-02-16')
    expect(days).not.toContain('2026-02-27')
    expect(days.at(-1)).toBe('2026-02-26')
  })

  it('nthTradingDayOfMonth：第 1 / 第 5 個交易日', () => {
    expect(nthTradingDayOfMonth(2026, 9, 1, H)).toBe('2026-09-01') // 週二
    // 9 月交易日：1,2,3,4,7,... → 第 5 個是 9/7
    expect(nthTradingDayOfMonth(2026, 9, 5, H)).toBe('2026-09-07')
    expect(nthTradingDayOfMonth(2026, 2, 99, H)).toBe('2026-02-26') // 不足 → 最後一個
  })

  it('tradingDayOrdinal：9/7 是 9 月第 5 個交易日', () => {
    expect(tradingDayOrdinal('2026-09-07', H)).toBe(5)
    expect(tradingDayOrdinal('2026-09-01', H)).toBe(1)
  })
})
