import { describe, expect, it } from 'vitest'

import { buildTimeline, type TimelineInput } from './timeline'

// 2026-10：10/9 國慶補假、10/26 光復節補假
const holidays = new Set(['2026-10-09', '2026-10-26'])
const base: TimelineInput = {
  asOfDate: '2026-10-07',
  holidays,
  rebalance: 'M',
  rebalanceDay: 1,
  execLagDays: 1,
  swapEnabled: true,
  minHoldDays: 10,
  swapLagDays: 1,
  holdings: [{ code: '2330', name: '台積電', entryDate: '2026-10-02', inTargets: true }],
}

const dayOf = (t: ReturnType<typeof buildTimeline>, d: string) => t.days.find((x) => x.date === d)
const cellOf = (t: ReturnType<typeof buildTimeline>, row: number, d: string) =>
  t.rows[row]!.cells[t.days.findIndex((x) => x.date === d)]

describe('buildTimeline', () => {
  it('排程：每月第 1 個交易日 = 訊號日，隔一交易日 = 成交日', () => {
    const t = buildTimeline(base)
    expect(t.schedule).toContainEqual({ signal: '2026-10-01', trade: '2026-10-02' })
    expect(t.schedule).toContainEqual({ signal: '2026-11-02', trade: '2026-11-03' })
    expect(dayOf(t, '2026-10-01')!.schedule).toBe('signal')
    expect(dayOf(t, '2026-10-02')!.schedule).toBe('trade')
    expect(dayOf(t, '2026-11-03')!.schedule).toBe('trade')
  })

  it('execLagDays = 0 → 訊號日當天成交', () => {
    const t = buildTimeline({ ...base, execLagDays: 0 })
    expect(dayOf(t, '2026-10-01')!.schedule).toBe('both')
  })

  it('只列交易日，休市日記在下一欄的 holidaysBefore', () => {
    const t = buildTimeline(base)
    expect(dayOf(t, '2026-10-09')).toBeUndefined()
    expect(dayOf(t, '2026-10-12')!.holidaysBefore).toEqual(['2026-10-09'])
    expect(dayOf(t, '2026-10-05')!.holidaysBefore).toEqual([]) // 週末不算
    expect(dayOf(t, '2026-10-07')!.isToday).toBe(true)
    expect(dayOf(t, '2026-10-08')!.future).toBe(true)
  })

  it('最短持有：買進日 = 第 0 天，第 N 天 = 最早訊號日，再隔一天成交', () => {
    const t = buildTimeline(base)
    const r = t.rows[0]!
    expect(cellOf(t, 0, '2026-10-02')).toEqual({ kind: 'entry', heldDay: 0 })
    expect(cellOf(t, 0, '2026-10-16')).toEqual({ kind: 'locked', heldDay: 9 })
    expect(cellOf(t, 0, '2026-10-19')).toEqual({ kind: 'ready', heldDay: 10 }) // 跨過 10/9
    expect(cellOf(t, 0, '2026-10-20')).toEqual({ kind: 'free', heldDay: 11 })
    expect(r.swapSignalFrom).toBe('2026-10-19')
    expect(r.swapTradeFrom).toBe('2026-10-20')
    expect(cellOf(t, 0, '2026-10-01')!.kind).toBe('none')
  })

  it('swapLagDays = 0 → 最早成交日就是最早訊號日', () => {
    const t = buildTimeline({ ...base, swapLagDays: 0 })
    expect(t.rows[0]!.swapTradeFrom).toBe('2026-10-19')
  })

  it('沒開動能換股：只畫持有天數，不畫鎖定期', () => {
    const t = buildTimeline({ ...base, swapEnabled: false })
    expect(cellOf(t, 0, '2026-10-05')).toEqual({ kind: 'held', heldDay: 1 })
    expect(t.rows[0]!.swapSignalFrom).toBeNull()
  })

  it('掉出目標名單 → 下次排程成交日標賣出，之後不再畫', () => {
    const t = buildTimeline({
      ...base,
      asOfDate: '2026-10-28',
      holdings: [{ code: '2317', name: '鴻海', entryDate: '2026-10-02', inTargets: false }],
    })
    expect(cellOf(t, 0, '2026-11-03')!.kind).toBe('sell')
    expect(cellOf(t, 0, '2026-11-04')!.kind).toBe('none')
  })

  it('買進日太早 → 左側截斷，天數照樣從買進日起算', () => {
    const t = buildTimeline({
      ...base,
      asOfDate: '2026-12-15',
      holdings: [{ code: '2330', name: '台積電', entryDate: '2026-09-01', inTargets: true }],
    })
    const r = t.rows[0]!
    expect(r.clipped).toBe(true)
    const first = r.cells[0]!
    expect(first.heldDay).toBeGreaterThan(25)
    expect(r.cells[1]!.heldDay).toBe(first.heldDay! + 1)
  })
})
