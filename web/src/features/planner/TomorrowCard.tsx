/**
 * 「明天要幹嘛」—— 操作計畫頁的主角。
 *
 * 結論（`report.verdict`）與提醒信是同一份資料，這裡只負責把它變成看得懂的畫面：
 * 一句大字 + 編號步驟 + 三個關鍵日期。
 */
import type { ActionRow, OperatorReport } from '../signal/report'
import styles from './planner.module.css'

const price = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 2 })
const money = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString())

function StepLine({ a }: { a: ActionRow }) {
  if (a.kind === 'sell') {
    return (
      <>
        <span className={styles.tagSell}>賣出</span>
        <span>
          {a.code} {a.name}
          <span className={styles.stepSub}>
            　{a.shares?.toLocaleString()} 股（現價 {price(a.price)}，約 {money(a.value)} 元）
          </span>
        </span>
      </>
    )
  }
  if (a.kind === 'buy') {
    return (
      <>
        <span className={styles.tagBuy}>買進</span>
        <span>
          {a.code} {a.name}
          <span className={styles.stepSub}>
            　佔投入金額 {((a.weight ?? 0) * 100).toFixed(0)}%（現價 {price(a.price)}）
          </span>
        </span>
      </>
    )
  }
  return (
    <>
      <span className={styles.tagKeep}>續抱</span>
      <span>
        {a.code} {a.name}
        <span className={styles.stepSub}>　不用動</span>
      </span>
    </>
  )
}

export function TomorrowCard({ report }: { report: OperatorReport }) {
  const v = report.verdict
  // 要動手時才列步驟；停損要單獨列在最前面（不等換股日）
  const todo: ActionRow[] = v.act
    ? [
        ...report.stopActionsNow.map<ActionRow>((s) => {
          const h = report.holdings.find((x) => x.code === s.code)
          return {
            kind: 'sell',
            code: s.code,
            name: s.name,
            shares: h?.shares,
            value: h?.value,
            price: h?.price,
          }
        }),
        ...(v.kind === 'stop' ? [] : report.actions.filter((a) => a.kind !== 'keep')),
      ]
    : []

  return (
    <>
      <div className={`${styles.verdict} ${v.act ? styles.verdictAct : styles.verdictCalm}`}>
        <p className={styles.verdictLabel}>明天要做什麼</p>
        <p className={styles.verdictHead}>
          {v.act ? '❗ ' : '✅ '}
          {v.headline}
        </p>
        <p className={styles.verdictDetail}>{v.detail}</p>
        {report.regime === 'bear' && (
          <p className={styles.verdictWarn}>
            大盤目前是空頭
            {report.regimeChangedFrom === 'bull' ? '（今天剛由多轉空）' : ''}
            {report.bearInverse ? '　→ 策略設定空頭持有元大台灣50反1（00632R）' : ''}
          </p>
        )}
      </div>

      {todo.length > 0 && (
        <div className={styles.card}>
          <h3>
            明天（{report.nextTradingDay}）的下單清單{' '}
            <span className={styles.sub}>照順序做完就結束</span>
          </h3>
          <ol className={styles.steps}>
            {todo.map((a) => (
              <li key={`${a.kind}${a.code}`}>
                <StepLine a={a} />
              </li>
            ))}
          </ol>
          <p className={styles.note}>
            下單時點：<b>盤後定價交易（14:00–14:30）</b>直接用收盤價撮合，最貼近回測； 或收盤前 5
            分鐘掛限價（買單掛現價 ×1.005、賣單掛現價 ×0.995），成交價仍是收盤價。 台股一張 = 1000
            股，湊不齊目標比例是正常的。
          </p>
        </div>
      )}

      <div className={styles.facts}>
        <div className={styles.fact}>
          <p className={styles.factLabel}>下一個交易日</p>
          <p className={styles.factValue}>{report.nextTradingDay}</p>
          <p className={styles.factNote}>{v.act ? '要照上面的清單下單' : '不用動作'}</p>
        </div>
        <div className={styles.fact}>
          <p className={styles.factLabel}>下一個定期換股日</p>
          <p className={styles.factValue}>{report.nextRebalanceDate}</p>
          <p className={styles.factNote}>
            還有 {report.tradingDaysToRebalance} 個交易日
            {report.isRebalanceDay ? '（今天就是換股日）' : ''}
          </p>
        </div>
        <div className={styles.fact}>
          <p className={styles.factLabel}>目前持股</p>
          <p className={styles.factValue}>
            {report.holdings.length} 檔
            {report.totalValue != null ? `　${money(report.totalValue)} 元` : ''}
          </p>
          <p className={styles.factNote}>
            {report.holdings.filter((h) => !h.inTargets).length > 0
              ? `其中 ${report.holdings.filter((h) => !h.inTargets).length} 檔已掉出目標名單`
              : '都還在目標名單內'}
          </p>
        </div>
      </div>
    </>
  )
}
