import { describe, expect, it } from 'vitest'

import {
  dailyWindowOutcomes,
  rollingWindowReturns,
  summarizeOutcomes,
  summarizeRolling,
} from './rolling'

// 造 4 個月、每月 2 個交易日的日期序列
const dates = [
  '2026-01-05',
  '2026-01-20',
  '2026-02-05',
  '2026-02-20',
  '2026-03-05',
  '2026-03-20',
  '2026-04-05',
  '2026-04-20',
]

describe('rollingWindowReturns', () => {
  it('2 個月視窗：從 equity 切片算報酬', () => {
    // equity 每個 index +10%
    const eq = [1, 1.1, 1.21, 1.331, 1.4641, 1.61051, 1.771561, 1.9487171]
    const bench = eq.map(() => 1)
    const rows = rollingWindowReturns(dates, eq, bench, 2)
    // 視窗：Jan→(不含 Mar)= idx0..idx3；Feb→idx2..idx5；Mar→idx4..idx7
    expect(rows.map((r) => r.start)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(rows[0]!.ret).toBeCloseTo(1.331 / 1 - 1, 6)
    expect(rows[0]!.end).toBe('2026-02')
    expect(rows[0]!.benchRet).toBe(0)
  })

  it('視窗超出資料範圍就停止', () => {
    const eq = dates.map((_, i) => 1 + i * 0.01)
    const rows = rollingWindowReturns(dates, eq, eq, 3)
    // 只有 Jan、Feb 的 3 個月視窗完整（Mar+3 = Jun 無資料）
    expect(rows.map((r) => r.start)).toEqual(['2026-01', '2026-02'])
  })

  it('資料不足回空', () => {
    expect(rollingWindowReturns(['2026-01-05'], [1], [1], 2)).toEqual([])
  })
})

describe('summarizeRolling', () => {
  it('統計正報酬比例 / 中位數 / 贏基準比例', () => {
    const rows = [
      { start: 'a', end: 'a', ret: 0.1, benchRet: 0.05 },
      { start: 'b', end: 'b', ret: -0.2, benchRet: -0.1 },
      { start: 'c', end: 'c', ret: 0.3, benchRet: 0.4 },
      { start: 'd', end: 'd', ret: 0.05, benchRet: 0.0 },
    ]
    const s = summarizeRolling(rows)
    expect(s.n).toBe(4)
    expect(s.positivePct).toBe(0.75)
    expect(s.best).toBeCloseTo(0.3)
    expect(s.worst).toBeCloseTo(-0.2)
    expect(s.beatBenchPct).toBe(0.5) // a、d 贏基準
    expect(s.median).toBeCloseTo((0.05 + 0.1) / 2)
  })

  it('空輸入不炸', () => {
    expect(summarizeRolling([]).n).toBe(0)
  })
})

describe('dailyWindowOutcomes', () => {
  // 每月 1 個交易日、共 8 個月
  const d = [
    '2024-01-15',
    '2024-02-15',
    '2024-03-15',
    '2024-04-15',
    '2024-05-15',
    '2024-06-15',
    '2024-07-15',
    '2024-08-15',
  ]

  it('每個起點都出一列，直到湊不滿視窗', () => {
    const eq = d.map((_, i) => 1 + i * 0.1)
    const rows = dailyWindowOutcomes(d, eq, eq, 3)
    // 起點 01..05 的 +3 月 (04..08) 都還在資料內；06 起點的 cutoff = 09-15 > 08-15 → 停
    expect(rows.map((r) => r.start)).toEqual([
      '2024-01-15',
      '2024-02-15',
      '2024-03-15',
      '2024-04-15',
      '2024-05-15',
    ])
    expect(rows[0]!.end).toBe('2024-04-15')
    expect(rows[0]!.ret).toBeCloseTo((1 + 0.3) / 1 - 1, 6)
  })

  it('對照序列缺值 → 該視窗 refRets 為 null', () => {
    const eq = d.map(() => 1)
    const ref = d.map((_, i) => (i < 3 ? null : 2))
    const rows = dailyWindowOutcomes(d, eq, eq, 2, { 大盤: ref })
    expect(rows[0]!.refRets['大盤']).toBeNull() // 起點缺值
    expect(rows.at(-1)!.refRets['大盤']).toBe(0) // 兩端都 = 2
  })

  it('資料不足回空', () => {
    expect(dailyWindowOutcomes(['2024-01-01'], [1], [1], 6)).toEqual([])
  })
})

describe('summarizeOutcomes', () => {
  it('中位數 / 期望值 / 正報酬比例 / 對照超額', () => {
    const rows = [
      { start: 'a', end: 'a', ret: 0.1, benchRet: 0.0, refRets: { 大盤: 0.05 } },
      { start: 'b', end: 'b', ret: -0.1, benchRet: -0.2, refRets: { 大盤: 0.0 } },
      { start: 'c', end: 'c', ret: 0.3, benchRet: 0.1, refRets: { 大盤: null } },
    ]
    const s = summarizeOutcomes(rows)
    expect(s.n).toBe(3)
    expect(s.median).toBeCloseTo(0.1)
    expect(s.mean).toBeCloseTo(0.1)
    expect(s.positivePct).toBeCloseTo(2 / 3)
    // 大盤配對只有 a、b：策略中位數 0（(0.1 + -0.1)/2）− 大盤中位數 0.025
    expect(s.medianExcess['大盤']).toBeCloseTo(0 - 0.025)
  })

  it('空輸入不炸', () => {
    expect(summarizeOutcomes([]).n).toBe(0)
  })
})
