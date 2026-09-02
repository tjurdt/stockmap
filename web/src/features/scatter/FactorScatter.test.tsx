import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Stock } from '../../lib/data'
import { FactorScatter, type ScatterOptions } from './FactorScatter'

const opts: ScatterOptions = {
  xKey: 'pe',
  yKey: 'm121',
  logX: false,
  logY: false,
  sizeByMcap: true,
  medianLines: true,
}

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

describe('FactorScatter', () => {
  it('renders a point label per valid stock', () => {
    const stocks = [
      mk({ code: '2330', name: '台積電', pe: 20, mom121: 30 }),
      mk({ code: '2317', name: '鴻海', pe: 15, mom121: 10 }),
    ]
    render(<FactorScatter stocks={stocks} opts={opts} />)
    expect(screen.getByText('台積電')).toBeInTheDocument()
    expect(screen.getByText('鴻海')).toBeInTheDocument()
  })

  it('drops stocks with a null value on a selected axis', () => {
    const stocks = [
      mk({ code: '2330', name: '台積電', mom121: 30 }),
      mk({ code: '2317', name: '鴻海', mom121: null }),
    ]
    render(<FactorScatter stocks={stocks} opts={opts} />)
    expect(screen.getByText('台積電')).toBeInTheDocument()
    expect(screen.queryByText('鴻海')).not.toBeInTheDocument()
  })

  it('shows an empty-state message when nothing is plottable', () => {
    render(<FactorScatter stocks={[mk({ pe: null })]} opts={opts} />)
    expect(screen.getByText(/無有效資料/)).toBeInTheDocument()
  })
})
