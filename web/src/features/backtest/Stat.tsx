import styles from './backtest.module.css'

export const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
export const cls = (v: number) => (v > 0 ? styles.pos : v < 0 ? styles.neg : undefined)

export function Stat({ label, value, klass }: { label: string; value: string; klass?: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={`${styles.statValue} ${klass ?? ''}`}>{value}</div>
    </div>
  )
}
