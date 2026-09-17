/**
 * 「什麼時候可以把手上哪一檔、換成動能超越多少的哪一檔」。
 *
 * 兩道閘同時滿足才會換（`engine.shouldSwap`）：
 *   1. 最短持有天數 —— 要被換掉的持股都得先抱滿 N 個交易日。
 *   2. 因子門檻 —— 挑戰者要比手上最弱一檔好過 margin（相對百分比或因子原始單位，見
 *      `engine.swapThreshold`）。
 * 這兩道只管「非排程日的臨時換股」；排程換股日一到照樣整批換（優先序見 report.ts 檔頭）。
 */
import { InfoHint } from '../../components/InfoHint'
import { factorFmt, type MetricKey } from '../../lib/metrics'
import type { OperatorReport } from '../signal/report'
import styles from './planner.module.css'

export function SwapWatchPanel({ report, factor }: { report: OperatorReport; factor: MetricKey }) {
  const w = report.swapWatch
  const fmt = factorFmt(factor)
  // relative：門檻是最弱持股因子值的 margin%；absolute：門檻是因子原始單位的差值
  const marginText = w.marginMode === 'absolute' ? fmt(w.margin) : `${w.margin}%`

  if (!w.enabled) {
    return (
      <div className={styles.card}>
        <h3>什麼時候會換股？</h3>
        <p className={styles.plain}>
          這個策略只在<b>定期換股日</b>換股 —— 下一次是 <b>{report.nextRebalanceDate}</b>（還有{' '}
          {report.tradingDaysToRebalance} 個交易日）。在那之前除非跌破停損，否則都不用動。
        </p>
        <p className={styles.note}>
          想讓「有股票動能反超時就提前換」，到回測頁打開「動能換股」再帶回來。
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
        <InfoHint label="換股規則怎麼運作">
          <ul>
            <li>
              <b>兩道關卡都過</b>才會臨時換股：①手上那檔已抱滿最短持有 {w.minHoldDays}{' '}
              個交易日；②有未持有的股票{report.factorLabel}比它高出 {marginText} 以上。
            </li>
            <li>
              條件在某天收盤成立 → <b>隔一個交易日</b>成交（收盤後才知道排名，下一盤才進得去）。
            </li>
            <li>
              「已贏最弱持股」是目前的領先幅度，「距門檻」是還差多少才達到 {marginText} 的要求。
            </li>
          </ul>
        </InfoHint>
      </h3>

      {/* 一句話把「誰 → 換誰 → 何時」講完 */}
      {w.weakest && w.thresholdFactor != null ? (
        <p className={styles.plain}>
          手上最弱的是 <b>{w.weakest.code}</b> {w.weakest.name}（{report.factorLabel}{' '}
          {fmt(w.weakest.factor)}）。
          {w.minHoldReady ? (
            <>
              　它<b>已經抱滿</b>最短持有 {w.minHoldDays} 個交易日 —— 只要有候補股票的
              {report.factorLabel}達到 <b>{fmt(w.thresholdFactor)}</b>
              ，隔一個交易日就換。
            </>
          ) : (
            <>
              　要等到 <b>{w.earliestSwapDate}</b>（還有 {w.tradingDaysToSwap} 個交易日，抱滿{' '}
              {w.minHoldDays} 天）之後，且候補股票的{report.factorLabel}達到{' '}
              <b>{fmt(w.thresholdFactor)}</b>，才會換。
            </>
          )}
        </p>
      ) : (
        <p className={styles.plain}>
          手上每一檔都還在目標名單內 —— 沒有要換掉的對象，動能換股不會觸發。
        </p>
      )}

      <div className={styles.watchHead}>
        <div className={styles.watchBox}>
          <p className={styles.factLabel}>① 換掉誰</p>
          <p className={styles.factValue}>
            {w.weakest ? `${w.weakest.code} ${w.weakest.name}` : '（沒有）'}
          </p>
          <p className={styles.factNote}>
            {w.weakest ? `${report.factorLabel} ${fmt(w.weakest.factor)}　已掉出目標名單` : '—'}
          </p>
        </div>
        <div className={styles.watchBox}>
          <p className={styles.factLabel}>② 候補要達到</p>
          <p className={styles.factValue}>
            {w.thresholdFactor == null ? '—' : fmt(w.thresholdFactor)}
          </p>
          <p className={styles.factNote}>
            {w.thresholdFactor == null ? '—' : `＝最弱持股再高出 ${marginText}`}
          </p>
        </div>
        <div className={`${styles.watchBox} ${styles.watchWhen}`}>
          <p className={styles.factLabel}>③ 最快哪天換</p>
          <p className={styles.factValue}>{w.earliestSwapDate ?? '—'}</p>
          <p className={styles.factNote}>
            {w.earliestSwapDate == null
              ? '—'
              : w.minHoldReady
                ? '最短持有已滿足，門檻到就換'
                : `還有 ${w.tradingDaysToSwap} 個交易日`}
          </p>
        </div>
      </div>

      {w.challengers.length > 0 && (
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
      )}

      <p className={styles.ruleNote}>
        <b>規則優先序：定期換股日 ＞ 最短持有天數。</b>
        「最短持有 {w.minHoldDays} 交易日」只擋非換股日的臨時換股；到了{' '}
        <b>{report.nextRebalanceDate}</b> 會照當天排名整批換，沒抱滿也可能被賣。
        {blockedByRebalance && (
          <>
            　→ 以目前情況，<b>{w.weakest?.code}</b> 會先在 {report.nextRebalanceDate}{' '}
            被定期換股換掉，輪不到動能換股。
          </>
        )}
      </p>
    </div>
  )
}
