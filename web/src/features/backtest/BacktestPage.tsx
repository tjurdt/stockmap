import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { InfoHint } from '../../components/InfoHint'
import { Layout } from '../../components/Layout'
import { useAsync } from '../../hooks/useAsync'
import { useLiveMarket } from '../../hooks/useLiveMarket'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useSnapshot } from '../../hooks/useSnapshot'
import { alignNormalized, loadBaselines } from '../../lib/baselines'
import { loadAllFactorHistory } from '../../lib/history'
import { baselineStyle, strategyStyle } from '../../lib/palette'
import { factorLabel } from '../../lib/metrics'
import { readStoredPlan, useOperatorPlan } from '../../lib/plan'
import { strategySummary } from '../signal/report'
import { BacktestPanel } from './BacktestPanel'
import { CompareTable, type CompareRow } from './CompareTable'
import { sameParams, useLockedStrategies } from './compare'
import { DistributionTab } from './DistributionTab'
import type { DistMode } from './distribution'
import { poolAtDate, runBacktest, type BacktestConfig } from './engine'
import { EquityChart } from './EquityChart'
import { LockedBar } from './LockedBar'
import { MethodNotes } from './MethodNotes'
import { costsOf, COST_REV, initialStrategy, readBacktestPrefs, writeBacktestPrefs } from './prefs'
import { cls, pct, Stat } from './Stat'
import { toStrategyParams, type StrategyParams } from './strategyParams'
import styles from './backtest.module.css'

type ResultTab = 'perf' | 'dist' | 'hold' | 'notes'
const TABS: [ResultTab, string][] = [
  ['perf', '績效'],
  ['dist', '報酬分布'],
  ['hold', '持股明細'],
  ['notes', '方法說明'],
]

function strategyLabel(p: StrategyParams): string {
  return `${factorLabel(p).replace(/\s*\(.*\)/, '')}·前${p.topN}·${
    p.rebalance === 'M' ? '月' : '週'
  }${p.stopType !== 'none' ? `·停${p.stopPct}` : ''}${p.takeProfitPct > 0 ? `·利${p.takeProfitPct}` : ''}${
    p.regime !== 'off' ? '·多空' : ''
  }`
}

