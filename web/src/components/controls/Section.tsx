import type { ReactNode } from 'react'

import styles from './controls.module.css'

/** 可收合的設定區塊。 */
export function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details className={styles.section} open={defaultOpen}>
      <summary>{title}</summary>
      <div className={styles.body}>{children}</div>
    </details>
  )
}
