import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchLiveQuotes, type LiveQuote } from '../lib/live'
import { useLiveQuotes } from './useLiveQuotes'

vi.mock('../lib/live', async (original) => ({
  ...(await original<typeof import('../lib/live')>()),
  fetchLiveQuotes: vi.fn(),
  liveAvailable: true,
}))

const fetchQuotes = vi.mocked(fetchLiveQuotes)
const quotes = new Map<string, LiveQuote>([
  ['2330', { code: '2330', price: 110, prevClose: 100, date: '2026-09-23', time: null }],
])

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-23T02:00:00Z'))
  fetchQuotes.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('useLiveQuotes', () => {
  it('fetches the closing quote immediately after hours and refreshes every ten minutes', async () => {
    vi.setSystemTime(new Date('2026-09-23T06:30:00Z'))
    fetchQuotes.mockResolvedValue(quotes)
    const { result } = renderHook(() => useLiveQuotes(['2330']))
    await act(async () => {})
    expect(result.current.phase).toBe('closed')
    expect(result.current.quotes).toBe(quotes)
    expect(fetchQuotes).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(590_000)
    })
    expect(fetchQuotes).toHaveBeenCalledTimes(1)
    expect(result.current.quotes).toBe(quotes)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(fetchQuotes).toHaveBeenCalledTimes(2)
    expect(result.current.quotes).toBe(quotes)
  })

  it.each(['empty', 'error'])('clears cached quotes after an %s response', async (kind) => {
    fetchQuotes.mockResolvedValueOnce(quotes)
    if (kind === 'empty') fetchQuotes.mockResolvedValueOnce(new Map())
    else fetchQuotes.mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useLiveQuotes(['2330']))
    await act(async () => {})
    expect(result.current.isLive).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(result.current.quotes.size).toBe(0)
    expect(result.current.failed).toBe(true)
    expect(result.current.isLive).toBe(false)
  })

  it('does not start overlapping requests', async () => {
    let resolve!: (value: Map<string, LiveQuote>) => void
    fetchQuotes.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const { result } = renderHook(() => useLiveQuotes(['2330']))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(fetchQuotes).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolve(quotes)
    })
    expect(result.current.quotes).toBe(quotes)
  })

  it('ignores an old request after changing the requested codes', async () => {
    let resolve!: (value: Map<string, LiveQuote>) => void
    fetchQuotes.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    fetchQuotes.mockResolvedValueOnce(new Map())
    const { result, rerender } = renderHook(({ codes }) => useLiveQuotes(codes), {
      initialProps: { codes: ['2330'] },
    })
    rerender({ codes: ['2317'] })
    await act(async () => {})
    await act(async () => {
      resolve(quotes)
    })
    expect(result.current.quotes.size).toBe(0)
  })

  it('clears quotes and failure state when disabled', async () => {
    fetchQuotes.mockResolvedValueOnce(quotes)
    const { result, rerender } = renderHook(({ enabled }) => useLiveQuotes(['2330'], enabled), {
      initialProps: { enabled: true },
    })
    await act(async () => {})
    rerender({ enabled: false })
    expect(result.current.quotes.size).toBe(0)
    expect(result.current.failed).toBe(false)
  })
})
