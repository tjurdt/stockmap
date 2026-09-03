import { scaleLinear } from '@visx/scale'
import { LinePath } from '@visx/shape'

import { niceTicks } from '../../lib/scales'
import styles from './backtest.module.css'

const W = 760
const H = 360
const M = { t: 16, r: 16, b: 28, l: 52 }

interface Series {
  label: string
  values: number[]
  color: string
}

export function EquityChart({ dates, series }: { dates: string[]; series: Series[] }) {
  if (dates.length < 2) return null
  const all = series.flatMap((s) => s.values)
  const lo = Math.min(...all)
  const hi = Math.max(...all)

  const x = scaleLinear<number>({ domain: [0, dates.length - 1], range: [M.l, W - M.r] })
  const y = scaleLinear<number>({ domain: [lo, hi], range: [H - M.b, M.t] })

  const yTicks = niceTicks(lo, hi, 5)
  const xTickIdx = [0, Math.floor((dates.length - 1) / 2), dates.length - 1]

  return (
    <div className={styles.chartbox}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="回測權益曲線">
        {yTicks.map((t) => (
          <g key={t}>
            <line className={styles.grid} x1={M.l} y1={y(t)} x2={W - M.r} y2={y(t)} />
            <text className={styles.tick} x={M.l - 8} y={y(t) + 4} textAnchor="end">
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        {xTickIdx.map((i) => (
          <text key={i} className={styles.tick} x={x(i)} y={H - M.b + 18} textAnchor="middle">
            {dates[i]?.slice(0, 7)}
          </text>
        ))}
        <line className={styles.axis} x1={M.l} y1={M.t} x2={M.l} y2={H - M.b} />
        <line className={styles.axis} x1={M.l} y1={H - M.b} x2={W - M.r} y2={H - M.b} />

        {series.map((s) => (
          <LinePath
            key={s.label}
            data={s.values}
            x={(_, i) => x(i)}
            y={(v) => y(v)}
            stroke={s.color}
            strokeWidth={1.6}
            fill="none"
          />
        ))}
      </svg>
      <div className={styles.legend}>
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
