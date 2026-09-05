import styles from './controls.module.css'

/** 循環選單：整列一顆，左右箭頭 tap 循環切換選項，省空間。 */
export function CycleField<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (v: T) => void
}) {
  const i = Math.max(
    0,
    options.findIndex(([v]) => v === value),
  )
  const go = (delta: number) => {
    const n = options.length
    onChange(options[(i + delta + n) % n]![0])
  }
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <div className={styles.cycle}>
        <button className={styles.arrow} onClick={() => go(-1)} aria-label={`${label} 上一個`}>
          ‹
        </button>
        <span
          className={styles.value}
          onClick={() => go(1)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && go(1)}
        >
          {options[i]?.[1] ?? String(value)}
        </span>
        <button className={styles.arrow} onClick={() => go(1)} aria-label={`${label} 下一個`}>
          ›
        </button>
      </div>
    </div>
  )
}
