import styles from './controls.module.css'

/** −  值  ＋ 數值控制，比滑桿省空間、觸控友善。 */
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
        <span className={styles.stepVal}>{format(value)}</span>
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
