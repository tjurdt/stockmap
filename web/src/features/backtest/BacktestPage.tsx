import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Layout } from '../../components/Layout'
import { CycleField } from '../../components/controls/CycleField'
import { Section } from '../../components/controls/Section'
import { StepperField } from '../../components/controls/StepperField'
import { useAsync } from '../../hooks/useAsync'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useSnapshot } from '../../hooks/useSnapshot'
import { alignNormalized, loadBaselines } from '../../lib/baselines'
import { loadAllFactorHistory } from '../../lib/history'
import { METRICS } from '../../lib/metrics'
import { rollingWindowReturns, summarizeRolling } from '../../lib/rolling'
import { CompareTable, type CompareRow } from './CompareTable'
import { useLockedStrategies } from './compare'
import { BACKTEST_FACTORS, poolAtDate, runBacktest, type BacktestConfig } from './engine'
import { EquityChart } from './EquityChart'
import { LockedBar } from './LockedBar'
import { MethodNotes } from './MethodNotes'
import { RollingChart } from './RollingChart'
import { decodeParams, encodeParams, type StrategyParams } from './strategyParams'
import styles from './backtest.module.css'

const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
const cls = (v: number) => (v > 0 ? styles.pos : v < 0 ? styles.neg : undefined)

/** 目前策略固定第一色；鎖定的策略用 1..4。 */
const COMPARE_COLORS = ['var(--accent)', '#b8560f', '#5b8c5a', '#7a4fb0', '#3a7ca5']

const FACTOR_OPTS = BACKTEST_FACTORS.map((k) => [k, METRICS[k].label] as const)
const WEEKDAY_OPTS = [
  [1, '週一'],
  [2, '週二'],
  [3, '週三'],
  [4, '週四'],
  [5, '週五'],
] as const
const WINDOW_OPTS = [
  [6, '6 個月'],
  [12, '12 個月'],
  [24, '24 個月'],
] as const

function strategyLabel(p: StrategyParams): string {
  return `${METRICS[p.factor].label.replace(/\s*\(.*\)/, '')}·前${p.topN}·${
    p.rebalance === 'M' ? '月' : '週'
  }${p.stopType !== 'none' ? `·停${p.stopPct}` : ''}${p.regime !== 'off' ? '·多空' : ''}`
}

