import { scaleLinear } from '@visx/scale'
import { useState } from 'react'

import { formatOrNA, tickLabel } from '../../lib/format'
import { METRICS, metricValue, type MetricKey } from '../../lib/metrics'
import { log10, median, niceTicks, padExtent } from '../../lib/scales'
import type { Stock } from '../../lib/data'
import styles from './scatter.module.css'

const W = 720
const H = 520
const M = { t: 22, r: 26, b: 58, l: 70 }

export interface ScatterOptions {
  xKey: MetricKey
  yKey: MetricKey
  logX: boolean
  logY: boolean
  sizeByMcap: boolean
  medianLines: boolean
}

interface Pt {
  d: Stock
  x: number
  y: number
}

function pointColor(chgPct: number | null): string {
  if (chgPct == null || chgPct === 0) return 'var(--flat)'
  return chgPct > 0 ? 'var(--up)' : 'var(--down)'
}

export function FactorScatter({ stocks, opts }: { stocks: Stock[]; opts: ScatterOptions }) {
  const [hover, setHover] = useState<{ pt: Pt; cx: number; cy: number } | null>(null)
  const { xKey, yKey, logX, logY, sizeByMcap, medianLines } = opts
  const mx = METRICS[xKey]
  const my = METRICS[yKey]

  const pts: Pt[] = stocks
    .map((d) => ({ d, x: metricValue(d, xKey), y: metricValue(d, yKey) }))
    .filter((p): p is Pt => p.x != null && p.y != null && (!logX || p.x > 0) && (!logY || p.y > 0))

  if (pts.length === 0) {
    return (
      <div className={styles.plotbox}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="因子散佈圖">
          <text x={W / 2} y={H / 2} textAnchor="middle" className={styles.tick}>
            此組合無有效資料（動能需累積足夠交易日）
          </text>
        </svg>
      </div>
    )
  }

  const tx = logX ? log10 : (v: number) => v
  const ty = logY ? log10 : (v: number) => v
  const xsT = pts.map((p) => tx(p.x))
  const ysT = pts.map((p) => ty(p.y))
  const [x0, x1] = padExtent(Math.min(...xsT), Math.max(...xsT))
  const [y0, y1] = padExtent(Math.min(...ysT), Math.max(...ysT))

  const xScale = scaleLinear<number>({ domain: [x0, x1], range: [M.l, W - M.r] })
  const yScale = scaleLinear<number>({ domain: [y0, y1], range: [H - M.b, M.t] })
  const X = (v: number) => xScale(tx(v))
  const Y = (v: number) => yScale(ty(v))

  const mcaps = pts.map((p) => p.d.mcap).filter((v): v is number => v != null)
  const mcMax = mcaps.length ? Math.max(...mcaps) : 1
  const radius = (d: Stock) =>
    sizeByMcap && d.mcap != null ? 4 + 13 * Math.sqrt(d.mcap / mcMax) : 6.5

  const label = (t: number, isLog: boolean) => tickLabel(isLog ? Math.pow(10, t) : t)

  return (
    <div className={styles.plotbox}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="因子散佈圖">
        {/* 格線 + 刻度 */}
        {niceTicks(x0, x1).map((t) => (
          <g key={`x${t}`}>
            <line className={styles.grid} x1={xScale(t)} y1={M.t} x2={xScale(t)} y2={H - M.b} />
            <text className={styles.tick} x={xScale(t)} y={H - M.b + 16} textAnchor="middle">
              {label(t, logX)}
            </text>
          </g>
        ))}
        {niceTicks(y0, y1).map((t) => (
          <g key={`y${t}`}>
            <line className={styles.grid} x1={M.l} y1={yScale(t)} x2={W - M.r} y2={yScale(t)} />
            <text className={styles.tick} x={M.l - 8} y={yScale(t) + 4} textAnchor="end">
              {label(t, logY)}
            </text>
          </g>
        ))}

        {/* 中位數分割線 */}
        {medianLines && (
          <>
            <line
              className={styles.median}
              x1={X(median(pts.map((p) => p.x)))}
              y1={M.t}
              x2={X(median(pts.map((p) => p.x)))}
              y2={H - M.b}
            />
            <line
              className={styles.median}
              x1={M.l}
              y1={Y(median(pts.map((p) => p.y)))}
              x2={W - M.r}
              y2={Y(median(pts.map((p) => p.y)))}
            />
            <text className={styles.qlab} x={W - M.r - 4} y={M.t + 13} textAnchor="end">
              高 X · 高 Y
            </text>
            <text className={styles.qlab} x={M.l + 4} y={H - M.b - 6}>
              低 X · 低 Y
            </text>
          </>
        )}

        {/* 軸 */}
        <line className={styles.axis} x1={M.l} y1={H - M.b} x2={W - M.r} y2={H - M.b} />
        <line className={styles.axis} x1={M.l} y1={M.t} x2={M.l} y2={H - M.b} />
        <text className={styles.axtitle} x={(M.l + W - M.r) / 2} y={H - 16} textAnchor="middle">
          {mx.label}
          {logX ? ' · log' : ''}
        </text>
        <text
          className={styles.axtitle}
          transform={`translate(18,${(M.t + H - M.b) / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          {my.label}
          {logY ? ' · log' : ''}
        </text>

        {/* 資料點 */}
        {pts.map((p) => {
          const c = pointColor(p.d.chgPct)
          const cx = X(p.x)
          const cy = Y(p.y)
          const r = radius(p.d)
          return (
            <g key={p.d.code}>
              <circle
                className={styles.dot}
                cx={cx}
                cy={cy}
                r={r}
                fill={c}
                fillOpacity={0.26}
                stroke={c}
                strokeWidth={1.6}
                onMouseEnter={(e) => setHover({ pt: p, cx: e.clientX, cy: e.clientY })}
                onMouseMove={(e) => setHover({ pt: p, cx: e.clientX, cy: e.clientY })}
                onMouseLeave={() => setHover(null)}
              />
              <text className={styles.dlab} x={cx} y={cy - r - 4} textAnchor="middle">
                {p.d.name}
              </text>
            </g>
          )
        })}
      </svg>

      {hover && (
        <div className={styles.tooltip} style={{ left: hover.cx + 14, top: hover.cy - 46 }}>
          <b>
            {hover.pt.d.code} {hover.pt.d.name}
          </b>
          {hover.pt.d.close != null && (
            <>
              <br />
              價：{hover.pt.d.close.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              {hover.pt.d.chgPct != null &&
                `　${hover.pt.d.chgPct > 0 ? '+' : ''}${hover.pt.d.chgPct.toFixed(2)}%`}
            </>
          )}
          <br />
          {mx.label}：{formatOrNA(metricValue(hover.pt.d, xKey), mx.fmt)}
          <br />
          {my.label}：{formatOrNA(metricValue(hover.pt.d, yKey), my.fmt)}
          {hover.pt.d.mcap != null && (
            <>
              <br />
              市值：{hover.pt.d.mcap.toFixed(0)} 億
            </>
          )}
        </div>
      )}
    </div>
  )
}
