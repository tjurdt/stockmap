import { createHashRouter } from 'react-router-dom'

import { BacktestPage } from './features/backtest/BacktestPage'
import { RankingPage } from './features/ranking/RankingPage'
import { ScatterPage } from './features/scatter/ScatterPage'
import { SignalPage } from './features/signal/SignalPage'
import { StockPage } from './features/stock/StockPage'

// GitHub Pages 無 SPA rewrite，用 hash router 最省事。
export const router = createHashRouter([
  { path: '/', element: <ScatterPage /> },
  { path: '/ranking', element: <RankingPage /> },
  { path: '/stock/:code', element: <StockPage /> },
  { path: '/backtest', element: <BacktestPage /> },
  { path: '/signal', element: <SignalPage /> },
])
