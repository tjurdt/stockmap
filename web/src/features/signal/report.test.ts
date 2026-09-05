import { describe, expect, it } from 'vitest'

import type { HistoryRow } from '../../lib/history'
import type { OperatorPlan } from '../../lib/plan'
import { DEFAULT_PARAMS } from '../backtest/strategyParams'
import { buildOperatorReport } from './report'

function row(
  date: string,
  stocks: { code: string; close: number; f: number; mcap?: number }[],
): HistoryRow {
  return {
    schemaVersion: 1,
    date,
    stocks: stocks.map((s) => ({
      code: s.code,
      close: s.close,
      adjClose: s.close,
      mcap: s.mcap ?? 100,
      pe: 10,
      pb: 1,
      dy: 1,
      mom20: s.f,
      mom60: s.f,
      mom121: s.f,
    })),
  }
}

// A 每天漲 1%、B 持平、C 緩跌。動能 A > B > C。
function history(days: number, from = new Date(Date.UTC(2026, 0, 1))): HistoryRow[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(from)
    d.setUTCDate(d.getUTCDate() + i)
    return row(d.toISOString().slice(0, 10), [
      { code: '1111', close: 100 * 1.01 ** i, f: 50 },
      { code: '2222', close: 100, f: 10 },
      { code: '3333', close: 100 * 0.99 ** i, f: -30 },
    ])
  })
}

const names = new Map([
  ['1111', '甲公司'],
  ['2222', '乙公司'],
  ['3333', '丙公司'],
])

interface PlanOver {
  startDate?: string
  holdings?: OperatorPlan['holdings']
  strategy?: Partial<OperatorPlan['strategy']>
}

const plan = (over: PlanOver = {}): OperatorPlan => ({
  schemaVersion: 1,
  startDate: over.startDate ?? '2026-01-01',
  strategy: { ...DEFAULT_PARAMS, factor: 'm20', topN: 1, poolTopN: 10, ...over.strategy },
  holdings: over.holdings ?? [],
})

describe('buildOperatorReport', () => {
  it('沒有歷史 → null', () => {
    expect(buildOperatorReport([], [], plan(), names)).toBeNull()
  })

  it('目標＝動能最高者，且帶入股名與現價', () => {
    const r = buildOperatorReport(history(30), [], plan(), names)!
    expect(r.targets.map((t) => t.code)).toEqual(['1111'])
    expect(r.targets[0]!.name).toBe('甲公司')
    expect(r.targets[0]!.price).toBeCloseTo(100 * 1.01 ** 29, 4)
  })

  it('尚未上線 → started=false', () => {
    const r = buildOperatorReport(history(30), [], plan({ startDate: '2099-01-01' }), names)!
    expect(r.started).toBe(false)
  })

  it('換股日：asOfDate 落在 rebalanceDay 上 → isSignalDay，且給買賣清單', () => {
    // 28 天從 1/1；rebalanceDay=28 → 訊號日 1/28（= 最後一天）
    const r = buildOperatorReport(
      history(28),
      [],
      plan({
        strategy: { rebalance: 'M', rebalanceDay: 28 },
        holdings: [{ code: '3333', shares: 1000, entryPrice: 100, entryDate: '2026-01-01' }],
      }),
      names,
    )!
    expect(r.asOfDate).toBe('2026-01-28')
    expect(r.isSignalDay).toBe(true)
    expect(r.actions.find((a) => a.kind === 'sell')?.code).toBe('3333')
    expect(r.actions.find((a) => a.kind === 'buy')?.code).toBe('1111')
  })

  it('非換股日 → isSignalDay=false，nextRebalanceDate 在未來', () => {
    const r = buildOperatorReport(
      history(10),
      [],
      plan({ strategy: { rebalance: 'M', rebalanceDay: 25 } }),
      names,
    )!
    expect(r.isSignalDay).toBe(false)
    expect(r.nextRebalanceDate > r.asOfDate).toBe(true)
  })

  it('固定停損：跌破買進價 stopPct% → hit 且列入 stopActionsNow', () => {
    const r = buildOperatorReport(
      history(30),
      [],
      plan({
        strategy: { stopType: 'fixed', stopPct: 10 },
        holdings: [{ code: '3333', shares: 1000, entryPrice: 100, entryDate: '2026-01-01' }],
      }),
      names,
    )!
    const h = r.holdings.find((x) => x.code === '3333')!
    expect(h.stop?.hit).toBe(true)
    expect(r.stopActionsNow.map((s) => s.code)).toContain('3333')
  })

  it('regime 轉變：昨天多、今天空 → regimeChangedFrom=bull，targets 清空', () => {
    const h = history(12)
    // 指數緩漲 11 天、最後一天跳水 → 5 日均線只在最後一天翻空
    const bl = h.map((r, i) => ({
      date: r.date,
      twiiTR: i < 11 ? 100 + i : 90,
    }))
    const r = buildOperatorReport(
      h,
      bl,
      plan({ strategy: { regime: 'ma', regimeDays: 5 } }),
      names,
    )!
    expect(r.regime).toBe('bear')
    expect(r.regimeChangedFrom).toBe('bull')
    expect(r.targets).toHaveLength(0)
  })
})
