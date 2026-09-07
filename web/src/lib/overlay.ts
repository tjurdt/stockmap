/**
 * 把即時報價疊到收盤快照上 —— 純函式。
 *
 * 更新：價、漲跌、市值，以及 **skip=0 的動能（m20 / m60）**。
 * `m121` 是 12-1 動能（回看 250 日、跳過最近 20 日）—— 動能窗結束在 20 天前，
 * 今日價本來就不影響它，故**不動**。
 *
 * 數學：momX% = close_today / close_(today−X) − 1
 *      → liveMomX% = (1 + momX/100) × (live / close_today) − 1
 */
import type { Stock } from './data'
import type { LiveQuote } from './live'

/** 用 ratio = live/close 把「結束在今天」的動能重算成「結束在現價」。 */
export function bumpMomentum(momPct: number | null, ratio: number): number | null {
  return momPct == null ? momPct : ((1 + momPct / 100) * ratio - 1) * 100
}

export function applyLive(stocks: Stock[], quotes: Map<string, LiveQuote>): Stock[] {
  return stocks.map((s) => {
    const q = quotes.get(s.code)
    if (!q || q.price == null || s.close == null || s.close <= 0) return s
    const ratio = q.price / s.close
    const chgPct =
      q.prevClose != null && q.prevClose > 0
        ? ((q.price - q.prevClose) / q.prevClose) * 100
        : s.chgPct
    return {
      ...s,
      close: q.price,
      chgPct,
      mcap: s.mcap != null ? s.mcap * ratio : s.mcap,
      mom20: bumpMomentum(s.mom20, ratio),
      mom60: bumpMomentum(s.mom60, ratio),
      // mom121：skip=20，今日價不影響 → 維持
    }
  })
}
