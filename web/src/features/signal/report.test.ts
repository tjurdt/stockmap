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

  it('即時價：skip=0 動能用現價重排 → 3333 拉高後排第一', () => {
    // priceOf 給 3333 一個超高現價 → bumpMomentum(-30, ratio) 反超 1111 的 50
    const live = (c: string) => (c === '3333' ? 300 : null)
    const r = buildOperatorReport(
      history(30),
      [],
      plan({ strategy: { poolTopN: 10 } }),
      names,
      new Set(),
      live,
    )!
    expect(r.momentumIsLive).toBe(true)
    expect(r.priceIsLive).toBe(true)
    expect(r.factorBoard[0]!.code).toBe('3333')
    expect(r.targets[0]!.code).toBe('3333')
  })

  it('即時價：12-1 動能（skip=20）不受現價影響 → momentumIsLive=false', () => {
    const live = (c: string) => (c === '3333' ? 300 : null)
    const r = buildOperatorReport(
      history(30),
      [],
      plan({ strategy: { factor: 'm121' } }),
      names,
      new Set(),
      live,
    )!
    expect(r.priceIsLive).toBe(true)
    expect(r.momentumIsLive).toBe(false)
    expect(r.targets[0]!.code).toBe('1111') // 排名不變
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

  it('非換股日、已建倉 → isSignalDay=false，nextRebalanceDate 在未來', () => {
    const r = buildOperatorReport(
      history(10),
      [],
      plan({
        strategy: { rebalance: 'M', rebalanceDay: 25 },
        holdings: [{ code: '1111', shares: 1000, entryPrice: 100, entryDate: '2026-01-01' }],
      }),
      names,
    )!
    expect(r.isSignalDay).toBe(false)
    expect(r.isEntryDay).toBe(false)
    expect(r.nextRebalanceDate > r.asOfDate).toBe(true)
  })

  it('已上線、還沒建倉 → isEntryDay=true、isSignalDay=true', () => {
    const r = buildOperatorReport(
      history(10),
      [],
      plan({ startDate: '2026-01-01', strategy: { rebalance: 'M', rebalanceDay: 25 } }),
      names,
    )!
    expect(r.started).toBe(true)
    expect(r.isEntryDay).toBe(true)
    expect(r.isSignalDay).toBe(true)
    expect(r.firstEntryDay).toBe('2026-01-01')
    expect(r.actions.every((a) => a.kind === 'buy')).toBe(true)
  })

  it('動能排行 vs 持股：前十 + 差值', () => {
    const r = buildOperatorReport(
      history(30),
      [],
      plan({
        strategy: { poolTopN: 10 },
        holdings: [{ code: '2222', shares: 1000, entryPrice: 100, entryDate: '2026-01-01' }],
      }),
      names,
    )!
    expect(r.factorBoard.length).toBeGreaterThan(0)
    expect(r.factorBoard[0]!.rank).toBe(1)
    expect(r.factorBoard[0]!.code).toBe('1111') // 動能最高
    const board1111 = r.factorBoard.find((b) => b.code === '1111')!
    // 1111 動能 50、2222 動能 10 → 差 +40
    expect(board1111.deltaVsHolding['2222']).toBeCloseTo(40)
    expect(r.factorBoard.find((b) => b.code === '2222')?.held).toBe(true)
    expect(r.holdings[0]!.factor).toBe(10)
    expect(r.holdings[0]!.factorRank).toBe(2) // 1111 > 2222 > 3333
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
    expect(h.stop?.stopPrice).toBeCloseTo(90) // 買進價 100 × (1 − 10%)
    expect(h.stop?.peakPrice).toBeNull()
    expect(r.stopActionsNow.map((s) => s.code)).toContain('3333')
  })

  it('移動停損：refPrice = 波段最高收盤、stopPrice、peakPrice', () => {
    // 1111 一路漲 30 天 → 波段最高 = 最後一天收盤；距高點 0
    const r = buildOperatorReport(
      history(30),
      [],
      plan({
        strategy: { stopType: 'trailing', stopPct: 15 },
        holdings: [{ code: '1111', shares: 1000, entryPrice: 100, entryDate: '2026-01-01' }],
      }),
      names,
    )!
    const h = r.holdings.find((x) => x.code === '1111')!
    const peak = 100 * 1.01 ** 29
    expect(h.stop?.type).toBe('trailing')
    expect(h.stop?.peakPrice).toBeCloseTo(peak, 4)
    expect(h.stop?.stopPrice).toBeCloseTo(peak * 0.85, 4)
    expect(h.stop?.pct).toBeCloseTo(0, 6) // 現價 = 高點
    expect(h.stop?.hit).toBe(false)
  })

  it('單日跌幅停損：3333 前一日 → 今日跌幅超過 stopPct% → hit', () => {
    // 3333 每天 -1%，單日跌幅約 -1%；門檻設 0.5% → 命中
    const r = buildOperatorReport(
      history(20),
      [],
      plan({
        strategy: { stopType: 'daily', stopPct: 0.5 },
        holdings: [{ code: '3333', shares: 1000, entryPrice: 100, entryDate: '2026-01-01' }],
      }),
      names,
    )!
    const h = r.holdings.find((x) => x.code === '3333')!
    expect(h.stop?.type).toBe('daily')
    expect(h.stop?.hit).toBe(true)
  })

  it('跌破均線停損：3333 一路跌 → 收盤低於 N 日均線 → hit；1111 一路漲 → 不 hit', () => {
    const r = buildOperatorReport(
      history(30),
      [],
      plan({
        strategy: { stopType: 'ma', stopMaDays: 5 },
        holdings: [
          { code: '3333', shares: 1000, entryPrice: 100, entryDate: '2026-01-01' },
          { code: '1111', shares: 1000, entryPrice: 100, entryDate: '2026-01-01' },
        ],
      }),
      names,
    )!
    expect(r.holdings.find((x) => x.code === '3333')!.stop?.hit).toBe(true)
    expect(r.holdings.find((x) => x.code === '1111')!.stop?.hit).toBe(false)
  })

  it('動能換股：非排程日、持有的股票被排名外挑戰者反超 → swapSignal + isSignalDay', () => {
    const r = buildOperatorReport(
      history(30),
      [],
      plan({
        strategy: {
          rebalance: 'M',
          rebalanceDay: 1,
          swapOnBetter: true,
          swapMargin: 15,
          swapMinHoldDays: 5,
        },
        holdings: [{ code: '2222', shares: 1000, entryPrice: 100, entryDate: '2026-01-01' }],
      }),
      names,
    )!
    expect(r.swapSignal).toBe(true)
    expect(r.isSignalDay).toBe(true)
    expect(r.actions.find((a) => a.kind === 'buy')?.code).toBe('1111')
    expect(r.actions.find((a) => a.kind === 'sell')?.code).toBe('2222')
  })

  it('動能換股：最短持有天數未到 → 不觸發', () => {
    const r = buildOperatorReport(
      history(30),
      [],
      plan({
        strategy: { rebalance: 'M', rebalanceDay: 1, swapOnBetter: true, swapMinHoldDays: 999 },
        holdings: [{ code: '2222', shares: 1000, entryPrice: 100, entryDate: '2026-01-01' }],
      }),
      names,
    )!
    expect(r.swapSignal).toBe(false)
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
