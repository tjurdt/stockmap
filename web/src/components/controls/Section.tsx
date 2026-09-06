import type { ReactNode } from 'react'

import styles from './controls.module.css'

/** 設定欄分區淡底色。 */
export type SectionTone = 'range' | 'pick' | 'swap' | 'risk' | 'cost'

const TONE_CLASS: Record<SectionTone, string> = {
  range: styles.toneRange!,
  pick: styles.tonePick!,
  swap: styles.toneSwap!,
  risk: styles.toneRisk!,
  cost: styles.toneCost!,
}

/** 可收合的設定區塊。 */
export function Section({
  title,
  defaultOpen = false,
  tone,
  children,
}: {
  title: string
  defaultOpen?: boolean
  tone?: SectionTone
  children: ReactNode
}) {
  return (
    <details className={`${styles.section} ${tone ? TONE_CLASS[tone] : ''}`} open={defaultOpen}>
      <summary>{title}</summary>
      <div className={styles.body}>{children}</div>
    </details>
  )
}
