import { liveAvailable } from '../../lib/live'
import { METRIC_KEYS, METRICS, type MetricKey } from '../../lib/metrics'
import type { ScatterOptions } from './FactorScatter'
import styles from './scatter.module.css'

interface Props {
  opts: ScatterOptions
  onChange: (patch: Partial<ScatterOptions>) => void
  status: string
  live: boolean
  onLiveChange: (v: boolean) => void
  showN: number
  maxN: number
  onShowN: (n: number) => void
}

function MetricSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: MetricKey
  onChange: (v: MetricKey) => void
}) {
  return (
    <>
      <label className={styles.field} htmlFor={id}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as MetricKey)}>
        {METRIC_KEYS.map((k) => (
          <option key={k} value={k}>
            {METRICS[k].label}
          </option>
        ))}
      </select>
    </>
  )
}

function Check({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className={styles.check}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
    </div>
  )
}

const SHOW_OPTIONS = [20, 40, 60]

export function Controls({
  opts,
  onChange,
  status,
  live,
  onLiveChange,
  showN,
  maxN,
  onShowN,
}: Props) {
  return (
    <div className={styles.panel}>
      <label className={styles.field} htmlFor="shown">
        顯示市值前
      </label>
      <select id="shown" value={showN} onChange={(e) => onShowN(Number(e.target.value))}>
        {SHOW_OPTIONS.filter((n) => n <= maxN).map((n) => (
          <option key={n} value={n}>
            {n} 檔
          </option>
        ))}
        {maxN > 0 && !SHOW_OPTIONS.includes(maxN) && <option value={maxN}>全部 {maxN} 檔</option>}
      </select>

      <MetricSelect
        id="xsel"
        label="橫軸 X"
        value={opts.xKey}
        onChange={(v) => onChange({ xKey: v })}
      />
      <MetricSelect
        id="ysel"
        label="縱軸 Y"
        value={opts.yKey}
        onChange={(v) => onChange({ yKey: v })}
      />
      <Check
        id="logx"
        label="X 軸取對數"
        checked={opts.logX}
        onChange={(v) => onChange({ logX: v })}
      />
      <Check
        id="logy"
        label="Y 軸取對數"
        checked={opts.logY}
        onChange={(v) => onChange({ logY: v })}
      />
      <Check
        id="szmc"
        label="點大小 = 市值"
        checked={opts.sizeByMcap}
        onChange={(v) => onChange({ sizeByMcap: v })}
      />
      <Check
        id="medln"
        label="中位數分割線"
        checked={opts.medianLines}
        onChange={(v) => onChange({ medianLines: v })}
      />
      {liveAvailable && (
        <Check
          id="live"
          label="盤中報價（約 15 分鐘延遲）"
          checked={live}
          onChange={onLiveChange}
        />
      )}
      <div className={styles.status}>{status}</div>
    </div>
  )
}
