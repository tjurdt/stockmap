import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { OutcomeHistogram } from './OutcomeHistogram'

describe('OutcomeHistogram', () => {
  it('uses whole-percentage boundaries, separates gains from losses, and aligns axis ticks', () => {
    render(<OutcomeHistogram returns={[-0.21, -0.05, 0, 0.07, 0.23]} median={0} mean={0.008} />)
    const svg = screen.getByRole('img', { name: '報酬分布直方圖' })
    const bars = [...svg.querySelectorAll('rect')]
    expect(bars.length).toBeGreaterThanOrEqual(20)
    expect(bars.length).toBeLessThanOrEqual(50)
    const boundaries = new Set<number>()
    let count = 0
    for (const bar of bars) {
      const label = bar.querySelector('title')!.textContent!
      const match = /^([+-]?\d+)% ~ ([+-]?\d+)%：(\d+) 次/.exec(label)
      expect(match).not.toBeNull()
      const lo = Number(match![1])
      const hi = Number(match![2])
      count += Number(match![3])
      boundaries.add(lo)
      boundaries.add(hi)
      expect(lo < 0 && hi > 0).toBe(false)
      expect(bar).toHaveAttribute('fill', lo >= 0 ? 'var(--up)' : 'var(--down)')
    }
    expect(count).toBe(5)
    expect(screen.getByText('0%')).toBeInTheDocument()
    for (const tick of svg.querySelectorAll('text')) {
      if (/^[+-]?\d+%$/.test(tick.textContent!)) {
        expect(boundaries.has(Number(tick.textContent!.replace('%', '')))).toBe(true)
      }
    }
  })

  it('renders identical zero outcomes with a visible nonzero-width bar', () => {
    render(<OutcomeHistogram returns={[0, 0, 0]} median={0} mean={0} />)
    const title = screen.getByText(/0% ~ \+1%：3 次/)
    const bar = title.parentElement!
    expect(Number(bar.getAttribute('width'))).toBeGreaterThan(0)
    expect(Number(bar.getAttribute('height'))).toBeGreaterThan(0)
    expect(bar).toHaveAttribute('fill', 'var(--up)')
  })

  it('keeps endpoint tick labels inside the plot', () => {
    render(<OutcomeHistogram returns={[-0.5, 3]} median={1} mean={1} />)
    expect(screen.getByText('-50%')).toHaveAttribute('text-anchor', 'start')
    expect(screen.getByText('+300%')).toHaveAttribute('text-anchor', 'end')
  })

  it('does not render invalid data as a distribution', () => {
    const { container } = render(<OutcomeHistogram returns={[NaN, Infinity]} median={0} mean={0} />)
    expect(container).toBeEmptyDOMElement()
  })
})
