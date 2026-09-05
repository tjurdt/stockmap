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
    // A 每天漲 1%，B 持平。跨兩個月。rebalanceDay=1 →月初就進場；=15 →月中才進場。
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
    // 第一次換股日：day1 是 1/1，day15 是第一個 day-of-month >= 15 的交易日
    expect(day1.holdings[0]!.signalDate).toBe('2026-01-01')
    expect(day15.holdings[0]!.signalDate.slice(0, 7)).toBe('2026-01')
    expect(Number(day15.holdings[0]!.signalDate.slice(8, 10))).toBeGreaterThanOrEqual(15)
    // 晚進場 → 少賺
    expect(day15.metrics.totalReturn).toBeLessThan(day1.metrics.totalReturn)
  })

  it('rebalanceDay 預設 1 時與舊「當期第一個交易日」行為一致', () => {
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
  // 2026-01：01(四)…；2026-02：…。用整個一月＋二月初的日曆日（含週末）當交易日近似。
  const jan = Array.from({ length: 45 }, (_, i) =>
    new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
  )

  it('每月：取第一個 day-of-month >= N 的日期', () => {
    const s = rebalanceDates(jan, 'M', 10)
    expect(s.has('2026-01-10')).toBe(true)
    expect(s.has('2026-01-01')).toBe(false)
    expect(s.has('2026-02-10')).toBe(true)
    expect(s.size).toBe(2)
  })

  it('每月 N=1 → 每期第一個交易日', () => {
    const s = rebalanceDates(['2026-01-05', '2026-01-06', '2026-02-02'], 'M', 1)
    expect([...s].sort()).toEqual(['2026-01-05', '2026-02-02'])
  })

  it('該期無交易日達門檻 → 取該期最後一個交易日', () => {
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

  it('當期尚未達門檻 → false（不回填最後一天）', () => {
    expect(isRebalanceDay(['2026-01-05', '2026-01-06'], '2026-01-06', 'M', 20)).toBe(false)
  })
})

describe('nextRebalanceDate', () => {
  it('每月：回傳下一個到達 N 號的日期（遇週末順延）', () => {
    expect(nextRebalanceDate('2026-01-03', 'M', 10)).toBe('2026-01-12') // 1/10 是週六 → 1/12(一)
    expect(nextRebalanceDate('2026-01-20', 'M', 10)).toBe('2026-02-10')
  })

  it('每週：回傳下一個指定星期（W=1 → 下週一）', () => {
    expect(nextRebalanceDate('2026-01-07', 'W', 1)).toBe('2026-01-12') // 週三 → 下週一
  })
})
