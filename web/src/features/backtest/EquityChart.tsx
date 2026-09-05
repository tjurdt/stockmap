import { scaleLinear } from '@visx/scale'
import { LinePath } from '@visx/shape'
import { useRef } from 'react'

import { niceTicks } from '../../lib/scales'
import styles from './backtest.module.css'

const W = 760
const H = 360
const M = { t: 16, r: 16, b: 28, l: 52 }

interface Series {
  label: string
  values: (number | null)[]
  color: string
  /** true = 虛線（基準用） */
  dashed?: boolean
}

interface Props {
  dates: string[]
  series: Series[]
  /** 換股成交日的索引，畫成虛線 */
  markers?: number[]
  /** 每日多空環境；空頭區間畫淺紅底 */
  regime?: ('bull' | 'bear')[]
  /** 目前游標索引（null = 沒懸停 / 未鎖定，顯示最後一天） */
  cursor: number | null
  onCursor: (i: number | null) => void
  onPin?: (i: number) => void
}

function bearSpans(regime: ('bull' | 'bear')[]): [number, number][] {
  const spans: [number, number][] = []
  let start = -1
  regime.forEach((r, i) => {
    if (r === 'bear' && start < 0) start = i
    else if (r !== 'bear' && start >= 0) {
      spans.push([start, i - 1])
      start = -1
    }
  })
  if (start >= 0) spans.push([start, regime.length - 1])
  return spans
}

export function EquityChart({
  dates,
  series,
  markers = [],
  regime = [],
  cursor,
  onCursor,
  onPin,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  if (dates.length < 2) return null

  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null)
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const x = scaleLinear<number>({ domain: [0, dates.length - 1], range: [M.l, W - M.r] })
  const y = scaleLinear<number>({ domain: [lo, hi], range: [H - M.b, M.t] })

  const yTicks = niceTicks(lo, hi, 5)
  const xTickIdx = [0, Math.floor((dates.length - 1) / 2), dates.length - 1]

  const idxFromEvent = (clientX: number): number => {
    const rect = svgRef.current!.getBoundingClientRect()
    const px = ((clientX - rect.left) / rect.width) * W
    return Math.min(dates.length - 1, Math.max(0, Math.round(x.invert(px))))
  }

  const cur = Math.min(dates.length - 1, Math.max(0, cursor ?? dates.length - 1))

  return (
    <div className={styles.chartbox}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="回測權益曲線"
        style={{ cursor: onPin ? 'crosshair' : undefined, touchAction: 'pan-y' }}
        onPointerMove={(e) => onCursor(idxFromEvent(e.clientX))}
        onPointerLeave={() => onCursor(null)}
        onClick={(e) => onPin?.(idxFromEvent(e.clientX))}
      >
        {/* 空頭區間淺紅底 */}
        {bearSpans(regime).map(([a, b]) => (
          <rect
            key={`bear${a}`}
            className={styles.bearBand}
            x={x(a)}
            y={M.t}
            width={Math.max(1, x(b) - x(a))}
            height={H - M.b - M.t}
          />
        ))}
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

        {/* 換股成交日 */}
        {markers.map((i) => (
          <line key={`m${i}`} className={styles.marker} x1={x(i)} y1={M.t} x2={x(i)} y2={H - M.b} />
        ))}

        <line className={styles.axis} x1={M.l} y1={M.t} x2={M.l} y2={H - M.b} />
        <line className={styles.axis} x1={M.l} y1={H - M.b} x2={W - M.r} y2={H - M.b} />

        {series.map((s) => (
          <LinePath<number | null>
            key={s.label}
            data={s.values}
            defined={(v) => v != null}
            x={(_, i) => x(i)}
            y={(v) => y(v ?? lo)}
            stroke={s.color}
            strokeWidth={1.6}
            strokeDasharray={s.dashed ? '4 3' : undefined}
            fill="none"
          />
        ))}

        {/* 游標十字 */}
        <line className={styles.cursorLine} x1={x(cur)} y1={M.t} x2={x(cur)} y2={H - M.b} />
        {series.map((s) => {
          const v = s.values[cur]
          return v == null ? null : (
            <circle key={s.label} cx={x(cur)} cy={y(v)} r={3} fill={s.color} />
          )
        })}
      </svg>

      <div className={styles.legend}>
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} /> {s.label}{' '}
            <b>{s.values[cur]?.toFixed(2) ?? '—'}</b>
          </span>
        ))}
        <span className={styles.cursorDate}>{dates[cur]}</span>
      </div>
    </div>
  )
}
