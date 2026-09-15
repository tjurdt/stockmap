import { useParams } from 'react-router-dom'

import { Layout } from '../../components/Layout'
import { useLiveSnapshot } from '../../hooks/useLiveSnapshot'
import { NA } from '../../lib/format'
import { METRIC_KEYS, METRICS, metricValue } from '../../lib/metrics'

// TODO: 個股頁待建。目前顯示當日各因子值；之後加還原價走勢圖（用 loadFactorHistory + visx TimeSeries）。
export function StockPage() {
  const { code } = useParams<{ code: string }>()
  const { snap, stocks, asOf } = useLiveSnapshot()

  if (snap.status !== 'ready') {
    return (
      <Layout>
        <p>{snap.status === 'error' ? '讀不到資料' : '載入中…'}</p>
      </Layout>
    )
  }

  const stock = stocks.find((s) => s.code === code)
  if (!stock) {
    return (
      <Layout>
        <p>找不到代號 {code}</p>
      </Layout>
    )
  }

  return (
    <Layout asOf={asOf}>
      <h2>
        {stock.code} {stock.name}
      </h2>
      <dl>
        {METRIC_KEYS.map((k) => {
          const v = metricValue(stock, k)
          return (
            <div key={k}>
              <dt style={{ color: 'var(--muted)', fontSize: 13 }}>{METRICS[k].label}</dt>
              <dd style={{ margin: '0 0 10px' }}>{v == null ? NA : METRICS[k].fmt(v)}</dd>
            </div>
          )
        })}
      </dl>
    </Layout>
  )
}
