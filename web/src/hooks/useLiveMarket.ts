import { useCallback, useMemo } from 'react'

import type { HistoryRow } from '../lib/history'
import { quoteTradingDate, selectLiveQuotes } from '../lib/live'
import { withProvisionalRow } from '../lib/liveRow'
import { useLiveQuotes } from './useLiveQuotes'

/**
 * 「最新的市場狀態」單一入口 —— 因子歷史 + 報價 → 補上暫定當日列後的 rows。
 *
 * 所有需要「今天」的頁面（回測 / 操作計畫 / 散佈圖）都走這裡，才不會有的頁面前進到今天、
 * 有的還停在昨天。
 *
 * @param rows       官方因子歷史（data/history/）
 * @param extraCodes 歷史最後一列以外也要報價的代號（例如手上持有但已掉出選股池的股票）
 */
export function useLiveMarket(
  rows: HistoryRow[],
  extraCodes: string[] = [],
  enabled = true,
  snapshotDate: string | null = null,
) {
  const extraKey = extraCodes.join(',')
  const codes = useMemo(
    () => [
      ...new Set([
        ...(rows.at(-1)?.stocks.map((s) => s.code) ?? []),
        ...extraKey.split(',').filter(Boolean),
      ]),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, extraKey],
  )

  const { quotes: fetchedQuotes, phase, failed } = useLiveQuotes(codes, enabled)
  const historyDate = rows.at(-1)?.date ?? null
  const officialDate =
    snapshotDate && (!historyDate || snapshotDate > historyDate) ? snapshotDate : historyDate
  const quotes = useMemo(
    () => selectLiveQuotes(fetchedQuotes, officialDate),
    [fetchedQuotes, officialDate],
  )
  const live = useMemo(() => withProvisionalRow(rows, quotes), [rows, quotes])
  const latestQuotes = useMemo(() => selectLiveQuotes(fetchedQuotes, null), [fetchedQuotes])
  const priceOf = useCallback(
    (code: string): number | null => {
      const official = rows.at(-1)?.stocks.find((s) => s.code === code)?.close
      const q = latestQuotes.get(code)
      // Holdings outside the universe may only have a quote for the official day.
      return (
        quotes.get(code)?.price ??
        official ??
        (q && quoteTradingDate(q) === officialDate ? q.price : null)
      )
    },
    [quotes, rows, latestQuotes, officialDate],
  )

  return { ...live, quotes, isLive: quotes.size > 0, phase, failed, priceOf }
}
