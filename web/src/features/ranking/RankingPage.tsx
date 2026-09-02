import { Layout } from '../../components/Layout'
import { useSnapshot } from '../../hooks/useSnapshot'
import { METRICS, metricValue, type MetricKey } from '../../lib/metrics'
import { NA } from '../../lib/format'

// TODO: 排行榜功能待建。目前先示範以「近月動能」排序，證明資料層可用。
const SORT_KEY: MetricKey = 'm20'

export function RankingPage() {
  const state = useSnapshot()
  if (state.status !== 'ready') {
    return (
      <Layout>
        <p>{state.status === 'error' ? '讀不到資料' : '載入中…'}</p>
      </Layout>
    )
  }

  const ranked = [...state.data.stocks].sort(
    (a, b) => (metricValue(b, SORT_KEY) ?? -Infinity) - (metricValue(a, SORT_KEY) ?? -Infinity),
  )

  return (
    <Layout asOf={`收盤 ${state.data.asOf}`}>
      <h2>依{METRICS[SORT_KEY].label}排行（雛型）</h2>
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
