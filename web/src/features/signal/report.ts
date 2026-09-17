/**
 * 操作報告 —— 純函式，操作計畫頁的單一事實來源。
 *
 * 輸入：因子歷史 + 大盤基準 + 一份操作計畫（策略 + 上線日 + 目前持股）。
 * 輸出：一份「到今天為止、我該知道的一切」結構，交給各處各自渲染。
 *
 * 規則優先序（與回測引擎 `engine.runBacktest` 完全一致，改這裡也要改那裡）：
 *   1. 停損觸發 —— 不等換股日，照策略設定的時點出場。
 *   2. 多空過濾 regimeExit='immediate' —— 轉空當天清空。
 *   3. **排程換股日（每月第 N 個交易日 / 每週星期 N）優先於最短持有天數。**
 *      排程日一到就照當日排名整批換，`swapMinHoldDays` 擋不住。
 *   4. 非排程日的動能換股 —— 這時 `swapMinHoldDays` 才生效（防止一天到晚換來換去）。
 */
import type { BaselineRow } from '../../lib/baselines'
import { addTradingDays, nextTradingDay, tradingDaysBetween } from '../../lib/calendar'
import type { HistoryRow } from '../../lib/history'
import { factorBetterWhen, factorFmt, factorLabel, metricField } from '../../lib/metrics'
import type { OperatorPlan } from '../../lib/plan'
import {
  factorRanking,
  isRebalanceDay,
  nextRebalanceDate,
  rankTargets,
  regimeByDate,
  shouldSwap,
  swapThreshold,
  withComputedFactors,
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
  /** 參考價：固定＝買進價；移動＝買進後最高收盤；均線＝當日均線值；單日＝前一交易日收盤 */
  refPrice: number
  /** 觸發價位（現價跌破這個就出場） */
  stopPrice: number
  /** 移動停損的波段最高收盤（含當日）；其餘型態為 null */
  peakPrice: number | null
  /** 現價相對參考價的漲跌幅（負值＝虧損；移動停損時＝距高點） */
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
  /** 買進後已經過幾個交易日 */
  heldDays: number
  /** 策略設定的最短持有交易日數（只擋非排程日的動能換股；0 = 沒設） */
  minHoldDays: number
  /** 滿足最短持有的那一天（已滿足則是過去的日期） */
  minHoldUntil: string
  minHoldMet: boolean
  /** 還要幾個交易日才滿足最短持有（已滿足 = 0） */
  minHoldDaysLeft: number
  /** 依當前排名仍是目標持股（false = 排程換股日會被換掉） */
  inTargets: boolean
}

export interface FactorBoardRow {
  /** 選股池內依當前因子的排名（1 起） */
  rank: number
  code: string
  name: string
  factor: number
  held: boolean
  /** 持股 code → 這檔因子相對該持股因子的差 */
  deltaVsHolding: Record<string, FactorDelta>
}

