import { useEffect, useState } from 'react'

import {
  fetchLiveQuotes,
  liveAvailable,
  marketPhase,
  type LiveQuote,
  type MarketPhase,
} from '../lib/live'

/** 盤中重抓間隔；Yahoo 本身約 15–20 分鐘延遲，20 秒已足夠即時。 */
const OPEN_MS = 20_000
/**
 * 盤後 / 假日重抓間隔。盤後價格不會再動，但仍要抓一次當作「今天的暫定收盤」
 * （管線入庫前，這是前端唯一能知道今天發生什麼事的來源）。
 */
const CLOSED_MS = 10 * 60_000
const TICK_MS = 10_000

/**
 * 報價輪詢。盤中每 20 秒、盤後每 10 分鐘抓一次；停用 / 沒代號時回空 Map。
 * 盤後也照抓 —— 「盤後回到昨天」正是這個專案要解掉的問題。
 */
export function useLiveQuotes(codes: string[], enabled = true) {
  const [quotes, setQuotes] = useState<Map<string, LiveQuote>>(new Map())
  const [phase, setPhase] = useState<MarketPhase>(() => marketPhase())
  const [failed, setFailed] = useState(false)
  const active = enabled && liveAvailable && codes.length > 0
  const key = codes.join(',')

  useEffect(() => {
    if (!active) {
      setQuotes(new Map())
      return
    }
    let alive = true
    let lastAt = 0
    const tick = () => {
      const ph = marketPhase()
      setPhase(ph)
      const wait = ph === 'open' ? OPEN_MS : CLOSED_MS
      if (Date.now() - lastAt < wait) return
      lastAt = Date.now()
      fetchLiveQuotes(codes).then(
        (q) => {
          if (!alive) return
          setFailed(false)
          if (q.size) setQuotes(q)
        },
        () => {
          if (alive) setFailed(true)
        },
      )
    }
    tick()
    const id = window.setInterval(tick, TICK_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key])

  return { quotes, isLive: active && quotes.size > 0, phase, failed }
}
