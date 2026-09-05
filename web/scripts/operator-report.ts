/**
 * 每晚提醒信產生器 —— 由 .github/workflows/notify.yml 呼叫（`npm run report`）。
 *
 * 讀 committed data/ + secret OPERATOR_PLAN → 用前端同一份 `buildOperatorReport` 算訊號
 * → 寫 web/tmp/{email-subject.txt, email.html, email.txt}，交給 dawidd6/action-send-mail 寄。
 *
 * OPERATOR_PLAN 未設 / 資料讀不到 → 印訊息、exit 0、不產出檔案（workflow 會跳過寄信）。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BaselineRow } from '../src/lib/baselines.ts'
import type { HistoryRow } from '../src/lib/history.ts'
import { operatorPlanSchema } from '../src/lib/plan.ts'
import { buildOperatorReport, type OperatorReport } from '../src/features/signal/report.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, '..')
const ROOT = join(WEB, '..')
const DATA = join(ROOT, 'data')
const OUT = join(WEB, 'tmp')

function parseJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T)
}

function loadHistory(): HistoryRow[] {
  const dir = join(DATA, 'history')
  if (!existsSync(dir)) return []
  const rows = readdirSync(dir)
    .filter((f) => /^factors-\d{4}\.jsonl$/.test(f))
    .flatMap((f) => parseJsonl<HistoryRow>(join(dir, f)))
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

function loadNames(): Map<string, string> {
  const m = new Map<string, string>()
  try {
    const latest = JSON.parse(readFileSync(join(DATA, 'latest.json'), 'utf-8')) as {
      stocks: { code: string; name: string }[]
    }
    for (const s of latest.stocks) m.set(s.code, s.name)
  } catch {
    /* 退回 universe.json */
  }
  try {
    const uni = JSON.parse(readFileSync(join(ROOT, 'schema', 'universe.json'), 'utf-8')) as {
      constituents: { code: string; name: string }[]
    }
    for (const c of uni.constituents) if (!m.has(c.code)) m.set(c.code, c.name)
  } catch {
    /* ignore */
  }
  return m
}

// ── e-mail 渲染 ─────────────────────────────────────────────
const UP = '#c4381f' // 台股：漲 = 紅
const DOWN = '#1a7a3c' // 跌 = 綠
const pct = (v: number | null | undefined) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
const price = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 2 })
const money = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString())
const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

function subjectOf(r: OperatorReport): string {
  const bits: string[] = []
  if (r.stopActionsNow.length) bits.push(`⚠️停損 ${r.stopActionsNow.length} 檔`)
  if (r.regimeChangedFrom) bits.push(r.regime === 'bear' ? '轉空頭' : '轉多頭')
  if (r.isSignalDay) bits.push('明天換股')
  if (!r.started) bits.push('策略待上線')
  if (!bits.length) bits.push('無須動作')
  return `[台股動力] ${r.asOfDate} · ${bits.join(' · ')}`
}

