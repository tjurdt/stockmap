import { useMemo, useState } from 'react'

import { Layout } from '../../components/Layout'
import { useLiveQuotes } from '../../hooks/useLiveQuotes'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useSnapshot } from '../../hooks/useSnapshot'
import { applyLive } from '../../lib/overlay'
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
  const state = useSnapshot()
  const [opts, setOpts] = useState<ScatterOptions>(DEFAULT_OPTS)
  const [wantLive, setWantLive] = useState(true)
  const [showN, setShowN] = useState<number | null>(null) // null = 用 snapshot 預設
  const patch = (p: Partial<ScatterOptions>) => setOpts((o) => ({ ...o, ...p }))
  const isMobile = useMediaQuery('(max-width: 820px)')

  const allStocks = state.status === 'ready' ? state.data.stocks : []
  const limit = showN ?? (state.status === 'ready' ? (state.data.universeDisplayCount ?? 20) : 20)
  const snapStocks = useMemo(() => allStocks.slice(0, limit), [allStocks, limit])
  const codes = useMemo(() => snapStocks.map((s) => s.code), [snapStocks])
  const { quotes, isLive, fetchedAt } = useLiveQuotes(codes, wantLive)
  const stocks = isLive ? applyLive(snapStocks, quotes) : snapStocks
  const liveTime =
    fetchedAt?.toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Taipei',
    }) ?? ''

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
  const asOf =
    state.status !== 'ready'
      ? '載入中…'
      : isLive
        ? `現價 Yahoo ${liveTime}（約 15–20 分延遲）· 近月/季動能已納入現價 · 12-1 動能與 PE 等為 ${state.data.asOf} 收盤${ranked}`
        : `收盤 ${state.data.asOf} · 序列 ${state.data.histLen} 日${ranked}`
  const status =
    state.status !== 'ready'
      ? '載入中…'
      : isLive
        ? `即時 ${quotes.size} 檔 · Yahoo ${liveTime}`
        : wantLive
          ? `已載入 ${stocks.length} 檔 · 即時報價抓取中…`
          : `已載入 ${stocks.length} 檔（即時報價已關）`

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
