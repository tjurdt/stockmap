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

  // 這條是真的踩過的坑：`.panel` 宣告了 display:block，會蓋掉瀏覽器預設的
  // `[hidden] { display: none }`。jest-dom 的 toBeVisible 只看 hidden 屬性，抓不到，
  // 所以這裡直接檢查算出來的 display。
  it('收合時 CSS 真的把它藏起來（不是只掛 hidden 屬性）', () => {
    render(<InfoHint label="說明">內容</InfoHint>)
    const panel = screen.getByText('內容')
    expect(getComputedStyle(panel).display).toBe('none')

    fireEvent.click(screen.getByRole('button'))
    expect(getComputedStyle(panel).display).toBe('block')
  })

  it('aria-controls 指到那塊說明，讀屏才連得起來', () => {
    render(<InfoHint label="說明">內容</InfoHint>)
    const id = screen.getByRole('button').getAttribute('aria-controls')
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)).toHaveTextContent('內容')
  })
})
