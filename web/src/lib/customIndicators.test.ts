import { beforeEach, describe, expect, it } from 'vitest'

import {
  deleteCustomIndicator,
  listCustomIndicators,
  newCustomIndicatorId,
  upsertCustomIndicator,
} from './customIndicators'

beforeEach(() => {
  localStorage.clear()
})

describe('customIndicators', () => {
  it('空的時候回空陣列', () => {
    expect(listCustomIndicators()).toEqual([])
  })

  it('新增 / 讀回', () => {
    const id = newCustomIndicatorId()
    const ok = upsertCustomIndicator({
      id,
      name: '我的動能',
      formula: 'avg(20)',
      betterWhen: 'high',
    })
    expect(ok).toBe(true)
    expect(listCustomIndicators()).toEqual([
      { id, name: '我的動能', formula: 'avg(20)', betterWhen: 'high' },
    ])
  })

  it('公式語法錯誤就不存', () => {
    const id = newCustomIndicatorId()
    const ok = upsertCustomIndicator({ id, name: '壞掉的', formula: 'avg(', betterWhen: 'high' })
    expect(ok).toBe(false)
    expect(listCustomIndicators()).toEqual([])
  })

  it('同 id 更新覆蓋，不新增', () => {
    const id = newCustomIndicatorId()
    upsertCustomIndicator({ id, name: 'A', formula: 'avg(5)', betterWhen: 'high' })
    upsertCustomIndicator({ id, name: 'B', formula: 'avg(10)', betterWhen: 'low' })
    const list = listCustomIndicators()
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual({ id, name: 'B', formula: 'avg(10)', betterWhen: 'low' })
  })

  it('刪除', () => {
    const id = newCustomIndicatorId()
    upsertCustomIndicator({ id, name: 'A', formula: 'avg(5)', betterWhen: 'high' })
    deleteCustomIndicator(id)
    expect(listCustomIndicators()).toEqual([])
  })

  it('localStorage 裡是垃圾資料時降級為空清單', () => {
    localStorage.setItem('stockmap:customIndicators.v1', '{not json')
    expect(listCustomIndicators()).toEqual([])
  })
})
