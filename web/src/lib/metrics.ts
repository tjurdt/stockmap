/**
 * 因子 / 指標 registry —— 前端唯一事實來源。
 *
 * key 對應 Python 端 `pipeline/src/twse_pipeline/factors.py` 的 FACTORS 與
 * `schema/snapshot.schema.json`。新增官方因子見 docs/ADDING_A_FACTOR.md。
 *
 * `'custom'` 是保留給使用者自訂指標的槽位（見 `lib/formula.ts`），跟其他 key 不同：
 * 它的顯示名稱 / 排序方向不是靜態資料，是內嵌在呼叫端設定物件裡的（`customLabel`/
 * `customBetterWhen`，比照 `BacktestConfig` 的 `momDays` 自訂動能窗），所以不在 `METRICS`
 * 這個靜態表裡 —— 用 `factorLabel`/`factorBetterWhen`/`factorFmt`/`metricField` 這幾個
 * helper 存取，不要直接 `METRICS['custom']`（不存在）。
 */
import type { Stock } from './data'
import { fixed } from './format'

export type BuiltinMetricKey =
  'price' | 'mcap' | 'pe' | 'pb' | 'dy' | 'chg' | 'turn' | 'm20' | 'm60' | 'm121'

export type MetricKey = BuiltinMetricKey | 'custom'

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

export const METRICS: Record<BuiltinMetricKey, MetricDef> = {
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

export const METRIC_KEYS = Object.keys(METRICS) as BuiltinMetricKey[]

/**
 * `key` 在 `Stock`/`HistoryRow['stocks'][number]` 上對應的欄位名。
 * `'custom'` 的值是執行期用 object spread 動態塞進去的（見 `engine.ts::withCustomFactor`），
 * 不在 zod schema 裡，欄位名固定叫 `'custom'`。
 */
export function metricField(key: MetricKey): string {
  return key === 'custom' ? 'custom' : METRICS[key].field
}

/** 取某股某指標的數值，非有限數一律回 null。 */
export function metricValue(stock: Stock, key: MetricKey): number | null {
  const v = (stock as Record<string, unknown>)[metricField(key)]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export interface CustomFactorCfg {
  factor: MetricKey
  customLabel?: string
  customBetterWhen?: 'high' | 'low'
}

/** 顯示名稱：內建指標用 METRICS 的 label，自訂指標用使用者命名的名稱。 */
export function factorLabel(cfg: CustomFactorCfg): string {
  if (cfg.factor === 'custom') return cfg.customLabel?.trim() || '自訂指標'
  return METRICS[cfg.factor].label
}

/** 排序方向：內建指標用 METRICS 的 betterWhen，自訂指標用使用者選的方向（預設「高」）。 */
export function factorBetterWhen(cfg: CustomFactorCfg): 'high' | 'low' {
  if (cfg.factor === 'custom') return cfg.customBetterWhen ?? 'high'
  return METRICS[cfg.factor].betterWhen
}

/** 數值格式化：自訂指標固定用兩位小數。 */
export function factorFmt(factor: MetricKey): (v: number) => string {
  return factor === 'custom' ? fixed(2) : METRICS[factor].fmt
}
