import { useEffect, useState } from 'react'

import { fetchLiveQuotes, isMarketHours, liveAvailable, type LiveQuote } from '../lib/live'

const FAST_MS = 20_000 // 盤中：價格在跳
const SLOW_MS = 300_000 // 盤後：偶爾刷（收盤定稿 / 隔日開盤 / 管線落後時的救援）

/**
 * `enabled` 時：掛載就抓一次，之後盤中每 20 秒、盤後每 5 分鐘刷新。
 * 不再「盤後就完全不抓」—— Yahoo 盤後會回最近一次收盤，永遠比落後的管線資料新。
 */
export function useLiveQuotes(codes: string[], enabled: boolean) {
  const [quotes, setQuotes] = useState<Map<string, LiveQuote>>(new Map())
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)
  const active = enabled && liveAvailable
  const key = codes.join(',')

  useEffect(() => {
    if (!active || codes.length === 0) {
      setQuotes(new Map())
      setFetchedAt(null)
      return
    }
    let alive = true
    let timer = 0
    const loop = () => {
      fetchLiveQuotes(codes).then(
        (q) => {
          if (alive && q.size) {
            setQuotes(q)
            setFetchedAt(new Date())
          }
        },
        () => {},
      )
      timer = window.setTimeout(loop, isMarketHours() ? FAST_MS : SLOW_MS)
    }
    loop()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key])

  return { quotes, fetchedAt, isLive: active && quotes.size > 0 }
}
