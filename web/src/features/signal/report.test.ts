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
    // 1111 動能 50、2222 動能 10 → 差 +40（相對 2222 因子值 10 → +400%）
    expect(board1111.deltaVsHolding['2222']!.abs).toBeCloseTo(40)
    expect(board1111.deltaVsHolding['2222']!.pct).toBeCloseTo(400)
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

describe('已持有天數 / 最短持有', () => {
  it('heldDays 數的是進場日之後的交易日列數，並算出最短持有到期日', () => {
    const r = buildOperatorReport(
      history(30),
      [],
      plan({
        strategy: { swapOnBetter: true, swapMinHoldDays: 10 },
        holdings: [{ code: '1111', shares: 1000, entryPrice: 100, entryDate: '2026-01-20' }],
      }),
      names,
    )!
    const h = r.holdings[0]!
    expect(h.heldDays).toBe(10) // 1/21 ~ 1/30
    expect(h.minHoldDays).toBe(10)
    expect(h.minHoldMet).toBe(true)
    expect(h.minHoldUntil > '2026-01-20').toBe(true)
  })

  it('剛買進 → 還沒滿最短持有', () => {
    const r = buildOperatorReport(
      history(30),
      [],
      plan({
        strategy: { swapOnBetter: true, swapMinHoldDays: 10 },
        holdings: [{ code: '1111', shares: 1000, entryPrice: 100, entryDate: '2026-01-29' }],
      }),
      names,
    )!
    expect(r.holdings[0]!.heldDays).toBe(1)
    expect(r.holdings[0]!.minHoldMet).toBe(false)
  })
})

// 不變式：排程換股日一到就整批換，swapMinHoldDays 擋不住（與 engine.runBacktest 的先後順序一致）
describe('規則優先序：排程換股日 > 最短持有天數', () => {
  it('排程換股日當天，沒滿最短持有的持股照樣被賣', () => {
    const r = buildOperatorReport(
      history(28),
      [],
      plan({
        strategy: {
          rebalance: 'M',
          rebalanceDay: 28,
          swapOnBetter: true,
          swapMinHoldDays: 10,
        },
        // 昨天才買，離最短持有 10 天還早
        holdings: [{ code: '3333', shares: 1000, entryPrice: 100, entryDate: '2026-01-27' }],
      }),
      names,
    )!
    expect(r.isRebalanceDay).toBe(true)
    expect(r.holdings[0]!.minHoldMet).toBe(false)
    expect(r.actions.find((a) => a.kind === 'sell')?.code).toBe('3333')
    expect(r.verdict.kind).toBe('rebalance')
    expect(r.verdict.act).toBe(true)
  })
})

