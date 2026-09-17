import { Layout } from '../../components/Layout'
import { useLiveSnapshot } from '../../hooks/useLiveSnapshot'
import { NA } from '../../lib/format'
import { METRICS, metricValue, type BuiltinMetricKey } from '../../lib/metrics'

// TODO: 排行榜功能待建。目前先示範以「近月動能」排序，證明資料層可用。
const SORT_KEY: BuiltinMetricKey = 'm20'

export function RankingPage() {
  const { snap, stocks, market, asOf } = useLiveSnapshot()
  if (snap.status !== 'ready') {
    return (
      <Layout>
        <p>{snap.status === 'error' ? '讀不到資料' : '載入中…'}</p>
      </Layout>
    )
  }

  const ranked = [...stocks].sort(
    (a, b) => (metricValue(b, SORT_KEY) ?? -Infinity) - (metricValue(a, SORT_KEY) ?? -Infinity),
  )

  return (
    <Layout asOf={asOf}>
      <h2>依{METRICS[SORT_KEY].label}排行（雛型）</h2>
      {market.provisionalDate && (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          官方收盤檔到 {market.officialDate}；已用 {market.provisionalDate} 的最新報價補算成暫定值。
        </p>
      )}
      <ol>
        {ranked.map((s) => {
          const v = metricValue(s, SORT_KEY)
          return (
            <li key={s.code}>
              {s.code} {s.name} — {v == null ? NA : METRICS[SORT_KEY].fmt(v)}
            </li>
          )
        })}
      </ol>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>
        待辦：可切換排序因子、多因子綜合評分、分位數上色。見 docs/ADDING_A_PAGE.md。
      </p>
    </Layout>
  )
}
