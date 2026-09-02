import { describe, expect, it } from 'vitest'

import type { Stock } from './data'
import { METRIC_KEYS, METRICS, metricValue } from './metrics'

const stock: Stock = {
  code: '2330',
  name: '台積電',
  close: 1000,
  chgPct: 1.23,
  mcap: 25000,
  value: 500,
  pe: 20,
  pb: 5,
  dy: 2,
  mom20: 3.456,
  mom60: null,
  mom121: -2.1,
}

describe('METRICS registry', () => {
  it('every key maps to an existing Stock field', () => {
    for (const k of METRIC_KEYS) {
      expect(stock).toHaveProperty(METRICS[k].field)
    }
  })

  it('metricValue reads the mapped field', () => {
    expect(metricValue(stock, 'price')).toBe(1000)
    expect(metricValue(stock, 'chg')).toBe(1.23)
    expect(metricValue(stock, 'm20')).toBe(3.456)
  })

  it('metricValue returns null for null / non-finite', () => {
    expect(metricValue(stock, 'm60')).toBeNull()
    expect(metricValue({ ...stock, pe: Infinity }, 'pe')).toBeNull()
  })

  it('fmt rounds to the declared precision', () => {
    expect(METRICS.m20.fmt(3.456)).toBe('3.46')
    expect(METRICS.mcap.fmt(25000)).toBe('25000')
  })
})
