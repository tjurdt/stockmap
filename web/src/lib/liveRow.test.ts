import { describe, expect, it } from 'vitest'

import type { HistoryRow } from './history'
import type { LiveQuote } from './live'
import { withProvisionalRow } from './liveRow'

const stock = (code: string, close: number) => ({
  code,
  close,
  adjClose: close,
  mcap: close * 100,
  pe: 20,
  pb: 5,
  dy: 2,
  mom20: 1,
  mom60: 2,
  mom121: 3,
})

/** 產生 n 個交易日、價格固定的歷史。 */
const history = (n: number, close = 100): HistoryRow[] =>
  Array.from({ length: n }, (_, i) => ({
    schemaVersion: 1 as const,
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    stocks: [stock('2330', close), stock('2317', close)],
  }))

const quote = (code: string, price: number | null, time: string): LiveQuote => ({
  code,
  price,
  prevClose: 100,
  time,
  date: null,
})

// 2026-09-10T05:00:00Z = 13:00 台北 2026-09-10
const TODAY = '2026-09-10T05:00:00Z'

describe('withProvisionalRow', () => {
  it('報價比歷史新 → 補一列暫定當日資料', () => {
    const rows = history(5)
    const r = withProvisionalRow(rows, new Map([['2330', quote('2330', 110, TODAY)]]))
    expect(r.provisionalDate).toBe('2026-09-10')
    expect(r.officialDate).toBe('2026-09-05')
    expect(r.quoted).toBe(1)
    expect(r.rows).toHaveLength(6)
    const added = r.rows.at(-1)!
    const a = added.stocks.find((s) => s.code === '2330')!
    expect(a.close).toBe(110)
    expect(a.adjClose).toBeCloseTo(110)
    expect(a.mcap).toBeCloseTo(100 * 100 * 1.1)
    expect(a.pe).toBeCloseTo(22)
    expect(a.pb).toBeCloseTo(5.5)
    expect(a.dy).toBeCloseTo(2 / 1.1) // 殖利率與股價成反比
  })

  it('沒報價的個股原值往後帶、不消失', () => {
    const r = withProvisionalRow(history(5), new Map([['2330', quote('2330', 110, TODAY)]]))
    const b = r.rows.at(-1)!.stocks.find((s) => s.code === '2317')!
    expect(b.close).toBe(100)
    expect(b.adjClose).toBe(100)
  })

  it('依補完的還原價序列重算動能（公式同 factors.py）', () => {
    const rows = history(21) // 21 列 + 暫定列 = 22 → 夠算 20 日動能
    const r = withProvisionalRow(
      rows,
      new Map([['2330', quote('2330', 110, '2026-09-22T05:00:00Z')]]),
    )
    const a = r.rows.at(-1)!.stocks.find((s) => s.code === '2330')!
    expect(a.mom20).toBeCloseTo(10, 6) // 110/100 - 1
    // 序列不夠長 → 保留管線算好的舊值（新進榜股在 jsonl 列數少，但管線用的是 400 日序列）
    expect(a.mom60).toBe(2)
    expect(a.mom121).toBe(3)
  })

  it('報價日期不晚於歷史最後一列 → 原樣回傳', () => {
    const rows = history(12) // 最後一列 2026-09-12
    const r = withProvisionalRow(rows, new Map([['2330', quote('2330', 110, TODAY)]]))
    expect(r.provisionalDate).toBeNull()
    expect(r.rows).toBe(rows)
  })

  it('沒有報價 / 空歷史 → 原樣回傳', () => {
    const rows = history(5)
    expect(withProvisionalRow(rows, new Map()).rows).toBe(rows)
    expect(withProvisionalRow([], new Map([['2330', quote('2330', 110, TODAY)]])).rows).toEqual([])
  })

  it('報價價格為 null → 該檔視同沒報價', () => {
    const r = withProvisionalRow(
      history(5),
      new Map([
        ['2330', quote('2330', null, TODAY)],
        ['2317', quote('2317', 90, TODAY)],
      ]),
    )
    expect(r.quoted).toBe(1)
    expect(r.rows.at(-1)!.stocks.find((s) => s.code === '2330')!.close).toBe(100)
  })
})
