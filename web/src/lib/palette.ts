/**
 * 圖表系列的顏色指派 —— 純函式，圖表色的單一事實來源。
 *
 * 三條規則（改動前先讀）：
 *  1. **顏色跟著「實體」走，不跟著名次走。** 鎖定第 3 個策略時，前兩個的顏色不可以變。
 *  2. **類別色固定順序、不循環。** 只有 5 個位子；第 6 個以後折成「其他」，不要生新色，
 *     否則兩個不同策略會拿到同一個顏色。
 *  3. **基準線不是類別色。** 全部同一個中性灰，身分靠虛線樣式 —— 參考線該退到背景，
 *     而且這樣才不會跟策略系列撞色（舊版 0050 的綠就跟比較色第 3 格一模一樣）。
 *
 * 色票在 `styles/tokens.css`，已跑過 CVD 驗證（相鄰配對 ΔE 16.3 / 一般視覺 19.6）。
 * slot 4、5 對白底對比 < 3:1 → 呼叫端必須同時提供可見標籤（圖例或比較表），不可只靠顏色。
 */

/** 策略系列的類別色，依此固定順序指派。 */
export const SERIES_COLORS = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
] as const

export const MAX_SERIES = SERIES_COLORS.length

/** 基準線共用的中性色。 */
export const REF_COLOR = 'var(--ref)'

/** 基準線的虛線樣式 —— 身分靠這個區分，圖例會畫出同樣的線樣。 */
export const REF_DASH: Record<string, string> = {
  twii: '7 4',
  e0050: '2 3',
  e00632r: '9 3 2 3',
}

export interface SeriesStyle {
  color: string
  /** SVG stroke-dasharray；實線為 undefined */
  dash?: string
  /** 基準線畫細一點，讓策略線是主角 */
  width: number
}

/**
 * 第 i 個策略系列的樣式（i 從 0 起，0 = 目前這組設定）。
 * 超過 MAX_SERIES 回 null —— 呼叫端應該擋在前面（鎖定上限 4 組），不要自己生顏色。
 */
export function strategyStyle(i: number): SeriesStyle | null {
  const color = SERIES_COLORS[i]
  return color ? { color, dash: undefined, width: 2 } : null
}

/** 基準線樣式。`key` 未知時退回實線的中性灰。 */
export function baselineStyle(key: string): SeriesStyle {
  return { color: REF_COLOR, dash: REF_DASH[key], width: 1.5 }
}
