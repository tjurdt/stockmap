/** 把一份 OperatorReport 渲染成網頁區塊（操作計畫頁預覽用；與每晚提醒信同一份資料）。 */
import { METRICS, type MetricKey } from '../../lib/metrics'
import type { OperatorReport } from './report'
import styles from './signal.module.css'

const pct = (v: number | null | undefined) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
const price = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 2 })
const money = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString())

export function ReportView({ report, factor }: { report: OperatorReport; factor: MetricKey }) {
  const fmt = METRICS[factor].fmt

  return (
    <>
      <div className={styles.summary}>
        <b>策略</b>：{report.strategySummary}
      </div>

      {!report.started && (
        <div className={styles.bullBox}>
          <p>
            策略尚未上線（上線日 <b>{report.startDate}</b>）。下方「目標持股」就是上線當天要照著買的
            清單；在那之前不用動作。
          </p>
        </div>
      )}

      <div className={report.regime === 'bear' ? styles.bearBox : styles.bullBox}>
        <p>
          下一個台股交易日：<b>{report.nextTradingDay}</b>
        </p>
        <p>
          大盤環境：<b>{report.regime === 'bear' ? '空頭' : '多頭'}</b>
          {report.regimeChangedFrom && (
            <>
              {' '}
              —— <b>今天由{report.regimeChangedFrom === 'bull' ? '多轉空' : '空轉多'}</b>
            </>
          )}
          {report.bearInverse && <>　空頭策略：手上放元大台灣50反1（00632R）</>}
        </p>
        {report.isSignalDay ? (
          <p>
            <b>{report.asOfDate} 是換股訊號日</b> → 下一個交易日（{report.nextTradingDay}
            ）照下方「本次換股動作」操作。
          </p>
        ) : (
          <p>
            今天不是換股日。下次換股約 <b>{report.nextRebalanceDate}</b>
            ；在那之前抱著不動，只看停損。
          </p>
        )}
      </div>

      {report.stopActionsNow.length > 0 && (
        <section>
          <h3>⚠️ 現在就要處理的停損</h3>
          <ul className={styles.actions}>
            {report.stopActionsNow.map((s) => (
              <li key={s.code}>
                <span className={styles.sell}>停損</span> {s.code} {s.name}　已跌破停損（
                {pct(s.dropPct)}）→ 不用等換股日，今天/明天出場、持有現金至下次再平衡
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>
          目標持股{' '}
          <span className={styles.sub}>
            依 {METRICS[factor].label} 排名（{report.asOfDate} 收盤）
          </span>
        </h3>
        {report.targets.length === 0 ? (
          <p className={styles.sub}>（空頭空手）</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>代號</th>
                <th>名稱</th>
                <th>{METRICS[factor].label}</th>
                <th>現價</th>
                <th>目標權重</th>
              </tr>
            </thead>
            <tbody>
              {report.targets.map((t, i) => (
                <tr key={t.code}>
                  <td>{i + 1}</td>
                  <td>{t.code}</td>
                  <td>{t.name}</td>
                  <td>{fmt(t.factor)}</td>
                  <td>{price(t.price)}</td>
                  <td>{(t.weight * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {report.holdings.length > 0 && (
        <section>
          <h3>我目前持有</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>代號</th>
                <th>股數</th>
                <th>買進價</th>
                <th>現價</th>
                <th>損益</th>
                <th>停損</th>
              </tr>
            </thead>
            <tbody>
              {report.holdings.map((h) => (
                <tr key={h.code}>
                  <td>
                    {h.code} {h.name}
                  </td>
                  <td>{h.shares.toLocaleString()}</td>
                  <td>{price(h.entryPrice)}</td>
                  <td>{price(h.price)}</td>
                  <td className={h.plPct != null && h.plPct < 0 ? styles.neg : styles.pos}>
                    {pct(h.plPct)}
                  </td>
                  <td className={h.stop?.hit ? styles.neg : undefined}>
                    {!h.stop
                      ? '—'
                      : h.stop.hit
                        ? `已觸發（${pct(h.stop.pct)}）→ 出場`
                        : `距停損 ${pct(h.stop.room)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h3>
          {report.isSignalDay
            ? '本次換股動作（明天執行）'
            : `下次換股日（約 ${report.nextRebalanceDate}）要做的`}
        </h3>
        {!report.isSignalDay && (
          <p className={styles.sub}>預覽而已 —— 到時清單會依當時動能重算。</p>
        )}
        <ul className={styles.actions}>
          {report.actions.map((a) => (
            <li key={`${a.kind}${a.code}`}>
              <span className={styles[a.kind]}>
                {a.kind === 'sell' ? '賣出' : a.kind === 'buy' ? '買進' : '續抱'}
              </span>{' '}
              {a.code} {a.name}
              {a.kind === 'sell' && ` · ${a.shares?.toLocaleString()} 股 · 約 ${money(a.value)} 元`}
              {a.kind === 'buy' &&
                ` · 目標 ${((a.weight ?? 0) * 100).toFixed(0)}% · 現價 ${price(a.price)}`}
            </li>
          ))}
          {report.actions.every((a) => a.kind === 'keep') && report.targets.length > 0 && (
            <li className={styles.sub}>組合與目標一致，無需換股。</li>
          )}
        </ul>
      </section>
    </>
  )
}
