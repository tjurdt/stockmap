/**
 * 我的績效 —— 買賣紀錄 → 實際報酬，跟大盤、回測放在一起比。
 * 所有數字來自 `lib/performance.ts::buildPerformance`；這頁只負責講成人話。
 */
import { useMemo, useState } from 'react'

import { InfoHint } from '../../components/InfoHint'
import { Layout } from '../../components/Layout'
import { useAsync } from '../../hooks/useAsync'
import { useLiveMarket } from '../../hooks/useLiveMarket'
import { useSnapshot } from '../../hooks/useSnapshot'
import { loadBaselines } from '../../lib/baselines'
import { loadAllFactorHistory } from '../../lib/history'
import { freshnessLabel } from '../../lib/liveRow'
import { baselineStyle, strategyStyle } from '../../lib/palette'
import { buildPerformance, sameFlowValue } from '../../lib/performance'
import { useOperatorPlan } from '../../lib/plan'
import { EquityChart } from '../backtest/EquityChart'
import { runBacktest } from '../backtest/engine'
import { costsOf, readBacktestPrefs } from '../backtest/prefs'
import { TradeLog } from '../planner/TradeLog'
import styles from '../planner/planner.module.css'

const pct = (v: number | null | undefined) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
const money = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v).toLocaleString()}`
const cls = (v: number | null | undefined) =>
  v == null || v === 0 ? undefined : v > 0 ? styles.pos : styles.neg

export function PerformancePage() {
  const [plan, setPlan] = useOperatorPlan()
  const hist = useAsync(loadAllFactorHistory, [])
  const bl = useAsync(loadBaselines, [])
  const snap = useSnapshot()
  const costs = useMemo(() => costsOf(readBacktestPrefs()), [])

  const names = useMemo(() => {
    const m = new Map<string, string>()
    if (snap.status === 'ready') for (const x of snap.data.stocks) m.set(x.code, x.name)
    return m
  }, [snap])

  const tradedCodes = useMemo(() => [...new Set(plan.trades.map((t) => t.code))], [plan.trades])
  const market = useLiveMarket(hist.status === 'ready' ? hist.data : [], tradedCodes)
  const baselines = useMemo(() => (bl.status === 'ready' ? bl.data : []), [bl])

  const report = useMemo(
    () => buildPerformance(plan.trades, market.rows, baselines, costs),
    [plan.trades, market.rows, baselines, costs],
  )

  // 同一段時間、照規則跑的回測（用目前操作計畫的策略）
  const backtest = useMemo(() => {
    if (!report || market.rows.length < 2) return null
    const r = runBacktest(
      market.rows,
      { ...plan.strategy, costBps: 0, ...costs, startDate: report.firstDate },
      baselines,
    )
    if (r.dates.length < 2) return null
    const at = (d: string): number | null => {
      let v: number | null = null
      for (let i = 0; i < r.dates.length && r.dates[i]! <= d; i++) v = r.equity[i]!
      return v ?? r.equity[0]!
    }
    const end = sameFlowValue(report.flows, at, report.asOf)
    return {
      periodReturn: r.metrics.totalReturn,
      pl: end == null ? null : end - report.contributed,
      index: report.dates.map((d) => at(d)),
    }
  }, [report, market.rows, plan.strategy, costs, baselines])

  const [hover, setHover] = useState<number | null>(null)
  const twii = report?.benchmarks.find((b) => b.key === 'twiiTR')
  const beat = twii && report ? report.pl - twii.pl : null

  const series = useMemo(() => {
    if (!report) return []
    const s = [{ label: '我的實際', values: report.twrIndex, ...strategyStyle(0)! }]
    if (backtest)
      s.push({ label: '照規則回測', values: backtest.index as number[], ...strategyStyle(1)! })
    for (const b of report.benchmarks) {
      s.push({
        label: b.label,
        values: b.index as number[],
        ...baselineStyle(b.key === 'twiiTR' ? 'twii' : 'e0050'),
      })
    }
    return s
  }, [report, backtest])

  const asOf = hist.status === 'ready' ? freshnessLabel(market, market.phase) : '載入中…'

  return (
    <Layout asOf={asOf}>
      <div className={styles.page}>
        {report ? (
          <>
            <div
              className={`${styles.verdict} ${report.pl >= 0 ? styles.verdictGain : styles.verdictLoss}`}
            >
              <p className={styles.verdictLabel}>
                {report.firstDate} ～ {report.asOf}
                {market.provisionalDate === report.asOf ? '（暫定）' : ''}
              </p>
              <p className={styles.verdictHead}>
                {money(report.pl)} 元（{pct(report.mwr)}）
              </p>
              {twii && beat != null && (
                <p className={styles.verdictDetail}>
                  同樣的錢、同樣的日子買大盤會是 {money(twii.pl)} 元 →{' '}
                  <b>
                    {beat >= 0 ? '贏' : '輸'}大盤 {Math.abs(Math.round(beat)).toLocaleString()} 元
                  </b>
                </p>
              )}
            </div>

            <div className={styles.facts}>
              <div className={styles.fact}>
                <p className={styles.factLabel}>
                  策略報酬（時間加權）
                  <InfoHint label="時間加權報酬是什麼">
                    把每天的漲跌幅連乘，跟你每次投入多少無關，所以<b>可以直接跟大盤、回測比</b>
                    ，用來判斷策略與執行好不好。
                  </InfoHint>
                </p>
                <p className={`${styles.factValue} ${cls(report.twr)}`}>{pct(report.twr)}</p>
                <p className={styles.factNote}>大盤同期 {pct(twii?.periodReturn)}</p>
              </div>
              <div className={styles.fact}>
                <p className={styles.factLabel}>
                  我的錢（資金加權）
                  <InfoHint label="資金加權報酬是什麼">
                    損益 ÷ 期間平均投入資金，晚投入的錢只算它在場內的時間。回答「我的錢實際賺了幾
                    %」。賺錢時放大部位，這個數字就會比時間加權好，反之亦然。
                  </InfoHint>
                </p>
                <p className={`${styles.factValue} ${cls(report.mwr)}`}>{pct(report.mwr)}</p>
                <p className={styles.factNote}>
                  {report.annualized != null ? `年化 ${pct(report.annualized)}` : '未滿一年不年化'}
                </p>
              </div>
              <div className={styles.fact}>
                <p className={styles.factLabel}>目前總資產</p>
                <p className={styles.factValue}>{Math.round(report.endValue).toLocaleString()}</p>
                <p className={styles.factNote}>
                  投入 {Math.round(report.contributed).toLocaleString()}・現金{' '}
                  {Math.round(report.cash).toLocaleString()}
                </p>
              </div>
              <div className={styles.fact}>
                <p className={styles.factLabel}>交易成本</p>
                <p className={styles.factValue}>
                  {(report.feesPaid + report.taxPaid).toLocaleString()}
                </p>
                <p className={styles.factNote}>
                  手續費 {report.feesPaid.toLocaleString()}・稅 {report.taxPaid.toLocaleString()}
                </p>
              </div>
            </div>

            <div className={styles.card}>
              <h3>
                跟誰比
                <InfoHint label="這張表怎麼算">
                  <ul>
                    <li>
                      <b>期間報酬</b>：時間加權，不受投入金額影響。
                    </li>
                    <li>
                      <b>同金流損益</b>：把你每次新投入的錢，同一天改投入該標的，到今天賺賠多少元。
                    </li>
                    <li>
                      新投入＝買進時帳上現金不夠的部分；賣出的錢留在帳上。提領與配息沒有記錄，
                      所以持股領到的現金股利不在你的損益裡，大盤和 0050 則是含息。
                    </li>
                    <li>「照規則回測」用目前操作計畫的策略，從你第一筆成交日開始跑。</li>
                  </ul>
                </InfoHint>
              </h3>
              <div className={styles.scroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th />
                      <th>期間報酬</th>
                      <th>同金流損益</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <b>我的實際</b>
                      </td>
                      <td className={cls(report.twr)}>{pct(report.twr)}</td>
                      <td className={cls(report.pl)}>{money(report.pl)}</td>
                    </tr>
                    {backtest && (
                      <tr>
                        <td>照規則回測</td>
                        <td className={cls(backtest.periodReturn)}>{pct(backtest.periodReturn)}</td>
                        <td className={cls(backtest.pl)}>
                          {backtest.pl == null ? '—' : money(backtest.pl)}
                        </td>
                      </tr>
                    )}
                    {report.benchmarks.map((b) => (
                      <tr key={b.key}>
                        <td>{b.label}</td>
                        <td className={cls(b.periodReturn)}>{pct(b.periodReturn)}</td>
                        <td className={cls(b.pl)}>{money(b.pl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {report.dates.length > 1 && (
                <EquityChart
                  dates={report.dates}
                  series={series}
                  cursor={hover}
                  onCursor={setHover}
                />
              )}
            </div>

            <div className={styles.card}>
              <h3>每段持股</h3>
              <div className={styles.scroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>股票</th>
                      <th>報酬</th>
                      <th>同期大盤</th>
                      <th>損益</th>
                      <th>期間</th>
                      <th>投入</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.segments.map((s) => (
                      <tr key={`${s.code}${s.startDate}`}>
                        <td>
                          {s.code} {names.get(s.code) ?? ''}
                        </td>
                        <td className={cls(s.ret)}>{pct(s.ret)}</td>
                        <td className={cls(s.benchRet)}>{pct(s.benchRet)}</td>
                        <td className={cls(s.pl)}>{money(s.pl)}</td>
                        <td className={styles.muted}>
                          {s.startDate.slice(5)} ～ {s.endDate?.slice(5) ?? '持有中'}
                        </td>
                        <td>{Math.round(s.cost).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className={styles.card}>
            <h3>我的績效</h3>
            <p className={styles.note}>
              把每筆成交記在下面，就能算出實際報酬，並跟大盤、回測比較。每次投入金額不同也沒關係。
            </p>
          </div>
        )}

        <TradeLog
          trades={plan.trades}
          onChange={(trades) => setPlan({ ...plan, trades })}
          names={names}
          priceOf={market.priceOf}
          defaultDate={market.rows.at(-1)?.date ?? new Date().toISOString().slice(0, 10)}
          costs={costs}
        />
      </div>
    </Layout>
  )
}
