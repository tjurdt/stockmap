import { describe, expect, it } from 'vitest'

import type { BaselineRow } from '../../lib/baselines'
import type { HistoryRow } from '../../lib/history'
import {
  isRebalanceDay,
  nextRebalanceDate,
  rebalanceDates,
  regimeByDate,
  runBacktest,
} from './engine'

function row(
  date: string,
  stocks: { code: string; adj: number; f: number; mcap?: number }[],
): HistoryRow {
  return {
    schemaVersion: 1,
    date,
    stocks: stocks.map((s) => ({
      code: s.code,
      close: s.adj,
      adjClose: s.adj,
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

// A 每天漲 1%、B 持平；A 的動能永遠比較高
function history(days: number): HistoryRow[] {
  return Array.from({ length: days }, (_, i) =>
    row(`2026-01-${String(i + 1).padStart(2, '0')}`, [
      { code: '1111', adj: 100 * 1.01 ** i, f: 50 },
      { code: '2222', adj: 100, f: -50 },
    ]),
  )
}

describe('runBacktest', () => {
  it('picks the high-momentum stock and beats the equal-weight benchmark', () => {
    const r = runBacktest(history(21), {
      factor: 'm20',
      topN: 1,
      rebalance: 'M',
      weighting: 'equal',
      costBps: 0,
      execLagDays: 0,
    })
    expect(r.dates).toHaveLength(21)
    expect(r.equity.at(-1)!).toBeCloseTo(1.01 ** 20, 2) // 全押 A（訊號日即成交）
    expect(r.metrics.totalReturn).toBeGreaterThan(r.metrics.benchmarkReturn)
    expect(r.metrics.maxDrawdown).toBe(0) // 只漲不跌
  })

  it('execLagDays delays the switch and costs a bit of return vs lag 0', () => {
    const base = {
      factor: 'm20' as const,
      topN: 1,
      rebalance: 'M' as const,
      weighting: 'equal' as const,
      costBps: 0,
    }
    const lag0 = runBacktest(history(21), { ...base, execLagDays: 0 }).metrics.totalReturn
    const lag1 = runBacktest(history(21), { ...base, execLagDays: 1 }).metrics.totalReturn
    // A 每天漲 → 晚一天進場少賺一天
    expect(lag1).toBeLessThan(lag0)
    expect(lag1).toBeGreaterThan(0)
  })

  it('transaction cost drags on returns', () => {
    const cfg = {
      factor: 'm20' as const,
      topN: 1,
      rebalance: 'W' as const,
      weighting: 'equal' as const,
      costBps: 0,
    }
    const free = runBacktest(history(21), cfg).metrics.totalReturn
    const costly = runBacktest(history(21), { ...cfg, costBps: 100 }).metrics.totalReturn
    expect(costly).toBeLessThan(free)
  })

  it('respects betterWhen=low for value factors (picks the cheap one)', () => {
    // A pe 低（=便宜，pe 因子下比較好）但股價持平；B pe 高但股價上漲。
    // 選 pe 最低 topN=1 → 應該持有 A → 落後於「兩檔等權」基準。
    const h = Array.from({ length: 15 }, (_, i) =>
      row(`2026-02-${String(i + 1).padStart(2, '0')}`, [
        { code: '1111', adj: 100, f: 0 },
        { code: '2222', adj: 100 * 1.01 ** i, f: 0 },
      ]),
    ).map((r) => ({
      ...r,
      stocks: [
        { ...r.stocks[0]!, pe: 5 },
        { ...r.stocks[1]!, pe: 20 },
      ],
    }))
    const r = runBacktest(h, {
      factor: 'pe',
      topN: 1,
      rebalance: 'M',
      weighting: 'equal',
      costBps: 0,
    })
    expect(r.holdings.at(-1)!.codes).toEqual(['1111']) // 選了低 pe 的 A
    expect(r.equity.at(-1)!).toBeCloseTo(1, 5) // A 持平
    expect(r.metrics.totalReturn).toBeLessThan(r.metrics.benchmarkReturn)
  })

  it('fixed stop-loss exits a crashing position and caps the loss', () => {
    // 只有一檔 A：前 5 天持平，第 6 天 -12%，之後續跌。stop 10% → 第 6 天出場後不再受傷。
    const days = 20
    const h = Array.from({ length: days }, (_, i) => {
      const adj = i < 5 ? 100 : i === 5 ? 88 : 88 - (i - 5) * 5
      return row(`2026-04-${String(i + 1).padStart(2, '0')}`, [{ code: '1111', adj, f: 1 }])
    })
    const noStop = runBacktest(h, {
      factor: 'm20',
      topN: 1,
      rebalance: 'M',
      weighting: 'equal',
      costBps: 0,
      execLagDays: 0,
    })
    const withStop = runBacktest(h, {
      factor: 'm20',
      topN: 1,
      rebalance: 'M',
      weighting: 'equal',
      costBps: 0,
      execLagDays: 0,
      stopType: 'fixed',
      stopPct: 10,
    })
    expect(withStop.metrics.stops).toBe(1)
    expect(withStop.metrics.totalReturn).toBeGreaterThan(noStop.metrics.totalReturn)
    expect(withStop.metrics.totalReturn).toBeCloseTo(-0.12, 2) // 停在 -12%，之後持有現金
  })

  it('daily stop-loss exits on a single-day plunge', () => {
    // A 前 4 天持平，第 5 天單日 -12%，之後續跌。daily stop 8% → 第 5 天出場。
    const seq = [100, 100, 100, 100, 88, 80, 72, 65, 60, 55]
    const h = seq.map((adj, i) =>
      row(`2026-07-${String(i + 1).padStart(2, '0')}`, [{ code: '1111', adj, f: 1 }]),
    )
    const base = {
      factor: 'm20' as const,
      topN: 1,
      rebalance: 'M' as const,
      weighting: 'equal' as const,
      costBps: 0,
      execLagDays: 0,
    }
    const r = runBacktest(h, { ...base, stopType: 'daily', stopPct: 8 })
    expect(r.metrics.stops).toBe(1)
    // 停在第 5 天收盤 88 → -12%，之後抱現金
    expect(r.metrics.totalReturn).toBeCloseTo(-0.12, 2)
    // 沒停損 → 一路跌到 55
    const noStop = runBacktest(h, base)
    expect(noStop.metrics.totalReturn).toBeCloseTo(-0.45, 2)
  })

  it('ma stop-loss exits when close drops below its own moving average', () => {
    // A 漲到 120 後崩跌；跌破 5 日均線就出場。
    const seq = [100, 104, 108, 112, 116, 120, 118, 108, 96, 84, 72]
    const h = seq.map((adj, i) =>
      row(`2026-08-${String(i + 1).padStart(2, '0')}`, [{ code: '1111', adj, f: 1 }]),
    )
    const r = runBacktest(h, {
      factor: 'm20',
      topN: 1,
      rebalance: 'M',
      weighting: 'equal',
      costBps: 0,
      execLagDays: 0,
      stopType: 'ma',
      stopMaDays: 5,
    })
    expect(r.metrics.stops).toBe(1)
    // 跌破均線那天出場 → 損失有限，遠優於抱到 72
    expect(r.metrics.totalReturn).toBeGreaterThan(-0.2)
    const noStop = runBacktest(h, {
      factor: 'm20',
      topN: 1,
      rebalance: 'M',
      weighting: 'equal',
      costBps: 0,
      execLagDays: 0,
    })
    expect(r.metrics.totalReturn).toBeGreaterThan(noStop.metrics.totalReturn)
  })

  it('stopExecNext delays the exit by one trading day', () => {
    const seq = [100, 100, 100, 100, 100, 80, 76, 72, 70, 68]
    const h = seq.map((adj, i) =>
      row(`2026-09-${String(i + 1).padStart(2, '0')}`, [{ code: '1111', adj, f: 1 }]),
    )
    const base = {
      factor: 'm20' as const,
      topN: 1,
      rebalance: 'M' as const,
      weighting: 'equal' as const,
      costBps: 0,
      execLagDays: 0,
      stopType: 'fixed' as const,
      stopPct: 10,
    }
    const sameDay = runBacktest(h, base)
    const nextDay = runBacktest(h, { ...base, stopExecNext: true })
    expect(sameDay.metrics.stops).toBe(1)
    expect(nextDay.metrics.stops).toBe(1)
    // 觸發日收盤 80、隔天收盤 76 → 晚一天出場、少賺（多虧）
    expect(sameDay.metrics.totalReturn).toBeCloseTo(-0.2, 2)
    expect(nextDay.metrics.totalReturn).toBeCloseTo(-0.24, 2)
  })

  it('trailing stop-loss triggers on drawdown from peak', () => {
    // A 漲到 120 再回落到 105（自高點 -12.5%）。trailing 10% → 出場。
    const seq = [100, 105, 110, 115, 120, 118, 112, 105, 100, 95]
    const h = seq.map((adj, i) =>
      row(`2026-05-${String(i + 1).padStart(2, '0')}`, [{ code: '1111', adj, f: 1 }]),
    )
    const r = runBacktest(h, {
      factor: 'm20',
      topN: 1,
      rebalance: 'M',
      weighting: 'equal',
      costBps: 0,
      execLagDays: 0,
      stopType: 'trailing',
      stopPct: 10,
    })
    expect(r.metrics.stops).toBe(1)
    // 120 * 0.9 = 108 → 第一個 <= 108 是 105（index 7）→ 停在 105/100 - 1 = +5%
    expect(r.metrics.totalReturn).toBeCloseTo(0.05, 2)
  })

  it('regimeByDate: 均線之上 = bull、之下 = bear', () => {
    // 指數前 5 天 100，第 6 天跌到 80 → 6 日均線 ~96.7，80 < 96.7 → bear
    const bl: BaselineRow[] = [100, 100, 100, 100, 100, 80].map((v, i) => ({
      date: `2026-06-0${i + 1}`,
      twiiTR: v,
    }))
    const dates = bl.map((b) => b.date)
    const m = regimeByDate(dates, bl, 'ma', 5)
    expect(m.get('2026-06-05')).toBe('bull')
    expect(m.get('2026-06-06')).toBe('bear')
  })

  it('regime 過濾：空頭再平衡日改持有現金', () => {
    // 指數持續下跌 → 一直空頭。A 每天漲但策略在空頭被要求空手 → 報酬接近 0。
    const days = 25
    const h = history(days)
    const bl: BaselineRow[] = Array.from({ length: days }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      twiiTR: 100 - i, // 一路跌
    }))
    const cfg = {
      factor: 'm20' as const,
      topN: 1,
      rebalance: 'W' as const,
      weighting: 'equal' as const,
      costBps: 0,
      execLagDays: 0,
    }
    const on = runBacktest(h, { ...cfg, regime: 'ma', regimeDays: 5 }, bl)
    const off = runBacktest(h, cfg, bl)
    // 空頭時空手 → 少賺，且大部分時間標記為空頭
    expect(on.metrics.totalReturn).toBeLessThan(off.metrics.totalReturn * 0.7)
    expect(off.metrics.totalReturn).toBeGreaterThan(0.1)
    expect(on.metrics.bearShare).toBeGreaterThan(0.5)
    expect(on.regime.filter((r) => r === 'bear').length).toBeGreaterThan(10)
  })

  it('regimeExit immediate：轉空當天清空，rebalance 模式撐到換股日', () => {
    // 25 天，A 每天漲 2%。指數前 3 天多頭、之後一路空頭。每週再平衡。
    const days = 25
    const h = Array.from({ length: days }, (_, i) =>
      row(`2026-02-${String(i + 1).padStart(2, '0')}`, [
        { code: '1111', adj: 100 * 1.02 ** i, f: 9 },
      ]),
    )
    const bl: BaselineRow[] = Array.from({ length: days }, (_, i) => ({
      date: `2026-02-${String(i + 1).padStart(2, '0')}`,
      twiiTR: i < 4 ? 100 : 100 - i * 3, // 第 4 天起跌破 3 日均線
    }))
    const base = {
      factor: 'm20' as const,
      topN: 1,
      rebalance: 'W' as const,
      weighting: 'equal' as const,
      costBps: 0,
      execLagDays: 0,
      regime: 'ma' as const,
      regimeDays: 3,
    }
    const immediate = runBacktest(h, { ...base, regimeExit: 'immediate' }, bl)
    const onRebal = runBacktest(h, { ...base, regimeExit: 'rebalance' }, bl)
    // immediate 在 A 還在漲的時候就出場 → 賺得比「撐到週末換股日」少
    expect(immediate.metrics.totalReturn).toBeLessThan(onRebal.metrics.totalReturn)
    expect(immediate.metrics.totalReturn).toBeGreaterThanOrEqual(0)
  })

  it('bearHolding inverse：空頭時買 00632R，指數跌 → 策略淨值上升', () => {
    const days = 25
    const h = history(days) // A 每天漲 1%
    const bl = Array.from({ length: days }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      twiiTR: 100 - i, // 一路跌 → 一直空頭
      e00632r: 100 + i * 1.5, // 反 1 一路漲
    }))
    const cfg = {
      factor: 'm20' as const,
      topN: 1,
      rebalance: 'W' as const,
      weighting: 'equal' as const,
      costBps: 0,
      execLagDays: 0,
      regime: 'ma' as const,
      regimeDays: 5,
    }
    const cash = runBacktest(h, { ...cfg, bearHolding: 'cash' }, bl)
    const inv = runBacktest(h, { ...cfg, bearHolding: 'inverse' }, bl)
    expect(cash.metrics.inverseShare).toBe(0)
    expect(inv.metrics.inverseShare).toBeGreaterThan(0.3)
    expect(inv.metrics.totalReturn).toBeGreaterThan(cash.metrics.totalReturn)
  })

  describe('動能換股（swapOnBetter）', () => {
    // 25 天全在 1 月（只有 1/1 是排程換股日）。A 價格持平，B 每天漲 2%。
    // 前 7 天 A 動能高 → 買 A；第 8 天起 B 動能反超。
    const build = (bMom: number) =>
      Array.from({ length: 25 }, (_, i) =>
        row(`2026-01-${String(i + 1).padStart(2, '0')}`, [
          { code: '1111', adj: 100, f: i < 7 ? 50 : 20 },
          { code: '2222', adj: 100 * 1.02 ** i, f: i < 7 ? 10 : bMom },
        ]),
      )
    const base = {
      factor: 'm20' as const,
      topN: 1,
      rebalance: 'M' as const,
      rebalanceDay: 1,
      weighting: 'equal' as const,
      costBps: 0,
      execLagDays: 0,
    }

    it('挑戰者動能明顯反超 + 已過最短持有 → 期間內換股', () => {
      const off = runBacktest(build(100), base)
      const on = runBacktest(build(100), {
        ...base,
        swapOnBetter: true,
        swapMargin: 15,
        swapMinHoldDays: 5,
      })
      expect(off.holdings.at(-1)!.codes).toEqual(['1111']) // 沒開 → 抱 A 到底
      expect(off.metrics.totalReturn).toBeCloseTo(0, 2)
      expect(on.holdings.at(-1)!.codes).toEqual(['2222']) // 開了 → 換到 B
      expect(on.metrics.totalReturn).toBeGreaterThan(0.1) // 吃到 B 後段漲幅
      expect(on.metrics.rebalances).toBeGreaterThan(off.metrics.rebalances)
    })

    it('門檻擋掉小幅反超', () => {
      // B 動能只比 A（20）高一點點（21）→ 15% 門檻擋掉，0% 放行
      const strict = runBacktest(build(21), {
        ...base,
        swapOnBetter: true,
        swapMargin: 15,
        swapMinHoldDays: 5,
      })
      const loose = runBacktest(build(21), {
        ...base,
        swapOnBetter: true,
        swapMargin: 0,
        swapMinHoldDays: 5,
      })
      expect(strict.holdings.at(-1)!.codes).toEqual(['1111'])
      expect(loose.holdings.at(-1)!.codes).toEqual(['2222'])
    })

    it('最短持有天數未到 → 不換', () => {
      const held = runBacktest(build(100), {
        ...base,
        swapOnBetter: true,
        swapMargin: 15,
        swapMinHoldDays: 100,
      })
      expect(held.holdings.at(-1)!.codes).toEqual(['1111'])
    })
  })

  it('returns empty-ish result when history too short', () => {
    const r = runBacktest(history(1), {
      factor: 'm20',
      topN: 1,
      rebalance: 'M',
      weighting: 'equal',
      costBps: 0,
    })
    expect(r.dates).toHaveLength(1)
    expect(r.metrics.rebalances).toBeGreaterThanOrEqual(0)
  })

  it('rebalanceDay: 每月第 N 個交易日才換股，回測結果隨之改變', () => {
    // A 每天漲 1%，B 持平。連續 45 天當交易日。N=1 →月初就進場；N=15 →第 15 個交易日才進場。
    const h = Array.from({ length: 45 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 1 + i))
      return row(d.toISOString().slice(0, 10), [
        { code: '1111', adj: 100 * 1.01 ** i, f: 50 },
        { code: '2222', adj: 100, f: -50 },
      ])
    })
    const base = {
      factor: 'm20' as const,
      topN: 1,
      rebalance: 'M' as const,
      weighting: 'equal' as const,
      costBps: 0,
      execLagDays: 0,
    }
    const day1 = runBacktest(h, { ...base, rebalanceDay: 1 })
    const day15 = runBacktest(h, { ...base, rebalanceDay: 15 })
    // 所有日子都是「交易日」→ 第 N 個交易日 = 該月第 N 天
    expect(day1.holdings[0]!.signalDate).toBe('2026-01-01')
    expect(day15.holdings[0]!.signalDate).toBe('2026-01-15')
    // 晚進場 → 少賺
    expect(day15.metrics.totalReturn).toBeLessThan(day1.metrics.totalReturn)
  })

  it('rebalanceDay 預設 1 時 = 每期第一個交易日', () => {
    const h = history(28)
    const cfg = {
      factor: 'm20' as const,
      topN: 1,
      rebalance: 'M' as const,
      weighting: 'equal' as const,
      costBps: 0,
    }
    const withDefault = runBacktest(h, cfg)
    const explicit1 = runBacktest(h, { ...cfg, rebalanceDay: 1 })
    expect(withDefault.equity.at(-1)).toBe(explicit1.equity.at(-1))
    expect(withDefault.holdings[0]!.signalDate).toBe(h[0]!.date)
  })

  it('poolTopN filters to the biggest stocks before ranking by factor', () => {
    // C 動能最強但市值小；A/B 市值大。poolTopN=2 → C 不在池內，不會被選。
    const h = Array.from({ length: 15 }, (_, i) =>
      row(`2026-03-${String(i + 1).padStart(2, '0')}`, [
        { code: '1111', adj: 100 * 1.005 ** i, f: 10, mcap: 900 },
        { code: '2222', adj: 100 * 1.003 ** i, f: 5, mcap: 800 },
        { code: '3333', adj: 100 * 1.02 ** i, f: 99, mcap: 50 },
      ]),
    )
    const picked = runBacktest(h, {
      poolTopN: 2,
      factor: 'm20',
      topN: 1,
      rebalance: 'M',
      weighting: 'equal',
      costBps: 0,
    })
    expect(picked.holdings.at(-1)!.codes).toEqual(['1111']) // 池內動能最強是 A，不是 C

    const noPool = runBacktest(h, {
      factor: 'm20',
      topN: 1,
      rebalance: 'M',
      weighting: 'equal',
      costBps: 0,
    })
    expect(noPool.holdings.at(-1)!.codes).toEqual(['3333']) // 沒池限制 → 選動能最強的 C
  })
})

