import { describe, expect, it } from 'vitest'

import { rankByValue } from './rank'

describe('rankByValue', () => {
  it('betterWhen=high：數值大排前面，rank 1 = 最大', () => {
    const rows = [
      { code: 'A', name: 'a', value: 10 },
      { code: 'B', name: 'b', value: 30 },
      { code: 'C', name: 'c', value: 20 },
    ]
    const r = rankByValue(rows, 'high')
    expect(r.map((x) => x.code)).toEqual(['B', 'C', 'A'])
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3])
  })

  it('betterWhen=low：數值小排前面（例如 PE）', () => {
    const rows = [
      { code: 'A', name: 'a', value: 10 },
      { code: 'B', name: 'b', value: 30 },
      { code: 'C', name: 'c', value: 20 },
    ]
    const r = rankByValue(rows, 'low')
    expect(r.map((x) => x.code)).toEqual(['A', 'C', 'B'])
  })

  it('percentile：最好 = 1、最差 = 0，等距分佈', () => {
    const rows = [
      { code: 'A', name: 'a', value: 10 },
      { code: 'B', name: 'b', value: 20 },
      { code: 'C', name: 'c', value: 30 },
    ]
    const r = rankByValue(rows, 'high')
    expect(r.find((x) => x.code === 'C')!.percentile).toBe(1)
    expect(r.find((x) => x.code === 'B')!.percentile).toBe(0.5)
    expect(r.find((x) => x.code === 'A')!.percentile).toBe(0)
  })

  it('空值（null / 非有限數）沉底，不佔真正名次也不算分位數', () => {
    const rows = [
      { code: 'A', name: 'a', value: 10 },
      { code: 'B', name: 'b', value: null },
      { code: 'C', name: 'c', value: NaN },
      { code: 'D', name: 'd', value: 20 },
    ]
    const r = rankByValue(rows, 'high')
    expect(r.map((x) => x.code)).toEqual(['D', 'A', 'B', 'C'])
    expect(r[2]!.percentile).toBeNull()
    expect(r[3]!.percentile).toBeNull()
    expect(r[2]!.rank).toBe(3)
    expect(r[3]!.rank).toBe(4)
  })

  it('只有一檔有值時 percentile = 1', () => {
    const r = rankByValue([{ code: 'A', name: 'a', value: 5 }], 'high')
    expect(r[0]!.percentile).toBe(1)
  })

  it('空陣列回空陣列', () => {
    expect(rankByValue([], 'high')).toEqual([])
  })
})
