import { scaleLinear } from '@visx/scale'

import type { RollingWindow } from '../../lib/rolling'
import { niceTicks } from '../../lib/scales'
import styles from './backtest.module.css'

const W = 760
const H = 240
const M = { t: 12, r: 12, b: 30, l: 48 }

/** 每個滾動視窗的報酬長條（漲紅跌綠），基準畫細線。 */
export function RollingChart({ rows }: { rows: RollingWindow[] }) {
  if (rows.length < 2) return null

  const all = rows.flatMap((r) => [r.ret, r.benchRet])
  const lo = Math.min(0, ...all)
  const hi = Math.max(0, ...all)
  const x = scaleLinear<number>({ domain: [0, rows.length], range: [M.l, W - M.r] })
  const y = scaleLinear<number>({ domain: [lo, hi], range: [H - M.b, M.t] })
  const bw = Math.max(1, (x(1) - x(0)) * 0.7)
  const yTicks = niceTicks(lo, hi, 4)
  const labelEvery = Math.ceil(rows.length / 8)

  return (
    <div className={styles.chartbox}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="滾動視窗報酬">
        {yTicks.map((t) => (
          <g key={t}>
            <line className={styles.grid} x1={M.l} y1={y(t)} x2={W - M.r} y2={y(t)} />
            <text className={styles.tick} x={M.l - 6} y={y(t) + 4} textAnchor="end">
              {`${(t * 100).toFixed(0)}%`}
            </text>
          </g>
        ))}
        <line className={styles.axis} x1={M.l} y1={y(0)} x2={W - M.r} y2={y(0)} />

        {rows.map((r, i) => {
          const top = Math.min(y(r.ret), y(0))
          const h = Math.abs(y(r.ret) - y(0))
          return (
            <rect
              key={r.start}
              x={x(i) + (x(1) - x(0) - bw) / 2}
              y={top}
              width={bw}
              height={Math.max(0.5, h)}
              fill={r.ret >= 0 ? 'var(--up)' : 'var(--down)'}
              opacity={0.85}
            >
              <title>{`${r.start}~${r.end}: ${(r.ret * 100).toFixed(1)}% (基準 ${(r.benchRet * 100).toFixed(1)}%)`}</title>
            </rect>
          )
        })}

        {/* 基準點 */}
        {rows.map((r, i) => (
          <circle
            key={`b${r.start}`}
            cx={x(i) + (x(1) - x(0)) / 2}
            cy={y(r.benchRet)}
            r={1.6}
            fill="var(--muted)"
          />
        ))}

        {rows.map((r, i) =>
          i % labelEvery === 0 ? (
            <text
              key={`l${r.start}`}
              className={styles.tick}
              x={x(i) + (x(1) - x(0)) / 2}
              y={H - M.b + 16}
              textAnchor="middle"
            >
              {r.start}
            </text>
          ) : null,
        )}
      </svg>
      <p className={styles.rollLegend}>長條 = 策略每個視窗報酬（漲紅跌綠）· 灰點 = 同期基準</p>
    </div>
  )
}
