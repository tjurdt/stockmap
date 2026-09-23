/**
 * 把即時 / 最新報價疊到收盤快照上 —— 純函式。
 *
 * 價、漲跌、市值直接換成報價；動能需要整段還原價序列，所以由 `lib/liveRow.ts` 算好一列
 * 暫定當日因子列後，經 `momentumFrom` 傳進來（沒傳就維持上次收盤的動能）。
 */
import type { Stock } from './data'
import type { HistoryRow } from './history'
import { quotesTradingDate, selectLiveQuotes, type LiveQuote } from './live'

export function applyLive(
  stocks: Stock[],
  quotes: Map<string, LiveQuote>,
  asOf: string,
  momentumFrom?: HistoryRow | null,
): Stock[] {
  const currentQuotes = selectLiveQuotes(quotes, asOf)
  const quoteDate = quotesTradingDate(currentQuotes)
  const row =
    momentumFrom && momentumFrom.date > asOf && (!quoteDate || momentumFrom.date === quoteDate)
      ? momentumFrom
      : null
  const mom = new Map(row?.stocks.map((s) => [s.code, s]) ?? [])
  const advanced = quoteDate != null || row != null
  return stocks
    .map((s) => {
      const q = currentQuotes.get(s.code)
      const m = mom.get(s.code)
      if (!advanced) return s
      const withMom = m
        ? { ...s, mom20: m.mom20, mom60: m.mom60, mom121: m.mom121, pe: m.pe, pb: m.pb, dy: m.dy }
        : s
      if (!q || q.price == null) return { ...withMom, chgPct: null, value: null }
      const chgPct =
        q.prevClose != null && Number.isFinite(q.prevClose) && q.prevClose > 0
          ? ((q.price - q.prevClose) / q.prevClose) * 100
          : null
      const scale = s.close != null && s.close > 0 ? q.price / s.close : null
      return {
        ...withMom,
        close: q.price,
        chgPct,
        // The quote service does not provide today's turnover.
        value: null,
        mcap: scale != null && s.mcap != null ? s.mcap * scale : s.mcap,
      }
    })
    .sort((a, b) => (b.mcap ?? -Infinity) - (a.mcap ?? -Infinity))
}