describe('rebalanceDates', () => {
  // 只放交易日（週一～五），跨 1、2 月。
  const days = Array.from({ length: 45 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)))
    .map((d) => d.toISOString().slice(0, 10))
    .filter((s) => {
      const wd = new Date(`${s}T00:00:00Z`).getUTCDay()
      return wd !== 0 && wd !== 6
    })

  it('每月：取該月第 N 個交易日', () => {
    const s = rebalanceDates(days, 'M', 3)
    // 2026-01 交易日：1(四),2(五),5,... → 第 3 個是 1/5
    expect(s.has('2026-01-05')).toBe(true)
    expect(s.has('2026-01-01')).toBe(false)
    // 2026-02 交易日：2(一),3,4,... → 第 3 個是 2/4
    expect(s.has('2026-02-04')).toBe(true)
    expect(s.size).toBe(2)
  })

  it('每月 N=1 → 每期第一個交易日', () => {
    const s = rebalanceDates(['2026-01-05', '2026-01-06', '2026-02-02'], 'M', 1)
    expect([...s].sort()).toEqual(['2026-01-05', '2026-02-02'])
  })

  it('該月交易日不足 N 個 → 取最後一個', () => {
    const s = rebalanceDates(['2026-01-05', '2026-01-06', '2026-01-07'], 'M', 20)
    expect([...s]).toEqual(['2026-01-07'])
  })

  it('每週：取該週第一個星期 >= W 的日期（W=3 → 週三）', () => {
    // 2026-01-05 是週一
    const wk = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09']
    const s = rebalanceDates(wk, 'W', 3)
    expect([...s]).toEqual(['2026-01-07'])
  })
})

