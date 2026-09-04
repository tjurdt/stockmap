import { useEffect, useMemo, useState } from 'react'

import { Layout } from '../../components/Layout'
import { useAsync } from '../../hooks/useAsync'
import { useSnapshot } from '../../hooks/useSnapshot'
import { loadAllFactorHistory } from '../../lib/history'
import { METRICS } from '../../lib/metrics'
import {
  BACKTEST_FACTORS,
  poolAtDate,
  runBacktest,
  type BacktestConfig,
  type Rebalance,
  type StopType,
  type Weighting,
} from './engine'
import { alignNormalized, loadBaselines } from '../../lib/baselines'
import { EquityChart } from './EquityChart'
import { MethodNotes } from './MethodNotes'
import styles from './backtest.module.css'

const DEFAULT: BacktestConfig = {
  poolTopN: 50,
  factor: 'm121',
  topN: 5,
  rebalance: 'M',
  weighting: 'equal',
  costBps: 30,
  execLagDays: 1,
  stopType: 'none',
  stopPct: 20,
}

const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
const cls = (v: number) => (v > 0 ? styles.pos : v < 0 ? styles.neg : undefined)

function Radio<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <div className={styles.radios}>
      {options.map(([v, label]) => (
        <button key={v} data-on={v === value} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function BacktestPage() {
  const state = useAsync(loadAllFactorHistory, [])
  const baselines = useAsync(loadBaselines, [])
  const snap = useSnapshot()
  const [cfg, setCfg] = useState<BacktestConfig>(DEFAULT)
  const patch = (p: Partial<BacktestConfig>) => setCfg((c) => ({ ...c, ...p }))
  const [refs, setRefs] = useState({ twii: true, e0050: true })

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

  // 時間區間（以月為單位）
  const [startMonth, setStartMonth] = useState('')
  const [endMonth, setEndMonth] = useState('')
  useEffect(() => {
    if (months.length && !startMonth) {
      setStartMonth(months[Math.max(0, months.length - 37)]!) // 預設近 3 年
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

  const result = useMemo(
    () => (history.length > 1 ? runBacktest(history, { ...cfg, ...range }) : null),
    [history, cfg, range],
  )

  const span = result?.dates.length ? `${result.dates[0]} ~ ${result.dates.at(-1)}` : ''

  // ── 圖表游標：hover 追隨、click 鎖定 ─────────────────────────
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

  const series = useMemo(() => {
    type S = { label: string; values: (number | null)[]; color: string; dashed?: boolean }
    if (!result) return [] as S[]
    const s: S[] = [
      { label: '策略', values: result.equity, color: 'var(--accent)' },
      { label: `基準（前 ${poolShown} 等權）`, values: result.benchmark, color: 'var(--muted)' },
    ]
    const bl = baselines.status === 'ready' ? baselines.data : []
    if (refs.twii) {
      const v = alignNormalized(bl, result.dates, 'twiiTR')
      if (v) s.push({ label: '大盤(報酬)', values: v, color: '#c8862b', dashed: true })
    }
    if (refs.e0050) {
      const v = alignNormalized(bl, result.dates, 'e0050')
      if (v) s.push({ label: '0050', values: v, color: '#5b8c5a', dashed: true })
    }
    return s
  }, [result, baselines, refs, poolShown])

  return (
    <Layout asOf={span && `回測區間 ${span}`}>
      <div className={styles.layout}>
        <div className={styles.panel}>
          <label className={styles.field}>回測區間</label>
          <Radio<string>
            value=""
            options={[
              ['1', '近 1 年'],
              ['3', '近 3 年'],
              ['all', '全部'],
            ]}
            onChange={(v) => quickRange(v === 'all' ? 'all' : Number(v))}
          />
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

          <label className={styles.field}>選股池：市值前 {poolShown} 大</label>
          <div className={styles.rangeRow}>
            <input
              type="range"
              min={10}
              max={80}
              step={5}
              value={cfg.poolTopN}
              onChange={(e) => patch({ poolTopN: Number(e.target.value) })}
            />
          </div>

          <label className={styles.field}>排名因子</label>
          <select
            value={cfg.factor}
            onChange={(e) => patch({ factor: e.target.value as BacktestConfig['factor'] })}
          >
            {BACKTEST_FACTORS.map((k) => (
              <option key={k} value={k}>
                {METRICS[k].label}（{METRICS[k].betterWhen === 'high' ? '高' : '低'}者佳）
              </option>
            ))}
          </select>

          <label className={styles.field}>持股數 前 {cfg.topN} 檔</label>
          <div className={styles.rangeRow}>
            <input
              type="range"
              min={1}
              max={10}
              value={cfg.topN}
              onChange={(e) => patch({ topN: Number(e.target.value) })}
            />
          </div>

          <label className={styles.field}>再平衡頻率</label>
          <Radio<Rebalance>
            value={cfg.rebalance}
            options={[
              ['W', '每週'],
              ['M', '每月'],
            ]}
            onChange={(v) => patch({ rebalance: v })}
          />

          <label className={styles.field}>成交時點</label>
          <Radio<string>
            value={String(cfg.execLagDays ?? 1)}
            options={[
              ['1', '隔一日'],
              ['0', '訊號日收盤'],
            ]}
            onChange={(v) => patch({ execLagDays: Number(v) })}
          />

          <label className={styles.field}>停損</label>
          <Radio<StopType>
            value={stopType}
            options={[
              ['none', '關'],
              ['fixed', '固定'],
              ['trailing', '移動'],
            ]}
            onChange={(v) => patch({ stopType: v })}
          />
          {stopType !== 'none' && (
            <div className={styles.rangeRow}>
              <input
                type="number"
                min={2}
                max={50}
                value={cfg.stopPct}
                onChange={(e) => patch({ stopPct: Number(e.target.value) })}
              />
              <span className={styles.sub}>
                % {stopType === 'trailing' ? '（自高點）' : '（自買進）'}
              </span>
            </div>
          )}

          <label className={styles.field}>權重</label>
          <Radio<Weighting>
            value={cfg.weighting}
            options={[
              ['equal', '等權'],
              ['mcap', '市值權重'],
            ]}
            onChange={(v) => patch({ weighting: v })}
          />

          <label className={styles.field}>交易成本（單邊 bp）</label>
          <input
            type="number"
            min={0}
            max={100}
            value={cfg.costBps}
            onChange={(e) => patch({ costBps: Number(e.target.value) })}
          />
        </div>

        <div>
          {state.status === 'loading' && <p>載入因子歷史中…</p>}
          {state.status === 'error' && <p>讀不到因子歷史：{String(state.error)}</p>}
          {state.status === 'ready' && !result && <p>因子歷史資料不足，無法回測。</p>}

          {result && view && (
            <>
              <EquityChart
                dates={result.dates}
                series={series}
                markers={view.markers}
                cursor={cursor}
                onCursor={setHover}
                onPin={(i) => setPinned((p) => (p === i ? null : i))}
              />
              <p className={styles.sub} style={{ marginTop: 4 }}>
                <label className={styles.refToggle}>
                  <input
                    type="checkbox"
                    checked={refs.twii}
                    onChange={(e) => setRefs((r) => ({ ...r, twii: e.target.checked }))}
                  />
                  大盤(報酬)
                </label>
                <label className={styles.refToggle}>
                  <input
                    type="checkbox"
                    checked={refs.e0050}
                    onChange={(e) => setRefs((r) => ({ ...r, e0050: e.target.checked }))}
                  />
                  0050
                </label>
                　圖上虛線 = 換股成交日。滑鼠移到曲線看任一天；<b>點一下鎖定</b>，
                {pinned != null ? (
                  <button className={styles.unpin} onClick={() => setPinned(null)}>
                    📌 已鎖定 {result.dates[pinned]} ✕
                  </button>
                ) : (
                  ' 再點一下解開。'
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
              </div>

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
                            {c} {names.get(c) ?? ''}
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
                回測區間 {span}（約 {result.metrics.years.toFixed(1)}{' '}
                年）。結果僅供研究，不代表未來績效。 候選 universe 為市值前 {universeSize}{' '}
                檔的歷史聯集；仍有殘存存活者偏誤。實際績效會因滑價、
                整股限制、成交量等低於回測。詳見下方說明。
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
