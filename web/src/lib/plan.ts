/**
 * 操作計畫 —— 策略設定 + 上線日 + 目前持股。
 *
 * 網站端存在瀏覽器 localStorage（每台裝置一份）；每晚提醒信的「單一事實來源」
 * 則是 GitHub Actions secret `OPERATOR_PLAN`（本檔 `operatorPlanSchema` 的 JSON）。
 * zod schema 需與 `schema/operator_plan.schema.json` 對齊（`plan.contract.test.ts` 會擋 drift）。
 */
import { useCallback, useState } from 'react'
import { z } from 'zod'

import { DEFAULT_PARAMS, type StrategyParams } from '../features/backtest/strategyParams'
import type { Position } from './portfolio'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const strategySchema = z.object({
  factor: z.enum(['price', 'mcap', 'pe', 'pb', 'dy', 'chg', 'turn', 'm20', 'm60', 'm121']),
  topN: z.number().int().positive(),
  poolTopN: z.number().int().positive(),
  rebalance: z.enum(['W', 'M']),
  rebalanceDay: z.number().int().min(1).max(23),
  weighting: z.enum(['equal', 'mcap']),
  execLagDays: z.number().int().min(0).max(1),
  stopType: z.enum(['none', 'fixed', 'trailing']),
  stopPct: z.number().positive(),
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

export const operatorPlanSchema = z.object({
  schemaVersion: z.literal(1),
  startDate: isoDate,
  strategy: strategySchema,
  holdings: z.array(positionSchema),
})

export type OperatorPlan = z.infer<typeof operatorPlanSchema>

/** 網站表單狀態（尚未加 schemaVersion）。 */
export interface PlanState {
  startDate: string
  strategy: StrategyParams
  holdings: Position[]
}

export function defaultPlan(strategy: StrategyParams = DEFAULT_PARAMS): PlanState {
  return { startDate: new Date().toISOString().slice(0, 10), strategy, holdings: [] }
}

export function toPlanJson(p: PlanState): OperatorPlan {
  return {
    schemaVersion: 1,
    startDate: p.startDate,
    strategy: p.strategy,
    holdings: p.holdings,
  }
}

const KEY = 'stockmap:plan.v1'

function read(): PlanState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = operatorPlanSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    const { startDate, strategy, holdings } = parsed.data
    return { startDate, strategy, holdings }
  } catch {
    return null
  }
}

export function useOperatorPlan(seedStrategy?: StrategyParams) {
  const [plan, setPlan] = useState<PlanState>(() => read() ?? defaultPlan(seedStrategy))

  const save = useCallback((next: PlanState) => {
    setPlan(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(toPlanJson(next)))
    } catch {
      /* 私密視窗 / 停用儲存 → 至少這個 session 還在 */
    }
  }, [])

  return [plan, save] as const
}
