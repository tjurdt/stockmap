import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { Layout } from '../../components/Layout'
import { useAsync } from '../../hooks/useAsync'
import { useSnapshot } from '../../hooks/useSnapshot'
import { loadBaselines } from '../../lib/baselines'
import { loadAllFactorHistory } from '../../lib/history'
import { toPlanJson, useOperatorPlan } from '../../lib/plan'
import { decodeParams, encodeParams } from '../backtest/strategyParams'
import { HoldingsEditor } from '../signal/HoldingsEditor'
import { buildOperatorReport } from '../signal/report'
import { ReportView } from '../signal/ReportView'
import styles from './planner.module.css'

const WEEKDAYS = [
  ['1', '週一'],
  ['2', '週二'],
  ['3', '週三'],
  ['4', '週四'],
  ['5', '週五'],
] as const

export function PlannerPage() {
  const search = useLocation().search
  const seed = useMemo(() => decodeParams(search), [search])
  const [plan, setPlan] = useOperatorPlan(seed)
  const s = plan.strategy

  const hist = useAsync(loadAllFactorHistory, [])
  const bl = useAsync(loadBaselines, [])
  const snap = useSnapshot()
  const [copied, setCopied] = useState(false)

  const names = useMemo(() => {
    const m = new Map<string, string>()
    if (snap.status === 'ready') for (const x of snap.data.stocks) m.set(x.code, x.name)
    return m
  }, [snap])

  const patchStrategy = (p: Partial<typeof s>) => setPlan({ ...plan, strategy: { ...s, ...p } })

  const planJson = useMemo(() => JSON.stringify(toPlanJson(plan), null, 2), [plan])

  const report = useMemo(() => {
    if (hist.status !== 'ready' || bl.status !== 'ready') return null
    return buildOperatorReport(hist.data, bl.data, toPlanJson(plan), names)
  }, [hist, bl, plan, names])

  const copy = () => {
    navigator.clipboard.writeText(planJson).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      },
      () => setCopied(false),
    )
  }

  const strategyQuery = encodeParams(s)

  return (
    <Layout asOf="操作計畫存在這台裝置；每晚提醒信讀 GitHub secret">
      <div className={styles.grid}>
        <div className={styles.panel}>
          <h3>設定</h3>

          <label className={styles.field}>策略上線日</label>
          <input
            type="date"
            value={plan.startDate}
            onChange={(e) => setPlan({ ...plan, startDate: e.target.value })}
          />
          <p className={styles.hint}>這天之前，提醒信只給「上線當天要買的目標清單」。</p>

          <label className={styles.field}>換股頻率</label>
          <div className={styles.radios}>
            {(['W', 'M'] as const).map((v) => (
              <button
                key={v}
                data-on={s.rebalance === v}
                onClick={() => patchStrategy({ rebalance: v })}
              >
                {v === 'W' ? '每週' : '每月'}
              </button>
            ))}
          </div>

          <label className={styles.field}>
            {s.rebalance === 'M' ? `每月第 ${s.rebalanceDay} 個交易日附近換股` : '每週星期幾換股'}
          </label>
          {s.rebalance === 'M' ? (
            <input
              type="range"
              min={1}
              max={28}
              value={s.rebalanceDay}
              onChange={(e) => patchStrategy({ rebalanceDay: Number(e.target.value) })}
            />
          ) : (
            <div className={styles.radios}>
              {WEEKDAYS.map(([v, label]) => (
                <button
                  key={v}
                  data-on={String(s.rebalanceDay) === v}
                  onClick={() => patchStrategy({ rebalanceDay: Number(v) })}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <label className={styles.field}>策略參數</label>
          <p className={styles.strategyLine}>{report?.strategySummary ?? '載入中…'}</p>
          <Link to={`/backtest?${strategyQuery}`} className={styles.link}>
            → 回回測頁調整因子 / 檔數 / 停損 / 多空過濾
          </Link>

          <label className={styles.field}>目前持股</label>
          <HoldingsEditor
            value={plan.holdings}
            names={names}
            onChange={(holdings) => setPlan({ ...plan, holdings })}
          />

          <hr className={styles.hr} />
          <button className={styles.copyBtn} onClick={copy}>
            {copied ? '✓ 已複製' : '複製設定 JSON'}
          </button>
          <ol className={styles.steps}>
            <li>
              到 GitHub → 這個 repo → <b>Settings</b> → <b>Secrets and variables</b> →{' '}
              <b>Actions</b>
            </li>
            <li>
              新增 / 更新 secret <code>OPERATOR_PLAN</code>，內容貼上剛剛複製的 JSON
            </li>
            <li>
              另外設好 <code>MAIL_USERNAME</code>（Gmail）、<code>MAIL_PASSWORD</code>
              （應用程式密碼）、
              <code>MAIL_TO</code>（收件人）
            </li>
            <li>每個交易日 19:00（台北）會寄出下方這份報告</li>
          </ol>
          <details className={styles.raw}>
            <summary>看 JSON</summary>
            <pre>{planJson}</pre>
          </details>
        </div>

        <div className={styles.preview}>
          <h3>提醒信預覽（依最新收盤資料）</h3>
          {hist.status === 'loading' && <p>載入因子歷史中…</p>}
          {hist.status === 'error' && <p>讀不到因子歷史。</p>}
          {report ? (
            <ReportView report={report} factor={s.factor} />
          ) : (
            hist.status === 'ready' && <p>因子歷史不足，無法產生報告。</p>
          )}
        </div>
      </div>
    </Layout>
  )
}
