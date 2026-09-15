import { useMemo } from 'react'

import { loadRecentFactorHistory } from '../lib/history'
import { freshnessLabel } from '../lib/liveRow'
import { applyLive } from '../lib/overlay'
import type { Snapshot } from '../lib/data'
import { useAsync } from './useAsync'
import { useLiveMarket } from './useLiveMarket'
import { useSnapshot } from './useSnapshot'

/**
 * 快照頁（散佈圖 / 排行榜）的資料入口：收盤快照 + 最新報價 → 一份「到今天為止」的個股清單。
 *
 * 價 / 漲跌 / 市值直接換成報價；動能與估值則用最近幾百列因子歷史重算出的暫定當日列覆蓋，
 * 所以盤中與盤後（管線入庫前）都不會停在昨天。
 */
export function useLiveSnapshot(enabled = true) {
  const snap = useSnapshot()
  const hist = useAsync(loadRecentFactorHistory, [])
  const rows = hist.status === 'ready' ? hist.data : []
  const market = useLiveMarket(rows, [], enabled)

  const snapStocks: Snapshot['stocks'] = snap.status === 'ready' ? snap.data.stocks : []
  const provisionalRow = market.provisionalDate ? (market.rows.at(-1) ?? null) : null
  const stocks = useMemo(
    () => applyLive(snapStocks, market.quotes, provisionalRow),
    [snapStocks, market.quotes, provisionalRow],
  )

  const asOf = market.provisionalDate
    ? freshnessLabel(market, market.phase)
    : snap.status === 'ready'
      ? `收盤 ${snap.data.asOf}`
      : '載入中…'

  return { snap, stocks, market, asOf }
}
