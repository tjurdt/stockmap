import { useMemo, useState } from 'react'

import { Layout } from '../../components/Layout'
import { useLiveSnapshot } from '../../hooks/useLiveSnapshot'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { Controls } from './Controls'
import { FactorScatter, type ScatterOptions } from './FactorScatter'
import { QuotePanel } from './QuotePanel'
import { StockTable } from './StockTable'
import styles from './scatter.module.css'

const DEFAULT_OPTS: ScatterOptions = {
  xKey: 'pe',
  yKey: 'm121',
  logX: false,
  logY: false,
  sizeByMcap: true,
  medianLines: true,
}

export function ScatterPage() {
  const [opts, setOpts] = useState<ScatterOptions>(DEFAULT_OPTS)
  // 預設開著：官方收盤檔盤後才更新，不抓報價的話整個下午都停在昨天
  const [wantLive, setWantLive] = useState(true)
  const [showN, setShowN] = useState<number | null>(null) // null = 用 snapshot 預設
  const patch = (p: Partial<ScatterOptions>) => setOpts((o) => ({ ...o, ...p }))
  const isMobile = useMediaQuery('(max-width: 820px)')

  const { snap: state, stocks: allStocks, market, asOf: asOfLabel } = useLiveSnapshot(wantLive)
  const limit = showN ?? (state.status === 'ready' ? (state.data.universeDisplayCount ?? 20) : 20)
  const stocks = useMemo(() => allStocks.slice(0, limit), [allStocks, limit])
  const isLive = market.isLive

  if (state.status === 'error') {
    return (
      <Layout>
        <div className={styles.error}>
          <strong>讀不到資料。</strong> 前端只讀 <code>data/latest.json</code>（由 GitHub Actions
          產生）。 請確認 <code>fetch-twse</code> workflow 至少成功跑過一次，且 <code>data/</code>{' '}
          已 commit。
        </div>
      </Layout>
    )
  }

  const ranked =
    state.status === 'ready' && state.data.universeRankedAt
      ? ` · 名單 ${state.data.universeRankedAt}`
      : ''
  const asOf = state.status !== 'ready' ? '載入中…' : `${asOfLabel}${ranked}`
  const status =
    state.status !== 'ready'
      ? '載入中…'
      : market.provisionalDate
        ? `${market.phase === 'open' ? '盤中' : '最新'}報價 ${market.quoted} 檔 · 動能已補算到 ${market.provisionalDate}（暫定）`
        : isLive
          ? `報價 ${market.quotes.size} 檔 · 官方收盤資料已是最新`
          : `已載入 ${stocks.length} 檔`

  return (
    <Layout asOf={asOf}>
      <div className={styles.layout}>
        <div>
          <details className={styles.panelWrap} open={!isMobile}>
            <summary>⚙ 圖表設定</summary>
            <div className={styles.panel}>
              <Controls
                opts={opts}
                onChange={patch}
                status={status}
                live={wantLive}
                onLiveChange={setWantLive}
                showN={limit}
                maxN={allStocks.length}
                onShowN={setShowN}
              />
            </div>
          </details>
          {stocks.length > 0 && <QuotePanel stocks={stocks} live={isLive} />}
        </div>
        <div className={styles.main}>
          {stocks.length > 0 ? (
            <>
              <FactorScatter stocks={stocks} opts={opts} />
              <StockTable stocks={stocks} />
            </>
          ) : (
            <div className={styles.plotbox}>
              <svg viewBox="0 0 720 520">
                <text x={360} y={260} textAnchor="middle" className={styles.tick}>
                  載入中…
                </text>
              </svg>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