describe('isRebalanceDay', () => {
  const wk = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09']

  it('每期第一個達門檻的交易日 → true，其餘 → false', () => {
    expect(isRebalanceDay(wk, '2026-01-07', 'W', 3)).toBe(true)
    expect(isRebalanceDay(wk, '2026-01-08', 'W', 3)).toBe(false)
    expect(isRebalanceDay(wk, '2026-01-06', 'W', 3)).toBe(false)
  })

  it('每月：只有當月第 N 個交易日為 true', () => {
    const jan = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08']
    expect(isRebalanceDay(jan, '2026-01-07', 'M', 3)).toBe(true)
    expect(isRebalanceDay(jan, '2026-01-08', 'M', 3)).toBe(false)
  })

  it('當月交易日還不足 N 個 → false（不回填最後一天）', () => {
    expect(isRebalanceDay(['2026-01-05', '2026-01-06'], '2026-01-06', 'M', 20)).toBe(false)
  })
})

describe('nextRebalanceDate', () => {
  it('每月：無日曆時＝第 N 個平日', () => {
    // 2026-01 平日：1,2,5,6,7,8,9,12,13,14 → 第 10 個 = 1/14
    expect(nextRebalanceDate('2026-01-03', 'M', 10)).toBe('2026-01-14')
    // 已過本月第 10 個 → 下個月：2026-02 平日第 10 個 = 2/13
    expect(nextRebalanceDate('2026-01-20', 'M', 10)).toBe('2026-02-13')
  })

  it('每月：帶台股日曆 → 跳過假日的第 N 個交易日', () => {
    const H = new Set(['2026-02-12', '2026-02-13', '2026-02-16', '2026-02-17', '2026-02-18'])
    // 2026-02 交易日：2,3,4,5,6,9,10,11,19,20,... → 第 9 個 = 2/19（跳過 2/12,13,16,17,18）
    expect(nextRebalanceDate('2026-01-31', 'M', 9, H)).toBe('2026-02-19')
  })

  it('每週：回傳下一個指定星期（W=1 → 下週一）', () => {
    expect(nextRebalanceDate('2026-01-07', 'W', 1)).toBe('2026-01-12') // 週三 → 下週一
  })
})