export interface FactorDelta {
  /** 「這檔因子 − 該持股因子」（同單位差值；動能為百分點） */
  abs: number
  /** 相對百分比：abs ÷ |該持股因子|（該持股因子為 0 時 = null） */
  pct: number | null
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

/** 動能換股的挑戰者：要贏最弱持股多少才換得動。 */
export interface SwapChallenger {
  code: string
  name: string
  factor: number
  /** 已經比最弱持股好多少（因子單位；正 = 已領先） */
  over: number
  /** 距離換股門檻還差多少（<= 0 = 已達標） */
  gap: number
  qualified: boolean
}

/** 「什麼時候可以把手上哪一檔、換成動能超越多少的哪一檔」。 */
export interface SwapWatch {
  /** 策略有開動能換股 */
  enabled: boolean
  /** 門檻：挑戰者要比最弱持股好過這個量，意義由 marginMode 決定 */
  margin: number
  /** relative：margin 是「最弱持股因子值的 margin%」；absolute：margin 就是因子原始單位的差值 */
  marginMode: 'relative' | 'absolute'
  minHoldDays: number
  /** 會被換掉的那檔（已掉出目標名單的持股裡因子最差的） */
  weakest: { code: string; name: string; factor: number } | null
  /** 挑戰者要達到的因子值（null = 目前沒有可換的對象） */
  thresholdFactor: number | null
  /** 目前排名內、未持有的挑戰者（依離門檻近到遠） */
  challengers: SwapChallenger[]
  /** 所有掉出名單的持股都過了最短持有 */
  minHoldReady: boolean
  /** 最快能換股的日期（= 待換持股裡最晚的最短持有到期日的下一個交易日） */
  earliestSwapDate: string | null
  /** 距離 earliestSwapDate 還有幾個交易日（0 = 就是下一個交易日） */
  tradingDaysToSwap: number | null
  /** 今天就觸發（下一個交易日執行） */
  triggered: boolean
}

export type VerdictKind =
  'not-started' | 'entry' | 'stop' | 'bear-exit' | 'rebalance' | 'swap' | 'hold'

/** 「明天到底要幹嘛」—— 網站大字用。 */
export interface Verdict {
  kind: VerdictKind
  /** 要不要動手 */
  act: boolean
  /** 一句話結論 */
  headline: string
  /** 補充一兩句 */
  detail: string
}

export interface OperatorReport {
  /** 依據的資料日（含盤中 / 盤後補的暫定當日列） */
  asOfDate: string
  /** asOfDate 是尚未入庫的暫定當日資料時 = 該日期，否則 null */
  provisionalDate: string | null
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
  /** asOfDate 是排程換股日（每月第 N 個交易日 / 每週星期 N） */
  isRebalanceDay: boolean
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
  /** 從今天到下次排程換股日還有幾個交易日 */
  tradingDaysToRebalance: number
  /** 目前空頭且策略設定「空頭買台灣50反1」 */
  bearInverse: boolean
  targets: TargetRow[]
  holdings: HoldingRow[]
  /** 換股日 = 真的要做；非換股日 = 「下次換股日的預覽」 */
  actions: ActionRow[]
  /** 不必等換股日、今天就該出場的停損 */
  stopActionsNow: { code: string; name: string; dropPct: number }[]
  swapWatch: SwapWatch
  verdict: Verdict
  /** 目前持股總市值（有現價的部分） */
  totalValue: number | null
}

export interface ReportOptions {
  /** 台股休市日（data/calendar.json）；沒給就只跳週末 */
  holidays?: Set<string>
  /** 可選的即時 / 最新報價來源；回 null 時退回當日收盤 */
  priceOf?: (code: string) => number | null
  /** 最後一列是「尚未入庫的暫定當日資料」時傳它的日期（純標示用） */
  provisionalDate?: string | null
}

const cfgOf = (plan: OperatorPlan): BacktestConfig => ({ ...plan.strategy, costBps: 0 })

const mmdd = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

function strategySummary(plan: OperatorPlan, factorLabelText: string): string {
  const s = plan.strategy
  const parts = [
    `${factorLabelText} 高者佳`,
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
    const marginText =
      (s.swapMarginMode ?? 'relative') === 'absolute'
        ? `高出 ${factorFmt(s.factor)(s.swapMargin)}`
        : `高出 ${s.swapMargin}%`
    parts.push(
      `動能換股（${marginText}、最短持有 ${s.swapMinHoldDays} 交易日、${
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

/** 一句話描述買賣清單，例如「賣出 2317 鴻海，買進 2454 聯發科」。 */
function actionPhrase(actions: ActionRow[]): string {
  const one = (a: ActionRow) => `${a.code} ${a.name}`.trim()
  const sell = actions.filter((a) => a.kind === 'sell')
  const buy = actions.filter((a) => a.kind === 'buy')
  const parts: string[] = []
  if (sell.length) parts.push(`賣出 ${sell.map(one).join('、')}`)
  if (buy.length) parts.push(`買進 ${buy.map(one).join('、')}`)
  return parts.join('，')
}

export function buildOperatorReport(
  history: HistoryRow[],
  baselines: BaselineRow[],
  plan: OperatorPlan,
  names: Map<string, string>,
  opts: ReportOptions = {},
): OperatorReport | null {
  const holidays = opts.holidays ?? new Set<string>()
  const priceOf = opts.priceOf ?? (() => null)

  const rows = [...history].sort((a, b) => a.date.localeCompare(b.date))
  const lastRow = rows.at(-1)
  if (!lastRow) return null
  const prevRow = rows.at(-2)

  const cfg = cfgOf(plan)
  // 自訂動能窗 / 自訂指標：把因子欄位換成重算值，排名一律用這份
  const fRows = withComputedFactors(rows, cfg)
  const fLast = fRows.at(-1)!
  const customMomWindow = (cfg.momDays ?? 0) > 0 && ['m20', 'm60', 'm121'].includes(cfg.factor)
  const factorLabelText = customMomWindow
    ? `自訂動能 ${cfg.momDays}${(cfg.momSkip ?? 0) > 0 ? `-${cfg.momSkip}` : ''} 日`
    : factorLabel(cfg)

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

  const rawTargets = regime === 'bear' ? [] : rankTargets(fLast, cfg)
  const targets: TargetRow[] = rawTargets.map((t) => ({
    code: t.code,
    name: name(t.code),
    factor: t.factor,
    weight: t.weight,
    price: px(t.code),
  }))

  const factorOf = (code: string): number | null => {
    const s = fLast.stocks.find((x) => x.code === code)
    if (!s) return null
    const v = (s as Record<string, unknown>)[metricField(cfg.factor)]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  const heldDaysOf = (code: string): number => {
    const h = plan.holdings.find((x) => x.code === code)
    return h ? rows.filter((r) => r.date > h.entryDate && r.date <= lastRow.date).length : 0
  }

  // 動能換股：非排程日也可能因為挑戰者反超而觸發換股
  const swapSignal =
    regime !== 'bear' &&
    !isRebalDay &&
    plan.holdings.length > 0 &&
    shouldSwap(
      cfg,
      rawTargets.map((t) => t.code),
      plan.holdings.map((h) => h.code),
      factorOf,
      heldDaysOf,
    )

  // 上線進場：已過上線日、但還沒建倉 → 今天就是進場日（在建倉前每天都提示）
  const started = lastRow.date >= plan.startDate
  const firstEntryDay = rows.find((r) => r.date >= plan.startDate)?.date ?? plan.startDate
  const isEntryDay = started && plan.holdings.length === 0 && regime !== 'bear'

  const isSignalDay = isRebalDay || swapSignal || isEntryDay

  // 動能排行 vs 我的持股（前十 + 未進前十的持股）
  const heldSet = new Set(plan.holdings.map((h) => h.code))
  const fullRank = regime === 'bear' ? [] : factorRanking(fLast, cfg, 9999)
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
      const deltaVsHolding: Record<string, FactorDelta> = {}
      for (const [hc, hf] of heldFactors) {
        const abs = factor - hf
        deltaVsHolding[hc] = { abs, pct: hf !== 0 ? (abs / Math.abs(hf)) * 100 : null }
      }
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

    const peakPrice = type === 'trailing' ? Math.max(entryPrice, peakSince(code, entryDate)) : null
    let refPrice: number | null
    if (type === 'trailing') refPrice = peakPrice
    else if (type === 'ma') refPrice = maClose(code, maDays)
    else if (type === 'daily') refPrice = prevClose(code)
    else refPrice = entryPrice
    if (refPrice == null || refPrice <= 0) return null

    const pct = now / refPrice - 1
    // ma：現價低於均線就出場（不看 stopPct，停損線 = 均線本身）；其餘：跌幅超過 stopPct
    const stopPrice = type === 'ma' ? refPrice : refPrice * (1 - stopFrac)
    const hit = type === 'ma' ? pct < 0 : pct <= -stopFrac
    const room = type === 'ma' ? pct : pct + stopFrac
    return { type, refPrice, stopPrice, peakPrice, pct, hit, room }
  }

  const targetCodes = new Set(targets.map((t) => t.code))
  const minHoldDays = Math.max(0, Math.round(plan.strategy.swapMinHoldDays ?? 0))

  const holdings: HoldingRow[] = plan.holdings.map((h) => {
    const price = px(h.code)
    const heldDays = heldDaysOf(h.code)
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
      heldDays,
      minHoldDays,
      minHoldUntil: addTradingDays(h.entryDate, minHoldDays, holidays),
      minHoldMet: heldDays >= minHoldDays,
      minHoldDaysLeft: Math.max(0, minHoldDays - heldDays),
      inTargets: targetCodes.has(h.code),
    }
  })

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
  const next = nextTradingDay(lastRow.date, holidays)
  const nextRebal = nextRebalanceDate(lastRow.date, cfg.rebalance, cfg.rebalanceDay ?? 1, holidays)

  // ── 動能換股監看：誰會被換掉、挑戰者要贏多少、最快哪天換得動 ──────────────
  const dir = factorBetterWhen(cfg) === 'high' ? 1 : -1
  const outgoing = holdings.filter(
    (h): h is HoldingRow & { factor: number } => !h.inTargets && h.factor != null,
  )
  const worst = outgoing.length
    ? outgoing.reduce((a, b) => (dir * (a.factor - b.factor) < 0 ? a : b))
    : null
  // 跟 engine.shouldSwap 共用同一個門檻算法，避免兩處漂移
  const thresholdFactor = worst ? swapThreshold(worst.factor, dir, plan.strategy) : null
  const challengers: SwapChallenger[] =
    worst && thresholdFactor != null
      ? targets
          .filter((t) => !heldCodes.has(t.code))
          .map((t) => ({
            code: t.code,
            name: t.name,
            factor: t.factor,
            over: dir * (t.factor - worst.factor),
            gap: dir * (thresholdFactor - t.factor),
            qualified: dir * (t.factor - thresholdFactor) >= 0,
          }))
          .sort((a, b) => a.gap - b.gap)
      : []
  const minHoldReady = outgoing.every((h) => h.minHoldMet)
  const earliestSwapDate = outgoing.length
    ? minHoldReady
      ? next
      : nextTradingDay(
          outgoing.map((h) => h.minHoldUntil).reduce((a, b) => (a > b ? a : b)),
          holidays,
        )
    : null
  const swapWatch: SwapWatch = {
    enabled: plan.strategy.swapOnBetter === true,
    margin: Math.max(0, plan.strategy.swapMargin ?? 0),
    marginMode: plan.strategy.swapMarginMode ?? 'relative',
    minHoldDays,
    weakest: worst ? { code: worst.code, name: worst.name, factor: worst.factor } : null,
    thresholdFactor,
    challengers,
    minHoldReady,
    earliestSwapDate,
    tradingDaysToSwap: earliestSwapDate
      ? tradingDaysBetween(lastRow.date, earliestSwapDate, holidays)
      : null,
    triggered: swapSignal,
  }

  // ── 明天到底要幹嘛 ────────────────────────────────────────────────────
  const phrase = actionPhrase(actions)
  const toRebal = tradingDaysBetween(lastRow.date, nextRebal, holidays)
  let verdict: Verdict
  if (!started) {
    verdict = {
      kind: 'not-started',
      act: false,
      headline: `還沒開始 —— ${mmdd(firstEntryDay)} 上線那天才進場`,
      detail: `上線日設定在 ${plan.startDate}；在那之前不用做任何事。`,
    }
  } else if (stopActionsNow.length > 0) {
    verdict = {
      kind: 'stop',
      act: true,
      headline: `${mmdd(next)} 要停損賣出：${stopActionsNow
        .map((s) => `${s.code} ${s.name}`.trim())
        .join('、')}`,
      detail: '停損不等換股日。賣掉後持有現金，直到下一個換股日再依排名進場。',
    }
  } else if (regime === 'bear' && plan.strategy.regimeExit === 'immediate' && holdings.length > 0) {
    verdict = {
      kind: 'bear-exit',
      act: true,
      headline: `${mmdd(next)} 清空持股（大盤轉空頭）`,
      detail: bearInverse
        ? '依策略：把持股換成元大台灣50反1（00632R），等轉多頭再換回來。'
        : `依策略：全部賣掉抱現金，等換股日（${nextRebal}）且大盤轉多再進場。`,
    }
  } else if (isEntryDay) {
    verdict = {
      kind: 'entry',
      act: true,
      headline: `${mmdd(next)} 進場：${phrase || '照目標清單建倉'}`,
      detail: `這是上線後第一次建倉；之後每逢換股日（下次 ${nextRebal}）再依排名調整。`,
    }
  } else if (isRebalDay || swapSignal) {
    const kind: VerdictKind = isRebalDay ? 'rebalance' : 'swap'
    const why = isRebalDay ? '今天是排程換股日' : '今天動能換股條件成立'
    verdict = phrase
      ? {
          kind,
          act: true,
          headline: `${mmdd(next)} 要換股：${phrase}`,
          detail: `${why}（依 ${lastRow.date} 的排名）。收盤前後下單，盡量以收盤價成交。`,
        }
      : {
          kind,
          act: false,
          headline: `${mmdd(next)} 不用動作`,
          detail: `${why}，但重新排名後名單沒變 —— 手上這幾檔續抱就好。`,
        }
  } else {
    verdict = {
      kind: 'hold',
      act: false,
      headline: `${mmdd(next)} 不用動作`,
      detail:
        holdings.length === 0
          ? `目前空手。下一個換股日 ${nextRebal}（還有 ${toRebal} 個交易日）再依排名進場。`
          : `抱著不動。下一個換股日 ${nextRebal}（還有 ${toRebal} 個交易日）；在那之前只有停損${
              swapWatch.enabled ? '或動能換股條件成立' : ''
            }才會提前出手。`,
    }
  }

  const valued = holdings.map((h) => h.value).filter((v): v is number => v != null)

  return {
    asOfDate: lastRow.date,
    provisionalDate: opts.provisionalDate ?? null,
    started,
    startDate: plan.startDate,
    factorLabel: factorLabelText,
    strategySummary: strategySummary(plan, factorLabelText),
    regime,
    regimeChangedFrom,
    isSignalDay,
    isRebalanceDay: isRebalDay,
    swapSignal,
    isEntryDay,
    firstEntryDay,
    factorBoard,
    nextTradingDay: next,
    nextRebalanceDate: nextRebal,
    tradingDaysToRebalance: toRebal,
    bearInverse,
    targets,
    holdings,
    actions,
    stopActionsNow,
    swapWatch,
    verdict,
    totalValue: valued.length ? valued.reduce((a, b) => a + b, 0) : null,
  }
}
