import { describe, expect, it } from 'vitest'

import { sameParams } from './compare'
import { DEFAULT_PARAMS } from './strategyParams'

describe('sameParams', () => {
  it('相同參數 → true', () => {
    expect(sameParams({ ...DEFAULT_PARAMS }, { ...DEFAULT_PARAMS })).toBe(true)
  })

  it('任一欄位不同 → false', () => {
    expect(sameParams(DEFAULT_PARAMS, { ...DEFAULT_PARAMS, topN: 3 })).toBe(false)
    expect(sameParams(DEFAULT_PARAMS, { ...DEFAULT_PARAMS, bearHolding: 'inverse' })).toBe(false)
  })
})
