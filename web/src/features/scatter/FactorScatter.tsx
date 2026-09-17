import { scaleLinear } from '@visx/scale'
import { useState } from 'react'

import type { Stock } from '../../lib/data'
import { formatOrNA, tickLabel } from '../../lib/format'
import { factorFmt, factorLabel, metricValue, type MetricKey } from '../../lib/metrics'
import { log10, median, niceTicks, padExtent } from '../../lib/scales'
import styles from './scatter.module.css'

const W = 720
const H = 520
const M = { t: 26, r: 26, b: 62, l: 72 }

/** 最多直接標幾個名字。全部都標一定重疊，重疊的標籤等於沒標。 */
const MAX_LABELS = 10
/** 估算中文標籤寬度（font-size 11px）。 */
const CHAR_W = 11
const LABEL_H = 13
/** 點再小也要好點得到。 */
const MIN_HIT_R = 13

export interface ScatterOptions {
  xKey: MetricKey
  yKey: MetricKey
  logX: boolean
  logY: boolean
  sizeByMcap: boolean
  medianLines: boolean
  /**
   * 自訂指標（`xKey`/`yKey === 'custom'` 時用）。X、Y 軸共用同一組定義 —— 兩軸都選自訂指標
   * 會顯示同一條公式的值，這是刻意的簡化（跟 `BacktestConfig.customFormula` 同一個設計）。
   */
  customFormula?: string
  customLabel?: string
  customBetterWhen?: 'high' | 'low'
}

interface Pt {
  d: Stock
  x: number
  y: number
}

interface Placed extends Pt {
  cx: number
  cy: number
  r: number
  color: string
  labelled: boolean
}

function pointColor(chgPct: number | null): string {
  if (chgPct == null || chgPct === 0) return 'var(--flat)'
  return chgPct > 0 ? 'var(--up)' : 'var(--down)'
}

type Rect = [x0: number, y0: number, x1: number, y1: number]

const overlaps = (a: Rect, b: Rect) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]

/**
 * 選擇性直接標籤：由大到小試著放，會撞到已放的就跳過，最多 MAX_LABELS 個。
 * 純函式（只讀座標），方便測試。
 */
function pickLabels(pts: Placed[]): Set<string> {
  const out = new Set<string>()
  const taken: Rect[] = []
  for (const p of [...pts].sort((a, b) => b.r - a.r)) {
    if (out.size >= MAX_LABELS) break
    const w = Math.max(24, p.d.name.length * CHAR_W)
    const top = p.cy - p.r - 4 - LABEL_H
    const box: Rect = [p.cx - w / 2, top, p.cx + w / 2, top + LABEL_H]
    if (box[1] < 2 || taken.some((t) => overlaps(box, t))) continue
    taken.push(box)
    out.add(p.d.code)
  }
  return out
}

