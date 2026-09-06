import type { ReactNode } from 'react'

import styles from './controls.module.css'

/** 條件展開的子設定 —— 用左側色框 + 縮排掛在觸發它的那顆選單下面。 */
export function SubGroup({ children }: { children: ReactNode }) {
  return <div className={styles.subgroup}>{children}</div>
}
