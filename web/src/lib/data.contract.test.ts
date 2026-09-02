import { describe, expect, it } from 'vitest'

import schema from '../../../schema/snapshot.schema.json'
import { snapshotSchema, stockSchema } from './data'

// 前端 zod schema 與管線用的 JSON Schema 必須描述同一份契約。
// 這裡比對欄位名；drift（任一邊加/改欄位而忘了另一邊）時此測試會紅。

describe('snapshot 契約：zod ↔ schema/snapshot.schema.json', () => {
  it('top-level 欄位一致', () => {
    expect(Object.keys(snapshotSchema.shape).sort()).toEqual(Object.keys(schema.properties).sort())
  })

  it('stock 欄位一致', () => {
    expect(Object.keys(stockSchema.shape).sort()).toEqual(
      Object.keys(schema.definitions.stock.properties).sort(),
    )
  })

  it('schemaVersion 常數一致', () => {
    expect(schema.properties.schemaVersion.const).toBe(1)
  })
})
