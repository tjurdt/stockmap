import { scaleLinear } from '@visx/scale'

import { histogram } from '../../lib/stats'
import { niceTicks } from '../../lib/scales'
import styles from './backtest.module.css'

const W = 760
const H = 240
const M = { t: 12, r: 12, b: 44, l: 44 }

interface Props {
  /** 每個視窗的策略總報酬（小數，0.1 = +10%） */
  returns: number[]
  /** 策略中位數（垂直線） */
  median: number
  /** 策略期望值（垂直線） */
  mean: number
  /** 目標直條數；實際配合整數百分點間距取 20–50 根。 */
  bins?: number
}

const pctLabel = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`

/**
 * 報酬分布直方圖 —— 「隨便挑一天進場、抱滿 N 個月」的所有結果攤成分布。
 * 長條漲紅跌綠（台股慣例）；中位數 / 期望值各一條垂直線。
 */
export function OutcomeHistogram({ returns, median, mean, bins = 30 }: Props) {
  if (returns.length < 2) return null

  const data = histogram(returns, bins)
  const sampleCount = data.reduce((sum, b) => sum + b.count, 0)
  if (sampleCount < 2) return null
  const lo = data[0]!.x0
  const hi = data.at(-1)!.x1
  const width = data[0]!.x1 - lo
  const maxCount = Math.max(...data.map((b) => b.count))

  const x = scaleLinear<number>({ domain: [lo, hi], range: [M.l, W - M.r] })
  const y = scaleLinear<number>({ domain: [0, maxCount], range: [H - M.b, M.t] })
  const xTicks = niceTicks(Math.round(lo / width), Math.round(hi / width), 6).map((t) =>
    Number((t * width).toPrecision(12)),
  )
  const yTicks = niceTicks(0, maxCount, 4).filter((t) => Number.isInteger(t))

  const vline = (value: number, color: string, label: string, dy: number) =>
    value >= lo && value <= hi ? (
      <g key={label}>
        <line
          x1={x(value)}
          x2={x(value)}
          y1={M.t}
          y2={H - M.b}
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <text x={x(value)} y={M.t + dy} textAnchor="middle" fontSize={11} fill={color}>
          {label} {pctLabel(value)}
        </text>
      </g>
    ) : null

  return (
    <div className={styles.chartbox}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="報酬分布直方圖">
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line className={styles.grid} x1={M.l} y1={y(t)} x2={W - M.r} y2={y(t)} />
            <text className={styles.tick} x={M.l - 6} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}

        {data.map((b, i) => {
          const bx = x(b.x0)
          const bw = Math.max(0.5, x(b.x1) - x(b.x0) - 1)
          return (
            <rect
              key={i}
              x={bx}
              y={y(b.count)}
              width={bw}
              height={Math.max(0, y(0) - y(b.count))}
              fill={b.x0 >= 0 ? 'var(--up)' : 'var(--down)'}
              opacity={0.8}
            >
              <title>{`${pctLabel(b.x0)} ~ ${pctLabel(b.x1)}：${b.count} 次（${(
                (b.count / sampleCount) *
                100
              ).toFixed(1)}%）`}</title>
            </rect>
          )
        })}

        <line className={styles.axis} x1={M.l} y1={y(0)} x2={W - M.r} y2={y(0)} />
        {x(0) >= M.l && x(0) <= W - M.r && (
          <line x1={x(0)} x2={x(0)} y1={M.t} y2={H - M.b} stroke="var(--muted)" strokeWidth={1} />
        )}

        {vline(median, 'var(--accent)', '中位數', 0)}
        {vline(mean, 'var(--ink)', '期望值', 14)}

        {xTicks.map((t) => (
          <text
            key={`x${t}`}
            className={styles.tick}
            x={x(t)}
            y={H - M.b + 16}
            textAnchor={t === lo ? 'start' : t === hi ? 'end' : 'middle'}
          >
            {pctLabel(t)}
          </text>
        ))}
        <text className={styles.tick} x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle">
          持有期間總報酬
        </text>
      </svg>
      <p className={styles.rollLegend}>
        長條 = 落在該報酬區間的進場日數（漲紅跌綠）·
        <span style={{ color: 'var(--accent)' }}> 虛線＝中位數</span> ·
        <span style={{ color: 'var(--ink)' }}> 虛線＝期望值</span>
      </p>
    </div>
  )
}
