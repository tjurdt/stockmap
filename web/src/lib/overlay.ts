/** 把即時報價疊到收盤快照上 —— 純函式。動能維持上次收盤（需歷史序列），只更新價/漲跌/市值。 */
import type { Stock } from './data'
import type { LiveQuote } from './live'

export function applyLive(stocks: Stock[], quotes: Map<string, LiveQuote>): Stock[] {
  return stocks.map((s) => {
    const q = quotes.get(s.code)
    if (!q || q.price == null) return s
    const chgPct =
      q.prevClose != null && q.prevClose > 0
        ? ((q.price - q.prevClose) / q.prevClose) * 100
        : s.chgPct
    const scale = s.close != null && s.close > 0 ? q.price / s.close : null
    return {
      ...s,
      close: q.price,
      chgPct,
      mcap: scale != null && s.mcap != null ? s.mcap * scale : s.mcap,
    }
  })
}
