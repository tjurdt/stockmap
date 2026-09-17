import { describe, expect, it } from 'vitest'

import { baselineStyle, MAX_SERIES, REF_COLOR, SERIES_COLORS, strategyStyle } from './palette'

describe('strategyStyle', () => {
  it('依固定順序指派，顏色跟著索引走（鎖定新策略不會重畫舊的）', () => {
    expect(strategyStyle(0)!.color).toBe(SERIES_COLORS[0])
    expect(strategyStyle(2)!.color).toBe(SERIES_COLORS[2])
  })

  it('不循環 —— 超過位子回 null，由呼叫端擋掉', () => {
    expect(strategyStyle(MAX_SERIES - 1)).not.toBeNull()
    expect(strategyStyle(MAX_SERIES)).toBeNull()
    expect(strategyStyle(MAX_SERIES + 7)).toBeNull()
  })

  it('色票不重複（撞色 = 兩個策略看起來是同一條線）', () => {
    expect(new Set(SERIES_COLORS).size).toBe(SERIES_COLORS.length)
  })

  it('策略線是實線且比基準線粗', () => {
    const s = strategyStyle(0)!
    expect(s.dash).toBeUndefined()
    expect(s.width).toBeGreaterThan(baselineStyle('twii').width)
  })
})

describe('baselineStyle', () => {
  it('基準線全部用中性色，身分靠虛線樣式', () => {
    const keys = ['twii', 'e0050', 'e00632r']
    const styles = keys.map(baselineStyle)
    expect(styles.every((s) => s.color === REF_COLOR)).toBe(true)
    expect(new Set(styles.map((s) => s.dash)).size).toBe(keys.length)
  })

  it('基準線不會拿到任何一個策略色', () => {
    for (const k of ['twii', 'e0050', 'e00632r', 'unknown']) {
      expect(SERIES_COLORS).not.toContain(baselineStyle(k).color)
    }
  })

  it('未知 key → 實線中性灰，不會炸掉', () => {
    expect(baselineStyle('nope')).toEqual({ color: REF_COLOR, dash: undefined, width: 1.5 })
  })
})
