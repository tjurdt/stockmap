/**
 * 操作報告 —— 純函式，訊號頁 / 操作計畫頁 / 每晚提醒信共用的單一事實來源。
 *
 * 輸入：因子歷史 + 大盤基準 + 一份操作計畫（策略 + 上線日 + 目前持股）。
 * 輸出：一份「今天收盤後、我該知道的一切」結構，交給各處各自渲染。
 */
import type { BaselineRow } from '../../lib/baselines'
import { nextTradingDay } from '../../lib/calendar'
import type { HistoryRow } from '../../lib/history'
import { METRICS } from '../../lib/metrics'
import type { OperatorPlan } from '../../lib/plan'
import {
  factorRanking,
  isRebalanceDay,
  nextRebalanceDate,
  rankTargets,
  regimeByDate,
  shouldSwap,
  type BacktestConfig,
} from '../backtest/engine'

export interface TargetRow {
  code: string
  name: string
  factor: number
  weight: number
  price: number | null
}

export interface StopInfo {
  type: 'fixed' | 'trailing' | 'daily' | 'ma'
  /** 參考價：固定＝買進價；移動＝買進後最高（含當日收盤）；均線＝當日均線值；單日＝前一交易日收盤 */
  refPrice: number
  /** 現價相對參考價的漲跌幅（負值＝虧損） */
  pct: number
  hit: boolean
  /** 距觸發還有多少百分點（已觸發為 <= 0） */
  room: number
}

export interface HoldingRow {
  code: string
  name: string
  shares: number
  entryPrice: number
  entryDate: string
  price: number | null
  /** 未實現損益（相對買進價） */
  plPct: number | null
  value: number | null
  stop: StopInfo | null
  /** 當前選定因子的值（收盤） */
  factor: number | null
  /** 當前因子在選股池的排名（1 起；不在池中 = null） */
  factorRank: number | null
}

export interface FactorBoardRow {
  /** 選股池內依當前因子的排名（1 起） */
  rank: number
  code: string
  name: string
  factor: number
  held: boolean
  /** 持股 code → 「這檔因子 − 該持股因子」（同單位差值；動能為百分點） */
  deltaVsHolding: Record<string, number>
}

export interface ActionRow {
  kind: 'sell' | 'buy' | 'keep'
  code: string
  name: string
  shares?: number
  value?: number | null
  weight?: number
  price?: number | null
}

export interface OperatorReport {
  /** 依據的收盤資料日 */
  asOfDate: string
  /** 策略是否已上線（asOfDate >= plan.startDate） */
  started: boolean
  startDate: string
  factorLabel: string
  strategySummary: string
  regime: 'bull' | 'bear'
  /** 與前一交易日不同才有值：前一交易日的多空 */
  regimeChangedFrom: 'bull' | 'bear' | null
  /** asOfDate 是換股訊號日 → 下一交易日要照 actions 換股（排程日 / 動能換股 / 上線進場） */
  isSignalDay: boolean
  /** 非排程日、但動能換股規則觸發了 */
  swapSignal: boolean
  /** 已上線、但還沒進場（asOfDate 就是上線進場日） */
  isEntryDay: boolean
  /** 第一個 >= 上線日的交易日（上線進場日） */
  firstEntryDay: string
  /** 當前因子的選股池排名前十（+ 未進前十的持股），含相對每檔持股的因子差 */
  factorBoard: FactorBoardRow[]
  /** asOfDate 之後的下一個台股交易日 */
  nextTradingDay: string
  nextRebalanceDate: string
  /** 目前空頭且策略設定「空頭買台灣50反1」 */
  bearInverse: boolean
  targets: TargetRow[]
  holdings: HoldingRow[]
  /** 換股日 = 真的要做；非換股日 = 「下次換股日的預覽」 */
  actions: ActionRow[]
  /** 不必等換股日、今天就該出場的停損 */
  stopActionsNow: { code: string; name: string; dropPct: number }[]
}

const cfgOf = (plan: OperatorPlan): BacktestConfig => ({ ...plan.strategy, costBps: 0 })

function strategySummary(plan: OperatorPlan, factorLabel: string): string {
  const s = plan.strategy
  const parts = [
    `${factorLabel} 高者佳`,
    `市值前 ${s.poolTopN} 選前 ${s.topN} 檔`,
    s.rebalance === 'M'
      ? `每月第 ${s.rebalanceDay} 個交易日再平衡`
      : `每週星期 ${s.rebalanceDay} 再平衡`,
    s.weighting === 'mcap' ? '市值權重' : '等權',
  ]
  if (s.stopType !== 'none') {
    const label =
      s.stopType === 'trailing'
        ? `移動停損 ${s.stopPct}%`
        : s.stopType === 'daily'
          ? `單日跌幅停損 ${s.stopPct}%`
          : s.stopType === 'ma'
            ? `跌破 ${s.stopMaDays ?? 20} 日均線停損`
            : `固定停損 ${s.stopPct}%`
    parts.push(s.stopExecNext ? `${label}（隔日出場）` : label)
  }
  if (s.swapOnBetter) {
    parts.push(
      `動能換股（高出 ${s.swapMargin}%、最短持有 ${s.swapMinHoldDays} 交易日、${
        s.swapExecNext ? '隔日成交' : '訊號日成交'
      }）`,
    )
  }
  if (s.regime !== 'off') {
    parts.push(
      `多空過濾（${s.regime === 'ma' ? '均線' : '動能'} ${s.regimeDays} 日，${
        s.regimeExit === 'immediate' ? '轉空立刻清空' : '換股日才空手'
      }，空頭${s.bearHolding === 'inverse' ? '買台灣50反1' : '抱現金'}）`,
    )
  }
  return parts.join(' · ')
}

