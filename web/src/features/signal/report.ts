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
  isRebalanceDay,
  nextRebalanceDate,
  rankTargets,
  regimeByDate,
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
  type: 'fixed' | 'trailing'
  /** 參考價：固定＝買進價；移動＝買進後最高（含當日收盤） */
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
  /** asOfDate 是換股訊號日 → 下一交易日要照 actions 換股 */
  isSignalDay: boolean
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
    parts.push(`${s.stopType === 'trailing' ? '移動' : '固定'}停損 ${s.stopPct}%`)
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

  const isSignalDay = isRebalanceDay(
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

  const stopFrac = (plan.strategy.stopPct ?? 0) / 100
  const stopOf = (code: string, entryPrice: number, entryDate: string): StopInfo | null => {
    if (plan.strategy.stopType === 'none') return null
    const now = px(code)
    if (now == null) return null
    const refPrice =
      plan.strategy.stopType === 'trailing'
        ? Math.max(entryPrice, peakSince(code, entryDate))
        : entryPrice
    const pct = now / refPrice - 1
    return {
      type: plan.strategy.stopType,
      refPrice,
      pct,
      hit: pct <= -stopFrac,
      room: pct + stopFrac,
    }
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
    started: lastRow.date >= plan.startDate,
    startDate: plan.startDate,
    factorLabel,
    strategySummary: strategySummary(plan, factorLabel),
    regime,
    regimeChangedFrom,
    isSignalDay,
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
