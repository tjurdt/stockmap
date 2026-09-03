import { describe, expect, it } from 'vitest'

import type { HistoryRow } from '../../lib/history'
import { runBacktest } from './engine'

function row(date: string, stocks: { code: string; adj: number; f: number }[]): HistoryRow {
  return {
    schemaVersion: 1,
    date,
    stocks: stocks.map((s) => ({
      code: s.code,
      close: s.adj,
      adjClose: s.adj,
      mcap: 100,
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
    })
    expect(r.dates).toHaveLength(21)
    expect(r.equity.at(-1)!).toBeCloseTo(1.01 ** 20, 2) // 全押 A
    expect(r.metrics.totalReturn).toBeGreaterThan(r.metrics.benchmarkReturn)
    expect(r.metrics.maxDrawdown).toBe(0) // 只漲不跌
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
})
