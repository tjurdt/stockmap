import { NA } from '../../lib/format'
import type { Stock } from '../../lib/data'
import styles from './scatter.module.css'

const price = (v: number | null) =>
  v == null ? NA : v.toLocaleString('en-US', { maximumFractionDigits: 2 })

/** 左欄的報價清單：直接把每檔的價格 + 漲跌幅攤開來看（散佈圖軸沒放到價格時尤其有用）。 */
export function QuotePanel({ stocks, live }: { stocks: Stock[]; live: boolean }) {
  const rows = [...stocks].sort((a, b) => (b.mcap ?? 0) - (a.mcap ?? 0))
  return (
    <div className={styles.quotes}>
      <div className={styles.quotesHead}>
        <span>{live ? '盤中價' : '收盤價'}</span>
        <span>漲跌幅</span>
      </div>
      <div className={styles.quotesBody}>
        {rows.map((s) => {
          const c = s.chgPct
          const cls = c == null ? undefined : c > 0 ? styles.pos : c < 0 ? styles.neg : undefined
          return (
            <div key={s.code} className={styles.quoteRow}>
              <span className={styles.quoteName}>
                {s.code} {s.name}
              </span>
              <span className={styles.quotePrice}>{price(s.close)}</span>
              <span className={`${styles.quoteChg} ${cls ?? ''}`}>
                {c == null ? NA : `${c > 0 ? '+' : ''}${c.toFixed(2)}%`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
