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
