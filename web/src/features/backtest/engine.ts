/**
 * 橫斷面因子排名回測 —— 純函式。
 *
 * 每個再平衡日：把當日 universe 依所選因子排名，取前 N 檔等權（或市值權重）持有，
 * 期間隨還原價每日變動，下個再平衡日換股。基準 = 全 universe 等權（每日再平衡）。
 *
 * 資料量小（~數年 × 20 檔），跑在主執行緒 <10ms；若日後歷史拉長到十幾年再考慮搬 web worker。
 */
import type { HistoryRow } from '../../lib/history'
import { METRICS, type MetricKey } from '../../lib/metrics'

export type Rebalance = 'W' | 'M'
export type Weighting = 'equal' | 'mcap'

/** 可當排名因子的欄位（history jsonl 有、且排名有意義的）。 */
export const BACKTEST_FACTORS: MetricKey[] = ['m20', 'm60', 'm121', 'pe', 'pb', 'dy', 'mcap']

export interface BacktestConfig {
  /** 選股池：每個再平衡日先取「當日市值前 poolTopN 大」；省略/0 = 全 universe */
  poolTopN?: number
  factor: MetricKey
  topN: number
  rebalance: Rebalance
  weighting: Weighting
  /** 單邊換手的交易成本（基點，1 bp = 0.01%）。台股含手續費 + 證交稅約 20–45 bp。 */
  costBps: number
  /**
   * 訊號日到實際成交隔幾個交易日。
   * 0 = 用訊號日收盤價當天換（理想，有前視偏誤）。
   * 1 = 隔一個交易日成交（預設，貼近實務：收盤後才知道排名，下一盤才進得去）。
   */
  execLagDays?: number
  /** 起始日 YYYY-MM-DD；省略 = 從資料最早 */
  startDate?: string
}

export interface BacktestMetrics {
  totalReturn: number
  benchmarkReturn: number
  cagr: number
  maxDrawdown: number
  sharpe: number
  volatility: number
  /** 每次再平衡的平均單邊換手率 */
  turnover: number
  rebalances: number
  tradingDays: number
  years: number
}

export interface RebalanceEvent {
  /** 排名依據的訊號日（收盤資料） */
  signalDate: string
  /** 實際換股成交日（= signalDate + execLagDays 個交易日）；尚未成交時為空字串 */
  tradeDate: string
  codes: string[]
}

export interface BacktestResult {
  dates: string[]
  equity: number[]
  benchmark: number[]
  drawdown: number[]
  holdings: RebalanceEvent[]
  metrics: BacktestMetrics
}

type HistStock = HistoryRow['stocks'][number]

