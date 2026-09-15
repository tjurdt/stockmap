/** 操作計畫的設定（上線日 / 換股時點 / 策略連結 / 提醒信 JSON）—— 預設收合，不擋住結論。 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { tradingDayOrdinal } from '../../lib/calendar'
import { toPlanJson, type PlanState } from '../../lib/plan'
import { encodeParams } from '../backtest/strategyParams'
import styles from './planner.module.css'

const WEEKDAYS = [
  [1, '週一'],
  [2, '週二'],
  [3, '週三'],
  [4, '週四'],
  [5, '週五'],
] as const

export function PlanSettings({
  plan,
  setPlan,
  holidays,
  strategySummary,
  seeded,
}: {
  plan: PlanState
  setPlan: (next: PlanState) => void
  holidays: Set<string>
  strategySummary: string
  /** 這次是從回測頁帶設定過來的 */
  seeded: boolean
}) {
  const s = plan.strategy
  const [copied, setCopied] = useState(false)
  const planJson = useMemo(() => JSON.stringify(toPlanJson(plan), null, 2), [plan])
  const patch = (p: Partial<typeof s>) => setPlan({ ...plan, strategy: { ...s, ...p } })

  const copy = () => {
    navigator.clipboard.writeText(planJson).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      },
      () => setCopied(false),
    )
  }

  const startOrdinal = tradingDayOrdinal(plan.startDate, holidays)

  return (
    <details className={styles.fold}>
      <summary>⚙ 設定（上線日、換股時點、策略、提醒信）</summary>
      <div className={`${styles.foldBody} ${styles.settingsGrid}`}>
        <div className={`${styles.group} ${styles.gTiming}`}>
          <label className={styles.field}>策略上線日</label>
          <input
            type="date"
            value={plan.startDate}
            onChange={(e) => setPlan({ ...plan, startDate: e.target.value })}
          />
          <p className={styles.hint}>
            上線日當天照目標清單進場；之後每逢換股日再依規則調整。例如上線日設本月 7
            號、換股日設「每月第一個交易日」，就是 7 號建倉、之後每月月初決定要不要換股。
          </p>

          <label className={styles.field}>多久換一次股</label>
          <div className={styles.radios}>
            {(['W', 'M'] as const).map((v) => (
              <button key={v} data-on={s.rebalance === v} onClick={() => patch({ rebalance: v })}>
                {v === 'W' ? '每週' : '每月'}
              </button>
            ))}
          </div>

          {s.rebalance === 'M' ? (
            <>
              <label className={styles.field}>每月第 {s.rebalanceDay} 個交易日換股</label>
              <div className={styles.radios}>
                <button data-on={s.rebalanceDay === 1} onClick={() => patch({ rebalanceDay: 1 })}>
                  每月第一個交易日
                </button>
                <button
                  data-on={s.rebalanceDay === startOrdinal}
                  onClick={() => patch({ rebalanceDay: startOrdinal })}
                >
                  跟上線日同順位（第 {startOrdinal}）
                </button>
              </div>
              <input
                type="range"
                min={1}
                max={23}
                value={s.rebalanceDay}
                onChange={(e) => patch({ rebalanceDay: Number(e.target.value) })}
              />
            </>
          ) : (
            <>
              <label className={styles.field}>每週星期幾換股</label>
              <div className={styles.radios}>
                {WEEKDAYS.map(([v, label]) => (
                  <button
                    key={v}
                    data-on={s.rebalanceDay === v}
                    onClick={() => patch({ rebalanceDay: v })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className={`${styles.group} ${styles.gStrategy}`}>
          <label className={styles.field}>策略參數</label>
          <p className={styles.strategyLine}>{strategySummary}</p>
          {seeded && (
            <p className={styles.hint}>✓ 已套用回測頁帶來的設定（買賣紀錄 / 上線日保留）。</p>
          )}
          <Link to={`/backtest?${encodeParams(s)}`} className={styles.link}>
            → 回回測頁調整因子 / 檔數 / 停損 / 動能換股 / 多空過濾
          </Link>
          <p className={styles.hint}>
            這頁的所有訊號都照這組參數算；想換規則請在回測頁驗證過再帶回來。
          </p>
        </div>

        <div className={`${styles.group} ${styles.gExport}`}>
          <label className={styles.field}>每晚提醒信</label>
          <button className={styles.copyBtn} onClick={copy}>
            {copied ? '✓ 已複製' : '複製設定 JSON'}
          </button>
          <ol className={styles.mailSteps}>
            <li>
              GitHub → 這個 repo → <b>Settings</b> → <b>Secrets and variables</b> → <b>Actions</b>
            </li>
            <li>
              新增 / 更新 secret <code>OPERATOR_PLAN</code>，貼上剛剛複製的 JSON
            </li>
            <li>
              另外設好 <code>MAIL_USERNAME</code>、<code>MAIL_PASSWORD</code>、<code>MAIL_TO</code>
            </li>
            <li>每個交易日 19:00（台北）寄出與這頁同一份結論</li>
          </ol>
          <details className={styles.raw}>
            <summary>看 JSON</summary>
            <pre>{planJson}</pre>
          </details>
        </div>
      </div>
    </details>
  )
}
