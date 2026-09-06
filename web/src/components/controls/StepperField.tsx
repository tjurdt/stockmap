import { useEffect, useRef, useState } from 'react'

import styles from './controls.module.css'

/**
 * −  值  ＋ 數值控制。中間的值可直接打字：編輯時不 clamp、不補零、可整個清空，
 * 失焦 / Enter 才套用（無效或空 → 還原）。−/＋ 一律直接動 value。
 */
export function StepperField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(v),
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const [draft, setDraft] = useState<string | null>(null) // null = 未在編輯
  const inputRef = useRef<HTMLInputElement>(null)

  // 外部把 value 改掉（−/＋ 或載入記憶）時，若不在編輯就同步顯示
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(null)
  }, [value])

  const commit = () => {
    if (draft === null) return
    const t = draft.trim()
    if (t !== '') {
      const n = Number(t)
      if (Number.isFinite(n)) onChange(clamp(n))
    }
    setDraft(null)
  }

  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <div className={styles.stepper}>
        <button
          className={styles.stepBtn}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
          aria-label={`${label} 減少`}
        >
          −
        </button>
        <input
          ref={inputRef}
          className={styles.stepInput}
          type="text"
          inputMode="numeric"
          value={draft ?? format(value)}
          aria-label={label}
          onFocus={() => setDraft(String(value))}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') inputRef.current?.blur()
            if (e.key === 'Escape') {
              setDraft(null)
              inputRef.current?.blur()
            }
          }}
        />
        <button
          className={styles.stepBtn}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + step))}
          aria-label={`${label} 增加`}
        >
          ＋
        </button>
      </div>
    </div>
  )
}
