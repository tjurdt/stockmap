/**
 * 操作計畫頁的三個主要區塊 —— 冒煙測試。
 * 報告用真的 `buildOperatorReport` 產生（不是手捏物件），所以這裡同時擋住
 * 「報告欄位改了、畫面沒跟著改」的 drift。
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { HistoryRow } from '../../lib/history'
import type { OperatorPlan } from '../../lib/plan'
import { DEFAULT_PARAMS } from '../backtest/strategyParams'
import { buildOperatorReport } from '../signal/report'
import { HoldingsPanel } from './HoldingsPanel'
import { SwapWatchPanel } from './SwapWatchPanel'
import { TomorrowCard } from './TomorrowCard'

// 甲一路漲、乙持平、丙一路跌 → 動能 甲 > 乙 > 丙
const history = (days: number): HistoryRow[] =>
  Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 1 + i))
    return {
      schemaVersion: 1 as const,
      date: d.toISOString().slice(0, 10),
      stocks: [
        ['1111', 100 * 1.01 ** i, 50],
        ['2222', 100, 10],
        ['3333', 100 * 0.99 ** i, -30],
      ].map(([code, close, f]) => ({
        code: code as string,
        close: close as number,
        adjClose: close as number,
        mcap: 100,
        pe: 10,
        pb: 1,
        dy: 1,
        mom20: f as number,
        mom60: f as number,
        mom121: f as number,
      })),
    }
  })

const names = new Map([
  ['1111', '甲公司'],
  ['2222', '乙公司'],
  ['3333', '丙公司'],
])

const plan = (over: Partial<OperatorPlan> = {}): OperatorPlan => ({
  schemaVersion: 1,
  startDate: '2026-01-01',
  strategy: {
    ...DEFAULT_PARAMS,
    factor: 'm20',
    topN: 1,
    poolTopN: 10,
    rebalance: 'M',
    rebalanceDay: 25,
    swapOnBetter: true,
    swapMargin: 15,
    swapMinHoldDays: 10,
    ...over.strategy,
  },
  holdings: over.holdings ?? [],
})

const reportOf = (days: number, p: OperatorPlan) =>
  buildOperatorReport(history(days), [], p, names)!

describe('TomorrowCard', () => {
  it('不用動作時給綠燈與下次換股日，不列下單清單', () => {
    const r = reportOf(
      10,
      plan({
        holdings: [{ code: '1111', shares: 1000, entryPrice: 100, entryDate: '2026-01-02' }],
      }),
    )
    render(<TomorrowCard report={r} />)
    expect(screen.getAllByText(/不用動作/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/的下單清單/)).not.toBeInTheDocument()
    expect(screen.getAllByText(new RegExp(r.nextRebalanceDate)).length).toBeGreaterThan(0)
  })

  it('要換股時列出編號步驟', () => {
    const r = reportOf(
      30,
      plan({
        strategy: { ...plan().strategy, swapMinHoldDays: 1 },
        holdings: [{ code: '3333', shares: 1000, entryPrice: 100, entryDate: '2026-01-02' }],
      }),
    )
    render(<TomorrowCard report={r} />)
    expect(screen.getByText(/的下單清單/)).toBeInTheDocument()
    expect(screen.getByText('賣出')).toBeInTheDocument()
    expect(screen.getByText('買進')).toBeInTheDocument()
  })
})

describe('HoldingsPanel', () => {
  it('空手時給說明', () => {
    render(<HoldingsPanel report={reportOf(10, plan())} factor="m20" />)
    expect(screen.getByText(/目前空手/)).toBeInTheDocument()
  })

  it('列出已持有交易日數與最短持有到期日', () => {
    const r = reportOf(
      30,
      plan({
        holdings: [{ code: '3333', shares: 1000, entryPrice: 100, entryDate: '2026-01-20' }],
      }),
    )
    render(<HoldingsPanel report={r} factor="m20" />)
    expect(screen.getByText('10 交易日')).toBeInTheDocument()
    expect(screen.getAllByText(/已掉出名單/).length).toBeGreaterThan(0)
  })
})

describe('SwapWatchPanel', () => {
  it('說明換誰、門檻多少、最快哪天可換', () => {
    const r = reportOf(
      10,
      plan({
        holdings: [{ code: '3333', shares: 1000, entryPrice: 100, entryDate: '2026-01-09' }],
      }),
    )
    render(<SwapWatchPanel report={r} factor="m20" />)
    expect(screen.getByText('3333 丙公司')).toBeInTheDocument()
    expect(screen.getAllByText(r.swapWatch.earliestSwapDate!).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/還有 \d+ 個交易日/).length).toBeGreaterThan(0)
    // 規則優先序一定要寫在畫面上
    expect(screen.getByText(/定期換股日 ＞ 最短持有天數/)).toBeInTheDocument()
  })

  it('沒開動能換股時只講定期換股日', () => {
    const p = plan()
    p.strategy.swapOnBetter = false
    render(<SwapWatchPanel report={reportOf(10, p)} factor="m20" />)
    expect(screen.getByText(/只在/)).toBeInTheDocument()
  })
})
