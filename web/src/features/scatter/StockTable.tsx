/**
 * 個股明細表 —— 散佈圖的「表格版」。
 *
 * 兩件事讓 60 × 10 的數字牆能讀：
 *  1. 點欄位標題可排序（同一欄再點一次換升冪 / 降冪），空值一律沉底。
 *  2. 圖上正在用的兩個因子欄位標記出來 —— 表和圖看的是同一件事。
 */
import { useState, type ReactNode } from 'react'

import type { Stock } from '../../lib/data'
import { NA } from '../../lib/format'
import { METRIC_KEYS, METRICS, metricValue, type MetricKey } from '../../lib/metrics'
import styles from './scatter.module.css'

type SortKey = MetricKey | 'code' | 'name'
type Dir = 'asc' | 'desc'

/** 空值永遠排在最後（不管升冪降冪）—— 「沒資料」不該被誤讀成「最小」。 */
function compare(a: Stock, b: Stock, key: SortKey, dir: Dir): number {
  const sign = dir === 'asc' ? 1 : -1
  if (key === 'code' || key === 'name') return sign * a[key].localeCompare(b[key])
  const va = metricValue(a, key)
  const vb = metricValue(b, key)
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  return sign * (va - vb)
}

function SortableTh({
  k,
  sort,
  onSort,
  highlight,
  children,
}: {
  k: SortKey
  sort: { key: SortKey; dir: Dir } | null
  onSort: (k: SortKey) => void
  highlight?: boolean
  children: ReactNode
}) {
  const on = sort?.key === k
  return (
    <th
      className={highlight ? styles.axisCol : undefined}
      aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className={styles.sortBtn} data-on={on} onClick={() => onSort(k)}>
        {children}
        <span className={styles.sortMark} aria-hidden="true">
          {on ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  )
}

export function StockTable({
  stocks,
  /** 圖上正在畫的兩個因子（會在表頭標出來） */
  axes = [],
}: {
  stocks: Stock[]
  axes?: MetricKey[]
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir } | null>(null)

  const rows = sort ? [...stocks].sort((a, b) => compare(a, b, sort.key, sort.dir)) : stocks

  // 數值欄預設降冪（想看「最大的是誰」）；代號 / 名稱預設升冪
  const toggle = (key: SortKey) =>
    setSort((s) =>
      s?.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'code' || key === 'name' ? 'asc' : 'desc' },
    )

  return (
    <div className={styles.tablewrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <SortableTh k="code" sort={sort} onSort={toggle}>
              代號
            </SortableTh>
            <SortableTh k="name" sort={sort} onSort={toggle}>
              名稱
            </SortableTh>
            {METRIC_KEYS.map((k) => (
              <SortableTh key={k} k={k} sort={sort} onSort={toggle} highlight={axes.includes(k)}>
                {METRICS[k].label}
              </SortableTh>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.code}>
              <td>{d.code}</td>
              <td>{d.name}</td>
              {METRIC_KEYS.map((k) => {
                const v = metricValue(d, k)
                const signed = METRICS[k].kind === 'momentum' && v != null
                const tone = signed
                  ? v > 0
                    ? styles.pos
                    : v < 0
                      ? styles.neg
                      : undefined
                  : undefined
                return (
                  <td
                    key={k}
                    className={`${tone ?? ''} ${axes.includes(k) ? styles.axisCol : ''}`.trim()}
                  >
                    {v == null ? NA : METRICS[k].fmt(v)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
