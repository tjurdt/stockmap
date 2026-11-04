/**
 * 操作計畫 —— 策略設定 + 上線日 + 交易日誌（持股由日誌推算）。
 *
 * 只存在瀏覽器 localStorage（每台裝置一份，`operatorPlanSchema` 的 JSON）。
 * zod schema 需與 `schema/operator_plan.schema.json` 對齊（`plan.contract.test.ts` 會擋 drift）。
 *
 * `holdings` 仍是契約裡的欄位（舊格式、`buildOperatorReport` 讀它）；有 `trades` 時 holdings
 * 由 `buildLedger` 推算後寫進去，使用者只需要維護交易日誌。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'

import { DEFAULT_PARAMS, type StrategyParams } from '../features/backtest/strategyParams'
import { readLegacyHoldings, type Position } from './portfolio'
import { buildLedger, tradesFromPositions, type Trade } from './trades'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const strategySchema = z.object({
  factor: z.enum([
    'price',
    'mcap',
    'pe',
    'pb',
    'dy',
    'chg',
    'turn',
    'm20',
    'm60',
    'm121',
    'custom',
  ]),
  momDays: z.number().int().nonnegative(),
  momSkip: z.number().int().nonnegative(),
  /** 只在 factor==='custom' 時有意義；公式見 `lib/formula.ts`。 */
  customFormula: z.string(),
  customLabel: z.string(),
  customBetterWhen: z.enum(['high', 'low']),
  topN: z.number().int().positive(),
  poolTopN: z.number().int().positive(),
  rebalance: z.enum(['W', 'M']),
  rebalanceDay: z.number().int().min(1).max(23),
  weighting: z.enum(['equal', 'mcap']),
  execLagDays: z.number().int().min(0).max(1),
  stopType: z.enum(['none', 'fixed', 'trailing', 'daily', 'ma']),
  stopPct: z.number().positive(),
  stopMaDays: z.number().int().positive(),
  stopExecNext: z.boolean(),
  /** 自買進漲超過這個 % 就賣；0 = 不停利。成交時點同 stopExecNext。 */
  takeProfitPct: z.number().nonnegative(),
  swapOnBetter: z.boolean(),
  swapMargin: z.number().nonnegative(),
  /** relative＝最弱持股因子值的 margin%；absolute＝因子原始單位的差值。 */
  swapMarginMode: z.enum(['relative', 'absolute']),
  swapMinHoldDays: z.number().int().nonnegative(),
  swapExecNext: z.boolean(),
  regime: z.enum(['off', 'ma', 'mom']),
  regimeDays: z.number().int().positive(),
  regimeExit: z.enum(['rebalance', 'immediate']),
  bearHolding: z.enum(['cash', 'inverse']),
})

export const positionSchema = z.object({
  code: z.string().regex(/^\d{4}$/),
  shares: z.number().positive(),
  entryPrice: z.number().positive(),
  entryDate: isoDate,
})

export const tradeSchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  code: z.string().regex(/^\d{4}$/),
  side: z.enum(['buy', 'sell']),
  shares: z.number().positive(),
  price: z.number().positive(),
})

export const operatorPlanSchema = z.object({
  schemaVersion: z.literal(1),
  startDate: isoDate,
  strategy: strategySchema,
  holdings: z.array(positionSchema),
  /** 交易日誌（可省略，舊計畫沒有）。有的話 holdings 由它推算。 */
  trades: z.array(tradeSchema).optional(),
})

export type OperatorPlan = z.infer<typeof operatorPlanSchema>

/** 網站表單狀態（尚未加 schemaVersion；持股一律由 trades 推算）。 */
export interface PlanState {
  startDate: string
  strategy: StrategyParams
  trades: Trade[]
}

export function defaultPlan(strategy: StrategyParams = DEFAULT_PARAMS): PlanState {
  return { startDate: new Date().toISOString().slice(0, 10), strategy, trades: [] }
}

/** 交易日誌 → 操作計畫契約用的持股清單。 */
export function holdingsOf(trades: Trade[]): Position[] {
  return buildLedger(trades).positions.map((p) => ({
    code: p.code,
    shares: Math.round(p.shares),
    entryPrice: Math.round(p.entryPrice * 1e4) / 1e4,
    entryDate: p.entryDate,
  }))
}

export function toPlanJson(p: PlanState): OperatorPlan {
  return {
    schemaVersion: 1,
    startDate: p.startDate,
    strategy: p.strategy,
    holdings: holdingsOf(p.trades),
    ...(p.trades.length ? { trades: p.trades } : {}),
  }
}

const KEY = 'stockmap:plan.v1'

/**
 * 解析存檔。策略欄位以 DEFAULT_PARAMS 補底 —— 之後新增欄位時，舊存檔才不會整份驗證失敗、
 * 被當成沒有計畫（那會讓使用者的策略和買賣紀錄一起變回預設）。
 */
export function parseStoredPlan(raw: string): PlanState | null {
  try {
    const json = JSON.parse(raw)
    const parsed = operatorPlanSchema.safeParse({
      ...json,
      strategy: { ...DEFAULT_PARAMS, ...json?.strategy },
    })
    if (!parsed.success) return null
    const { startDate, strategy, holdings, trades } = parsed.data
    // 舊版沒有交易日誌 → 用既有持股（或更舊的「操作訊號」頁存的那份）轉成等值的買進紀錄
    const legacy = holdings.length ? holdings : readLegacyHoldings()
    return { startDate, strategy, trades: trades?.length ? trades : tradesFromPositions(legacy) }
  } catch {
    return null
  }
}

/** 這台裝置存的操作計畫；沒有 = null。 */
export function readStoredPlan(): PlanState | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? parseStoredPlan(raw) : null
  } catch {
    return null
  }
}

function write(next: PlanState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(toPlanJson(next)))
  } catch {
    /* 私密視窗 / 停用儲存 → 至少這個 session 還在 */
  }
}

/**
 * @param seedStrategy 從回測頁 URL query 帶來的策略；有值就**覆蓋**既有計畫的策略設定
 *                     （交易日誌 / 上線日保留）。沒有 query（直接開 /plan）就別傳。
 */
export function useOperatorPlan(seedStrategy?: StrategyParams) {
  const [plan, setPlan] = useState<PlanState>(() => readStoredPlan() ?? defaultPlan(seedStrategy))

  const save = useCallback((next: PlanState) => {
    setPlan(next)
    write(next)
  }, [])

  // seed 變了（回測頁帶新設定進來）→ 覆蓋策略，其餘保留
  const seedKey = seedStrategy ? JSON.stringify(seedStrategy) : ''
  const appliedSeed = useRef('')
  useEffect(() => {
    if (!seedStrategy || !seedKey || seedKey === appliedSeed.current) return
    appliedSeed.current = seedKey
    setPlan((p) => {
      const next = { ...p, strategy: seedStrategy }
      write(next)
      return next
    })
  }, [seedKey, seedStrategy])

  return [plan, save] as const
}
