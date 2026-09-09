import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { Layout } from '../../components/Layout'
import { useAsync } from '../../hooks/useAsync'
import { useLiveQuotes } from '../../hooks/useLiveQuotes'
import { useSnapshot } from '../../hooks/useSnapshot'
import { loadBaselines } from '../../lib/baselines'
import { loadCalendar, tradingDayOrdinal } from '../../lib/calendar'
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
  // 有 query（從回測頁帶設定過來）才傳 seed —— 直接開 /plan 就別動既有計畫
  const seed = useMemo(() => (search ? decodeParams(search) : undefined), [search])
  const [plan, setPlan] = useOperatorPlan(seed)
  const s = plan.strategy

  const hist = useAsync(loadAllFactorHistory, [])
  const bl = useAsync(loadBaselines, [])
  const cal = useAsync(loadCalendar, [])
  const snap = useSnapshot()
  const [copied, setCopied] = useState(false)

  const holidays = cal.status === 'ready' && cal.data ? cal.data.holidays : new Set<string>()

  const names = useMemo(() => {
    const m = new Map<string, string>()
    if (snap.status === 'ready') for (const x of snap.data.stocks) m.set(x.code, x.name)
    return m
  }, [snap])

  const patchStrategy = (p: Partial<typeof s>) => setPlan({ ...plan, strategy: { ...s, ...p } })

  const planJson = useMemo(() => JSON.stringify(toPlanJson(plan), null, 2), [plan])

  // 即時價：持股 + 最新一列的整個 universe（動能排行要用現價重排）
  const liveCodes = useMemo(() => {
    const set = new Set(plan.holdings.map((h) => h.code))
    if (hist.status === 'ready') {
      for (const st of hist.data.at(-1)?.stocks ?? []) set.add(st.code)
    }
    return [...set]
  }, [plan.holdings, hist])
  const { quotes, fetchedAt, isLive } = useLiveQuotes(liveCodes, true)
  const priceOf = useMemo(() => (code: string) => quotes.get(code)?.price ?? null, [quotes])
  const liveTime =
    fetchedAt?.toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Taipei',
    }) ?? ''

  const report = useMemo(() => {
    if (hist.status !== 'ready' || bl.status !== 'ready') return null
    return buildOperatorReport(hist.data, bl.data, toPlanJson(plan), names, holidays, priceOf)
  }, [hist, bl, plan, names, holidays, priceOf])

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
  const staleAsOf =
    snap.status === 'ready' && isLive && report && snap.data.asOf < report.asOfDate
      ? snap.data.asOf
      : null
  const asOfLine = isLive
    ? `現價 Yahoo ${liveTime}（約 15–20 分延遲）· 每晚提醒信讀 GitHub secret`
    : '操作計畫存在這台裝置；每晚提醒信讀 GitHub secret'

  return (
    <Layout asOf={asOfLine}>
      <div className={styles.grid}>
        <div className={styles.panel}>
          <h3>設定</h3>

          {report && (
            <p className={styles.nextDay}>
              下一個台股交易日：<b>{report.nextTradingDay}</b>
              {isLive && (
                <>
                  {' · '}現價 Yahoo <b>{liveTime}</b>
                  {report.momentumIsLive && '（動能已納入現價）'}
                </>
              )}
            </p>
          )}
          {staleAsOf && (
            <p className={styles.hint}>
              ⚠️ 管線資料停在 {staleAsOf}；現價與 skip=0 動能已改用 Yahoo 即時。
            </p>
          )}

          <div className={`${styles.group} ${styles.gTiming}`}>
            <label className={styles.field}>策略上線日</label>
            <input
              type="date"
              value={plan.startDate}
              onChange={(e) => setPlan({ ...plan, startDate: e.target.value })}
            />
            <p className={styles.hint}>
              上線日進場買下方目標清單；之後每逢換股日再依規則調整。例如：上線日設本月 7
              號、換股日設 「每月第一個交易日」，就是 7 號建倉、之後每月月初決定要不要換股。
            </p>

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

            {s.rebalance === 'M' ? (
              <>
                <label className={styles.field}>每月第 {s.rebalanceDay} 個交易日換股</label>
                <div className={styles.radios}>
                  <button
                    data-on={s.rebalanceDay === 1}
                    onClick={() => patchStrategy({ rebalanceDay: 1 })}
                  >
                    每月第一個交易日
                  </button>
                  <button
                    data-on={s.rebalanceDay === tradingDayOrdinal(plan.startDate, holidays)}
                    onClick={() =>
                      patchStrategy({ rebalanceDay: tradingDayOrdinal(plan.startDate, holidays) })
                    }
                  >
                    跟上線日同順位（第 {tradingDayOrdinal(plan.startDate, holidays)}）
                  </button>
                </div>
                <input
                  type="range"
                  min={1}
                  max={23}
                  value={s.rebalanceDay}
                  onChange={(e) => patchStrategy({ rebalanceDay: Number(e.target.value) })}
                />
              </>
            ) : (
              <>
                <label className={styles.field}>每週星期幾換股</label>
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
              </>
            )}
          </div>

          <div className={`${styles.group} ${styles.gStrategy}`}>
            <label className={styles.field}>策略參數</label>
            <p className={styles.strategyLine}>{report?.strategySummary ?? '載入中…'}</p>
            {search && (
              <p className={styles.hint}>✓ 已用回測頁帶來的設定更新策略（持股 / 上線日保留）。</p>
            )}
            <Link to={`/backtest?${strategyQuery}`} className={styles.link}>
              → 回回測頁調整因子 / 檔數 / 停損 / 動能換股 / 多空過濾
            </Link>

            <label className={styles.field}>目前持股</label>
            <HoldingsEditor
              value={plan.holdings}
              names={names}
              onChange={(holdings) => setPlan({ ...plan, holdings })}
            />
          </div>

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
