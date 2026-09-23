import { renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

import type { HistoryRow } from '../lib/history'
import type { LiveQuote } from '../lib/live'
import { useLiveMarket } from './useLiveMarket'
import { useLiveQuotes } from './useLiveQuotes'

vi.mock('./useLiveQuotes', () => ({ useLiveQuotes: vi.fn() }))

const stock = (code: string) => ({
  code,
  close: 100,
  adjClose: 100,
  mcap: 1000,
  pe: 20,
  pb: 5,
  dy: 2,
  mom20: 1,
  mom60: 2,
  mom121: 3,
})
const rows: HistoryRow[] = [
  { schemaVersion: 1, date: '2026-09-22', stocks: [stock('2330'), stock('2317')] },
]
const quote = (code: string, date: string, price = 110): LiveQuote => ({
  code,
  date,
  price,
  prevClose: 100,
  time: null,
})

beforeEach(() => vi.mocked(useLiveQuotes).mockReset())

function respond(quotes: LiveQuote[]) {
  vi.mocked(useLiveQuotes).mockReturnValue({
    quotes: new Map(quotes.map((q) => [q.code, q])),
    isLive: true,
    phase: 'open',
    failed: false,
  })
}

it('keeps official prices when same-day or older quotes are available', () => {
  respond([quote('2330', '2026-09-22', 95), quote('2317', '2026-09-21', 80)])
  const { result } = renderHook(() => useLiveMarket(rows))
  expect(result.current.priceOf('2330')).toBe(100)
  expect(result.current.priceOf('2317')).toBe(100)
  expect(result.current.provisionalDate).toBeNull()
  expect(result.current.isLive).toBe(false)
})

it('uses the same date rules for provisional rows and holding prices', () => {
  respond([quote('2330', '2026-09-23'), quote('2317', '2026-09-21', 80)])
  const { result } = renderHook(() => useLiveMarket(rows))
  expect(result.current.priceOf('2330')).toBe(110)
  expect(result.current.priceOf('2317')).toBe(100)
  expect(result.current.quoted).toBe(1)
})

it('can value an out-of-universe holding on the official day', () => {
  respond([quote('9999', '2026-09-22', 200)])
  const { result } = renderHook(() => useLiveMarket(rows, ['9999']))
  expect(result.current.priceOf('9999')).toBe(200)
  expect(result.current.provisionalDate).toBeNull()
})

it('does not let lagging history bypass a newer snapshot', () => {
  respond([quote('2330', '2026-09-23')])
  const { result } = renderHook(() => useLiveMarket(rows, [], true, '2026-09-23'))
  expect(result.current.quotes.size).toBe(0)
  expect(result.current.provisionalDate).toBeNull()
})