function histValue(hs: HistStock, key: MetricKey): number | null {
  const f = METRICS[key].field
  const v = (hs as Record<string, unknown>)[f]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function isoWeekKey(iso: string): string {
  const dt = new Date(`${iso}T00:00:00Z`)
  const day = (dt.getUTCDay() + 6) % 7 // 週一 = 0
  dt.setUTCDate(dt.getUTCDate() - day + 3) // 該週的週四
  const year = dt.getUTCFullYear()
  const firstThu = new Date(Date.UTC(year, 0, 4))
  const week = 1 + Math.round((dt.getTime() - firstThu.getTime()) / 6.048e8)
  return `${year}-W${week}`
}

function rebalanceKey(iso: string, freq: Rebalance): string {
  return freq === 'M' ? iso.slice(0, 7) : isoWeekKey(iso)
}

function targetWeights(row: HistoryRow, cfg: BacktestConfig): Map<string, number> {
  const dir = METRICS[cfg.factor].betterWhen === 'high' ? -1 : 1
  const inPool = new Set(poolCodes(row, cfg.poolTopN)) // 當日市值前 poolTopN 大

  const ranked = row.stocks
    .filter((s) => inPool.has(s.code))
    .map((s) => ({ code: s.code, f: histValue(s, cfg.factor), mcap: histValue(s, 'mcap') }))
    .filter((s): s is { code: string; f: number; mcap: number | null } => s.f !== null)
    .sort((a, b) => dir * (a.f - b.f))
    .slice(0, cfg.topN)

  const w = new Map<string, number>()
  if (ranked.length === 0) return w
  if (cfg.weighting === 'mcap' && ranked.every((s) => s.mcap && s.mcap > 0)) {
    const total = ranked.reduce((acc, s) => acc + (s.mcap ?? 0), 0)
    for (const s of ranked) w.set(s.code, (s.mcap ?? 0) / total)
  } else {
    for (const s of ranked) w.set(s.code, 1 / ranked.length)
  }
  return w
}

/** 依市值取當日前 n 大 `{code, mcap}`（n 省略 = 全部），市值大→小。 */
export function poolRanked(row: HistoryRow, n?: number): { code: string; mcap: number }[] {
  const withMcap = row.stocks
    .map((s) => ({ code: s.code, mcap: histValue(s, 'mcap') }))
    .filter((s): s is { code: string; mcap: number } => s.mcap !== null)
    .sort((a, b) => b.mcap - a.mcap)
  return n && n > 0 ? withMcap.slice(0, n) : withMcap
}

function poolCodes(row: HistoryRow, n?: number): string[] {
  return poolRanked(row, n).map((s) => s.code)
}

/** 某日期（或最近的較早交易日）的市值前 n 大。 */
export function poolAtDate(
  history: HistoryRow[],
  date: string,
  n?: number,
): { code: string; mcap: number }[] {
  let pick: HistoryRow | undefined
  for (const r of history) {
    if (r.date <= date && (!pick || r.date > pick.date)) pick = r
  }
  return pick ? poolRanked(pick, n) : []
}

/** code -> 當日相對前一日的還原報酬率 */
function dailyReturns(prev: HistoryRow, cur: HistoryRow): Map<string, number> {
  const prevAdj = new Map(prev.stocks.map((s) => [s.code, s.adjClose]))
  const out = new Map<string, number>()
  for (const s of cur.stocks) {
    const p = prevAdj.get(s.code)
    if (p != null && p > 0 && s.adjClose != null && s.adjClose > 0) {
      out.set(s.code, s.adjClose / p - 1)
    }
  }
  return out
}

function drift(weights: Map<string, number>, rets: Map<string, number>): Map<string, number> {
  const grown = new Map<string, number>()
  let total = 0
  for (const [code, w] of weights) {
    const g = w * (1 + (rets.get(code) ?? 0))
    grown.set(code, g)
    total += g
  }
  if (total > 0) for (const [code, g] of grown) grown.set(code, g / total)
  return grown
}

function portfolioReturn(weights: Map<string, number>, rets: Map<string, number>): number {
  let r = 0
  for (const [code, w] of weights) r += w * (rets.get(code) ?? 0)
  return r
}

function turnoverOf(from: Map<string, number>, to: Map<string, number>): number {
  const codes = new Set([...from.keys(), ...to.keys()])
  let sum = 0
  for (const c of codes) sum += Math.abs((to.get(c) ?? 0) - (from.get(c) ?? 0))
  return sum / 2 // 單邊
}

export function runBacktest(history: HistoryRow[], cfg: BacktestConfig): BacktestResult {
  const rows = history
    .filter((r) => !cfg.startDate || r.date >= cfg.startDate)
    .sort((a, b) => a.date.localeCompare(b.date))

  const dates: string[] = []
  const equity: number[] = []
  const benchmark: number[] = []
  const holdings: BacktestResult['holdings'] = []
  const dailyEq: number[] = []

  let eq = 1
  let bench = 1
  let weights = new Map<string, number>()
  let lastRebalKey = ''
  const turnovers: number[] = []
  const lag = Math.max(0, Math.round(cfg.execLagDays ?? 1))
  let pending: { target: Map<string, number>; applyAt: number; signalDate: string } | null = null

  const applyRebalance = (target: Map<string, number>, tradeDate: string, signalDate: string) => {
    const to = turnoverOf(weights, target)
    turnovers.push(to)
    eq *= 1 - (cfg.costBps / 1e4) * to * 2 // 來回
    weights = target
    holdings.push({ signalDate, tradeDate, codes: [...target.keys()] })
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    if (i > 0) {
      const rets = dailyReturns(rows[i - 1]!, row)
      const r = portfolioReturn(weights, rets)
      eq *= 1 + r
      weights = drift(weights, rets)
      dailyEq.push(r)
      // 基準：選股池等權（每日再平衡）
      const poolRets = poolCodes(rows[i - 1]!, cfg.poolTopN)
        .map((c) => rets.get(c))
        .filter((v): v is number => v !== undefined)
      if (poolRets.length) {
        bench *= 1 + poolRets.reduce((a, b) => a + b, 0) / poolRets.length
      }
    }

    // 到了成交日 → 換股
    if (pending && i >= pending.applyAt) {
      if (pending.target.size > 0) applyRebalance(pending.target, row.date, pending.signalDate)
      pending = null
    }

    // 訊號日 → 排名（用當日資料），排定 lag 個交易日後成交
    const key = rebalanceKey(row.date, cfg.rebalance)
    if (key !== lastRebalKey) {
      lastRebalKey = key
      pending = { target: targetWeights(row, cfg), applyAt: i + lag, signalDate: row.date }
      if (lag === 0 && pending.target.size > 0) {
        applyRebalance(pending.target, row.date, row.date)
        pending = null
      }
    }

    dates.push(row.date)
    equity.push(eq)
    benchmark.push(bench)
  }

  // 回測結束時還沒成交的最新排名 → 當成「下次要換成的持股」顯示
  if (pending && pending.target.size > 0) {
    holdings.push({
      signalDate: pending.signalDate,
      tradeDate: '',
      codes: [...pending.target.keys()],
    })
  }

  // 指標
  const peak: number[] = []
  let mx = 0
  const drawdown = equity.map((v) => {
    mx = Math.max(mx, v)
    peak.push(mx)
    return v / mx - 1
  })
  const years = Math.max(dates.length / 252, 1 / 252)
  const mean = dailyEq.reduce((a, b) => a + b, 0) / (dailyEq.length || 1)
  const variance = dailyEq.reduce((a, b) => a + (b - mean) ** 2, 0) / (dailyEq.length || 1)
  const sd = Math.sqrt(variance)

  return {
    dates,
    equity,
    benchmark,
    drawdown,
    holdings,
    metrics: {
      totalReturn: eq - 1,
      benchmarkReturn: bench - 1,
      cagr: dates.length ? eq ** (1 / years) - 1 : 0,
      maxDrawdown: Math.min(0, ...drawdown),
      sharpe: sd > 0 ? (mean / sd) * Math.sqrt(252) : 0,
      volatility: sd * Math.sqrt(252),
      turnover: turnovers.length ? turnovers.reduce((a, b) => a + b, 0) / turnovers.length : 0,
      rebalances: turnovers.length,
      tradingDays: dates.length,
      years,
    },
  }
}
