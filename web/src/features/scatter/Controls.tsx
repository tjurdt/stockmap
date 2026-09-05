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

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      className={styles.toggle}
      data-on={checked}
      onClick={() => onChange(!checked)}
    >
      {label}
    </button>
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
    <>
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

      <label className={styles.field}>選項</label>
      <div className={styles.toggles}>
        <Toggle label="X 對數" checked={opts.logX} onChange={(v) => onChange({ logX: v })} />
        <Toggle label="Y 對數" checked={opts.logY} onChange={(v) => onChange({ logY: v })} />
        <Toggle
          label="點大小＝市值"
          checked={opts.sizeByMcap}
          onChange={(v) => onChange({ sizeByMcap: v })}
        />
        <Toggle
          label="中位數線"
          checked={opts.medianLines}
          onChange={(v) => onChange({ medianLines: v })}
        />
        {liveAvailable && <Toggle label="盤中報價" checked={live} onChange={onLiveChange} />}
      </div>
      <div className={styles.status}>{status}</div>
    </>
  )
}