export function BacktestPage() {
  const state = useAsync(loadAllFactorHistory, [])
  const baselines = useAsync(loadBaselines, [])
  const snap = useSnapshot()
  const navigate = useNavigate()
  const search = useLocation().search
  const [cfg, setCfg] = useState<BacktestConfig>(() => ({ costBps: 30, ...decodeParams(search) }))
  const patch = (p: Partial<BacktestConfig>) => setCfg((c) => ({ ...c, ...p }))
  const [refs, setRefs] = useState({ twii: true, e0050: true, e00632r: false })
  const [windowMonths, setWindowMonths] = useState(12)
  const { locked, add, remove, clear } = useLockedStrategies()
  const isMobile = useMediaQuery('(max-width: 820px)')

  const names = useMemo(() => {
    const m = new Map<string, string>()
    if (snap.status === 'ready') for (const s of snap.data.stocks) m.set(s.code, s.name)
    return m
  }, [snap])

  const history = state.status === 'ready' ? state.data : []
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
      setStartMonth(months[Math.max(0, months.length - 37)]!)
      setEndMonth(months.at(-1)!)
    }
  }, [months, startMonth])
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
            runBacktest(history, { ...l.params, costBps: cfg.costBps, ...range }, blData),
          )
        : [],
    [history, locked, range, blData, cfg.costBps],
  )

  // 滾動視窗：用完整歷史（不受區間選擇影響）
  const fullResult = useMemo(
    () => (history.length > 1 ? runBacktest(history, cfg, blData) : null),
    [history, cfg, blData],
  )
  const rolling = useMemo(
    () =>
      fullResult
        ? rollingWindowReturns(
            fullResult.dates,
            fullResult.equity,
            fullResult.benchmark,
            windowMonths,
          )
        : [],
    [fullResult, windowMonths],
  )
  const rollSummary = useMemo(() => summarizeRolling(rolling), [rolling])

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
    const held = new Set(active?.codes ?? [])
    const pool = poolAtDate(history, date, cfg.poolTopN)
    return { date, markers, held, active, pool }
  }, [result, cursor, history, cfg.poolTopN])

  const poolShown = Math.min(cfg.poolTopN ?? 0, universeSize || (cfg.poolTopN ?? 0))
  const stopType = cfg.stopType ?? 'none'

  const asParams = (c: BacktestConfig): StrategyParams => ({
    factor: c.factor,
    topN: c.topN,
    poolTopN: c.poolTopN ?? 50,
    rebalance: c.rebalance,
    rebalanceDay: c.rebalanceDay ?? 1,
    weighting: c.weighting,
    execLagDays: c.execLagDays ?? 1,
    stopType: c.stopType ?? 'none',
    stopPct: c.stopPct ?? 20,
    regime: c.regime ?? 'off',
    regimeDays: c.regimeDays ?? 200,
    regimeExit: c.regimeExit ?? 'rebalance',
    bearHolding: c.bearHolding ?? 'cash',
  })
  const paramsQuery = useMemo(() => encodeParams(asParams(cfg)), [cfg])

  const series = useMemo(() => {
    type S = { label: string; values: (number | null)[]; color: string; dashed?: boolean }
    if (!result) return [] as S[]
    const s: S[] = [{ label: '策略', values: result.equity, color: COMPARE_COLORS[0]! }]
    lockedResults.forEach((r, i) => {
      s.push({
        label: locked[i]!.label,
        values: r.equity,
        color: COMPARE_COLORS[(i + 1) % COMPARE_COLORS.length]!,
      })
    })
    if (locked.length === 0) {
      s.push({
        label: `基準（前 ${poolShown} 等權）`,
        values: result.benchmark,
        color: 'var(--muted)',
      })
    }
    if (refs.twii) {
      const v = alignNormalized(blData, result.dates, 'twiiTR')
      if (v) s.push({ label: '大盤(報酬)', values: v, color: '#c8862b', dashed: true })
    }
    if (refs.e0050) {
      const v = alignNormalized(blData, result.dates, 'e0050')
      if (v) s.push({ label: '0050', values: v, color: '#5b8c5a', dashed: true })
    }
    if (refs.e00632r) {
      const v = alignNormalized(blData, result.dates, 'e00632r')
      if (v) s.push({ label: '台灣50反1', values: v, color: '#9a3b3b', dashed: true })
    }
    return s
  }, [result, lockedResults, locked, blData, refs, poolShown])

  const compareRows: CompareRow[] = useMemo(() => {
    if (!result || locked.length === 0) return []
    return [
      {
        label: '目前策略',
        color: COMPARE_COLORS[0]!,
        metrics: result.metrics,
        hasRegime: (cfg.regime ?? 'off') !== 'off',
      },
      ...lockedResults.map((r, i) => ({
        label: locked[i]!.label,
        color: COMPARE_COLORS[(i + 1) % COMPARE_COLORS.length]!,
        metrics: r.metrics,
        hasRegime: locked[i]!.params.regime !== 'off',
      })),
    ]
  }, [result, lockedResults, locked, cfg.regime])

  const panel = (
    <>
      <Section title="回測區間" defaultOpen>
        <div className={styles.quick}>
          {(
            [
              ['1', '近 1 年'],
              ['3', '近 3 年'],
              ['all', '全部'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} onClick={() => quickRange(v === 'all' ? 'all' : Number(v))}>
              {label}
            </button>
          ))}
        </div>
        <div className={styles.monthRow}>
          <input
            type="month"
            value={startMonth}
            min={months[0]}
            max={endMonth || months.at(-1)}
            onChange={(e) => setStartMonth(e.target.value)}
          />
          <span>~</span>
          <input
            type="month"
            value={endMonth}
            min={startMonth || months[0]}
            max={months.at(-1)}
            onChange={(e) => setEndMonth(e.target.value)}
          />
        </div>
      </Section>

      <Section title="選股" defaultOpen>
        <StepperField
          label={`選股池 前 ${poolShown} 大`}
          value={cfg.poolTopN ?? 50}
          min={10}
          max={80}
          step={5}
          onChange={(v) => patch({ poolTopN: v })}
        />
        <CycleField
          label="排名因子"
          value={cfg.factor}
          options={FACTOR_OPTS}
          onChange={(v) => patch({ factor: v })}
        />
        <StepperField
          label="持股數"
          value={cfg.topN}
          min={1}
          max={10}
          onChange={(v) => patch({ topN: v })}
          format={(v) => `前 ${v} 檔`}
        />
        <CycleField
          label="權重"
          value={cfg.weighting}
          options={[
            ['equal', '等權'],
            ['mcap', '市值權重'],
          ]}
          onChange={(v) => patch({ weighting: v })}
        />
      </Section>

      <Section title="換股" defaultOpen>
        <CycleField
          label="頻率"
          value={cfg.rebalance}
          options={[
            ['W', '每週'],
            ['M', '每月'],
          ]}
          onChange={(v) => patch({ rebalance: v })}
        />
        {cfg.rebalance === 'M' ? (
          <StepperField
            label="換股時點"
            value={cfg.rebalanceDay ?? 1}
            min={1}
            max={23}
            onChange={(v) => patch({ rebalanceDay: v })}
            format={(v) => `每月第 ${v} 個交易日`}
          />
        ) : (
          <CycleField
            label="換股星期"
            value={cfg.rebalanceDay ?? 1}
            options={WEEKDAY_OPTS}
            onChange={(v) => patch({ rebalanceDay: v })}
          />
        )}
        <CycleField
          label="成交時點"
          value={cfg.execLagDays ?? 1}
          options={[
            [1, '隔一日'],
            [0, '訊號日收盤'],
          ]}
          onChange={(v) => patch({ execLagDays: v })}
        />
      </Section>

      <Section title="風控">
        <CycleField
          label="停損"
          value={stopType}
          options={[
            ['none', '關'],
            ['fixed', '固定'],
            ['trailing', '移動'],
          ]}
          onChange={(v) => patch({ stopType: v })}
        />
        {stopType !== 'none' && (
          <StepperField
            label={stopType === 'trailing' ? '停損%（自高點）' : '停損%（自買進）'}
            value={cfg.stopPct ?? 20}
            min={2}
            max={50}
            onChange={(v) => patch({ stopPct: v })}
            format={(v) => `${v}%`}
          />
        )}
        <CycleField
          label="多空過濾"
          value={cfg.regime ?? 'off'}
          options={[
            ['off', '關'],
            ['ma', '均線'],
            ['mom', '動能'],
          ]}
          onChange={(v) => patch({ regime: v })}
        />
        {(cfg.regime ?? 'off') !== 'off' && (
          <>
            <StepperField
              label="回看天數"
              value={cfg.regimeDays ?? 200}
              min={20}
              max={300}
              step={10}
              onChange={(v) => patch({ regimeDays: v })}
              format={(v) => `${v} 日`}
            />
            <CycleField
              label="轉空反應"
              value={cfg.regimeExit ?? 'rebalance'}
              options={[
                ['rebalance', '換股日才空手'],
                ['immediate', '轉空立刻清空'],
              ]}
              onChange={(v) => patch({ regimeExit: v })}
            />
            <CycleField
              label="空頭時"
              value={cfg.bearHolding ?? 'cash'}
              options={[
                ['cash', '持有現金'],
                ['inverse', '買台灣50反1'],
              ]}
              onChange={(v) => patch({ bearHolding: v })}
            />
          </>
        )}
      </Section>

      <Section title="成本">
        <StepperField
          label="交易成本"
          value={cfg.costBps}
          min={0}
          max={100}
          step={5}
          onChange={(v) => patch({ costBps: v })}
          format={(v) => `單邊 ${v} bp`}
        />
      </Section>
    </>
  )

  return (
    <Layout asOf={span && `回測區間 ${span}`}>
      <div className={styles.layout}>
        <details className={styles.panelWrap} open={!isMobile}>
          <summary>⚙ 回測設定</summary>
          <div className={styles.panel}>{panel}</div>
        </details>

        <div className={styles.main}>
          {state.status === 'loading' && <p>載入因子歷史中…</p>}
          {state.status === 'error' && <p>讀不到因子歷史：{String(state.error)}</p>}
          {state.status === 'ready' && !result && <p>因子歷史資料不足，無法回測。</p>}

          {result && view && (
            <>
              <div className={styles.signalCta}>
                <button onClick={() => navigate(`/signal?${paramsQuery}`)}>
                  📋 產生操作訊號 →
                </button>
                <button onClick={() => navigate(`/plan?${paramsQuery}`)}>＋ 存成操作計畫 →</button>
                <button
                  className={styles.lockBtn}
                  disabled={locked.length >= 4}
                  onClick={() => add(asParams(cfg), strategyLabel(asParams(cfg)))}
                >
                  🔒 鎖定比較{locked.length >= 4 ? '（已滿 4）' : ''}
                </button>
              </div>

              <LockedBar
                locked={locked}
                colorOf={(i) => COMPARE_COLORS[i % COMPARE_COLORS.length]!}
                onRemove={remove}
                onClear={clear}
              />

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
                　虛線 = 換股成交日。移到曲線看任一天；<b>點一下鎖定</b>
                {pinned != null ? (
                  <button className={styles.unpin} onClick={() => setPinned(null)}>
                    📌 {result.dates[pinned]} ✕
                  </button>
                ) : (
                  '，再點一下解開。'
                )}
              </p>

              <div className={styles.stats}>
                <Stat
                  label="總報酬"
                  value={pct(result.metrics.totalReturn)}
                  klass={cls(result.metrics.totalReturn)}
                />
                <Stat
                  label="基準總報酬"
                  value={pct(result.metrics.benchmarkReturn)}
                  klass={cls(result.metrics.benchmarkReturn)}
                />
                <Stat
                  label="相對基準"
                  value={pct(result.metrics.totalReturn - result.metrics.benchmarkReturn)}
                  klass={cls(result.metrics.totalReturn - result.metrics.benchmarkReturn)}
                />
                <Stat
                  label="年化報酬"
                  value={pct(result.metrics.cagr)}
                  klass={cls(result.metrics.cagr)}
                />
                <Stat label="最大回撤" value={pct(result.metrics.maxDrawdown)} klass={styles.neg} />
                <Stat label="夏普值" value={result.metrics.sharpe.toFixed(2)} />
                <Stat label="年化波動" value={pct(result.metrics.volatility)} />
                <Stat label="平均換手率" value={`${(result.metrics.turnover * 100).toFixed(0)}%`} />
                <Stat
                  label="再平衡 / 停損"
                  value={`${result.metrics.rebalances} / ${result.metrics.stops}`}
                />
                {cfg.regime !== 'off' && (
                  <Stat
                    label="空頭空手佔比"
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

              {compareRows.length > 0 && <CompareTable rows={compareRows} />}

              {rolling.length > 1 && (
                <section className={styles.rollSection}>
                  <div className={styles.rollHead}>
                    <h3>
                      滾動報酬 <span className={styles.sub}>每個進場時點、往後 N 個月的報酬</span>
                    </h3>
                    <CycleField
                      label="視窗"
                      value={windowMonths}
                      options={WINDOW_OPTS}
                      onChange={setWindowMonths}
                    />
                  </div>
                  <RollingChart rows={rolling} />
                  <div className={styles.stats}>
                    <Stat
                      label="正報酬比例"
                      value={`${(rollSummary.positivePct * 100).toFixed(0)}%`}
                      klass={cls(rollSummary.positivePct - 0.5)}
                    />
                    <Stat
                      label="報酬中位數"
                      value={pct(rollSummary.median)}
                      klass={cls(rollSummary.median)}
                    />
                    <Stat
                      label="最好 / 最差"
                      value={`${pct(rollSummary.best)} / ${pct(rollSummary.worst)}`}
                    />
                    <Stat
                      label="贏基準比例"
                      value={`${(rollSummary.beatBenchPct * 100).toFixed(0)}%`}
                      klass={cls(rollSummary.beatBenchPct - 0.5)}
                    />
                    <Stat label="視窗數" value={String(rollSummary.n)} />
                  </div>
                </section>
              )}

              <div className={styles.snapshot}>
                <div>
                  <h3>
                    當時持股 <span className={styles.sub}>{view.date}</span>
                  </h3>
                  <div className={styles.snapCol}>
                    <ol>
                      {(view.active?.codes ?? []).map((c) => (
                        <li key={c}>
                          <span>
                            {c} {names.get(c) ?? (c === '00632R' ? '元大台灣50反1' : '')}
                          </span>
                        </li>
                      ))}
                      {!view.active && <li>（尚未進場）</li>}
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

              <p className={styles.note}>
                回測區間 {span}（約 {result.metrics.years.toFixed(1)} 年）。結果僅供研究，不代表未來
                績效。候選 universe 為市值前 {universeSize} 檔的歷史聯集；仍有殘存存活者偏誤。
                實際績效會因滑價、整股限制、成交量等低於回測。詳見下方說明。
              </p>

              <MethodNotes />
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}

function Stat({ label, value, klass }: { label: string; value: string; klass?: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={`${styles.statValue} ${klass ?? ''}`}>{value}</div>
    </div>
  )
}
