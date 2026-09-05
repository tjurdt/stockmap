import type { BacktestMetrics } from './engine'
import styles from './backtest.module.css'

const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`

export interface CompareRow {
  label: string
  color: string
  metrics: BacktestMetrics
  hasRegime: boolean
}

const COLS: { key: string; label: string; fmt: (m: BacktestMetrics) => string }[] = [
  { key: 'tot', label: '總報酬', fmt: (m) => pct(m.totalReturn) },
  { key: 'cagr', label: '年化', fmt: (m) => pct(m.cagr) },
  { key: 'mdd', label: '最大回撤', fmt: (m) => pct(m.maxDrawdown) },
  { key: 'sharpe', label: '夏普', fmt: (m) => m.sharpe.toFixed(2) },
  { key: 'vol', label: '年化波動', fmt: (m) => pct(m.volatility) },
  { key: 'to', label: '平均換手', fmt: (m) => `${(m.turnover * 100).toFixed(0)}%` },
  { key: 'rb', label: '再平衡/停損', fmt: (m) => `${m.rebalances}/${m.stops}` },
]

export function CompareTable({ rows }: { rows: CompareRow[] }) {
  if (rows.length < 2) return null
  return (
    <div className={styles.compareWrap}>
      <table className={styles.compareTable}>
        <thead>
          <tr>
            <th>策略</th>
            {COLS.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>
                <span className={styles.swatch} style={{ background: r.color }} /> {r.label}
              </td>
              {COLS.map((c) => (
                <td key={c.key}>{c.fmt(r.metrics)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
