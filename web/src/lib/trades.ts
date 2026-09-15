/**
 * 交易日誌 —— 純函式。使用者逐筆記「哪天、買/賣、哪檔、幾股、成交價」，
 * 目前持股（股數、加權平均成本、這一段的進場日）與已實現損益全部由這裡推算。
 *
 * 為什麼不直接讓使用者填持股：
 *  - 「已持有幾個交易日」要看**這一段**持有是哪天開始的（賣光再買回要重算），
 *    最短持有天數 / 移動停損的高點都依賴這個日期。
 *  - 加碼後的成本應該是加權平均，手填容易錯。
 *
 * 存在瀏覽器 localStorage（每台裝置一份，不上傳）。
 */

export interface Trade {
  /** 穩定 id（新增時產生），供刪除 / 編輯用 */
  id: string
  /** 成交日 YYYY-MM-DD */
  date: string
  code: string
  side: 'buy' | 'sell'
  shares: number
  price: number
}

export interface OpenPosition {
  code: string
  shares: number
  /** 加權平均成本 */
  entryPrice: number
  /** 這一段持有的起算日（第一筆買進；賣光後再買會重設） */
  entryDate: string
  /** 這一段持有期間最後一次加碼的日期（沒加碼 = entryDate） */
  lastBuyDate: string
  /** 這一段持有已實現的損益（部分賣出） */
  realized: number
}

export interface TradeLedger {
  positions: OpenPosition[]
  /** 全部已了結的損益（含部分賣出） */
  realized: number
}

const sorted = (trades: Trade[]): Trade[] =>
  [...trades].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

/**
 * 依交易日誌推算目前持股 + 已實現損益。
 * 賣出數量超過持股時，只認到持有的部分（使用者輸入錯誤時不讓帳本爆掉）。
 */
export function buildLedger(trades: Trade[]): TradeLedger {
  const open = new Map<string, OpenPosition>()
  let realized = 0

  for (const t of sorted(trades)) {
    if (!/^\d{4}$/.test(t.code) || !(t.shares > 0) || !(t.price > 0)) continue
    const cur = open.get(t.code)

    if (t.side === 'buy') {
      if (!cur) {
        open.set(t.code, {
          code: t.code,
          shares: t.shares,
          entryPrice: t.price,
          entryDate: t.date,
          lastBuyDate: t.date,
          realized: 0,
        })
      } else {
        const shares = cur.shares + t.shares
        cur.entryPrice = (cur.entryPrice * cur.shares + t.price * t.shares) / shares
        cur.shares = shares
        cur.lastBuyDate = t.date
      }
      continue
    }

    if (!cur) continue
    const qty = Math.min(t.shares, cur.shares)
    const pl = (t.price - cur.entryPrice) * qty
    realized += pl
    cur.realized += pl
    cur.shares -= qty
    if (cur.shares <= 1e-9) open.delete(t.code) // 賣光 → 下次買進重新起算持有天數
  }

  return {
    positions: [...open.values()].sort((a, b) => a.code.localeCompare(b.code)),
    realized,
  }
}

/** 新增一筆交易用的 id（時間戳 + 亂數，夠唯一且可排序）。 */
export function tradeId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** 把一份持股清單反推成「一筆買進」的交易日誌（舊資料遷移用）。 */
export function tradesFromPositions(
  positions: { code: string; shares: number; entryPrice: number; entryDate: string }[],
): Trade[] {
  return positions.map((p, i) => ({
    id: `seed${i}${p.code}`,
    date: p.entryDate,
    code: p.code,
    side: 'buy' as const,
    shares: p.shares,
    price: p.entryPrice,
  }))
}
