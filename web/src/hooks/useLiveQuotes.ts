import { useEffect, useState } from 'react'

import { fetchLiveQuotes, isMarketHours, liveAvailable, type LiveQuote } from '../lib/live'

const POLL_MS = 20_000

/** enabled 且盤中時，每 20 秒抓一次即時報價。盤後或停用時回空 Map。 */
export function useLiveQuotes(codes: string[], enabled: boolean) {
  const [quotes, setQuotes] = useState<Map<string, LiveQuote>>(new Map())
  const active = enabled && liveAvailable
  const key = codes.join(',')

  useEffect(() => {
    if (!active || codes.length === 0) {
      setQuotes(new Map())
      return
    }
    let alive = true
    const tick = () => {
      if (!isMarketHours()) return
      fetchLiveQuotes(codes).then(
        (q) => {
          if (alive) setQuotes(q)
        },
        () => {},
      )
    }
    tick()
    const id = window.setInterval(tick, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key])

  return { quotes, isLive: active && quotes.size > 0 }
}
