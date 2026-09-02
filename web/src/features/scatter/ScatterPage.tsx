import { useMemo, useState } from 'react'

import { Layout } from '../../components/Layout'
import { useLiveQuotes } from '../../hooks/useLiveQuotes'
import { useSnapshot } from '../../hooks/useSnapshot'
import { applyLive } from '../../lib/overlay'
import { Controls } from './Controls'
import { FactorScatter, type ScatterOptions } from './FactorScatter'
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
  const [wantLive, setWantLive] = useState(false)
  const patch = (p: Partial<ScatterOptions>) => setOpts((o) => ({ ...o, ...p }))

  const snapStocks = state.status === 'ready' ? state.data.stocks : []
  const codes = useMemo(() => snapStocks.map((s) => s.code), [snapStocks])
  const { quotes, isLive } = useLiveQuotes(codes, wantLive)
  const stocks = isLive ? applyLive(snapStocks, quotes) : snapStocks

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
        ? `即時（約 20 秒延遲）· 動能為 ${state.data.asOf} 收盤${ranked}`
        : `收盤 ${state.data.asOf} · 序列 ${state.data.histLen} 日${ranked}`
  const status =
    state.status !== 'ready'
      ? '載入中…'
      : isLive
        ? `即時 ${quotes.size} 檔`
        : `已載入 ${stocks.length} 檔`

  return (
    <Layout asOf={asOf}>
      <div className={styles.layout}>
        <Controls
          opts={opts}
          onChange={patch}
          status={status}
          live={wantLive}
          onLiveChange={setWantLive}
        />
        <div>
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
