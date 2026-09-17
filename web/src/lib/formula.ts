/**
 * 自訂指標運算式 —— 純函式，不用 `eval`/`Function()`（使用者輸入，安全起見自己寫 parser）。
 *
 * 語法：`+ - * / ^ ()` 四則運算 + `avg`/`max`/`min`/`price`。
 *   avg(n)   ≡ avg(0:n)：offset 0（今天）到 offset n（n 個交易日前）共 n+1 天的平均
 *   avg(a:b)：offset a..b（含）的平均，a、b 順序不拘；max/min 同理
 *   price(n)：offset n 那天的還原價（單點，不支援 range）
 *
 * 對齊 `momentum.ts` 的序列慣例：series 由舊到新，最後一個是今天；
 * series[series.length-1-k] = k 個交易日前。資料不夠長、或算出非有限數（例如除以零）一律回
 * null —— 跟 `metricValue`/`histValue` 的 `Number.isFinite` 慣例一致，讓排名邏輯自然濾掉。
 */

export type FormulaFn = 'avg' | 'max' | 'min' | 'price'

export type FormulaNode =
  | { type: 'num'; value: number }
  | { type: 'call'; fn: FormulaFn; from: number; to: number }
  | { type: 'unary'; op: '+' | '-'; arg: FormulaNode }
  | { type: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: FormulaNode; right: FormulaNode }

export type ParseResult = { ok: true; ast: FormulaNode } | { ok: false; error: string }

const FUNCS = new Set<string>(['avg', 'max', 'min', 'price'])

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ident'; value: string }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '^' | '(' | ')' | ':' }
  | { kind: 'eof' }

function tokenize(text: string): Token[] | { error: string } {
  const tokens: Token[] = []
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]!
    if (/\s/.test(c)) {
      i++
      continue
    }
    if ('+-*/^():'.includes(c)) {
      tokens.push({ kind: 'op', value: c as '+' | '-' | '*' | '/' | '^' | '(' | ')' | ':' })
      i++
      continue
    }
    if (/[0-9.]/.test(c)) {
      const start = i
      while (i < n && /[0-9.]/.test(text[i]!)) i++
      const raw = text.slice(start, i)
      const value = Number(raw)
      if (raw === '' || raw === '.' || !Number.isFinite(value)) {
        return { error: `無法解析數字：「${raw}」` }
      }
      tokens.push({ kind: 'num', value })
      continue
    }
    if (/[a-zA-Z]/.test(c)) {
      const start = i
      while (i < n && /[a-zA-Z]/.test(text[i]!)) i++
      tokens.push({ kind: 'ident', value: text.slice(start, i) })
      continue
    }
    return { error: `無法辨識的字元：「${c}」` }
  }
  tokens.push({ kind: 'eof' })
  return tokens
}

class Parser {
  private pos = 0
  private tokens: Token[]
  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  peek(): Token {
    return this.tokens[this.pos]!
  }

  private next(): Token {
    return this.tokens[this.pos++]!
  }

  private expectOp(value: string): string | null {
    const t = this.peek()
    if (t.kind === 'op' && t.value === value) {
      this.pos++
      return null
    }
    return `預期「${value}」，但遇到${describe(t)}`
  }

  parseExpr(): FormulaNode | string {
    let left = this.parseTerm()
    if (typeof left === 'string') return left
    for (;;) {
      const t = this.peek()
      if (t.kind === 'op' && (t.value === '+' || t.value === '-')) {
        this.next()
        const right = this.parseTerm()
        if (typeof right === 'string') return right
        left = { type: 'binary', op: t.value, left, right }
      } else break
    }
    return left
  }

  private parseTerm(): FormulaNode | string {
    let left = this.parsePower()
    if (typeof left === 'string') return left
    for (;;) {
      const t = this.peek()
      if (t.kind === 'op' && (t.value === '*' || t.value === '/')) {
        this.next()
        const right = this.parsePower()
        if (typeof right === 'string') return right
        left = { type: 'binary', op: t.value, left, right }
      } else break
    }
    return left
  }

  private parsePower(): FormulaNode | string {
    const base = this.parseUnary()
    if (typeof base === 'string') return base
    const t = this.peek()
    if (t.kind === 'op' && t.value === '^') {
      this.next()
      const exp = this.parsePower() // 右結合
      if (typeof exp === 'string') return exp
      return { type: 'binary', op: '^', left: base, right: exp }
    }
    return base
  }

