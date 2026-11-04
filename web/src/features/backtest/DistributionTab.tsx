/**
 * 「報酬分布」分頁：滾動報酬 + 報酬分布直方圖。
 * 分布要跑 20 次完整回測，所以獨立成分頁，打開時才算，不拖慢調參數的手感。
 */
import { useMemo } from 'react'

import { CycleField } from '../../components/controls/CycleField'
import type { BaselineRow } from '../../lib/baselines'
import type { HistoryRow } from '../../lib/history'
import { rollingWindowReturns, summarizeOutcomes, summarizeRolling } from '../../lib/rolling'
import { distributionOutcomes, type DistMode } from './distribution'
import { runBacktest, type BacktestConfig } from './engine'
import { OutcomeHistogram } from './OutcomeHistogram'
import { RollingChart } from './RollingChart'
import { cls, pct, Stat } from './Stat'
import styles from './backtest.module.css'

const WINDOW_OPTS = [
  [6, '6 個月'],
  [12, '12 個月'],
  [24, '24 個月'],
] as const

export function DistributionTab({
  history,
  baselines,
  cfg,
  windowMonths,
  setWindowMonths,
  distMonths,
  setDistMonths,
  distMode,
  setDistMode,
}: {
  history: HistoryRow[]
  baselines: BaselineRow[]
  cfg: BacktestConfig
  windowMonths: number
  setWindowMonths: (v: number) => void
  distMonths: number
  setDistMonths: (v: number) => void
  distMode: DistMode
  setDistMode: (v: DistMode) => void
}) {
  // 滾動視窗：用完整歷史（不受區間選擇影響）
  const fullResult = useMemo(
    () => (history.length > 1 ? runBacktest(history, cfg, baselines) : null),
    [history, cfg, baselines],
  )
  const rolling = useMemo(
    () =>
      fullResult
        ? rollingWindowReturns(
            fullResult.dates,
            fullResult.equity,
            fullResult.benchmark,
            windowMonths,
          )
        : [],
    [fullResult, windowMonths],
  )
  const rollSummary = useMemo(() => summarizeRolling(rolling), [rolling])

  // aligned / all 掃過所有換股日 → 結果不受 rebalanceDay 影響，memo key 拿掉它避免白重算
  const distKey = useMemo(() => {
    const c: Partial<BacktestConfig> = { ...cfg }
    if (distMode !== 'follow') delete c.rebalanceDay
    return `${JSON.stringify(c)}|${distMonths}|${distMode}`
  }, [cfg, distMonths, distMode])
  const outcomes = useMemo(
    () =>
      history.length > 1 ? distributionOutcomes(history, cfg, baselines, distMonths, distMode) : [],
    // distKey 已涵蓋 cfg / distMonths / distMode
    [history, baselines, distKey],
  )
  const distSummary = useMemo(() => summarizeOutcomes(outcomes), [outcomes])

  return (
    <>
      {outcomes.length > 1 && (
        <section className={styles.rollSection}>
          <div className={styles.rollHead}>
            <h3>
              報酬分布{' '}
              <span className={styles.sub}>
                {distMode === 'aligned'
                  ? `換股日進場、掃過所有換股日、抱滿 N 個月（${distSummary.n.toLocaleString()} 組）`
                  : distMode === 'all'
                    ? `任一交易日進場、掃過所有換股日、抱滿 N 個月（${distSummary.n.toLocaleString()} 組）`
                    : `任一交易日進場、抱滿 N 個月（${distSummary.n} 個起點）`}
              </span>
            </h3>
            <div className={styles.distControls}>
              <CycleField
                label="取樣"
                value={distMode}
                options={[
                  ['aligned', '換股日進場'],
                  ['all', '每日進場'],
                  ['follow', '跟隨設定'],
                ]}
                onChange={setDistMode}
              />
              <CycleField
                label="持有期"
                value={distMonths}
                options={WINDOW_OPTS}
                onChange={setDistMonths}
              />
            </div>
          </div>
          <OutcomeHistogram
            returns={outcomes.map((o) => o.ret)}
            median={distSummary.median}
            mean={distSummary.mean}
          />
          <div className={styles.stats}>
            <Stat
              label="報酬中位數"
              value={pct(distSummary.median)}
              klass={cls(distSummary.median)}
            />
            <Stat label="期望值" value={pct(distSummary.mean)} klass={cls(distSummary.mean)} />
            <Stat label="成長為投入的" value={`${((1 + distSummary.median) * 100).toFixed(0)}%`} />
            <Stat label="標準差" value={pct(distSummary.stdev)} />
            <Stat
              label="正報酬比例"
              value={`${(distSummary.positivePct * 100).toFixed(0)}%`}
              klass={cls(distSummary.positivePct - 0.5)}
            />
            <Stat
              label="相對基準（中位）"
              value={pct(distSummary.medianExcessBench)}
              klass={cls(distSummary.medianExcessBench)}
            />
            {distSummary.medianExcess['大盤'] != null && (
              <Stat
                label="相對大盤（中位）"
                value={pct(distSummary.medianExcess['大盤'])}
                klass={cls(distSummary.medianExcess['大盤'])}
              />
            )}
            {distSummary.medianExcess['0050'] != null && (
              <Stat
                label="相對 0050（中位）"
                value={pct(distSummary.medianExcess['0050'])}
                klass={cls(distSummary.medianExcess['0050'])}
              />
            )}
          </div>
          <p className={styles.rollLegend}>
            {distMode === 'aligned'
              ? '「換股日進場」= 每月第 1..20 個交易日換股各跑一次，只從換股日當進場點；不隨你設的換股日變。'
              : distMode === 'all'
                ? '「每日進場」= 同上但每個交易日都當進場點，樣本更多；不隨你設的換股日變。'
                : '「跟隨設定」= 用你目前設定的換股日。'}
            重疊視窗、非獨立樣本，期望值與標準差僅供參考。
          </p>
        </section>
      )}

      {rolling.length > 1 && (
        <section className={styles.rollSection}>
          <div className={styles.rollHead}>
            <h3>
              滾動報酬 <span className={styles.sub}>每個進場時點、往後 N 個月的報酬</span>
            </h3>
            <CycleField
              label="視窗"
              value={windowMonths}
              options={WINDOW_OPTS}
              onChange={setWindowMonths}
            />
          </div>
          <RollingChart rows={rolling} />
          <div className={styles.stats}>
            <Stat
              label="正報酬比例"
              value={`${(rollSummary.positivePct * 100).toFixed(0)}%`}
              klass={cls(rollSummary.positivePct - 0.5)}
            />
            <Stat
              label="報酬中位數"
              value={pct(rollSummary.median)}
              klass={cls(rollSummary.median)}
            />
            <Stat
              label="最好 / 最差"
              value={`${pct(rollSummary.best)} / ${pct(rollSummary.worst)}`}
            />
            <Stat
              label="贏基準比例"
              value={`${(rollSummary.beatBenchPct * 100).toFixed(0)}%`}
              klass={cls(rollSummary.beatBenchPct - 0.5)}
            />
            <Stat label="視窗數" value={String(rollSummary.n)} />
          </div>
        </section>
      )}
    </>
  )
}
