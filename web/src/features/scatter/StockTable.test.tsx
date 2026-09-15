import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Stock } from '../../lib/data'
import { StockTable } from './StockTable'

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

const stocks = [
  mk({ code: '1111', name: '甲', mcap: 300, mom121: null }),
  mk({ code: '2222', name: '乙', mcap: 100, mom121: 50 }),
  mk({ code: '3333', name: '丙', mcap: 200, mom121: 10 }),
]

const codeOrder = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0]!.textContent)

describe('StockTable 排序', () => {
  it('預設維持傳入順序', () => {
    render(<StockTable stocks={stocks} />)
    expect(codeOrder()).toEqual(['1111', '2222', '3333'])
  })

  it('點數值欄先降冪，再點換升冪', () => {
    render(<StockTable stocks={stocks} />)
    const btn = screen.getByRole('button', { name: /市值/ })
    fireEvent.click(btn)
    expect(codeOrder()).toEqual(['1111', '3333', '2222'])
    fireEvent.click(btn)
    expect(codeOrder()).toEqual(['2222', '3333', '1111'])
  })

  it('空值一律沉底 —— 不可以被當成最小值', () => {
    render(<StockTable stocks={stocks} />)
    const btn = screen.getByRole('button', { name: /12-1 動能/ })
    fireEvent.click(btn) // 降冪
    expect(codeOrder()).toEqual(['2222', '3333', '1111'])
    fireEvent.click(btn) // 升冪，空值仍在最後
    expect(codeOrder()).toEqual(['3333', '2222', '1111'])
  })

  it('代號欄用字串排序', () => {
    render(<StockTable stocks={[...stocks].reverse()} />)
    fireEvent.click(screen.getByRole('button', { name: /代號/ }))
    expect(codeOrder()).toEqual(['1111', '2222', '3333'])
  })

  it('目前排序的欄位標在 aria-sort 上', () => {
    render(<StockTable stocks={stocks} />)
    fireEvent.click(screen.getByRole('button', { name: /市值/ }))
    expect(screen.getByRole('columnheader', { name: /市值/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
  })
})
