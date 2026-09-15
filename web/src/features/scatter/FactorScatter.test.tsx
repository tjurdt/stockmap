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
  it('點少的時候每檔都直接標名字', () => {
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

  it('點很多時只選擇性標名字 —— 全部都標一定重疊，等於沒標', () => {
    // 30 檔擠在幾乎同一個位置，標籤一定互相碰撞
    const stocks = Array.from({ length: 30 }, (_, i) =>
      mk({ code: String(1000 + i), name: `公司${i}`, pe: 20 + i * 0.01, mom121: 30 + i * 0.01 }),
    )
    render(<FactorScatter stocks={stocks} opts={opts} />)
    const labelled = stocks.filter((d) => screen.queryByText(d.name) !== null)
    expect(labelled.length).toBeGreaterThan(0)
    expect(labelled.length).toBeLessThanOrEqual(10)
  })

  it('顏色有圖例可對照（不能只靠顏色說話）', () => {
    render(<FactorScatter stocks={[mk({ code: '2330', name: '台積電' })]} opts={opts} />)
    expect(screen.getByText('今日漲')).toBeInTheDocument()
    expect(screen.getByText('今日跌')).toBeInTheDocument()
  })
})
