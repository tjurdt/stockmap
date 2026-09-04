import { describe, expect, it } from 'vitest'

import type { HistoryRow } from '../../lib/history'
import { runBacktest } from './engine'

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
