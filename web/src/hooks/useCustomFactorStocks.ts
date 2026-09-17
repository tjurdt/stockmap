import { useMemo } from 'react'

import { applyCustomFormula } from '../features/backtest/engine'
import type { Stock } from '../lib/data'
import type { HistoryRow } from '../lib/history'

/**
 * 若 `needsCustom` 且公式有效，依 `rows`（含暫定當日列）補算 `custom` 欄位到 `stocks` 上；
 * 否則原樣回傳。給散佈圖 / 排行榜這類「今天」快照畫面共用（`ScatterPage`/`RankingPage`）。
 */
export function useCustomFactorStocks(
  stocks: Stock[],
  rows: HistoryRow[],
  needsCustom: boolean,
  formula: string | undefined,
): Stock[] {
  const customByCode = useMemo(() => {
    if (!needsCustom || !formula) return null
    const last = applyCustomFormula(rows, formula).at(-1)
    if (!last) return null
    return new Map(
      last.stocks.map((s) => [s.code, (s as { custom?: number | null }).custom ?? null]),
    )
  }, [needsCustom, formula, rows])

  return useMemo(
    () =>
      customByCode
        ? stocks.map((s) => ({ ...s, custom: customByCode.get(s.code) ?? null }))
        : stocks,
    [stocks, customByCode],
  )
}
