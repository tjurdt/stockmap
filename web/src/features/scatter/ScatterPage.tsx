import { useState } from 'react'

import { Layout } from '../../components/Layout'
import { useSnapshot } from '../../hooks/useSnapshot'
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
  const patch = (p: Partial<ScatterOptions>) => setOpts((o) => ({ ...o, ...p }))

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

  const asOf =
    state.status === 'ready' ? `收盤 ${state.data.asOf} · 序列 ${state.data.histLen} 日` : '載入中…'
  const stocks = state.status === 'ready' ? state.data.stocks : []
  const status = state.status === 'ready' ? `已載入 ${stocks.length} 檔` : '載入中…'

  return (
    <Layout asOf={asOf}>
      <div className={styles.layout}>
        <Controls opts={opts} onChange={patch} status={status} />
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
