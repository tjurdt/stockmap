import { describe, expect, it } from 'vitest'

import { evalFormula, parseFormula } from './formula'

function run(text: string, series: number[]): number | null {
  const parsed = parseFormula(text)
  if (!parsed.ok) throw new Error(`parse failed: ${parsed.error}`)
  return evalFormula(parsed.ast, series)
}

// 由舊到新，最後一個是「今天」
const series = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

describe('parseFormula', () => {
  it('接受四則運算 + 括號 + 一元負號', () => {
    expect(run('1+2*3', series)).toBe(7)
    expect(run('(1+2)*3', series)).toBe(9)
    expect(run('-5+2', series)).toBe(-3)
    expect(run('2*-3', series)).toBe(-6)
  })

  it('^ 右結合、優先序高於 * /', () => {
    expect(run('2^3', series)).toBe(8)
    expect(run('2^3^2', series)).toBe(2 ** (3 ** 2))
    expect(run('2*2^2', series)).toBe(8)
  })

  it('price(n)：n 天前的還原價，price(0) = 今天', () => {
    expect(run('price(0)', series)).toBe(100)
    expect(run('price(1)', series)).toBe(90)
    expect(run('price(9)', series)).toBe(10)
  })

  it('avg(n) ≡ avg(0:n)：offset 0..n（含）的平均', () => {
    expect(run('avg(0)', series)).toBe(100)
    expect(run('avg(1)', series)).toBe((100 + 90) / 2)
    expect(run('avg(0:1)', series)).toBe((100 + 90) / 2)
  })

  it('avg(a:b) 順序不拘', () => {
    expect(run('avg(2:4)', series)).toBe(run('avg(4:2)', series))
    expect(run('avg(2:4)', series)).toBeCloseTo((80 + 70 + 60) / 3)
  })

  it('max / min 用同樣的參數語法', () => {
    expect(run('max(0:3)', series)).toBe(100)
    expect(run('min(0:3)', series)).toBe(70)
    expect(run('max(3)', series)).toBe(100)
  })

  it('複合公式：使用者範例', () => {
    expect(run('2*avg(0)/6', series)).toBeCloseTo((2 * 100) / 6)
    expect(run('1/(avg(0)+max(0))', series)).toBeCloseTo(1 / (100 + 100))
  })

  it('offset 超出資料長度回 null', () => {
    expect(run('price(20)', series)).toBeNull()
    expect(run('avg(0:20)', series)).toBeNull()
  })

  it('除以零回 null，不是 Infinity/NaN', () => {
    expect(run('1/(price(0)-price(0))', series)).toBeNull()
  })

  it('null 會沿著運算往外傳播', () => {
    expect(run('1+price(999)', series)).toBeNull()
  })

  it('price 不支援 range', () => {
    const parsed = parseFormula('price(1:2)')
    expect(parsed.ok).toBe(false)
  })

  it('語法錯誤回 {ok:false}', () => {
    expect(parseFormula('').ok).toBe(false)
    expect(parseFormula('1+').ok).toBe(false)
    expect(parseFormula('(1+2').ok).toBe(false)
    expect(parseFormula('foo(1)').ok).toBe(false)
    expect(parseFormula('avg()').ok).toBe(false)
    expect(parseFormula('1 2').ok).toBe(false)
    expect(parseFormula('avg(-1)').ok).toBe(false)
  })
})
