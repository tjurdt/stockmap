import type { LockedStrategy } from './compare'
import styles from './backtest.module.css'

/** 已鎖定策略的 chips。 */
export function LockedBar({
  locked,
  colorOf,
  onRemove,
  onClear,
}: {
  locked: LockedStrategy[]
  colorOf: (i: number) => string
  onRemove: (id: string) => void
  onClear: () => void
}) {
  if (locked.length === 0) return null
  return (
    <div className={styles.lockedBar}>
      <span className={styles.lockedLabel}>比較中：</span>
      {locked.map((l, i) => (
        <span key={l.id} className={styles.lockChip}>
          <span className={styles.swatch} style={{ background: colorOf(i + 1) }} />
          {l.label}
          <button onClick={() => onRemove(l.id)} aria-label="移除">
            ✕
          </button>
        </span>
      ))}
      <button className={styles.lockClear} onClick={onClear}>
        清空
      </button>
    </div>
  )
}
