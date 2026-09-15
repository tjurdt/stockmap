/**
 * 暫定當日因子列 —— 純函式。
 *
 * 台股 13:30 收盤，但 `data/` 要等 GitHub Actions 盤後抓完、重新部署才會更新（常常晚上才到）。
 * 在那之前，`data/history/` 的最後一列還是前一個交易日 —— 排名、動能、回測、操作計畫全都
 * 停在昨天。這裡用 Yahoo 報價（盤中 = 現價，盤後 = 當日收盤）補上一列「暫定的今天」，
 * 讓所有下游邏輯都能前進到當日。
 *
 * 規則：
 *  - 只有當報價的交易日「晚於」歷史最後一列時才補（資料已入庫就不補）。
 *  - 價格 / 還原價 / 市值 / PE / PB / 殖利率都用「現價 ÷ 前一列收盤」等比例推算
 *    （股數、EPS、每股淨值、配息當日不變 → 這幾個比例關係是精確的）。
 *  - 動能欄位依補完的還原價序列重算，公式與 pipeline `factors.py` 同一份（`lib/momentum.ts`）。
 *    序列不夠長而算不出來時**保留前一列的值**（新進榜個股在 jsonl 只有進榜後那幾列，
 *    但管線是用 prices.json 的 400 個交易日算的 —— 不能把它洗成 null，那會讓它掉出排名）。
 *  - 沒有報價的個股原值往後帶（等同當日 0%），不從選股池消失。
 *
 * 限制：這是「暫定」資料 —— 除權息當日的還原價會有一天的誤差；若 `data/` 落後好幾個交易日，
 * 補的這一列只代表最新報價那天，中間缺的交易日不會被補回來（動能窗會少算那幾天）。
 * 下游一律要把 `provisionalDate` 標示給使用者看。
 */
import type { HistoryRow } from './history'
import { quotesTradingDate, type LiveQuote, type MarketPhase } from './live'
import { momentumFields } from './momentum'

/** 重算動能需要的最長回看窗（mom121 = 250 + 1）再加一點緩衝。 */
const SERIES_TAIL = 300

export interface ProvisionalRows {
  /** 原始 rows，或尾端多一列暫定當日列 */
  rows: HistoryRow[]
  /** 暫定列的日期；沒補列時為 null */
  provisionalDate: string | null
  /** 暫定列裡真的有報價的檔數（其餘是往後帶的舊值） */
  quoted: number
  /** 歷史最後一列的日期（= 官方收盤資料到哪一天） */
  officialDate: string | null
}

const scale = (v: number | null | undefined, k: number): number | null =>
  v == null || !Number.isFinite(v) ? null : v * k

export function withProvisionalRow(
  rows: HistoryRow[],
  quotes: Map<string, LiveQuote>,
): ProvisionalRows {
  const last = rows.at(-1)
  const officialDate = last?.date ?? null
  if (!last || quotes.size === 0) return { rows, provisionalDate: null, quoted: 0, officialDate }

  const date = quotesTradingDate(quotes)
  if (!date || date <= last.date) return { rows, provisionalDate: null, quoted: 0, officialDate }

  // 每檔的還原價序列（只取尾巴，足夠算最長的動能窗）
  const tail = rows.slice(-SERIES_TAIL)
  const series = new Map<string, number[]>()
  for (const row of tail) {
    for (const s of row.stocks) {
      if (s.adjClose == null || s.adjClose <= 0) continue
      const arr = series.get(s.code)
      if (arr) arr.push(s.adjClose)
      else series.set(s.code, [s.adjClose])
    }
  }

  let quoted = 0
  const stocks = last.stocks.map((s) => {
    const q = quotes.get(s.code)
    const usable = q?.price != null && q.price > 0 && s.close != null && s.close > 0
    const k = usable ? q!.price! / s.close! : 1
    if (usable) quoted++

    const arr = series.get(s.code) ?? []
    const adjClose = scale(s.adjClose, k)
    const withToday = adjClose != null && adjClose > 0 ? [...arr, adjClose] : arr

    const mom = momentumFields(withToday)
    return {
      ...s,
      close: usable ? q!.price! : s.close,
      adjClose,
      mcap: scale(s.mcap, k),
      pe: scale(s.pe, k),
      pb: scale(s.pb, k),
      // 殖利率 = 每股配息 ÷ 股價 → 與股價成反比
      dy: scale(s.dy, 1 / k),
      mom20: mom.mom20 ?? s.mom20,
      mom60: mom.mom60 ?? s.mom60,
      mom121: mom.mom121 ?? s.mom121,
    }
  })

  return {
    rows: [...rows, { schemaVersion: 1, date, stocks }],
    provisionalDate: date,
    quoted,
    officialDate,
  }
}

/** 資料新鮮度的一句話說明（頁首用）。 */
export function freshnessLabel(p: ProvisionalRows, phase: MarketPhase): string {
  if (!p.provisionalDate) return `收盤 ${p.officialDate ?? '—'}`
  const kind = phase === 'open' ? '盤中即時' : '暫定收盤'
  return `${kind} ${p.provisionalDate}（官方資料到 ${p.officialDate ?? '—'}）`
}
