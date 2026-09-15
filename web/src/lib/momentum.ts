/**
 * 動能計算 —— 純函式，與 pipeline `factors.py` 同一份定義。
 *
 * 前端原則上只視覺化管線算好的因子；這裡重算是為了兩件事：
 *  1. 回測頁的「自訂動能窗」（`engine.withCustomMomentum`）。
 *  2. 盤中 / 盤後資料尚未入庫時的暫定當日列（`lib/liveRow.ts`）。
 * 兩者都要跟 `factors.py::FACTORS` 完全一致，`momentum.test.ts` 會直接讀 factors.py 檢查。
 */

/** 管線內建動能因子的回看窗（交易日）。key = history / snapshot 的欄位名。 */
export const MOM_WINDOWS = {
  mom20: { lookback: 20, skip: 0 },
  mom60: { lookback: 60, skip: 0 },
  mom121: { lookback: 250, skip: 20 },
} as const

export type MomField = keyof typeof MOM_WINDOWS

/**
 * 還原價序列（由舊到新）的區間報酬率 (%)。對齊 `factors.py::total_return`：
 * start = series[-(lookback+1)]、end = series[-(1+skip)]（跳過近期 → 同 12-1 動能定義）。
 * 長度不足回 null。
 */
export function momentumPct(series: number[], lookback: number, skip: number): number | null {
  const need = lookback + 1
  if (series.length < need || series.length < skip + 1) return null
  const end = series[series.length - 1 - skip]!
  const start = series[series.length - need]!
  return start > 0 ? (end / start - 1) * 100 : null
}

/** 一次算出三個內建動能因子（序列由舊到新）。 */
export function momentumFields(series: number[]): Record<MomField, number | null> {
  return {
    mom20: momentumPct(series, MOM_WINDOWS.mom20.lookback, MOM_WINDOWS.mom20.skip),
    mom60: momentumPct(series, MOM_WINDOWS.mom60.lookback, MOM_WINDOWS.mom60.skip),
    mom121: momentumPct(series, MOM_WINDOWS.mom121.lookback, MOM_WINDOWS.mom121.skip),
  }
}
