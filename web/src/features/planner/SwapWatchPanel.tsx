/**
 * 「什麼時候可以把手上哪一檔、換成動能超越多少的哪一檔」。
 *
 * 兩道閘同時滿足才會換（`engine.shouldSwap`）：
 *   1. 最短持有天數 —— 要被換掉的持股都得先抱滿 N 個交易日。
 *   2. 因子門檻 —— 挑戰者要比手上最弱一檔好過 margin%。
 * 這兩道只管「非排程日的臨時換股」；排程換股日一到照樣整批換（優先序見 report.ts 檔頭）。
 */
import { METRICS, type MetricKey } from '../../lib/metrics'
import type { OperatorReport } from '../signal/report'
import styles from './planner.module.css'

export function SwapWatchPanel({ report, factor }: { report: OperatorReport; factor: MetricKey }) {
  const w = report.swapWatch
  const fmt = METRICS[factor].fmt

  if (!w.enabled) {
    return (
      <div className={styles.card}>
        <h3>什麼時候會換股？</h3>
        <p className={styles.note}>
          目前策略只在<b>定期換股日</b>換股 —— 下一次是 <b>{report.nextRebalanceDate}</b>（還有{' '}
          {report.tradingDaysToRebalance} 個交易日）。在那之前除非跌破停損，否則不會動。
          想讓動能反超時就提前換，到回測頁打開「動能換股」。
        </p>
      </div>
    )
  }

  const blockedByRebalance =
    w.earliestSwapDate != null && w.earliestSwapDate > report.nextRebalanceDate

  return (
    <div className={styles.card}>
      <h3>
        什麼時候可以換股？ <span className={styles.sub}>動能換股監看</span>
      </h3>

      <div className={styles.watchHead}>
        <div className={styles.watchBox}>
          <p className={styles.factLabel}>會被換掉的是</p>
          <p className={styles.factValue}>
            {w.weakest ? `${w.weakest.code} ${w.weakest.name}` : '（沒有）'}
          </p>
          <p className={styles.factNote}>
            {w.weakest
              ? `${report.factorLabel} ${fmt(w.weakest.factor)}　已掉出目標名單`
              : '手上每一檔都還在目標名單內 —— 現在沒有可換的對象'}
          </p>
        </div>
        <div className={styles.watchBox}>
          <p className={styles.factLabel}>挑戰者要達到</p>
          <p className={styles.factValue}>
            {w.thresholdFactor == null ? '—' : fmt(w.thresholdFactor)}
          </p>
          <p className={styles.factNote}>
            {w.thresholdFactor == null
              ? '沒有待換的持股'
              : `= 最弱持股再高出 ${w.marginPct}%（門檻設定）`}
          </p>
        </div>
        <div className={styles.watchBox}>
          <p className={styles.factLabel}>最快可換日</p>
          <p className={styles.factValue}>{w.earliestSwapDate ?? '—'}</p>
          <p className={styles.factNote}>
            {w.earliestSwapDate == null
              ? '沒有待換的持股'
              : w.minHoldReady
                ? `已過最短持有 ${w.minHoldDays} 交易日 —— 門檻一到就換`
                : `最短持有 ${w.minHoldDays} 交易日還沒滿`}
          </p>
        </div>
      </div>

      {w.challengers.length > 0 ? (
        <>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>候補</th>
                  <th>名稱</th>
                  <th>{report.factorLabel}</th>
                  <th>已贏最弱持股</th>
                  <th>距門檻</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                {w.challengers.map((c) => (
                  <tr key={c.code}>
                    <td>{c.code}</td>
                    <td>{c.name}</td>
                    <td>{fmt(c.factor)}</td>
                    <td className={c.over >= 0 ? styles.pos : styles.neg}>
                      {c.over >= 0 ? '+' : ''}
                      {fmt(c.over)}
                    </td>
                    <td>{c.gap <= 0 ? '已達標' : `還差 ${fmt(c.gap)}`}</td>
                    <td className={c.qualified ? styles.warn : styles.muted}>
                      {!c.qualified
                        ? '門檻未達'
                        : w.minHoldReady
                          ? '可換 → 明天執行'
                          : `門檻已過，等 ${w.earliestSwapDate}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.note}>
            白話：
            {w.weakest && w.thresholdFactor != null ? (
              <>
                手上最弱的是 <b>{w.weakest.code}</b>；只要候補股票的{report.factorLabel}達到{' '}
                <b>{fmt(w.thresholdFactor)}</b>，而且 <b>{w.earliestSwapDate}</b> 之後（最短持有滿{' '}
                {w.minHoldDays} 個交易日），就會在隔一個交易日把 {w.weakest.code} 換成它。
              </>
            ) : (
              '目前沒有要換掉的持股，所以不會觸發動能換股。'
            )}
          </p>
        </>
      ) : (
        <p className={styles.note}>
          目前排名前 {report.targets.length} 名裡沒有你還沒持有的股票 ——
          手上就是最強的那幾檔，不會換。
        </p>
      )}

      <p className={styles.ruleNote}>
        <b>規則優先序：定期換股日 &gt; 最短持有天數。</b>
        「最短持有 {w.minHoldDays} 交易日」只擋<b>非換股日的臨時換股</b>；到了{' '}
        <b>{report.nextRebalanceDate}</b>（定期換股日）會照當天排名整批換，就算某檔還沒抱滿
        {w.minHoldDays} 天也可能被賣掉。
        {blockedByRebalance && (
          <>
            　→ 以目前情況，<b>{w.weakest?.code}</b> 會先在 {report.nextRebalanceDate}{' '}
            的定期換股被換掉，輪不到動能換股。
          </>
        )}
      </p>
    </div>
  )
}