export function BacktestPage() {
  const state = useAsync(loadAllFactorHistory, [])
  const baselines = useAsync(loadBaselines, [])
  const snap = useSnapshot()
  const navigate = useNavigate()
  const search = useLocation().search
  const stored = useMemo(() => readBacktestPrefs(), [])
  const [plan, savePlan] = useOperatorPlan()
  const [hasPlan, setHasPlan] = useState(() => readStoredPlan() != null)
  const [cfg, setCfg] = useState<BacktestConfig>(() => ({
    costBps: 0,
    ...costsOf(stored),
    ...initialStrategy(search, stored, hasPlan ? plan.strategy : null),
  }))
  const patch = (p: Partial<BacktestConfig>) => setCfg((c) => ({ ...c, ...p }))
  // 分享連結的 query 只在開頁時用一次：留在網址上的話，重新整理 / 上一頁都會蓋掉之後的調整
  useEffect(() => {
    if (search) navigate('/backtest', { replace: true })
  }, [search, navigate])
  const [tab, setTab] = useState<ResultTab>('perf')
  const [refs, setRefs] = useState(
    () => stored?.refs ?? { twii: true, e0050: true, e00632r: false },
  )
  const [windowMonths, setWindowMonths] = useState(() => stored?.windowMonths ?? 12)
  const [distMonths, setDistMonths] = useState(() => stored?.distMonths ?? 12)
  const [distMode, setDistMode] = useState<DistMode>(() => stored?.distMode ?? 'aligned')
  const { locked, add, remove, clear } = useLockedStrategies()
  const isMobile = useMediaQuery('(max-width: 820px)')

  const names = useMemo(() => {
    const m = new Map<string, string>()
    if (snap.status === 'ready') for (const s of snap.data.stocks) m.set(s.code, s.name)
    return m
  }, [snap])

  // 官方收盤檔盤後才更新 → 用最新報價補一列暫定的當日資料，回測 / 目標名單才不會停在昨天
  const officialHistory = state.status === 'ready' ? state.data : []
  const market = useLiveMarket(officialHistory)
  const history = market.rows
  const universeSize = useMemo(
    () => history.reduce((m, r) => Math.max(m, r.stocks.length), 0),
    [history],
  )
  const months = useMemo(
    () => [...new Set(history.map((r) => r.date.slice(0, 7)))].sort(),
    [history],
  )

  const [startMonth, setStartMonth] = useState('')
  const [endMonth, setEndMonth] = useState('')
  useEffect(() => {
    if (months.length && !startMonth) {
      const s = stored?.startMonth && months.includes(stored.startMonth) ? stored.startMonth : null
      const e = stored?.endMonth && months.includes(stored.endMonth) ? stored.endMonth : null
      setStartMonth(s ?? months[Math.max(0, months.length - 37)]!)
      setEndMonth(e ?? months.at(-1)!)
    }
  }, [months, startMonth, stored])
  const quickRange = (yrs: number | 'all') => {
    if (!months.length) return
    setEndMonth(months.at(-1)!)
    setStartMonth(yrs === 'all' ? months[0]! : months[Math.max(0, months.length - yrs * 12 - 1)]!)
  }

  const range = useMemo(
    () => ({
      startDate: startMonth ? `${startMonth}-01` : undefined,
      endDate: endMonth ? `${endMonth}-31` : undefined,
    }),
    [startMonth, endMonth],
  )

  const blData = baselines.status === 'ready' ? baselines.data : []
  const result = useMemo(
    () => (history.length > 1 ? runBacktest(history, { ...cfg, ...range }, blData) : null),
    [history, cfg, range, blData],
  )

  // 鎖定策略：用目前區間各自重算
  const lockedResults = useMemo(
    () =>
      history.length > 1
        ? locked.map((l) =>
            runBacktest(
              history,
              { ...l.params, costBps: 0, feeBps: cfg.feeBps, taxBps: cfg.taxBps, ...range },
              blData,
            ),
          )
        : [],
    [history, locked, range, blData, cfg.feeBps, cfg.taxBps],
  )

  const span = result?.dates.length ? `${result.dates[0]} ~ ${result.dates.at(-1)}` : ''

  const [hover, setHover] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const cursor = pinned ?? hover

  const view = useMemo(() => {
    if (!result) return null
    const idx = Math.min(result.dates.length - 1, Math.max(0, cursor ?? result.dates.length - 1))
    const date = result.dates[idx]!
    const dateIdx = new Map(result.dates.map((d, i) => [d, i]))
    const markers = result.holdings
      .map((h) => dateIdx.get(h.tradeDate))
      .filter((i): i is number => i !== undefined)
    const active = [...result.holdings].reverse().find((h) => h.tradeDate && h.tradeDate <= date)
    // 這天實際持有的代號（已反映停損 / 轉空清倉，不是排程換股當時決定的名單）
    const heldList = result.dailyHoldings[idx] ?? []
    const held = new Set(heldList)
    // 這次換股決定的名單裡，已經停損 / 清倉出場、所以不在 heldList 的代號 —— 解釋兩者的落差
    const exitedSinceRebalance = active
      ? result.exitEvents.filter(
          (e) => active.codes.includes(e.code) && e.date > active.tradeDate && e.date <= date,
        )
      : []
    const pool = poolAtDate(history, date, cfg.poolTopN)
    return { date, markers, held, heldList, active, exitedSinceRebalance, pool }
  }, [result, cursor, history, cfg.poolTopN])

  const poolShown = Math.min(cfg.poolTopN ?? 0, universeSize || (cfg.poolTopN ?? 0))
  const params = useMemo(() => toStrategyParams(cfg), [cfg])
  const isPlan = hasPlan && sameParams(params, plan.strategy)

  const applyToPlan = () => {
    if (!window.confirm('把操作計畫換成這組設定？之後的買賣訊號會跟著變。')) return
    savePlan({ ...plan, strategy: params })
    setHasPlan(true)
    navigate('/plan')
  }

  // 記憶設定到這台裝置（startMonth 還沒定好前不寫）
  useEffect(() => {
    if (!startMonth) return
    writeBacktestPrefs({
      params,
      feeBps: cfg.feeBps ?? 0,
      taxBps: cfg.taxBps ?? 0,
      costRev: COST_REV,
      startMonth,
      endMonth,
      refs,
      distMonths,
      distMode,
      windowMonths,
    })
  }, [cfg, params, startMonth, endMonth, refs, distMonths, distMode, windowMonths])

  const series = useMemo(() => {
    type S = {
      label: string
      values: (number | null)[]
      color: string
      dash?: string
      width: number
    }
    if (!result) return [] as S[]
    // 策略吃類別色（固定順序、不循環）；基準線一律中性灰 + 各自的虛線樣式，見 lib/palette.ts
    const s: S[] = [{ label: '策略', values: result.equity, ...strategyStyle(0)! }]
    lockedResults.forEach((r, i) => {
      const style = strategyStyle(i + 1)
      if (style) s.push({ label: locked[i]!.label, values: r.equity, ...style })
    })
    if (locked.length === 0) {
      s.push({
        label: `基準（前 ${poolShown} 等權）`,
        values: result.benchmark,
        ...baselineStyle('pool'),
      })
    }
    const refSeries = [
      ['twii', 'twiiTR', '大盤(報酬)'],
      ['e0050', 'e0050', '0050'],
      ['e00632r', 'e00632r', '台灣50反1'],
    ] as const
    for (const [key, field, label] of refSeries) {
      if (!refs[key]) continue
      const v = alignNormalized(blData, result.dates, field)
      if (v) s.push({ label, values: v, ...baselineStyle(key) })
    }
    return s
  }, [result, lockedResults, locked, blData, refs, poolShown])

  const compareRows: CompareRow[] = useMemo(() => {
    if (!result || locked.length === 0) return []
    return [
      {
        label: '目前策略',
        color: strategyStyle(0)!.color,
        metrics: result.metrics,
        hasRegime: (cfg.regime ?? 'off') !== 'off',
      },
      ...lockedResults.map((r, i) => ({
        label: locked[i]!.label,
        color: strategyStyle(i + 1)?.color ?? 'var(--muted)',
        metrics: r.metrics,
        hasRegime: locked[i]!.params.regime !== 'off',
      })),
    ]
  }, [result, lockedResults, locked, cfg.regime])

  const twiiIndex = result ? alignNormalized(blData, result.dates, 'twiiTR') : null
  const twiiReturn = twiiIndex?.at(-1) != null ? twiiIndex.at(-1)! - 1 : null

  return (
    <Layout
      asOf={
        span &&
        `回測區間 ${span}${market.provisionalDate ? `（含 ${market.provisionalDate} 暫定當日資料）` : ''}`
      }
    >
      <div className={styles.layout}>
        <details className={styles.panelWrap} open={!isMobile}>
          <summary>⚙ 回測設定</summary>
          <div className={styles.panel}>
            <BacktestPanel
              cfg={cfg}
              patch={patch}
              months={months}
              startMonth={startMonth}
              endMonth={endMonth}
              setStartMonth={setStartMonth}
              setEndMonth={setEndMonth}
              quickRange={quickRange}
              poolShown={poolShown}
            />
          </div>
        </details>

        <div className={styles.main}>
          {state.status === 'loading' && <p>載入因子歷史中…</p>}
          {state.status === 'error' && <p>讀不到因子歷史：{String(state.error)}</p>}
          {state.status === 'ready' && !result && <p>因子歷史資料不足，無法回測。</p>}

          {result && view && (
            <>
              <div className={styles.strategyBar}>
                <p className={styles.strategyText}>{strategySummary(params)}</p>
                <div className={styles.strategyActions}>
                  {isPlan ? (
                    <span className={styles.planBadge}>✓ 這就是你的操作計畫</span>
                  ) : (
                    <>
                      <button className={styles.primaryBtn} onClick={applyToPlan}>
                        套用到操作計畫
                      </button>
                      {hasPlan && (
                        <button
                          onClick={() => setCfg((c) => ({ ...c, ...plan.strategy }))}
                          title="把左邊設定換回操作計畫目前用的那組"
                        >
                          載入操作計畫
                        </button>
                      )}
                    </>
                  )}
                  <button
                    disabled={locked.length >= 4}
                    onClick={() => add(params, strategyLabel(params))}
                  >
                    加入比較{locked.length >= 4 ? '（已滿 4）' : ''}
                  </button>
                </div>
              </div>

              <LockedBar
                locked={locked}
                colorOf={(i) => strategyStyle(i + 1)?.color ?? 'var(--muted)'}
                onRemove={remove}
                onClear={clear}
              />

              <div className={styles.stats}>
                <Stat
                  label="總報酬"
                  value={pct(result.metrics.totalReturn)}
                  klass={cls(result.metrics.totalReturn)}
                />
                {twiiReturn != null && (
                  <Stat label="大盤同期" value={pct(twiiReturn)} klass={cls(twiiReturn)} />
                )}
                <Stat
                  label="年化報酬"
                  value={pct(result.metrics.cagr)}
                  klass={cls(result.metrics.cagr)}
                />
                <Stat label="最大回撤" value={pct(result.metrics.maxDrawdown)} klass={styles.neg} />
              </div>

              <div className={styles.tabs} role="tablist">
                {TABS.map(([k, label]) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={tab === k}
                    data-on={tab === k}
                    onClick={() => setTab(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'perf' && (
                <>
                  <EquityChart
                    dates={result.dates}
                    series={series}
                    markers={view.markers}
                    regime={cfg.regime !== 'off' ? result.regime : undefined}
                    cursor={cursor}
                    onCursor={setHover}
                    onPin={(i) => setPinned((p) => (p === i ? null : i))}
                  />
                  <p className={styles.sub} style={{ marginTop: 4 }}>
                    {(
                      [
                        ['twii', '大盤(報酬)'],
                        ['e0050', '0050'],
                        ['e00632r', '台灣50反1'],
                      ] as const
                    ).map(([k, label]) => (
                      <label key={k} className={styles.refToggle}>
                        <input
                          type="checkbox"
                          checked={refs[k]}
                          onChange={(e) => setRefs((r) => ({ ...r, [k]: e.target.checked }))}
                        />
                        {label}
                      </label>
                    ))}
                    {view.date} 持有{' '}
                    {view.heldList.length
                      ? view.heldList.map((c) => `${c} ${names.get(c) ?? ''}`.trim()).join('、')
                      : '現金或反1'}
                    <InfoHint label="圖怎麼看">
                      虛線＝換股成交日，淡色底＝空頭。移到曲線看任一天，點一下鎖定、再點一下解開。
                    </InfoHint>
                    {pinned != null && (
                      <button className={styles.unpin} onClick={() => setPinned(null)}>
                        📌 {result.dates[pinned]} ✕
                      </button>
                    )}
                  </p>

                  {compareRows.length > 0 && <CompareTable rows={compareRows} />}

                  <details className={styles.moreStats}>
                    <summary>更多指標</summary>
                    <div className={styles.stats}>
                      <Stat
                        label={`前 ${poolShown} 等權報酬`}
                        value={pct(result.metrics.benchmarkReturn)}
                        klass={cls(result.metrics.benchmarkReturn)}
                      />
                      <Stat label="夏普值" value={result.metrics.sharpe.toFixed(2)} />
                      <Stat label="年化波動" value={pct(result.metrics.volatility)} />
                      <Stat
                        label="平均換手率"
                        value={`${(result.metrics.turnover * 100).toFixed(0)}%`}
                      />
                      <Stat
                        label="換股 / 停損 / 停利"
                        value={`${result.metrics.rebalances} / ${result.metrics.stops} / ${result.metrics.takeProfits}`}
                      />
                      {cfg.regime !== 'off' && (
                        <Stat
                          label="空頭佔比"
                          value={`${(result.metrics.bearShare * 100).toFixed(0)}%`}
                        />
                      )}
                      {(cfg.bearHolding ?? 'cash') === 'inverse' && (
                        <Stat
                          label="反1 持有佔比"
                          value={`${(result.metrics.inverseShare * 100).toFixed(0)}%`}
                        />
                      )}
                    </div>
                  </details>
                </>
              )}

              {tab === 'dist' && (
                <DistributionTab
                  history={history}
                  baselines={blData}
                  cfg={cfg}
                  windowMonths={windowMonths}
                  setWindowMonths={setWindowMonths}
                  distMonths={distMonths}
                  setDistMonths={setDistMonths}
                  distMode={distMode}
                  setDistMode={setDistMode}
                />
              )}

              {tab === 'hold' && (
                <div className={styles.snapshot}>
                  <div>
                    <h3>
                      當時持股 <span className={styles.sub}>{view.date}</span>
                    </h3>
                    <div className={styles.snapCol}>
                      <ol>
                        {view.heldList.map((c) => (
                          <li key={c}>
                            <span>
                              {c} {names.get(c) ?? ''}
                            </span>
                          </li>
                        ))}
                        {view.exitedSinceRebalance.map((e) => (
                          <li key={e.code} className={styles.sub}>
                            <span>
                              {e.code} {names.get(e.code) ?? ''} —{' '}
                              {e.reason === 'stop'
                                ? '已停損'
                                : e.reason === 'take-profit'
                                  ? '已停利'
                                  : '轉空清倉'}
                              （{e.date}）
                            </span>
                          </li>
                        ))}
                        {view.heldList.length === 0 && view.exitedSinceRebalance.length === 0 && (
                          <li>（空手）</li>
                        )}
                      </ol>
                    </div>
                    {view.active && (
                      <p className={styles.sub} style={{ marginTop: 6 }}>
                        訊號 {view.active.signalDate}
                        {view.active.tradeDate ? ` · 成交 ${view.active.tradeDate}` : ' · 尚未成交'}
                      </p>
                    )}
                  </div>
                  <div>
                    <h3>
                      當時市值前 {poolShown} <span className={styles.sub}>持股標藍</span>
                    </h3>
                    <div className={styles.snapCol}>
                      <ol>
                        {view.pool.map((s, i) => (
                          <li
                            key={s.code}
                            className={view.held.has(s.code) ? styles.held : undefined}
                          >
                            <span>
                              {i + 1}. {s.code} {names.get(s.code) ?? ''}
                            </span>
                            <span className={styles.mc}>
                              {Math.round(s.mcap).toLocaleString()} 億
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'notes' && <MethodNotes />}

              <p className={styles.note}>
                回測區間約 {result.metrics.years.toFixed(1)} 年，僅供研究，不代表未來績效。
                <InfoHint label="回測的限制">
                  候選 universe 為市值前 {universeSize}{' '}
                  檔的歷史聯集，仍有殘存存活者偏誤。實際績效會因 滑價、整股限制、成交量等低於回測。
                </InfoHint>
              </p>
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}
