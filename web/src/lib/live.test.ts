import { describe, expect, it } from 'vitest'

import { isMarketHours } from './live'

// 用固定 UTC 時刻推算 Asia/Taipei（UTC+8，台灣不實施日光節約）
const at = (iso: string) => new Date(iso)

describe('isMarketHours', () => {
  it('true 在週三 10:00 TPE', () => {
    expect(isMarketHours(at('2026-09-02T02:00:00Z'))).toBe(true) // = 10:00 TPE 週三
  })

  it('false 在週三 08:30 TPE（開盤前）', () => {
    expect(isMarketHours(at('2026-09-02T00:30:00Z'))).toBe(false)
  })

  it('false 在週三 14:30 TPE（收盤緩衝後）', () => {
    expect(isMarketHours(at('2026-09-02T06:30:00Z'))).toBe(false)
  })

  it('true 在週三 13:50 TPE（收盤後緩衝內，Yahoo 資料落定）', () => {
    expect(isMarketHours(at('2026-09-02T05:50:00Z'))).toBe(true)
  })

  it('false 在週六', () => {
    expect(isMarketHours(at('2026-09-05T02:00:00Z'))).toBe(false)
  })
})
