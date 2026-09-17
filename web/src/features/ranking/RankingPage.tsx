import { useMemo, useState } from 'react'

import { CustomIndicatorEditor } from '../../components/CustomIndicatorEditor'
import { Layout } from '../../components/Layout'
import { useCustomFactorStocks } from '../../hooks/useCustomFactorStocks'
import { useLiveSnapshot } from '../../hooks/useLiveSnapshot'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { liveAvailable } from '../../lib/live'
import {
  factorBetterWhen,
  factorFmt,
  factorLabel,
  metricValue,
  METRIC_KEYS,
  METRICS,
  type MetricKey,
} from '../../lib/metrics'
import { rankByValue } from './rank'
import styles from './ranking.module.css'

const NA = '—'
const price = (v: number | null) =>
  v == null ? NA : v.toLocaleString('en-US', { maximumFractionDigits: 2 })
const SHOW_OPTIONS = [20, 40, 60]

export function RankingPage() {
  const [factor, setFactor] = useState<MetricKey>('m121')
  const [customFormula, setCustomFormula] = useState('')
  const [customLabel, setCustomLabel] = useState('')
  const [customBetterWhen, setCustomBetterWhen] = useState<'high' | 'low'>('high')
  const [wantLive, setWantLive] = useState(true)
  const [showN, setShowN] = useState<number | null>(null)
  const isMobile = useMediaQuery('(max-width: 820px)')

  const { snap: state, stocks: allStocks, market, asOf: asOfLabel } = useLiveSnapshot(wantLive)

  const needsCustom = factor === 'custom'
  const stocksWithCustom = useCustomFactorStocks(allStocks, market.rows, needsCustom, customFormula)

  const limit = showN ?? (state.status === 'ready' ? (state.data.universeDisplayCount ?? 20) : 20)
  // 排行榜跟散佈圖同一個 universe（市值前 N 大，latest.json 本來就依市值排序），只是排序依據換成選的因子
  const pool = useMemo(() => stocksWithCustom.slice(0, limit), [stocksWithCustom, limit])

  const betterWhen = factorBetterWhen({ factor, customBetterWhen })
  const fmt = factorFmt(factor)
  const label = factorLabel({ factor, customLabel })
  const ranked = useMemo(
    () =>
      rankByValue(
        pool.map((s) => ({ code: s.code, name: s.name, value: metricValue(s, factor) })),
        betterWhen,
      ),
    [pool, factor, betterWhen],
  )
  const byCode = useMemo(() => new Map(pool.map((s) => [s.code, s])), [pool])

  if (state.status === 'error') {
    return (
      <Layout>
        <div className={styles.error}>
          <strong>讀不到資料。</strong> 前端只讀 <code>data/latest.json</code>（由 GitHub Actions
          產生）。請確認 <code>fetch-twse</code> workflow 至少成功跑過一次，且 <code>data/</code> 已
          commit。
        </div>
      </Layout>
    )
  }

  const rankedNote =
    state.status === 'ready' && state.data.universeRankedAt
      ? ` · 名單 ${state.data.universeRankedAt}`
      : ''
  const asOf = state.status !== 'ready' ? '載入中…' : `${asOfLabel}${rankedNote}`
  const status =
    state.status !== 'ready'
      ? '載入中…'
      : market.provisionalDate
        ? `${market.phase === 'open' ? '盤中' : '最新'}報價 ${market.quoted} 檔 · 動能已補算到 ${market.provisionalDate}（暫定）`
        : `已載入 ${pool.length} 檔`

  return (
    <Layout asOf={asOf}>
      <div className={styles.layout}>
        <div>
          <details className={styles.panelWrap} open={!isMobile}>
            <summary>⚙ 排行設定</summary>
            <div className={styles.panel}>
              <label className={styles.field} htmlFor="rankFactor">
                排序依據
              </label>
              <select
                id="rankFactor"
                value={factor}
                onChange={(e) => setFactor(e.target.value as MetricKey)}
              >
                {METRIC_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {METRICS[k].label}
                  </option>
                ))}
                <option value="custom">🧩 自訂指標</option>
              </select>

              {needsCustom && (
                <CustomIndicatorEditor
                  value={{
                    formula: customFormula,
                    label: customLabel,
                    betterWhen: customBetterWhen,
                  }}
                  onChange={(v) => {
                    setCustomFormula(v.formula)
                    setCustomLabel(v.label)
                    setCustomBetterWhen(v.betterWhen)
                  }}
                />
              )}

              <label className={styles.field} htmlFor="rankShown">
                範圍
              </label>
              <select
                id="rankShown"
                value={limit}
                onChange={(e) => setShowN(Number(e.target.value))}
              >
                {SHOW_OPTIONS.filter((n) => n <= allStocks.length).map((n) => (
                  <option key={n} value={n}>
                    市值前 {n} 大
                  </option>
                ))}
                {allStocks.length > 0 && !SHOW_OPTIONS.includes(allStocks.length) && (
                  <option value={allStocks.length}>市值前 {allStocks.length} 大（全部）</option>
                )}
              </select>

              {liveAvailable && (
                <>
                  <label className={styles.field}>選項</label>
                  <button
                    type="button"
                    className={styles.toggle}
                    data-on={wantLive}
                    onClick={() => setWantLive((v) => !v)}
                  >
                    最新報價
                  </button>
                </>
              )}
              <div className={styles.status}>{status}</div>
            </div>
          </details>
        </div>

        <div className={styles.main}>
          <h2>
            依{label}排行 <span className={styles.sub}>市值前 {pool.length} 大內排序</span>
          </h2>
          {ranked.length === 0 ? (
            <p className={styles.status}>
              {needsCustom && !customFormula.trim() ? '先在左側輸入自訂指標的公式。' : '載入中…'}
            </p>
          ) : (
            <div className={styles.tablewrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>代號 / 名稱</th>
                    <th className={styles.valCol}>{label}</th>
                    <th>現價</th>
                    <th>漲跌幅</th>
                    <th>市值 (億)</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((r) => {
                    const s = byCode.get(r.code)
                    const chg = s?.chgPct ?? null
                    const chgCls =
                      chg == null
                        ? undefined
                        : chg > 0
                          ? styles.pos
                          : chg < 0
                            ? styles.neg
                            : undefined
                    return (
                      <tr key={r.code}>
                        <td>{r.rank}</td>
                        <td>
                          {r.code} {r.name}
                        </td>
                        <td className={styles.valCol}>
                          <div className={styles.pctCell}>
                            <span className={styles.pctNum}>
                              {r.value == null ? NA : fmt(r.value)}
                            </span>
                            {r.percentile != null && (
                              <span className={styles.pctBar}>
                                <span style={{ width: `${r.percentile * 100}%` }} />
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{price(s?.close ?? null)}</td>
                        <td className={chgCls}>
                          {chg == null ? NA : `${chg > 0 ? '+' : ''}${chg.toFixed(2)}%`}
                        </td>
                        <td>{s?.mcap != null ? Math.round(s.mcap).toLocaleString() : NA}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
