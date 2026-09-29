/**
 * 日期時間軸 —— 把「訊號日 → 成交日」與「最短持有」攤成交易日甘特圖。
 *
 * 只畫 `report.timeline`（`features/signal/timeline.ts` 算好的），不自己算任何日期規則。
 * 橫軸只列交易日（週末 / 休市日不佔欄，休市日用虛線分隔標出），格子裡的數字＝持有第幾個交易日。
 */
import { useEffect, useRef } from 'react'

import { InfoHint } from '../../components/InfoHint'
import type { OperatorReport } from '../signal/report'
import type { TimelineCell, TimelineDay } from '../signal/timeline'
import styles from './planner.module.css'

const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
const wk = (iso: string) => '日一二三四五六'[new Date(`${iso}T00:00:00Z`).getUTCDay()]

const CELL_TEXT: Record<TimelineCell['kind'], string> = {
  none: '',
  entry: '買進日（第 0 天）',
  locked: '最短持有期內，動能換股擋住',
  ready: '抱滿最短持有：這天收盤起可成為動能換股訊號日',
  free: '已過最短持有，動能換股隨時可能觸發',
  held: '持有中',
  sell: '依目前排名，這天排程換股會賣掉',
}

const SCHEDULE_TEXT = { signal: '訊號', trade: '換股', both: '訊+換' } as const

function colClass(d: TimelineDay): string {
  return [
    d.holidaysBefore.length ? styles.tlGap : '',
    d.schedule === 'trade' || d.schedule === 'both' ? styles.tlTradeCol : '',
    d.schedule === 'signal' ? styles.tlSignalCol : '',
    d.isToday ? styles.tlTodayCol : '',
  ].join(' ')
}

function dayTitle(d: TimelineDay): string {
  const parts = [`${d.date}（${wk(d.date)}）`]
  if (d.isToday) parts.push('今天')
  if (d.holidaysBefore.length) parts.push(`前面休市：${d.holidaysBefore.map(md).join('、')}`)
  return parts.join(' · ')
}

