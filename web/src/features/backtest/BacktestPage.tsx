import { useMemo, useState } from 'react'

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
  type Weighting,
} from './engine'
import { EquityChart } from './EquityChart'
import styles from './backtest.module.css'

const DEFAULT: BacktestConfig = {
  poolTopN: 50,
  factor: 'm121',
  topN: 5,
  rebalance: 'M',
  weighting: 'equal',
  costBps: 30,
  execLagDays: 1,
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
  const snap = useSnapshot()
  const [cfg, setCfg] = useState<BacktestConfig>(DEFAULT)
  const patch = (p: Partial<BacktestConfig>) => setCfg((c) => ({ ...c, ...p }))

  const names = useMemo(() => {
    const m = new Map<string, string>()
    if (snap.status === 'ready') for (const s of snap.data.stocks) m.set(s.code, s.name)
    return m
  }, [snap])

  const history = state.status === 'ready' ? state.data : []
  const lastDate = history.at(-1)?.date
  // 每日新增的列只含顯示 universe（~60）；歷史列含完整回測 universe（~120）→ 取最大
  const universeSize = useMemo(
    () => history.reduce((m, r) => Math.max(m, r.stocks.length), 0),
    [history],
  )
  const [period, setPeriod] = useState<'all' | '3y' | '1y'>('3y')
  const startDate = useMemo(() => {
    if (period === 'all' || !lastDate) return undefined
    const d = new Date(`${lastDate}T00:00:00Z`)
    d.setUTCFullYear(d.getUTCFullYear() - (period === '3y' ? 3 : 1))
    return d.toISOString().slice(0, 10)
  }, [period, lastDate])

  const result = useMemo(
    () => (history.length > 1 ? runBacktest(history, { ...cfg, startDate }) : null),
    [history, cfg, startDate],
  )

  const span = result?.dates.length ? `${result.dates[0]} ~ ${result.dates.at(-1)}` : ''

  // ── 圖表游標：看某一天的持股 + 當時市值前 N ──────────────────
  const [cursor, setCursor] = useState<number | null>(null)
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

  return (
    <Layout asOf={span && `回測區間 ${span}`}>
      <div className={styles.layout}>
        <div className={styles.panel}>
          <label className={styles.field}>回測區間</label>
          <Radio<'all' | '3y' | '1y'>
            value={period}
            options={[
              ['1y', '近 1 年'],
              ['3y', '近 3 年'],
              ['all', '全部'],
            ]}
            onChange={setPeriod}
          />

          <label className={styles.field}>
            選股池：市值前 {Math.min(cfg.poolTopN ?? 0, universeSize || (cfg.poolTopN ?? 0))} 大
          </label>
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
                series={[
                  { label: '策略', values: result.equity, color: 'var(--accent)' },
                  {
                    label: `基準（市值前 ${cfg.poolTopN} 等權）`,
                    values: result.benchmark,
                    color: 'var(--muted)',
                  },
                ]}
                markers={view.markers}
                cursor={cursor}
                onCursor={setCursor}
              />

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
                  label="年化報酬"
                  value={pct(result.metrics.cagr)}
                  klass={cls(result.metrics.cagr)}
                />
                <Stat label="最大回撤" value={pct(result.metrics.maxDrawdown)} klass={styles.neg} />
                <Stat label="夏普值" value={result.metrics.sharpe.toFixed(2)} />
                <Stat label="年化波動" value={pct(result.metrics.volatility)} />
                <Stat label="平均換手率" value={`${(result.metrics.turnover * 100).toFixed(0)}%`} />
                <Stat label="再平衡次數" value={String(result.metrics.rebalances)} />
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
                      {view.active.tradeDate && ` · 成交 ${view.active.tradeDate}`}
                    </p>
                  )}
                </div>
                <div>
                  <h3>
                    當時市值前 {Math.min(cfg.poolTopN ?? 0, universeSize)}{' '}
                    <span className={styles.sub}>持股標藍</span>
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
              <p className={styles.sub} style={{ marginTop: 4 }}>
                圖上虛線 = 換股成交日；滑鼠移到曲線上可看任一天的持股與當時市值排名。
              </p>

              <p className={styles.note}>
                回測區間 {span}（約 {result.metrics.years.toFixed(1)}{' '}
                年）。結果僅供研究，不代表未來績效。 排名用<b>訊號日收盤</b>資料，
                {cfg.execLagDays === 0
                  ? '並假設當天收盤即成交（理想，略有前視偏誤）。'
                  : '隔一個交易日才成交（貼近實務：收盤後才知道排名）。'}
                選股池是每個再平衡日當下市值前{' '}
                {Math.min(cfg.poolTopN ?? universeSize, universeSize)} 大
                （市值用當日股數算），基準是同一池等權。候選 universe 為目前市值前 {universeSize} 檔
                ——
                早期曾進榜、但現已掉出的股票不在其中（殘存的存活者偏誤）。報酬以還原權值計算（含配息）；
                PE/PB/DY 為 FinMind 歷史值。前約 1 年因序列不足，12-1 動能為空。實務還有滑價、
                整股（1000 股）限制、成交量等未計入。
              </p>
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
