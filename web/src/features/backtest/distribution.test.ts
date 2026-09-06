import { describe, expect, it } from 'vitest'

import type { HistoryRow } from '../../lib/history'
import { distributionOutcomes } from './distribution'
import type { BacktestConfig } from './engine'

// ~10 個月的日期（每個工作日一列），兩檔：A 緩漲、B 緩跌，動能 A > B
function history(months: number): HistoryRow[] {
  const rows: HistoryRow[] = []
  const d = new Date(Date.UTC(2024, 0, 1))
  let i = 0
  while (rows.length < months * 21) {
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) {
      rows.push({
        schemaVersion: 1,
        date: d.toISOString().slice(0, 10),
        stocks: [
          { code: '1111', close: 100 * 1.002 ** i, adjClose: 100 * 1.002 ** i, mcap: 900, pe: 10, pb: 1, dy: 1, mom20: 5, mom60: 5, mom121: 5 }, // prettier-ignore
          { code: '2222', close: 100 * 0.999 ** i, adjClose: 100 * 0.999 ** i, mcap: 800, pe: 10, pb: 1, dy: 1, mom20: -5, mom60: -5, mom121: -5 }, // prettier-ignore
        ],
      })
      i++
    }
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return rows
}

const base: BacktestConfig = {
  factor: 'm20',
  topN: 1,
  rebalance: 'M',
  weighting: 'equal',
  costBps: 0,
}

describe('distributionOutcomes', () => {
  const h = history(10)

  it('follow：只用設定的換股日，一組視窗', () => {
    const a = distributionOutcomes(h, { ...base, rebalanceDay: 1 }, [], 3, 'follow')
    const b = distributionOutcomes(h, { ...base, rebalanceDay: 12 }, [], 3, 'follow')
    expect(a.length).toBeGreaterThan(10)
    // 換股日不同 → follow 模式結果會不一樣
    expect(a.map((o) => o.ret)).not.toEqual(b.map((o) => o.ret))
  })

  it('all：掃過所有換股日 → 結果不受 rebalanceDay 影響', () => {
    const a = distributionOutcomes(h, { ...base, rebalanceDay: 1 }, [], 3, 'all')
    const b = distributionOutcomes(h, { ...base, rebalanceDay: 15 }, [], 3, 'all')
    expect(a.length).toBe(b.length)
    expect(a.map((o) => o.ret)).toEqual(b.map((o) => o.ret))
    const one = distributionOutcomes(h, { ...base, rebalanceDay: 1 }, [], 3, 'follow')
    expect(a.length).toBeGreaterThan(one.length * 10)
  })

  it('aligned：只從換股日進場、掃過所有換股日 → 不受 rebalanceDay 影響、樣本比 all 少', () => {
    const a = distributionOutcomes(h, { ...base, rebalanceDay: 1 }, [], 3, 'aligned')
    const b = distributionOutcomes(h, { ...base, rebalanceDay: 20 }, [], 3, 'aligned')
    expect(a.map((o) => o.ret)).toEqual(b.map((o) => o.ret))
    const all = distributionOutcomes(h, { ...base, rebalanceDay: 1 }, [], 3, 'all')
    expect(a.length).toBeLessThan(all.length)
    expect(a.length).toBeGreaterThan(0)
  })

  it('資料不足回空', () => {
    expect(distributionOutcomes([], base, [], 6, 'aligned')).toEqual([])
  })
})