/**
 * @param names   code → 股名
 * @param priceOf 可選的即時價來源（盤中用）；回 null 時退回當日收盤
 */
export function buildOperatorReport(
  history: HistoryRow[],
  baselines: BaselineRow[],
  plan: OperatorPlan,
  names: Map<string, string>,
  holidays: Set<string> = new Set(),
  priceOf: (code: string) => number | null = () => null,
): OperatorReport | null {
  const rows = [...history].sort((a, b) => a.date.localeCompare(b.date))
  const lastRow = rows.at(-1)
  if (!lastRow) return null
  const prevRow = rows.at(-2)

  const cfg = cfgOf(plan)
  const factorLabel = METRICS[cfg.factor].label

  const regimeMap = regimeByDate(
    [prevRow?.date ?? lastRow.date, lastRow.date],
    baselines,
    cfg.regime ?? 'off',
    cfg.regimeDays ?? 200,
  )
  const regime = regimeMap.get(lastRow.date) ?? 'bull'
  const prevRegime = prevRow ? (regimeMap.get(prevRow.date) ?? 'bull') : null
  const regimeChangedFrom = prevRegime && prevRegime !== regime ? prevRegime : null

  const isRebalDay = isRebalanceDay(
    rows.map((r) => r.date),
    lastRow.date,
    cfg.rebalance,
    cfg.rebalanceDay ?? 1,
  )

  const name = (code: string) => names.get(code) ?? ''
  const closeOf = (code: string): number | null =>
    lastRow.stocks.find((s) => s.code === code)?.close ?? null
  const px = (code: string): number | null => priceOf(code) ?? closeOf(code)

  const peakSince = (code: string, from: string): number => {
    let mx = 0
    for (const r of rows) {
      if (r.date < from) continue
      const s = r.stocks.find((x) => x.code === code)
      if (s?.close != null) mx = Math.max(mx, s.close)
    }
    return mx
  }

  const rawTargets = regime === 'bear' ? [] : rankTargets(lastRow, cfg)
  const targets: TargetRow[] = rawTargets.map((t) => ({
    code: t.code,
    name: name(t.code),
    factor: t.factor,
    weight: t.weight,
    price: px(t.code),
  }))

  // 動能換股：非排程日也可能因為挑戰者反超而觸發換股
  const factorOf = (code: string): number | null => {
    const s = lastRow.stocks.find((x) => x.code === code)
    if (!s) return null
    const v = (s as Record<string, unknown>)[METRICS[cfg.factor].field]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  const heldDays = (code: string): number => {
    const h = plan.holdings.find((x) => x.code === code)
    return h ? rows.filter((r) => r.date > h.entryDate && r.date <= lastRow.date).length : 0
  }
  const swapSignal =
    regime !== 'bear' &&
    !isRebalDay &&
    plan.holdings.length > 0 &&
    shouldSwap(
      cfg,
      rawTargets.map((t) => t.code),
      plan.holdings.map((h) => h.code),
      factorOf,
      heldDays,
    )

  // 上線進場：已過上線日、但還沒建倉 → 今天就是進場日（在建倉前每天都提示）
  const started = lastRow.date >= plan.startDate
  const firstEntryDay = rows.find((r) => r.date >= plan.startDate)?.date ?? plan.startDate
  const isEntryDay = started && plan.holdings.length === 0 && regime !== 'bear'

  const isSignalDay = isRebalDay || swapSignal || isEntryDay

  // 動能排行 vs 我的持股（前十 + 未進前十的持股）
  const heldSet = new Set(plan.holdings.map((h) => h.code))
  const fullRank = regime === 'bear' ? [] : factorRanking(lastRow, cfg, 9999)
  const rankOf = new Map(fullRank.map((r, i) => [r.code, i + 1]))
  const factorByCode = new Map(fullRank.map((r) => [r.code, r.factor]))
  const boardCodes = [
    ...fullRank.slice(0, 10).map((r) => r.code),
    ...plan.holdings.map((h) => h.code).filter((c) => factorByCode.has(c) && !rankOf.has(c)),
  ]
  const heldFactors = plan.holdings
    .map((h) => [h.code, factorByCode.get(h.code) ?? factorOf(h.code)] as const)
    .filter((e): e is readonly [string, number] => e[1] != null)
  const factorBoard: FactorBoardRow[] = [...new Set(boardCodes)]
    .filter((c) => factorByCode.has(c) && rankOf.has(c))
    .map((code) => {
      const factor = factorByCode.get(code)!
      const deltaVsHolding: Record<string, number> = {}
      for (const [hc, hf] of heldFactors) deltaVsHolding[hc] = factor - hf
      return {
        rank: rankOf.get(code)!,
        code,
        name: name(code),
        factor,
        held: heldSet.has(code),
        deltaVsHolding,
      }
    })
    .sort((a, b) => a.rank - b.rank)

  const stopFrac = (plan.strategy.stopPct ?? 0) / 100
  const maDays = Math.max(2, Math.round(plan.strategy.stopMaDays ?? 20))

  /** 某代號近 n 個交易日收盤均值（含 lastRow）。 */
  const maClose = (code: string, n: number): number | null => {
    const closes: number[] = []
    for (let k = rows.length - 1; k >= 0 && closes.length < n; k--) {
      const s = rows[k]!.stocks.find((x) => x.code === code)
      if (s?.close != null) closes.push(s.close)
    }
    return closes.length ? closes.reduce((a, b) => a + b, 0) / closes.length : null
  }
  /** 某代號前一個交易日收盤（給單日跌幅停損）。 */
  const prevClose = (code: string): number | null =>
    prevRow?.stocks.find((s) => s.code === code)?.close ?? null

  const stopOf = (code: string, entryPrice: number, entryDate: string): StopInfo | null => {
    const type = plan.strategy.stopType
    if (type === 'none') return null
    const now = px(code)
    if (now == null) return null

    let refPrice: number | null
    if (type === 'trailing') refPrice = Math.max(entryPrice, peakSince(code, entryDate))
    else if (type === 'ma') refPrice = maClose(code, maDays)
    else if (type === 'daily') refPrice = prevClose(code)
    else refPrice = entryPrice
    if (refPrice == null || refPrice <= 0) return null

    const pct = now / refPrice - 1
    // ma：現價低於均線就出場（不看 stopPct）；其餘：跌幅超過 stopPct
    const hit = type === 'ma' ? pct < 0 : pct <= -stopFrac
    const room = type === 'ma' ? pct : pct + stopFrac
    return { type, refPrice, pct, hit, room }
  }

  const holdings: HoldingRow[] = plan.holdings.map((h) => {
    const price = px(h.code)
    return {
      code: h.code,
      name: name(h.code),
      shares: h.shares,
      entryPrice: h.entryPrice,
      entryDate: h.entryDate,
      price,
      plPct: price != null ? price / h.entryPrice - 1 : null,
      value: price != null ? price * h.shares : null,
      stop: stopOf(h.code, h.entryPrice, h.entryDate),
      factor: factorByCode.get(h.code) ?? factorOf(h.code),
      factorRank: rankOf.get(h.code) ?? null,
    }
  })

  const targetCodes = new Set(targets.map((t) => t.code))
  const heldCodes = new Set(plan.holdings.map((h) => h.code))
  const actions: ActionRow[] = [
    ...holdings
      .filter((h) => !targetCodes.has(h.code))
      .map<ActionRow>((h) => ({
        kind: 'sell',
        code: h.code,
        name: h.name,
        shares: h.shares,
        value: h.value,
        price: h.price,
      })),
    ...targets
      .filter((t) => !heldCodes.has(t.code))
      .map<ActionRow>((t) => ({
        kind: 'buy',
        code: t.code,
        name: t.name,
        weight: t.weight,
        price: t.price,
      })),
    ...holdings
      .filter((h) => targetCodes.has(h.code))
      .map<ActionRow>((h) => ({ kind: 'keep', code: h.code, name: h.name })),
  ]

  const stopActionsNow = holdings
    .filter((h) => h.stop?.hit)
    .map((h) => ({ code: h.code, name: h.name, dropPct: h.stop!.pct }))

  const bearInverse = regime === 'bear' && plan.strategy.bearHolding === 'inverse'

  return {
    asOfDate: lastRow.date,
    started,
    startDate: plan.startDate,
    factorLabel,
    strategySummary: strategySummary(plan, factorLabel),
    regime,
    regimeChangedFrom,
    isSignalDay,
    swapSignal,
    isEntryDay,
    firstEntryDay,
    factorBoard,
    nextTradingDay: nextTradingDay(lastRow.date, holidays),
    nextRebalanceDate: nextRebalanceDate(
      lastRow.date,
      cfg.rebalance,
      cfg.rebalanceDay ?? 1,
      holidays,
    ),
    bearInverse,
    targets,
    holdings,
    actions,
    stopActionsNow,
  }
}
