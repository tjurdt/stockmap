/**
 * 橫斷面因子排名回測 —— 純函式。
 *
 * 每個再平衡日：把當日 universe 依所選因子排名，取前 N 檔等權（或市值權重）持有，
 * 期間隨還原價每日變動，下個再平衡日換股。基準 = 全 universe 等權（每日再平衡）。
 *
 * 資料量小（~數年 × 20 檔），跑在主執行緒 <10ms；若日後歷史拉長到十幾年再考慮搬 web worker。
 */
import type { BaselineRow } from '../../lib/baselines'
import { isTradingDay, nextTradingDay, nthTradingDayOfMonth } from '../../lib/calendar'
import type { HistoryRow } from '../../lib/history'
import { METRICS, type MetricKey } from '../../lib/metrics'

export type Rebalance = 'W' | 'M'
export type Weighting = 'equal' | 'mcap'
export type StopType = 'none' | 'fixed' | 'trailing'
export type RegimeIndicator = 'off' | 'ma' | 'mom'

/** 可當排名因子的欄位（history jsonl 有、且排名有意義的）。 */
export const BACKTEST_FACTORS: MetricKey[] = ['m20', 'm60', 'm121', 'pe', 'pb', 'dy', 'mcap']

export interface BacktestConfig {
  /** 選股池：每個再平衡日先取「當日市值前 poolTopN 大」；省略/0 = 全 universe */
  poolTopN?: number
  factor: MetricKey
  topN: number
  rebalance: Rebalance
  /**
   * 換股時點：`rebalance='M'` 時＝每月第幾日（1–28，遇假日順延到當期第一個交易日）；
   * `rebalance='W'` 時＝每週星期幾（1=一 … 5=五）。省略 = 1（＝當期第一個交易日，等同舊行為）。
   */
  rebalanceDay?: number
  weighting: Weighting
  /** 單邊換手的交易成本（基點，1 bp = 0.01%）。台股含手續費 + 證交稅約 20–45 bp。 */
  costBps: number
  /**
   * 訊號日到實際成交隔幾個交易日。
   * 0 = 用訊號日收盤價當天換（理想，有前視偏誤）。
   * 1 = 隔一個交易日成交（預設，貼近實務：收盤後才知道排名，下一盤才進得去）。
   */
  execLagDays?: number
  /**
   * 停損。none = 關（預設）。
   * fixed：個股自買進日跌超過 stopPct% 就當日出場、持有現金到下次再平衡。
   * trailing：從買進後的最高點回落超過 stopPct% 就出場。
   */
  stopType?: StopType
  stopPct?: number
  /**
   * 多空環境過濾（用加權報酬指數判斷）。off = 關（預設）。
   * ma：指數在自身 regimeDays 日均線之上 = 多頭，之下 = 空頭。
   * mom：指數 regimeDays 日報酬率 > 0 = 多頭。
   */
  regime?: RegimeIndicator
  regimeDays?: number
  /**
   * 空頭時怎麼反應。
   * rebalance（預設）：只在再平衡日檢查，空頭則不進場 / 抱現金；期間內轉空不動作。
   * immediate：一轉空頭當天就清空全部持股、抱現金，直到再平衡日且轉多才重新進場。
   */
  regimeExit?: 'rebalance' | 'immediate'
  /**
   * 空頭期間手上放什麼。cash（預設）= 現金 0 報酬；inverse = 元大台灣50反1（00632R），
   * 需 `baselines` 有 `e00632r`（2014-10 才成立，更早的空頭仍當現金）。
   */
  bearHolding?: 'cash' | 'inverse'
  /** 起始 / 結束日 YYYY-MM-DD；省略 = 資料全範圍 */
  startDate?: string
  endDate?: string
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
  /** 停損出場次數 */
  stops: number
  /** 空頭天數佔比（regime = off 時為 0） */
  bearShare: number
  /** 持有台灣50反1的天數佔比（bearHolding != inverse 時為 0） */
  inverseShare: number
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
  /** 每日多空環境（regime = off 時全 'bull'） */
  regime: ('bull' | 'bear')[]
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

export function rebalanceKey(iso: string, freq: Rebalance): string {
  return freq === 'M' ? iso.slice(0, 7) : isoWeekKey(iso)
}

/** ISO 星期：週一 = 1 … 週日 = 7。 */
function isoWeekday(iso: string): number {
  return ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1
}

/**
 * 依 `rebalanceDay` 決定每個再平衡期間實際換股的交易日。
 * `M`：每月第 N 個交易日（該月交易日不足 N 個 → 取最後一個）。
 * `W`：該週第一個星期 >= N 的交易日（都沒有 → 取該週最後一個交易日）。
 */
export function rebalanceDates(dates: string[], freq: Rebalance, rebalanceDay = 1): Set<string> {
  const n = Math.max(1, Math.round(rebalanceDay || 1))
  const groups = new Map<string, string[]>()
  for (const d of dates) {
    const k = rebalanceKey(d, freq)
    const g = groups.get(k)
    if (g) g.push(d)
    else groups.set(k, [d])
  }
  const out = new Set<string>()
  for (const g of groups.values()) {
    g.sort()
    if (freq === 'M') {
      out.add(g[Math.min(n, g.length) - 1]!)
    } else {
      out.add(g.find((d) => isoWeekday(d) >= n) ?? g[g.length - 1]!)
    }
  }
  return out
}

/**
 * `date` 是否為它所在再平衡期間的換股訊號日。
 * 與 `rebalanceDates` 不同：不套用「該期沒到 N 就取最後一天」的回填（給即時訊號用 ——
 * 當期交易日還不足 N 個，就還沒到你的操作日）。
 */
export function isRebalanceDay(
  dates: string[],
  date: string,
  freq: Rebalance,
  rebalanceDay = 1,
): boolean {
  const n = Math.max(1, Math.round(rebalanceDay || 1))
  const key = rebalanceKey(date, freq)
  const group = dates.filter((d) => rebalanceKey(d, freq) === key).sort()
  if (freq === 'M') return group[n - 1] === date
  return group.find((d) => isoWeekday(d) >= n) === date
}

/**
 * 從 `fromISO` 之後、下一個再平衡日的日期（給「操作訊號 / 提醒信」顯示）。
 * 傳 `holidays` 就用真的台股交易日曆；否則只跳週末。
 */
export function nextRebalanceDate(
  fromISO: string,
  freq: Rebalance,
  rebalanceDay = 1,
  holidays: Set<string> = new Set(),
): string {
  const n = Math.max(1, Math.round(rebalanceDay || 1))
  const base = new Date(`${fromISO}T00:00:00Z`)

  if (freq === 'M') {
    let y = base.getUTCFullYear()
    let m = base.getUTCMonth() + 1
    let cand = nthTradingDayOfMonth(y, m, n, holidays)
    if (cand <= fromISO) {
      if (++m > 12) {
        m = 1
        y++
      }
      cand = nthTradingDayOfMonth(y, m, n, holidays)
    }
    return cand
  }

  const d = new Date(base)
  const wd = ((d.getUTCDay() + 6) % 7) + 1
  d.setUTCDate(d.getUTCDate() + (n - wd))
  if (d <= base) d.setUTCDate(d.getUTCDate() + 7)
  const s = d.toISOString().slice(0, 10)
  return isTradingDay(s, holidays) ? s : nextTradingDay(s, holidays)
}

/** 排名後的目標持股（給操作訊號頁用）。 */
export function rankTargets(
  row: HistoryRow,
  cfg: BacktestConfig,
): { code: string; weight: number; factor: number; mcap: number | null }[] {
  const w = targetWeights(row, cfg)
  const dir = METRICS[cfg.factor].betterWhen === 'high' ? -1 : 1
  return [...w.keys()]
    .map((code) => {
      const s = row.stocks.find((x) => x.code === code)!
      return {
        code,
        weight: w.get(code)!,
        factor: histValue(s, cfg.factor)!,
        mcap: histValue(s, 'mcap'),
      }
    })
    .sort((a, b) => dir * (a.factor - b.factor))
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

/** 依當日報酬更新權重（佔「新的總權益」的比例）。r = 當日組合報酬。 */
function drift(
  weights: Map<string, number>,
  rets: Map<string, number>,
  r: number,
): Map<string, number> {
  const grown = new Map<string, number>()
  for (const [code, w] of weights) {
    grown.set(code, (w * (1 + (rets.get(code) ?? 0))) / (1 + r))
  }
  return grown // 未加總到 1 的部分 = 現金
}

/** row → {code: adjClose} */
function adjMap(row: HistoryRow): Map<string, number> {
  const m = new Map<string, number>()
  for (const s of row.stocks) if (s.adjClose != null && s.adjClose > 0) m.set(s.code, s.adjClose)
  return m
}

/** 元大台灣50反1 —— 空頭避險部位的合成代號。 */
export const INVERSE_CODE = '00632R'

/** baselines 的 e00632r → {date: 相對前一交易日的還原報酬率}。 */
function inverseReturns(baselines: BaselineRow[]): Map<string, number> {
  const rows = baselines
    .filter((b) => b.e00632r != null)
    .sort((a, b) => a.date.localeCompare(b.date))
  const out = new Map<string, number>()
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!.e00632r!
    const cur = rows[i]!.e00632r!
    if (prev > 0 && cur > 0) out.set(rows[i]!.date, cur / prev - 1)
  }
  return out
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

/**
 * 用加權報酬指數逐日判斷多空。回傳 date → 'bull' | 'bear'。
 * off / 無指數資料 → 全 'bull'。
 */
export function regimeByDate(
  dates: string[],
  baselines: BaselineRow[],
  indicator: RegimeIndicator,
  lookback: number,
): Map<string, 'bull' | 'bear'> {
  const out = new Map<string, 'bull' | 'bear'>()
  const idx = baselines.filter((b) => b.twiiTR != null).sort((a, b) => a.date.localeCompare(b.date))
  const lv = idx.map((b) => b.twiiTR!)
  const dt = idx.map((b) => b.date)

  if (indicator === 'off' || lv.length < lookback + 1) {
    for (const d of dates) out.set(d, 'bull')
    return out
  }

  let j = 0
  for (const d of dates) {
    while (j < dt.length && dt[j]! <= d) j++
    const k = j - 1 // 最後一個交易日 <= d
    if (k < lookback) {
      out.set(d, 'bull')
      continue
    }
    const cur = lv[k]!
    let bull: boolean
    if (indicator === 'ma') {
      let s = 0
      for (let m = k - lookback; m <= k; m++) s += lv[m]!
      bull = cur > s / (lookback + 1)
    } else {
      bull = cur / lv[k - lookback]! - 1 > 0
    }
    out.set(d, bull ? 'bull' : 'bear')
  }
  return out
}

export function runBacktest(
  history: HistoryRow[],
  cfg: BacktestConfig,
  baselines: BaselineRow[] = [],
): BacktestResult {
  const rows = history
    .filter(
      (r) => (!cfg.startDate || r.date >= cfg.startDate) && (!cfg.endDate || r.date <= cfg.endDate),
    )
    .sort((a, b) => a.date.localeCompare(b.date))

  const dates: string[] = []
  const equity: number[] = []
  const benchmark: number[] = []
  const regime: ('bull' | 'bear')[] = []
  const holdings: BacktestResult['holdings'] = []
  const dailyEq: number[] = []

  const regimeMap = regimeByDate(
    rows.map((r) => r.date),
    baselines,
    cfg.regime ?? 'off',
    cfg.regimeDays ?? 200,
  )

  let eq = 1
  let bench = 1
  let weights = new Map<string, number>()
  const rebalSet = rebalanceDates(
    rows.map((r) => r.date),
    cfg.rebalance,
    cfg.rebalanceDay ?? 1,
  )
  const turnovers: number[] = []
  let stops = 0
  const lag = Math.max(0, Math.round(cfg.execLagDays ?? 1))
  const stopType = cfg.stopType ?? 'none'
  const stopFrac = (cfg.stopPct ?? 0) / 100
  const immediateExit = (cfg.regime ?? 'off') !== 'off' && cfg.regimeExit === 'immediate'
  const bearInverse = (cfg.regime ?? 'off') !== 'off' && cfg.bearHolding === 'inverse'
  const invRet = bearInverse ? inverseReturns(baselines) : new Map<string, number>()
  /** 空頭那天手上要放什麼：反 1（有資料）或現金。 */
  const bearTarget = (d: string): Map<string, number> =>
    bearInverse && invRet.has(d) ? new Map([[INVERSE_CODE, 1]]) : new Map<string, number>()
  let inverseDays = 0
  let pending: { target: Map<string, number>; applyAt: number; signalDate: string } | null = null
  // 每檔進場後的參考 adjClose（買進日）與波段高點
  const entry = new Map<string, { in: number; peak: number }>()
  const cost1 = cfg.costBps / 1e4

  const applyRebalance = (
    target: Map<string, number>,
    tradeDate: string,
    signalDate: string,
    adj: Map<string, number>,
  ) => {
    const to = turnoverOf(weights, target)
    turnovers.push(to)
    eq *= 1 - cost1 * to * 2 // 來回
    weights = target
    for (const c of target.keys()) {
      if (!entry.has(c)) {
        const p = adj.get(c) ?? 0
        entry.set(c, { in: p, peak: p })
      }
    }
    for (const c of entry.keys()) if (!target.has(c)) entry.delete(c)
    holdings.push({ signalDate, tradeDate, codes: [...target.keys()] })
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const adj = adjMap(row)

    if (i > 0) {
      const rets = dailyReturns(rows[i - 1]!, row)
      const ir = invRet.get(row.date)
      if (ir != null) rets.set(INVERSE_CODE, ir)
      const r = portfolioReturn(weights, rets)
      eq *= 1 + r
      weights = drift(weights, rets, r)
      dailyEq.push(r)
      // 基準：選股池等權（每日再平衡）
      const poolRets = poolCodes(rows[i - 1]!, cfg.poolTopN)
        .map((c) => rets.get(c))
        .filter((v): v is number => v !== undefined)
      if (poolRets.length) {
        bench *= 1 + poolRets.reduce((a, b) => a + b, 0) / poolRets.length
      }

      // 停損檢查（用當日 adjClose）
      if (stopType !== 'none' && stopFrac > 0) {
        for (const [c, w] of weights) {
          if (w <= 0 || c === INVERSE_CODE) continue // 避險部位不停損
          const e = entry.get(c)
          const px = adj.get(c)
          if (!e || px == null) continue
          e.peak = Math.max(e.peak, px)
          const ref = stopType === 'trailing' ? e.peak : e.in
          if (ref > 0 && px / ref - 1 <= -stopFrac) {
            eq *= 1 - cost1 * w // 賣出成本
            weights.set(c, 0)
            entry.delete(c)
            stops++
          }
        }
      }

      // immediate：一轉空頭當天清掉股票部位（→ 現金或反 1）
      if (immediateExit && regimeMap.get(row.date) === 'bear') {
        let stockW = 0
        for (const [c, w] of weights) if (c !== INVERSE_CODE) stockW += w
        const inInverse = (weights.get(INVERSE_CODE) ?? 0) > 1e-9
        const wantInverse = bearInverse && invRet.has(row.date)
        if (stockW > 1e-9) {
          eq *= 1 - cost1 * stockW
          weights = new Map()
          entry.clear()
          if (pending && pending.target.size > 0) pending = null // 取消尚未成交的進場
        }
        if (wantInverse && !inInverse && weights.size === 0) {
          eq *= 1 - cost1 // 買進反 1 成本
          weights = new Map([[INVERSE_CODE, 1]])
          entry.set(INVERSE_CODE, { in: 0, peak: 0 })
        } else if (!wantInverse && inInverse) {
          eq *= 1 - cost1 // 反 1 → 現金
          weights = new Map()
          entry.delete(INVERSE_CODE)
        }
      }
    }

    // 到了成交日 → 換股（空頭時就算 target 是空的也要換 = 出清持股）
    if (pending && i >= pending.applyAt) {
      applyRebalance(pending.target, row.date, pending.signalDate, adj)
      pending = null
    }

    // 訊號日 → 排名（用當日資料）；空頭則目標 = 現金 / 反 1
    if (rebalSet.has(row.date)) {
      const bear = regimeMap.get(row.date) === 'bear'
      const target = bear ? bearTarget(row.date) : targetWeights(row, cfg)
      pending = { target, applyAt: i + lag, signalDate: row.date }
      if (lag === 0) {
        applyRebalance(target, row.date, row.date, adj)
        pending = null
      }
    }

    if ((weights.get(INVERSE_CODE) ?? 0) > 1e-9) inverseDays++

    dates.push(row.date)
    equity.push(eq)
    benchmark.push(bench)
    regime.push(regimeMap.get(row.date) ?? 'bull')
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
    regime,
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
      stops,
      bearShare: regime.length ? regime.filter((r) => r === 'bear').length / regime.length : 0,
      inverseShare: dates.length ? inverseDays / dates.length : 0,
      tradingDays: dates.length,
      years,
    },
  }
}
