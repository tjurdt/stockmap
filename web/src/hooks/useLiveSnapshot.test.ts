import { renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

import type { Snapshot } from '../lib/data'
import { useAsync } from './useAsync'
import { useLiveQuotes } from './useLiveQuotes'
import { useLiveSnapshot } from './useLiveSnapshot'
import { useSnapshot } from './useSnapshot'

vi.mock('./useAsync', () => ({ useAsync: vi.fn() }))
vi.mock('./useLiveQuotes', () => ({ useLiveQuotes: vi.fn() }))
vi.mock('./useSnapshot', () => ({ useSnapshot: vi.fn() }))

const snapshot: Snapshot = {
  schemaVersion: 1,
  asOf: '2026-09-22',
  generatedAt: '2026-09-22T22:00:00+08:00',
  histLen: 400,
  stocks: [
    {
      code: '2330',
      name: 'TSMC',
      close: 100,
      chgPct: 1,
      mcap: 1000,
      value: 10,
      pe: 20,
      pb: 5,
      dy: 2,
      mom20: 1,
      mom60: 2,
      mom121: 3,
    },
  ],
}

beforeEach(() => {
  vi.mocked(useSnapshot).mockReturnValue({ status: 'ready', data: snapshot })
  vi.mocked(useAsync).mockReturnValue({ status: 'loading' })
})

it('requests snapshot codes and labels the quote date while history is unavailable', () => {
  vi.mocked(useLiveQuotes).mockReturnValue({
    quotes: new Map([
      ['2330', { code: '2330', price: 110, prevClose: null, date: '2026-09-23', time: null }],
    ]),
    phase: 'closed',
    failed: false,
    isLive: true,
  })
  const { result } = renderHook(() => useLiveSnapshot())
  expect(useLiveQuotes).toHaveBeenLastCalledWith(['2330'], true)
  expect(result.current.stocks[0]!.close).toBe(110)
  expect(result.current.stocks[0]!.chgPct).toBeNull()
  expect(result.current.asOf).toContain('2026-09-23')
  expect(result.current.asOf).toContain('2026-09-22')
})

it('keeps official daily change when the provider supplies a conflicting same-day reference', () => {
  vi.mocked(useLiveQuotes).mockReturnValue({
    quotes: new Map([
      ['2330', { code: '2330', price: 100, prevClose: 90, date: '2026-09-22', time: null }],
    ]),
    phase: 'closed',
    failed: false,
    isLive: true,
  })
  const { result } = renderHook(() => useLiveSnapshot())
  expect(result.current.stocks[0]).toBe(snapshot.stocks[0])
  expect(result.current.stocks[0]!.chgPct).toBe(1)
  expect(result.current.asOf).toBe('收盤 2026-09-22')
})

it('shows the current closing quote after hours until the official data catches up', () => {
  const previousRow = {
    schemaVersion: 1 as const,
    date: snapshot.asOf,
    stocks: [{ ...snapshot.stocks[0]!, adjClose: 100 }],
  }
  vi.mocked(useAsync).mockReturnValue({ status: 'ready', data: [previousRow] })
  // The deployed provider may omit date; 05:30 UTC is the 13:30 Taiwan close.
  vi.mocked(useLiveQuotes).mockReturnValue({
    quotes: new Map([
      [
        '2330',
        { code: '2330', price: 110, prevClose: 100, date: null, time: '2026-09-23T05:30:00Z' },
      ],
    ]),
    phase: 'closed',
    failed: false,
    isLive: true,
  })
  const { result, rerender } = renderHook(() => useLiveSnapshot())
  expect(result.current.stocks[0]!.close).toBe(110)
  expect(result.current.stocks[0]!.chgPct).toBeCloseTo(10)
  expect(result.current.market.priceOf('2330')).toBe(110)
  expect(result.current.market.rows).toHaveLength(2)
  expect(result.current.market.rows.at(-1)!.stocks[0]!.close).toBe(110)
  expect(result.current.asOf).toBe('暫定收盤 2026-09-23（官方資料到 2026-09-22）')

  const official: Snapshot = {
    ...snapshot,
    asOf: '2026-09-23',
    stocks: [{ ...snapshot.stocks[0]!, close: 110, chgPct: 10 }],
  }
  vi.mocked(useSnapshot).mockReturnValue({ status: 'ready', data: official })
  vi.mocked(useAsync).mockReturnValue({
    status: 'ready',
    data: [
      previousRow,
      {
        schemaVersion: 1,
        date: official.asOf,
        stocks: [{ ...official.stocks[0]!, adjClose: 110 }],
      },
    ],
  })
  rerender()
  expect(result.current.stocks[0]).toBe(official.stocks[0])
  expect(result.current.market.priceOf('2330')).toBe(110)
  expect(result.current.market.provisionalDate).toBeNull()
  expect(result.current.market.rows).toHaveLength(2)
  expect(result.current.asOf).toBe('收盤 2026-09-23')
})
