/**
 * 交易成本 —— 純函式。預設值對齊國泰證券對帳單：
 * 手續費 0.1425% × 2.8 折 = 0.0399%（單邊、無最低收費），證交稅個股 0.3%、ETF 0.1%（只在賣出），
 * 兩者都是**無條件捨去到整數元**。
 */

export interface TradeCosts {
  /** 單邊手續費（bp，1 bp = 0.01%） */
  feeBps: number
  /** 個股賣出證交稅（bp） */
  taxBps: number
}

export const DEFAULT_COSTS: TradeCosts = { feeBps: 3.99, taxBps: 30 }

/** ETF 的賣出證交稅（bp），代號 00 開頭。 */
const ETF_TAX_BPS = 10

export interface TradeCash {
  gross: number
  fee: number
  tax: number
  /** 買進＝實付（gross + fee）；賣出＝實收（gross − fee − tax） */
  net: number
}

/** 一筆成交實際收付多少錢。 */
export function tradeCash(
  t: { code: string; side: 'buy' | 'sell'; shares: number; price: number },
  costs: TradeCosts = DEFAULT_COSTS,
): TradeCash {
  const gross = t.shares * t.price
  // 先四捨五入到 1e-6，避免 6135 × 10 × 0.003 這類浮點誤差被 floor 少算 1 元
  const floorYuan = (v: number) => Math.floor(Math.round(v * 1e6) / 1e6)
  const fee = floorYuan((gross * costs.feeBps) / 1e4)
  if (t.side === 'buy') return { gross, fee, tax: 0, net: gross + fee }
  const taxBps = t.code.startsWith('00') ? Math.min(ETF_TAX_BPS, costs.taxBps) : costs.taxBps
  const tax = floorYuan((gross * taxBps) / 1e4)
  return { gross, fee, tax, net: gross - fee - tax }
}
