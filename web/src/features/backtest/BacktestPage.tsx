import { Layout } from '../../components/Layout'
import { useAsync } from '../../hooks/useAsync'
import { loadFactorHistory } from '../../lib/history'

// TODO: 回測引擎待建（見 docs/ARCHITECTURE.md 的計算分工）。
// 本頁已接好資料層：loadFactorHistory(year) → 每交易日全因子快照。
// 下一步：把回測邏輯放進 src/features/backtest/engine.worker.ts，主執行緒只畫權益曲線。
const YEAR = new Date().getFullYear()

export function BacktestPage() {
  const state = useAsync(() => loadFactorHistory(YEAR), [YEAR])

  return (
    <Layout>
      <h2>策略回測（雛型）</h2>
      {state.status === 'loading' && <p>載入因子歷史中…</p>}
      {state.status === 'error' && <p>讀不到因子歷史：{String(state.error)}</p>}
      {state.status === 'ready' && (
        <p>
          已載入 {state.data.length} 個交易日的因子快照（{YEAR} 年度）。 回測引擎與權益曲線尚未實作
          —— 見 docs/ADDING_A_PAGE.md。
        </p>
      )}
    </Layout>
  )
}
