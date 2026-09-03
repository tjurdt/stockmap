/**
 * 因子 / 指標 registry —— 前端唯一事實來源。
 *
 * key 對應 Python 端 `pipeline/src/twse_pipeline/factors.py` 的 FACTORS 與
 * `schema/snapshot.schema.json`。新增指標見 docs/ADDING_A_FACTOR.md。
 */
import type { Stock } from './data'
import { fixed } from './format'

export type MetricKey =
  'price' | 'mcap' | 'pe' | 'pb' | 'dy' | 'chg' | 'turn' | 'm20' | 'm60' | 'm121'

export type MetricKind = 'price' | 'value' | 'ratio' | 'momentum'

export interface MetricDef {
  /** 顯示名稱（含單位） */
  label: string
  /** 對應 Stock 上的欄位 */
  field: keyof Stock
  /** 數值格式化 */
  fmt: (v: number) => string
  kind: MetricKind
  /** 選股 / 排名時，數值「高」還是「低」比較好（回測用） */
  betterWhen: 'high' | 'low'
}

export const METRICS: Record<MetricKey, MetricDef> = {
  price: { label: '收盤價 (元)', field: 'close', fmt: fixed(2), kind: 'price', betterWhen: 'high' },
  mcap: { label: '市值 (億元)', field: 'mcap', fmt: fixed(0), kind: 'value', betterWhen: 'high' },
  pe: { label: '本益比 (PE)', field: 'pe', fmt: fixed(2), kind: 'ratio', betterWhen: 'low' },
  pb: { label: '股價淨值比 (PB)', field: 'pb', fmt: fixed(2), kind: 'ratio', betterWhen: 'low' },
  dy: { label: '殖利率 (%)', field: 'dy', fmt: fixed(2), kind: 'ratio', betterWhen: 'high' },
  chg: {
    label: '當日漲跌幅 (%)',
    field: 'chgPct',
    fmt: fixed(2),
    kind: 'momentum',
    betterWhen: 'high',
  },
  turn: {
    label: '成交金額 (億元)',
    field: 'value',
    fmt: fixed(2),
    kind: 'value',
    betterWhen: 'high',
  },
  m20: {
    label: '近月動能 (%)',
    field: 'mom20',
    fmt: fixed(2),
    kind: 'momentum',
    betterWhen: 'high',
  },
  m60: {
    label: '近季動能 (%)',
    field: 'mom60',
    fmt: fixed(2),
    kind: 'momentum',
    betterWhen: 'high',
  },
  m121: {
    label: '12-1 動能 (%)',
    field: 'mom121',
    fmt: fixed(2),
    kind: 'momentum',
    betterWhen: 'high',
  },
}

export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[]

/** 取某股某指標的數值，非有限數一律回 null。 */
export function metricValue(stock: Stock, key: MetricKey): number | null {
  const v = stock[METRICS[key].field]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
