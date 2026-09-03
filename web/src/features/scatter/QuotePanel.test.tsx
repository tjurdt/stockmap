import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Stock } from '../../lib/data'
import { QuotePanel } from './QuotePanel'

const mk = (over: Partial<Stock>): Stock => ({
  code: '0000',
  name: 'X',
  close: 100,
  chgPct: 0,
  mcap: 100,
  value: 1,
  pe: 10,
  pb: 1,
  dy: 1,
  mom20: 1,
  mom60: 1,
  mom121: 1,
  ...over,
})

describe('QuotePanel', () => {
  it('lists every stock with price + change, sorted by market cap', () => {
    render(
      <QuotePanel
        stocks={[
          mk({ code: '2317', name: '鴻海', close: 251, chgPct: -1.95, mcap: 3 }),
          mk({ code: '2330', name: '台積電', close: 2390, chgPct: 0.21, mcap: 60 }),
        ]}
        live
      />,
    )
    expect(screen.getByText('盤中價')).toBeInTheDocument()
    const names = screen.getAllByText(/台積電|鴻海/).map((n) => n.textContent)
    expect(names[0]).toContain('台積電') // 市值大的排前面
    expect(screen.getByText('2,390')).toBeInTheDocument()
    expect(screen.getByText('-1.95%')).toBeInTheDocument()
  })

  it('shows 收盤價 header when not live', () => {
    render(<QuotePanel stocks={[mk({})]} live={false} />)
    expect(screen.getByText('收盤價')).toBeInTheDocument()
  })
})
