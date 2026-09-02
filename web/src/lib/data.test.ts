import { describe, expect, it } from 'vitest'

import { snapshotSchema } from './data'

const validStock = {
  code: '2330',
  name: '台積電',
  close: 1000,
  chgPct: 1.2,
  mcap: 25000,
  value: 500,
  pe: 20,
  pb: 5,
  dy: 2,
  mom20: null,
  mom60: null,
  mom121: null,
}

const validSnapshot = {
  schemaVersion: 1,
  asOf: '2026-09-01',
  generatedAt: '2026-09-02T14:51:15+08:00',
  histLen: 1,
  stocks: [validStock],
}

describe('snapshotSchema', () => {
  it('accepts a well-formed snapshot', () => {
    expect(() => snapshotSchema.parse(validSnapshot)).not.toThrow()
  })

  it('rejects a bad asOf date', () => {
    expect(() => snapshotSchema.parse({ ...validSnapshot, asOf: '2026/09/01' })).toThrow()
  })

  it('rejects a wrong schemaVersion', () => {
    expect(() => snapshotSchema.parse({ ...validSnapshot, schemaVersion: 2 })).toThrow()
  })

  it('rejects a non-numeric metric (string where number|null expected)', () => {
    const bad = { ...validSnapshot, stocks: [{ ...validStock, pe: '20' }] }
    expect(() => snapshotSchema.parse(bad)).toThrow()
  })

  it('rejects an empty stocks array', () => {
    expect(() => snapshotSchema.parse({ ...validSnapshot, stocks: [] })).toThrow()
  })
})
