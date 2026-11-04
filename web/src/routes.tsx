import { createHashRouter, Navigate, useLocation } from 'react-router-dom'

import { BacktestPage } from './features/backtest/BacktestPage'
import { PerformancePage } from './features/performance/PerformancePage'
import { PlannerPage } from './features/planner/PlannerPage'
import { RankingPage } from './features/ranking/RankingPage'
import { ScatterPage } from './features/scatter/ScatterPage'
import { StockPage } from './features/stock/StockPage'

/** 首頁與舊的「操作訊號」頁都導向操作計畫（每天真正要看的頁面）；舊書籤 / 舊連結還能用。 */
function PlanRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/plan${search}`} replace />
}

// GitHub Pages 無 SPA rewrite，用 hash router 最省事。
export const router = createHashRouter([
  { path: '/', element: <PlanRedirect /> },
  { path: '/market', element: <ScatterPage /> },
  { path: '/ranking', element: <RankingPage /> },
  { path: '/stock/:code', element: <StockPage /> },
  { path: '/backtest', element: <BacktestPage /> },
  { path: '/signal', element: <PlanRedirect /> },
  { path: '/plan', element: <PlannerPage /> },
  { path: '/performance', element: <PerformancePage /> },
])