function textOf(r: OperatorReport): string {
  const L: string[] = []
  L.push(`台股動力投資 — 操作提醒（依 ${r.asOfDate} 收盤）`)
  L.push(`策略：${r.strategySummary}`)
  L.push('')
  if (!r.started) L.push(`※ 策略尚未上線（上線日 ${r.startDate}）。下方為上線當天要買的清單。`)
  L.push(
    `大盤：${r.regime === 'bear' ? '空頭' : '多頭'}` +
      (r.regimeChangedFrom
        ? `（今天由${r.regimeChangedFrom === 'bull' ? '多轉空' : '空轉多'}）`
        : ''),
  )
  L.push(
    r.isSignalDay
      ? `${r.asOfDate} 是換股訊號日 → 下一交易日照下列動作換股。`
      : `今天不是換股日；下次換股約 ${r.nextRebalanceDate}。在那之前抱著不動、只看停損。`,
  )
  L.push('')
  if (r.stopActionsNow.length) {
    L.push('⚠️ 立即停損：')
    for (const s of r.stopActionsNow) L.push(`  - ${s.code} ${s.name}（${pct(s.dropPct)}）→ 出場`)
    L.push('')
  }
  L.push(r.isSignalDay ? '本次換股動作：' : `下次換股（約 ${r.nextRebalanceDate}）預覽：`)
  for (const a of r.actions) {
    const verb = a.kind === 'sell' ? '賣出' : a.kind === 'buy' ? '買進' : '續抱'
    const tail =
      a.kind === 'sell'
        ? ` ${a.shares?.toLocaleString()} 股 ≈ ${money(a.value)} 元`
        : a.kind === 'buy'
          ? ` 目標 ${((a.weight ?? 0) * 100).toFixed(0)}% · 現價 ${price(a.price)}`
          : ''
    L.push(`  ${verb} ${a.code} ${a.name}${tail}`)
  }
  if (!r.actions.length) L.push('  （無）')
  L.push('')
  L.push('目標持股排名：')
  for (const [i, t] of r.targets.entries()) {
    L.push(
      `  ${i + 1}. ${t.code} ${t.name} · 現價 ${price(t.price)} · 目標 ${(t.weight * 100).toFixed(0)}%`,
    )
  }
  if (!r.targets.length) L.push('  （空頭空手）')
  if (r.holdings.length) {
    L.push('')
    L.push('目前持股：')
    for (const h of r.holdings) {
      const st = !h.stop ? '' : h.stop.hit ? ' · 停損已觸發' : ` · 距停損 ${pct(h.stop.room)}`
      L.push(`  ${h.code} ${h.name} · ${h.shares.toLocaleString()} 股 · 損益 ${pct(h.plPct)}${st}`)
    }
  }
  L.push('')
  L.push('僅供研究，不構成投資建議。設定改動請到網站「操作計畫」頁重新產生 OPERATOR_PLAN。')
  return L.join('\n')
}

function htmlOf(r: OperatorReport): string {
  const box = (bg: string, inner: string) =>
    `<div style="background:${bg};border:1px solid #ddd;padding:10px 14px;margin:10px 0;border-radius:4px">${inner}</div>`
  const h3 = (t: string) => `<h3 style="font-size:15px;margin:18px 0 6px">${esc(t)}</h3>`
  const p: string[] = []
  p.push(
    `<div style="font-family:-apple-system,'Helvetica Neue',Arial,'Noto Sans TC',sans-serif;font-size:14px;line-height:1.7;color:#1a1a1a;max-width:640px">`,
  )
  p.push(
    `<p style="color:#666;margin:0 0 4px">台股動力投資 — 操作提醒（依 <b>${r.asOfDate}</b> 收盤）</p>`,
  )
  p.push(`<p style="color:#666;font-size:12.5px;margin:0">策略：${esc(r.strategySummary)}</p>`)

  if (!r.started) {
    p.push(
      box(
        '#fff8e1',
        `策略尚未上線（上線日 <b>${r.startDate}</b>）。下方「目標持股」＝上線當天要買的清單；在那之前不用動作。`,
      ),
    )
  }

  const regimeTxt =
    `大盤環境：<b>${r.regime === 'bear' ? '空頭' : '多頭'}</b>` +
    (r.regimeChangedFrom
      ? ` — <b style="color:${r.regime === 'bear' ? DOWN : UP}">今天由${
          r.regimeChangedFrom === 'bull' ? '多轉空' : '空轉多'
        }</b>`
      : '') +
    '<br>' +
    (r.isSignalDay
      ? `<b>${r.asOfDate} 是換股訊號日</b> → 下一交易日照「本次換股動作」操作。`
      : `今天不是換股日；下次換股約 <b>${r.nextRebalanceDate}</b>。在那之前抱著不動、只看停損。`)
  p.push(box(r.regime === 'bear' ? '#fdecea' : '#eef7f0', regimeTxt))

  if (r.stopActionsNow.length) {
    p.push(h3('⚠️ 現在就要處理的停損'))
    p.push('<ul style="margin:0;padding-left:18px">')
    for (const s of r.stopActionsNow) {
      p.push(
        `<li><b style="color:${DOWN}">停損</b> ${s.code} ${esc(s.name)} — 已跌破停損（${pct(
          s.dropPct,
        )}），不用等換股日，今天/明天出場。</li>`,
      )
    }
    p.push('</ul>')
  }

  p.push(
    h3(r.isSignalDay ? '本次換股動作（明天執行）' : `下次換股（約 ${r.nextRebalanceDate}）預覽`),
  )
  p.push('<ul style="margin:0;padding-left:18px">')
  for (const a of r.actions) {
    const color = a.kind === 'sell' ? DOWN : a.kind === 'buy' ? UP : '#666'
    const verb = a.kind === 'sell' ? '賣出' : a.kind === 'buy' ? '買進' : '續抱'
    const tail =
      a.kind === 'sell'
        ? ` · ${a.shares?.toLocaleString()} 股 ≈ ${money(a.value)} 元`
        : a.kind === 'buy'
          ? ` · 目標 ${((a.weight ?? 0) * 100).toFixed(0)}% · 現價 ${price(a.price)}`
          : ''
    p.push(`<li><b style="color:${color}">${verb}</b> ${a.code} ${esc(a.name)}${tail}</li>`)
  }
  if (!r.actions.length) p.push('<li style="color:#666">（無）</li>')
  p.push('</ul>')

  p.push(h3('目標持股排名'))
  p.push(
    tableOf(
      ['#', '代號', '名稱', '現價', '目標權重'],
      r.targets.length === 0
        ? [['—', '空頭空手', '', '', '']]
        : r.targets.map((t, i) => [
            String(i + 1),
            t.code,
            esc(t.name),
            price(t.price),
            `${(t.weight * 100).toFixed(0)}%`,
          ]),
    ),
  )

  if (r.holdings.length) {
    p.push(h3('目前持股'))
    p.push(
      tableOf(
        ['代號', '股數', '買進價', '現價', '損益', '停損'],
        r.holdings.map((h) => [
          `${h.code} ${esc(h.name)}`,
          h.shares.toLocaleString(),
          price(h.entryPrice),
          price(h.price),
          coloredPct(h.plPct),
          !h.stop ? '—' : h.stop.hit ? '已觸發 → 出場' : `距停損 ${pct(h.stop.room)}`,
        ]),
      ),
    )
  }

  p.push(
    `<p style="color:#999;font-size:12px;margin-top:18px">僅供研究，不構成投資建議。設定改動請到網站「操作計畫」頁重新產生 <code>OPERATOR_PLAN</code>。</p>`,
  )
  p.push('</div>')
  return p.join('')
}

