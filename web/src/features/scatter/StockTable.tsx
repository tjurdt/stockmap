import { NA } from '../../lib/format'
import { METRIC_KEYS, METRICS, metricValue } from '../../lib/metrics'
import type { Stock } from '../../lib/data'
import styles from './scatter.module.css'

export function StockTable({ stocks }: { stocks: Stock[] }) {
  return (
    <div className={styles.tablewrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>代號</th>
            <th>名稱</th>
            {METRIC_KEYS.map((k) => (
              <th key={k}>{METRICS[k].label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stocks.map((d) => (
            <tr key={d.code}>
              <td>{d.code}</td>
              <td>{d.name}</td>
              {METRIC_KEYS.map((k) => {
                const v = metricValue(d, k)
                const signed = METRICS[k].kind === 'momentum' && v != null
                const cls = signed
                  ? v > 0
                    ? styles.pos
                    : v < 0
                      ? styles.neg
                      : undefined
                  : undefined
                return (
                  <td key={k} className={cls}>
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