  private parseUnary(): FormulaNode | string {
    const t = this.peek()
    if (t.kind === 'op' && (t.value === '+' || t.value === '-')) {
      this.next()
      const arg = this.parseUnary()
      if (typeof arg === 'string') return arg
      return { type: 'unary', op: t.value, arg }
    }
    return this.parsePrimary()
  }

  private parseInt(): number | string {
    const t = this.next()
    if (t.kind !== 'num' || !Number.isInteger(t.value) || t.value < 0) {
      return `預期非負整數，但遇到${describe(t)}`
    }
    return t.value
  }

  private parsePrimary(): FormulaNode | string {
    const t = this.peek()
    if (t.kind === 'num') {
      this.next()
      return { type: 'num', value: t.value }
    }
    if (t.kind === 'op' && t.value === '(') {
      this.next()
      const inner = this.parseExpr()
      if (typeof inner === 'string') return inner
      const err = this.expectOp(')')
      if (err) return err
      return inner
    }
    if (t.kind === 'ident') {
      const name = t.value.toLowerCase()
      if (!FUNCS.has(name)) return `不認識的函式：「${t.value}」（只支援 avg/max/min/price）`
      this.next()
      const openErr = this.expectOp('(')
      if (openErr) return openErr
      const firstNum = this.parseInt()
      if (typeof firstNum === 'string') return firstNum
      let from: number
      let to: number
      const maybeColon = this.peek()
      if (maybeColon.kind === 'op' && maybeColon.value === ':') {
        if (name === 'price') return 'price(n) 只吃單一天數，不支援「a:b」區間'
        this.next()
        const toVal = this.parseInt()
        if (typeof toVal === 'string') return toVal
        from = firstNum
        to = toVal
      } else {
        // avg(n)/max(n)/min(n) ≡ 0:n（今天到 n 天前）；price(n) 是單點 n
        from = name === 'price' ? firstNum : 0
        to = firstNum
      }
      const closeErr = this.expectOp(')')
      if (closeErr) return closeErr
      const lo = Math.min(from, to)
      const hi = Math.max(from, to)
      return { type: 'call', fn: name as FormulaFn, from: lo, to: hi }
    }
    return `預期數字、函式或「(」，但遇到${describe(t)}`
  }
}

function describe(t: Token): string {
  if (t.kind === 'eof') return '結尾'
  if (t.kind === 'num') return `數字「${t.value}」`
  if (t.kind === 'ident') return `「${t.value}」`
  return `「${t.value}」`
}

export function parseFormula(text: string): ParseResult {
  if (!text.trim()) return { ok: false, error: '公式是空的' }
  const tokens = tokenize(text)
  if (!Array.isArray(tokens)) return { ok: false, error: tokens.error }
  const parser = new Parser(tokens)
  const ast = parser.parseExpr()
  if (typeof ast === 'string') return { ok: false, error: ast }
  const end = parser.peek()
  if (end.kind !== 'eof') return { ok: false, error: `多出未預期的內容：${describe(end)}` }
  return { ok: true, ast }
}

/** offset k 天前（0 = series 最後一個，即今天）的值；超出範圍回 null。 */
function at(series: number[], offset: number): number | null {
  const idx = series.length - 1 - offset
  return idx >= 0 ? series[idx]! : null
}

function windowValues(series: number[], from: number, to: number): number[] | null {
  const out: number[] = []
  for (let k = from; k <= to; k++) {
    const v = at(series, k)
    if (v == null) return null
    out.push(v)
  }
  return out
}

function finite(v: number): number | null {
  return Number.isFinite(v) ? v : null
}

export function evalFormula(ast: FormulaNode, series: number[]): number | null {
  switch (ast.type) {
    case 'num':
      return finite(ast.value)
    case 'call': {
      const vals = windowValues(series, ast.from, ast.to)
      if (vals == null) return null
      if (ast.fn === 'price') return finite(vals[0]!)
      if (ast.fn === 'max') return finite(Math.max(...vals))
      if (ast.fn === 'min') return finite(Math.min(...vals))
      return finite(vals.reduce((a, b) => a + b, 0) / vals.length)
    }
    case 'unary': {
      const v = evalFormula(ast.arg, series)
      if (v == null) return null
      return finite(ast.op === '-' ? -v : v)
    }
    case 'binary': {
      const l = evalFormula(ast.left, series)
      const r = evalFormula(ast.right, series)
      if (l == null || r == null) return null
      switch (ast.op) {
        case '+':
          return finite(l + r)
        case '-':
          return finite(l - r)
        case '*':
          return finite(l * r)
        case '/':
          return r === 0 ? null : finite(l / r)
        case '^':
          return finite(l ** r)
      }
    }
  }
}
