/**
 * 操作計畫 —— 「明天要幹嘛」的單一入口（舊的 /signal 已併進來）。
 *
 * 所有訊號都來自 `features/signal/report.ts::buildOperatorReport`，與每晚提醒信同一份邏輯；
 * 這頁不自己算任何規則，只負責把結論講成人話。
 *
 * 資料新鮮度：因子歷史（官方收盤）之外，再用最新報價補一列暫定的當日資料
 * （`hooks/useLiveMarket`），所以盤中與盤後都不會停在昨天。
 */
import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'

import { Layout } from '../../components/Layout'
import { useAsync } from '../../hooks/useAsync'
import { useLiveMarket } from '../../hooks/useLiveMarket'
import { useSnapshot } from '../../hooks/useSnapshot'
import { loadBaselines } from '../../lib/baselines'
import { loadCalendar } from '../../lib/calendar'
import { loadAllFactorHistory } from '../../lib/history'
import { freshnessLabel } from '../../lib/liveRow'
import { METRICS } from '../../lib/metrics'
import { holdingsOf, toPlanJson, useOperatorPlan } from '../../lib/plan'
import { decodeParams } from '../backtest/strategyParams'
import { buildOperatorReport } from '../signal/report'
import { ReportView } from '../signal/ReportView'
import { HoldingsPanel } from './HoldingsPanel'
import { PlanSettings } from './PlanSettings'
import styles from './planner.module.css'
import { SwapWatchPanel } from './SwapWatchPanel'
import { TomorrowCard } from './TomorrowCard'
import { TradeLog } from './TradeLog'

const price = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 2 })

export function PlannerPage() {
  const search = useLocation().search
  // 有 query（從回測頁帶設定過來）才傳 seed —— 直接開 /plan 就別動既有計畫
  const seed = useMemo(() => (search ? decodeParams(search) : undefined), [search])
  const [plan, setPlan] = useOperatorPlan(seed)

  const hist = useAsync(loadAllFactorHistory, [])
  const bl = useAsync(loadBaselines, [])
  const cal = useAsync(loadCalendar, [])
  const snap = useSnapshot()

  const holidays = cal.status === 'ready' && cal.data ? cal.data.holidays : new Set<string>()
  const rows = hist.status === 'ready' ? hist.data : []

  const names = useMemo(() => {
    const m = new Map<string, string>()
    if (snap.status === 'ready') for (const x of snap.data.stocks) m.set(x.code, x.name)
    return m
  }, [snap])

  // 手上持有但可能已掉出選股池的股票也要報價
  const holdingCodes = useMemo(() => holdingsOf(plan.trades).map((h) => h.code), [plan.trades])
  const market = useLiveMarket(rows, holdingCodes)

  // 報告偏重（要掃過整段歷史）→ 只在真正會改變結果的東西變了才重算
  const { rows: liveRows, priceOf, provisionalDate } = market
  const report = useMemo(() => {
    if (hist.status !== 'ready' || bl.status !== 'ready') return null
    return buildOperatorReport(liveRows, bl.data, toPlanJson(plan), names, {
      holidays,
      priceOf,
      provisionalDate,
    })
  }, [hist.status, bl, plan, names, holidays, liveRows, priceOf, provisionalDate])

  const asOf = hist.status === 'ready' ? freshnessLabel(market, market.phase) : '載入中…'

  if (hist.status === 'loading') return <Layout asOf={asOf}>載入中…</Layout>
  if (hist.status === 'error' || !report) {
    return (
      <Layout asOf={asOf}>
        <p>
          讀不到因子歷史（<code>data/history/</code>）。請確認 <code>fetch-twse</code> workflow
          至少成功跑過一次。
        </p>
      </Layout>
    )
  }

  const factor = plan.strategy.factor

  return (
    <Layout asOf={asOf}>
      <div className={styles.page}>
        {market.provisionalDate && (
          <p className={styles.note} style={{ margin: 0 }}>
            ※ 官方收盤檔還停在 <b>{market.officialDate}</b>；下面所有數字已用{' '}
            <b>{market.provisionalDate}</b> 的最新報價
            {market.phase === 'open' ? '（盤中，約 15 分鐘延遲）' : '（收盤價）'}
            補算成暫定值（{market.quoted} 檔有報價）。等盤後資料入庫會自動換回官方數字。
          </p>
        )}
        {!market.provisionalDate && market.failed && (
          <p className={styles.stale}>
            抓不到最新報價，畫面停在官方收盤資料 <b>{market.officialDate}</b>。
            若今天已收盤，代表報價 proxy 沒回應（見 <code>worker/</code>）。
          </p>
        )}

        <TomorrowCard report={report} />

        <HoldingsPanel report={report} factor={factor} />

        <SwapWatchPanel report={report} factor={factor} />

        <div className={styles.card}>
          <h3>
            目標名單{' '}
            <span className={styles.sub}>
              依 {report.factorLabel} 排名（{report.asOfDate}
              {report.provisionalDate ? '，暫定' : ' 收盤'}）
            </span>
          </h3>
          {report.targets.length === 0 ? (
            <p className={styles.note}>（空頭，這輪不持股）</p>
          ) : (
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>代號 / 名稱</th>
                    <th>{report.factorLabel}</th>
                    <th>現價</th>
                    <th>目標比重</th>
                    <th>我有嗎</th>
                  </tr>
                </thead>
                <tbody>
                  {report.targets.map((t, i) => {
                    const held = report.holdings.some((h) => h.code === t.code)
                    return (
                      <tr key={t.code}>
                        <td>{i + 1}</td>
                        <td>
                          {t.code} {t.name}
                        </td>
                        <td>{METRICS[factor].fmt(t.factor)}</td>
                        <td>{price(t.price)}</td>
                        <td>{(t.weight * 100).toFixed(0)}%</td>
                        <td className={held ? styles.ok : styles.warn}>
                          {held ? '已持有' : '要買進'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className={styles.note}>
            這是「假如現在就換股」的名單。真正要照著做的時機，以上面的結論為準 ——
            非換股日看到名單有差異是正常的。
          </p>
        </div>

        <TradeLog
          trades={plan.trades}
          onChange={(trades) => setPlan({ ...plan, trades })}
          names={names}
          priceOf={market.priceOf}
          defaultDate={report.asOfDate}
        />

        <PlanSettings
          plan={plan}
          setPlan={setPlan}
          holidays={holidays}
          strategySummary={report.strategySummary}
          seeded={Boolean(search)}
        />

        <details className={styles.fold}>
          <summary>📧 每晚提醒信預覽（含動能排行 vs 我的持股）</summary>
          <div className={styles.foldBody}>
            <ReportView report={report} factor={factor} />
          </div>
        </details>
      </div>
    </Layout>
  )
}