export function FactorScatter({ stocks, opts }: { stocks: Stock[]; opts: ScatterOptions }) {
  const [hover, setHover] = useState<{ pt: Pt; cx: number; cy: number } | null>(null)
  const { xKey, yKey, logX, logY, sizeByMcap, medianLines, customLabel, customBetterWhen } = opts
  const mx = {
    label: factorLabel({ factor: xKey, customLabel, customBetterWhen }),
    fmt: factorFmt(xKey),
  }
  const my = {
    label: factorLabel({ factor: yKey, customLabel, customBetterWhen }),
    fmt: factorFmt(yKey),
  }

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

  const placed: Placed[] = pts.map((p) => ({
    ...p,
    cx: X(p.x),
    cy: Y(p.y),
    r: radius(p.d),
    color: pointColor(p.d.chgPct),
    labelled: false,
  }))
  const labelled = pickLabels(placed)

  const label = (t: number, isLog: boolean) => tickLabel(isLog ? Math.pow(10, t) : t)
  const medX = X(median(pts.map((p) => p.x)))
  const medY = Y(median(pts.map((p) => p.y)))
  const hoverCode = hover?.pt.d.code

  return (
    <div className={styles.plotbox}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="因子散佈圖">
        {/* 格線 + 刻度 */}
        {niceTicks(x0, x1).map((t) => (
          <g key={`x${t}`}>
            <line className={styles.grid} x1={xScale(t)} y1={M.t} x2={xScale(t)} y2={H - M.b} />
            <text className={styles.tick} x={xScale(t)} y={H - M.b + 17} textAnchor="middle">
              {label(t, logX)}
            </text>
          </g>
        ))}
        {niceTicks(y0, y1).map((t) => (
          <g key={`y${t}`}>
            <line className={styles.grid} x1={M.l} y1={yScale(t)} x2={W - M.r} y2={yScale(t)} />
            <text className={styles.tick} x={M.l - 10} y={yScale(t) + 4} textAnchor="end">
              {label(t, logY)}
            </text>
          </g>
        ))}

        {/* 中位數分割線 —— 象限標籤直接寫因子名稱，不用「高 X」這種代號 */}
        {medianLines && (
          <>
            <line className={styles.median} x1={medX} y1={M.t} x2={medX} y2={H - M.b} />
            <line className={styles.median} x1={M.l} y1={medY} x2={W - M.r} y2={medY} />
            <text className={styles.qlab} x={W - M.r - 6} y={M.t + 14} textAnchor="end">
              {mx.label.replace(/\s*\(.*\)/, '')}高 · {my.label.replace(/\s*\(.*\)/, '')}高
            </text>
            <text className={styles.qlab} x={M.l + 6} y={H - M.b - 8}>
              {mx.label.replace(/\s*\(.*\)/, '')}低 · {my.label.replace(/\s*\(.*\)/, '')}低
            </text>
          </>
        )}

        {/* 軸 */}
        <line className={styles.axis} x1={M.l} y1={H - M.b} x2={W - M.r} y2={H - M.b} />
        <line className={styles.axis} x1={M.l} y1={M.t} x2={M.l} y2={H - M.b} />
        <text className={styles.axtitle} x={(M.l + W - M.r) / 2} y={H - 18} textAnchor="middle">
          {mx.label}
          {logX ? ' · log' : ''}
        </text>
        <text
          className={styles.axtitle}
          transform={`translate(20,${(M.t + H - M.b) / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          {my.label}
          {logY ? ' · log' : ''}
        </text>

        {/* 資料點：hover 時其餘淡出，焦點只有一個 */}
        <g className={hoverCode ? styles.dimmed : undefined}>
          {placed.map((p) => {
            const on = p.d.code === hoverCode
            return (
              <g
                key={p.d.code}
                className={on ? styles.dotOn : styles.dotGroup}
                onMouseEnter={(e) => setHover({ pt: p, cx: e.clientX, cy: e.clientY })}
                onMouseMove={(e) => setHover({ pt: p, cx: e.clientX, cy: e.clientY })}
                onMouseLeave={() => setHover(null)}
              >
                <circle
                  cx={p.cx}
                  cy={p.cy}
                  r={p.r}
                  fill={p.color}
                  fillOpacity={on ? 0.42 : 0.24}
                  stroke={p.color}
                  strokeWidth={on ? 2.4 : 1.6}
                />
                {/* 看不見的命中區：小點也點得到 */}
                <circle
                  className={styles.hit}
                  cx={p.cx}
                  cy={p.cy}
                  r={Math.max(p.r + 6, MIN_HIT_R)}
                />
                {(labelled.has(p.d.code) || on) && (
                  <text className={styles.dlab} x={p.cx} y={p.cy - p.r - 5} textAnchor="middle">
                    {p.d.name}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      <div className={styles.chartLegend}>
        <span>
          <i className={styles.swUp} /> 今日漲
        </span>
        <span>
          <i className={styles.swDown} /> 今日跌
        </span>
        <span>
          <i className={styles.swFlat} /> 平盤
        </span>
        {sizeByMcap && <span className={styles.legendNote}>圓圈大小 = 市值</span>}
        <span className={styles.legendNote}>
          {pts.length} 檔 · 直接標名 {Math.min(labelled.size, MAX_LABELS)} 檔（其餘游標移上去看）
        </span>
      </div>

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
