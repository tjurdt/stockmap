import { describe, expect, it } from 'vitest'

import schema from '../../../schema/operator_plan.schema.json'
import { DEFAULT_PARAMS } from '../features/backtest/strategyParams'
import { operatorPlanSchema, positionSchema, strategySchema, toPlanJson } from './plan'

// 前端 zod schema 與管線 / CI 用的 JSON Schema 必須是同一份契約。drift 時此測試會紅。

describe('operator plan 契約：zod ↔ schema/operator_plan.schema.json', () => {
  it('top-level 欄位一致', () => {
    expect(Object.keys(operatorPlanSchema.shape).sort()).toEqual(
      Object.keys(schema.properties).sort(),
    )
  })

  it('strategy 欄位一致', () => {
    expect(Object.keys(strategySchema.shape).sort()).toEqual(
      Object.keys(schema.definitions.strategy.properties).sort(),
    )
  })

  it('position 欄位一致', () => {
    expect(Object.keys(positionSchema.shape).sort()).toEqual(
      Object.keys(schema.definitions.position.properties).sort(),
    )
  })

  it('strategy 欄位與 DEFAULT_PARAMS 一致', () => {
    expect(Object.keys(strategySchema.shape).sort()).toEqual(Object.keys(DEFAULT_PARAMS).sort())
  })

  it('schemaVersion 常數一致', () => {
    expect(schema.properties.schemaVersion.const).toBe(1)
  })

  it('DEFAULT_PARAMS 通過 strategy schema', () => {
    expect(strategySchema.safeParse(DEFAULT_PARAMS).success).toBe(true)
  })

  it('toPlanJson 產出通過 operatorPlanSchema', () => {
    const plan = toPlanJson({
      startDate: '2026-09-15',
      strategy: DEFAULT_PARAMS,
      holdings: [{ code: '2330', shares: 1000, entryPrice: 2400, entryDate: '2026-09-15' }],
    })
    expect(operatorPlanSchema.safeParse(plan).success).toBe(true)
  })
})
