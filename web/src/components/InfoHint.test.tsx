import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { InfoHint } from './InfoHint'

describe('InfoHint', () => {
  it('預設收合，點了才展開、再點收回', () => {
    render(<InfoHint label="欄位說明">停損線是跌破就賣的價位</InfoHint>)

    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(/停損線/)).not.toBeVisible()

    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/停損線/)).toBeVisible()

    fireEvent.click(btn)
    expect(screen.getByText(/停損線/)).not.toBeVisible()
  })

  it('鈕的無障礙名稱講得出它會展開什麼', () => {
    render(<InfoHint label="資料來源">來源說明</InfoHint>)
    expect(screen.getByRole('button', { name: '展開資料來源' })).toBeInTheDocument()
  })

  it('aria-controls 指到那塊說明，讀屏才連得起來', () => {
    render(<InfoHint label="說明">內容</InfoHint>)
    const id = screen.getByRole('button').getAttribute('aria-controls')
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)).toHaveTextContent('內容')
  })
})