describe('swapWatch：什麼時候可以換成誰', () => {
  const swapPlan = (entryDate: string) =>
    plan({
      strategy: {
        rebalance: 'M',
        rebalanceDay: 25, // history(10) 期間不會是排程日
        topN: 1,
        swapOnBetter: true,
        swapMargin: 15,
        swapMinHoldDays: 10,
      },
      holdings: [{ code: '3333', shares: 1000, entryPrice: 100, entryDate }],
    })

  it('算出最弱持股、門檻值與挑戰者', () => {
    const r = buildOperatorReport(history(10), [], swapPlan('2026-01-09'), names)!
    const w = r.swapWatch
    expect(w.enabled).toBe(true)
    expect(w.weakest?.code).toBe('3333')
    // 因子 −30、門檻 = −30 + 30 × 15%
    expect(w.thresholdFactor).toBeCloseTo(-25.5, 6)
    expect(w.challengers[0]!.code).toBe('1111')
    expect(w.challengers[0]!.qualified).toBe(true)
    expect(w.challengers[0]!.over).toBeCloseTo(80, 6)
  })

  it('沒滿最短持有 → 不觸發，但給得出最快可換日', () => {
    const r = buildOperatorReport(history(10), [], swapPlan('2026-01-09'), names)!
    expect(r.swapWatch.minHoldReady).toBe(false)
    expect(r.swapWatch.triggered).toBe(false)
    expect(r.swapWatch.earliestSwapDate! > r.asOfDate).toBe(true)
    expect(r.verdict.kind).toBe('hold')
  })

  it('已滿最短持有且門檻達標 → 觸發，明天換股', () => {
    const r = buildOperatorReport(history(30), [], swapPlan('2026-01-05'), names)!
    expect(r.swapWatch.minHoldReady).toBe(true)
    expect(r.swapWatch.triggered).toBe(true)
    expect(r.swapWatch.earliestSwapDate).toBe(r.nextTradingDay)
    expect(r.verdict.kind).toBe('swap')
    expect(r.verdict.act).toBe(true)
  })

  it('手上每一檔都還在目標名單內 → 沒有可換的對象', () => {
    const r = buildOperatorReport(
      history(10),
      [],
      plan({
        strategy: { rebalance: 'M', rebalanceDay: 25, topN: 1, swapOnBetter: true },
        holdings: [{ code: '1111', shares: 1000, entryPrice: 100, entryDate: '2026-01-02' }],
      }),
      names,
    )!
    expect(r.swapWatch.weakest).toBeNull()
    expect(r.swapWatch.thresholdFactor).toBeNull()
    expect(r.swapWatch.challengers).toEqual([])
    expect(r.swapWatch.earliestSwapDate).toBeNull()
  })
})

describe('verdict：明天要幹嘛', () => {
  it('還沒上線 → not-started，不用動作', () => {
    const r = buildOperatorReport(history(30), [], plan({ startDate: '2099-01-01' }), names)!
    expect(r.verdict.kind).toBe('not-started')
    expect(r.verdict.act).toBe(false)
  })

  it('已上線但空手 → entry', () => {
    const r = buildOperatorReport(history(30), [], plan(), names)!
    expect(r.verdict.kind).toBe('entry')
    expect(r.verdict.act).toBe(true)
    expect(r.verdict.headline).toContain('買進 1111')
  })

  it('持股就是目標、非換股日 → hold 且不用動作', () => {
    const r = buildOperatorReport(
      history(10),
      [],
      plan({
        strategy: { rebalance: 'M', rebalanceDay: 25, topN: 1 },
        holdings: [{ code: '1111', shares: 1000, entryPrice: 100, entryDate: '2026-01-02' }],
      }),
      names,
    )!
    expect(r.verdict.kind).toBe('hold')
    expect(r.verdict.act).toBe(false)
    expect(r.verdict.detail).toContain(r.nextRebalanceDate)
  })

  it('停損觸發 → stop 最優先', () => {
    const r = buildOperatorReport(
      history(30),
      [],
      plan({
        strategy: { rebalance: 'M', rebalanceDay: 25, topN: 1, stopType: 'fixed', stopPct: 10 },
        holdings: [{ code: '3333', shares: 1000, entryPrice: 100, entryDate: '2026-01-01' }],
      }),
      names,
    )!
    expect(r.stopActionsNow).toHaveLength(1)
    expect(r.verdict.kind).toBe('stop')
    expect(r.verdict.headline).toContain('停損')
  })
})

describe('報價覆寫與暫定資料', () => {
  it('priceOf 蓋掉收盤價、影響損益與市值', () => {
    const r = buildOperatorReport(
      history(30),
      [],
      plan({
        holdings: [{ code: '2222', shares: 1000, entryPrice: 100, entryDate: '2026-01-02' }],
      }),
      names,
      { priceOf: (c) => (c === '2222' ? 150 : null) },
    )!
    const h = r.holdings[0]!
    expect(h.price).toBe(150)
    expect(h.plPct).toBeCloseTo(0.5, 6)
    expect(h.value).toBe(150_000)
  })

  it('provisionalDate 原樣帶出來供標示', () => {
    const r = buildOperatorReport(history(30), [], plan(), names, {
      provisionalDate: '2026-01-30',
    })!
    expect(r.provisionalDate).toBe('2026-01-30')
  })
})
