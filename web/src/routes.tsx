import { createHashRouter, Navigate, useLocation } from 'react-router-dom'

import { BacktestPage } from './features/backtest/BacktestPage'
import { PlannerPage } from './features/planner/PlannerPage'
import { RankingPage } from './features/ranking/RankingPage'
import { ScatterPage } from './features/scatter/ScatterPage'
import { StockPage } from './features/stock/StockPage'

/** 舊的「操作訊號」頁已併入「操作計畫」；保留轉址讓舊書籤 / 舊連結還能用。 */
function SignalRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/plan${search}`} replace />
}

// GitHub Pages 無 SPA rewrite，用 hash router 最省事。
export const router = createHashRouter([
  { path: '/', element: <ScatterPage /> },
  { path: '/ranking', element: <RankingPage /> },
  { path: '/stock/:code', element: <StockPage /> },
  { path: '/backtest', element: <BacktestPage /> },
  { path: '/signal', element: <SignalRedirect /> },
  { path: '/plan', element: <PlannerPage /> },
])