function coloredPct(v: number | null): string {
  if (v == null) return '—'
  return `<span style="color:${v < 0 ? DOWN : UP}">${pct(v)}</span>`
}

function tableOf(head: string[], rows: string[][]): string {
  const th = head
    .map(
      (h) =>
        `<th style="text-align:left;padding:5px 8px;border-bottom:1px solid #ccc">${esc(h)}</th>`,
    )
    .join('')
  const body = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c) => `<td style="padding:5px 8px;border-bottom:1px solid #eee">${c}</td>`)
          .join('')}</tr>`,
    )
    .join('')
  return `<table style="border-collapse:collapse;font-size:13px;width:100%">${th ? `<thead><tr>${th}</tr></thead>` : ''}<tbody>${body}</tbody></table>`
}

// ── main ───────────────────────────────────────────────────
function main(): void {
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true })

  const raw = process.env.OPERATOR_PLAN?.trim()
  if (!raw) {
    console.log('OPERATOR_PLAN 未設定 → 不產生提醒信。')
    return
  }

  const parsed = operatorPlanSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    console.error('OPERATOR_PLAN 格式不符 operator_plan.schema：')
    console.error(parsed.error.message)
    process.exitCode = 1
    return
  }

  const history = loadHistory()
  const baselines = parseJsonl<BaselineRow>(join(DATA, 'baselines.jsonl'))
  const report = buildOperatorReport(history, baselines, parsed.data, loadNames())
  if (!report) {
    console.log('因子歷史不足 → 不產生提醒信。')
    return
  }

  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'email-subject.txt'), subjectOf(report))
  writeFileSync(join(OUT, 'email.txt'), textOf(report))
  writeFileSync(join(OUT, 'email.html'), htmlOf(report))
  console.log(`已產生提醒信：${subjectOf(report)}`)
}

main()
