/**
 * ⓘ 說明鈕 —— 把「看得懂就不必看」的細節收起來，點了才展開。
 *
 * 用 inline 展開（不是浮動氣泡）：手機上不會被螢幕邊緣切掉，也不需要處理點擊外部關閉。
 * 可以安全地放在 <h3> 之類的 inline 內容裡（整棵都是 <span>）。
 */
import { useId, useState, type ReactNode } from 'react'

import styles from './InfoHint.module.css'

export function InfoHint({
  children,
  label = '說明',
  symbol = 'i',
}: {
  children: ReactNode
  /** 給螢幕閱讀器與 title 用的名稱，例如「欄位說明」 */
  label?: string
  /** 鈕上的字；預設 i，也可以用 ? */
  symbol?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={styles.dot}
        data-open={open}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${open ? '收起' : '展開'}${label}`}
        title={label}
        onClick={() => setOpen((o) => !o)}
      >
        {symbol}
      </button>
      <span id={id} className={styles.panel} hidden={!open}>
        {children}
      </span>
    </span>
  )
}
