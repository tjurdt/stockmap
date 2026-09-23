import { useMemo } from 'react'

import { loadRecentFactorHistory } from '../lib/history'
import { quotesTradingDate } from '../lib/live'
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
  const snapStocks: Snapshot['stocks'] = snap.status === 'ready' ? snap.data.stocks : []
  const snapshotDate = snap.status === 'ready' ? snap.data.asOf : ''
  const market = useLiveMarket(
    rows,
    snapStocks.map((s) => s.code),
    enabled,
    snapshotDate || null,
  )
  const provisionalRow = market.provisionalDate ? (market.rows.at(-1) ?? null) : null
  const stocks = useMemo(
    () => applyLive(snapStocks, market.quotes, snapshotDate, provisionalRow),
    [snapStocks, market.quotes, snapshotDate, provisionalRow],
  )

  const quoteDate = quotesTradingDate(market.quotes)
  const asOf =
    quoteDate && quoteDate > snapshotDate
      ? freshnessLabel(
          { ...market, provisionalDate: quoteDate, officialDate: snapshotDate || null },
          market.phase,
        )
      : snap.status === 'ready'
        ? `收盤 ${snap.data.asOf}`
        : '載入中…'

  return { snap, stocks, market, asOf }
}