export function DateTimeline({ report }: { report: OperatorReport }) {
  const t = report.timeline
  const scroller = useRef<HTMLDivElement>(null)

  // 捲到「今天」附近（手機上一開始就看到重點，而不是很久以前的買進日）
  useEffect(() => {
    const box = scroller.current
    const today = box?.querySelector<HTMLElement>('[data-today="true"]')
    if (box && today) box.scrollLeft = Math.max(0, today.offsetLeft - 200)
  }, [t])

  if (!t.days.length) return null

  // 月份表頭：連續同月合併成一格
  const months: { label: string; span: number }[] = []
  for (const d of t.days) {
    if (d.monthStart) months.push({ label: `${Number(d.date.slice(5, 7))} 月`, span: 1 })
    else months[months.length - 1]!.span++
  }

  const next = t.schedule.find((s) => s.signal === report.nextRebalanceDate)
  const lagText = t.execLagDays === 0 ? '同一天收盤' : `隔 ${t.execLagDays} 個交易日收盤`
  const swapLagText = t.swapLagDays === 0 ? '同一天收盤' : '隔一個交易日收盤'
  // 動能換股只換「已掉出名單」的持股；排程換股日前抱不滿的，會先被排程換掉 → 不提
  const outOfTargets = new Set(report.holdings.filter((h) => !h.inTargets).map((h) => h.code))
  const soonest = t.rows
    .filter(
      (r) =>
        outOfTargets.has(r.code) &&
        r.swapSignalFrom &&
        r.swapSignalFrom > report.asOfDate &&
        r.swapSignalFrom < report.nextRebalanceDate,
    )
    .sort((a, b) => a.swapSignalFrom!.localeCompare(b.swapSignalFrom!))[0]

  return (
    <div className={styles.card}>
      <h3>
        日期時間軸 <span className={styles.sub}>訊號日 → 成交日 · 最短持有</span>
        <InfoHint label="這些日期怎麼算">
          <ul>
            <li>
              <b>排程換股</b>：每月第 N 個交易日（每週星期 N）是<b>訊號日</b>
              ，用當天收盤排名；{lagText}是<b>成交日</b>，<b>同一天</b>賣掉舊的、買進新的。
            </li>
            <li>
              <b>持有天數</b>：買進（成交）當天＝<b>第 0 天</b>，之後每個交易日 +1，週末 /
              休市不算。格子裡的數字就是它。
            </li>
            {t.swapEnabled && (
              <li>
                <b>最短持有 {t.minHoldDays} 天</b>：第 {t.minHoldDays} 天收盤起才可能成為動能換股的
                訊號日，{swapLagText}成交。排程換股沒被換掉、繼續抱著的股票，天數<b>不歸零</b>。
              </li>
            )}
            <li>
              <b>排程換股不受最短持有限制</b>：換股日一到照當天排名整批換，沒抱滿也會被賣。
            </li>
            <li>今天以後的格子是依目前狀況推估的預覽（顏色較淡），排名每天都會變。</li>
          </ul>
        </InfoHint>
      </h3>

      <p className={styles.plain}>
        {next ? (
          <>
            下次排程換股：<b>{md(next.signal)}</b> 收盤排名（訊號日）→ <b>{md(next.trade)}</b>{' '}
            收盤賣舊買新（成交日）。
          </>
        ) : (
          <>下次排程換股訊號日：{report.nextRebalanceDate}。</>
        )}
        {soonest && (
          <>
            　{soonest.code} 抱滿 {t.minHoldDays} 天是 <b>{md(soonest.swapSignalFrom!)}</b>
            ，最快 <b>{md(soonest.swapTradeFrom!)}</b> 可因動能換股賣出。
          </>
        )}
      </p>

      <div className={styles.tlScroll} ref={scroller}>
        <table className={styles.tl}>
          <caption className={styles.srOnly}>
            交易日時間軸：排程換股訊號日、成交日，以及每檔持股的持有天數
          </caption>
          <thead>
            <tr>
              <th className={styles.tlLabel} scope="col" />
              {months.map((m, i) => (
                <th key={i} colSpan={m.span} className={styles.tlMonth} scope="colgroup">
                  {m.label}
                </th>
              ))}
            </tr>
            <tr>
              <th className={styles.tlLabel} scope="row">
                交易日
              </th>
              {t.days.map((d) => (
                <th
                  key={d.date}
                  scope="col"
                  className={`${styles.tlDay} ${colClass(d)}`}
                  data-today={d.isToday}
                  data-future={d.future}
                  title={dayTitle(d)}
                >
                  {d.isToday ? '今' : Number(d.date.slice(8, 10))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className={styles.tlLabel} scope="row">
                排程換股
              </th>
              {t.days.map((d) => (
                <td
                  key={d.date}
                  className={`${styles.tlSched} ${colClass(d)}`}
                  data-kind={d.schedule ?? undefined}
                  data-future={d.future}
                  title={
                    d.schedule === 'signal'
                      ? `${d.date} 訊號日：用當天收盤排名`
                      : d.schedule === 'trade'
                        ? `${d.date} 成交日：收盤賣舊買新`
                        : d.schedule === 'both'
                          ? `${d.date} 訊號日當天收盤就成交`
                          : undefined
                  }
                >
                  {d.schedule ? SCHEDULE_TEXT[d.schedule] : ''}
                </td>
              ))}
            </tr>
            {t.rows.map((r) => (
              <tr key={r.code}>
                <th className={styles.tlLabel} scope="row" title={`買進日 ${r.entryDate}`}>
                  {r.clipped && '← '}
                  {r.code} <span className={styles.tlName}>{r.name}</span>
                </th>
                {r.cells.map((c, i) => {
                  const d = t.days[i]!
                  return (
                    <td
                      key={d.date}
                      className={`${styles.tlCell} ${colClass(d)}`}
                      data-kind={c.kind}
                      data-future={d.future}
                      title={
                        c.heldDay == null
                          ? undefined
                          : `${d.date} · 持有第 ${c.heldDay} 天 · ${CELL_TEXT[c.kind]}`
                      }
                    >
                      {c.kind === 'sell' ? '賣' : (c.heldDay ?? '')}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className={styles.tlLegend}>
        <li>
          <i data-kind="entry">0</i>買進日＝第 0 天
        </li>
        {t.swapEnabled ? (
          <>
            <li>
              <i data-kind="locked" />
              最短持有中（動能換股擋住）
            </li>
            <li>
              <i data-kind="ready">{t.minHoldDays}</i>抱滿：最早的動能換股訊號日
            </li>
            <li>
              <i data-kind="free" />
              可動能換股
            </li>
          </>
        ) : (
          <li>
            <i data-kind="held" />
            持有中
          </li>
        )}
        <li>
          <i data-kind="sell">賣</i>依目前排名會在排程換股賣掉
        </li>
        <li>
          <i className={styles.tlLegendSignal}>訊號</i>排程訊號日（看收盤排名）
        </li>
        <li>
          <i className={styles.tlLegendTrade}>換股</i>排程成交日（賣舊買新）
        </li>
        <li>
          <i className={styles.tlLegendGap} />
          休市日（不佔欄）
        </li>
      </ul>
      {report.provisionalDate && (
        <p className={styles.note}>今天（{report.provisionalDate}）用的是暫定資料。</p>
      )}
    </div>
  )
}
