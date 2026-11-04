/**
 * 我的持股 —— 每檔一列，回答「這檔還能不能抱」「抱多久了」「什麼時候才換得掉」。
 * 持股本身由交易日誌推算（見 `lib/trades.ts`），這裡只顯示。
 */
import { InfoHint } from '../../components/InfoHint'
import type { OperatorReport } from '../signal/report'
import styles from './planner.module.css'

const pct = (v: number | null | undefined) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
const price = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 2 })

export function HoldingsPanel({ report }: { report: OperatorReport }) {
  const tpOn = report.holdings.some((h) => h.takeProfitPrice != null)
  const swapOn = report.swapWatch.enabled && report.swapWatch.minHoldDays > 0

  if (report.holdings.length === 0) {
    return (
      <div className={styles.card}>
        <h3>我的持股</h3>
        <p className={styles.note}>
          目前空手。買進後到「我的績效」記一筆，這頁就會依你的實際部位算停損、持有天數與換股訊號。
        </p>
      </div>
    )
  }

  return (
    <div className={styles.card}>
      <h3>
        我的持股
        <InfoHint label="欄位說明">
          <ul>
            <li>
              <b>已持有</b>：買進日之後經過的交易日數（不含假日）。賣光再買回會重新起算。
            </li>
            {swapOn && (
              <li>
                <b>可換日</b>：抱滿「最短持有 {report.swapWatch.minHoldDays}{' '}
                交易日」的日子。在那之前就算有別的股票動能反超，也不會臨時把它換掉 ——
                <b>但定期換股日不受這個限制</b>。
              </li>
            )}
            <li>
              <b>停損線</b>：現價跌破這個數字就賣，不必等換股日。括號是離停損還有多少 %。
            </li>
            {tpOn && (
              <li>
                <b>停利線</b>：現價漲過這個數字就賣，不必等換股日。
              </li>
            )}
            <li>
              <b>紅底那列</b>＝依最新排名已經掉出前 {report.targets.length}{' '}
              名，下一個定期換股日會被換掉。
            </li>
          </ul>
        </InfoHint>
      </h3>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>股票</th>
              <th>損益</th>
              <th>成本 → 現價</th>
              <th>已持有</th>
              {swapOn && <th>可換日</th>}
              <th>停損線</th>
              {tpOn && <th>停利線</th>}
            </tr>
          </thead>
          <tbody>
            {report.holdings.map((h) => (
              <tr key={h.code} className={h.inTargets ? undefined : styles.rowOut}>
                <td>
                  {h.code} {h.name}
                  {!h.inTargets && <span className={styles.warn}>（已掉出名單）</span>}
                </td>
                <td className={h.plPct != null && h.plPct < 0 ? styles.neg : styles.pos}>
                  {pct(h.plPct)}
                </td>
                <td>
                  {price(h.entryPrice)} → {price(h.price)}
                </td>
                <td>{h.heldDays} 日</td>
                {swapOn && (
                  <td className={h.minHoldMet ? styles.ok : styles.pending}>
                    {h.minHoldMet ? '✓ 隨時可換' : `${h.minHoldUntil} 起`}
                  </td>
                )}
                <td className={h.stop?.hit ? styles.warn : undefined}>
                  {!h.stop
                    ? '未設'
                    : h.stop.hit
                      ? '已觸發 → 賣出'
                      : `${price(h.stop.stopPrice)}（距 ${pct(h.stop.room)}）`}
                </td>
                {tpOn && (
                  <td className={h.takeProfitHit ? styles.warn : undefined}>
                    {h.takeProfitHit ? '已達標 → 賣出' : price(h.takeProfitPrice)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
