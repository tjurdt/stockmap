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

export function Controls({ opts, onChange, status, live, onLiveChange }: Props) {
  return (
    <div className={styles.panel}>
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
          label="即時報價（盤中，約 20 秒延遲）"
          checked={live}
          onChange={onLiveChange}
        />
      )}
      <div className={styles.status}>{status}</div>
    </div>
  )
}
