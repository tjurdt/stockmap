/**
 * 回測設定側欄。常用的放「策略」，一眼看完；其餘全部收進「進階」。
 * 開關型設定的子欄位只有打開時才出現。
 */
import { CustomIndicatorEditor } from '../../components/CustomIndicatorEditor'
import { InfoHint } from '../../components/InfoHint'
import { CycleField } from '../../components/controls/CycleField'
import { Section } from '../../components/controls/Section'
import { StepperField } from '../../components/controls/StepperField'
import { SubGroup } from '../../components/controls/SubGroup'
import { factorFmt, METRICS } from '../../lib/metrics'
import { BACKTEST_FACTORS, MOMENTUM_KEYS, type BacktestConfig } from './engine'
import styles from './backtest.module.css'

const FACTOR_OPTS = [
  ...BACKTEST_FACTORS.map((k) => [k, METRICS[k].label] as const),
  ['custom', '🧩 自訂指標'] as const,
]
const WEEKDAY_OPTS = [
  [1, '週一'],
  [2, '週二'],
  [3, '週三'],
  [4, '週四'],
  [5, '週五'],
] as const

export function BacktestPanel({
  cfg,
  patch,
  months,
  startMonth,
  endMonth,
  setStartMonth,
  setEndMonth,
  quickRange,
  poolShown,
}: {
  cfg: BacktestConfig
  patch: (p: Partial<BacktestConfig>) => void
  months: string[]
  startMonth: string
  endMonth: string
  setStartMonth: (v: string) => void
  setEndMonth: (v: string) => void
  quickRange: (yrs: number | 'all') => void
  poolShown: number
}) {
  const stopType = cfg.stopType ?? 'none'
  const regimeOn = (cfg.regime ?? 'off') !== 'off'
  const marginMode = cfg.swapMarginMode ?? 'relative'

  return (
    <>
      <Section title="回測區間" tone="range" defaultOpen>
        <div className={styles.quick}>
          {(
            [
              ['1', '近 1 年'],
              ['3', '近 3 年'],
              ['all', '全部'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} onClick={() => quickRange(v === 'all' ? 'all' : Number(v))}>
              {label}
            </button>
          ))}
        </div>
        <div className={styles.monthRow}>
          <input
            type="month"
            value={startMonth}
            min={months[0]}
            max={endMonth || months.at(-1)}
            onChange={(e) => setStartMonth(e.target.value)}
          />
          <span>~</span>
          <input
            type="month"
            value={endMonth}
            min={startMonth || months[0]}
            max={months.at(-1)}
            onChange={(e) => setEndMonth(e.target.value)}
          />
        </div>
      </Section>

      <Section title="策略" tone="pick" defaultOpen>
        <CycleField
          label="排名因子"
          value={cfg.factor}
          options={FACTOR_OPTS}
          onChange={(v) => patch({ factor: v })}
        />
        {cfg.factor === 'custom' && (
          <SubGroup>
            <CustomIndicatorEditor
              value={{
                formula: cfg.customFormula ?? '',
                label: cfg.customLabel ?? '',
                betterWhen: cfg.customBetterWhen ?? 'high',
              }}
              onChange={(v) =>
                patch({
                  customFormula: v.formula,
                  customLabel: v.label,
                  customBetterWhen: v.betterWhen,
                })
              }
            />
          </SubGroup>
        )}
        <StepperField
          label="持股數"
          value={cfg.topN}
          min={1}
          max={10}
          onChange={(v) => patch({ topN: v })}
          format={(v) => `前 ${v} 檔`}
        />
        <CycleField
          label="換股頻率"
          value={cfg.rebalance}
          options={[
            ['W', '每週'],
            ['M', '每月'],
          ]}
          onChange={(v) => patch({ rebalance: v })}
        />
        <CycleField
          label="動能換股"
          value={cfg.swapOnBetter ? 'on' : 'off'}
          options={[
            ['off', '關'],
            ['on', '開'],
          ]}
          onChange={(v) => patch({ swapOnBetter: v === 'on' })}
        />
        {cfg.swapOnBetter && (
          <SubGroup>
            <StepperField
              label="換股門檻"
              value={cfg.swapMargin ?? 15}
              min={0}
              max={marginMode === 'absolute' ? 9999 : 50}
              step={marginMode === 'absolute' ? 1 : 5}
              onChange={(v) => patch({ swapMargin: v })}
              format={(v) =>
                marginMode === 'absolute' ? `高出 ${factorFmt(cfg.factor)(v)}` : `高出 ${v}%`
              }
            />
            <StepperField
              label="最短持有"
              value={cfg.swapMinHoldDays ?? 10}
              min={0}
              max={60}
              step={5}
              onChange={(v) => patch({ swapMinHoldDays: v })}
              format={(v) => `${v} 交易日`}
            />
          </SubGroup>
        )}
        <CycleField
          label="停損"
          value={stopType}
          options={[
            ['none', '關'],
            ['fixed', '固定'],
            ['trailing', '移動'],
            ['daily', '單日跌幅'],
            ['ma', '跌破均線'],
          ]}
          onChange={(v) => patch({ stopType: v })}
        />
        {stopType !== 'none' && (
          <SubGroup>
            {stopType === 'ma' ? (
              <StepperField
                label="均線天數"
                value={cfg.stopMaDays ?? 20}
                min={5}
                max={120}
                step={5}
                onChange={(v) => patch({ stopMaDays: v })}
                format={(v) => `${v} 日`}
              />
            ) : (
              <StepperField
                label={
                  stopType === 'trailing'
                    ? '停損%（自高點）'
                    : stopType === 'daily'
                      ? '單日跌幅%'
                      : '停損%（自買進）'
                }
                value={cfg.stopPct ?? 20}
                min={2}
                max={50}
                onChange={(v) => patch({ stopPct: v })}
                format={(v) => `${v}%`}
              />
            )}
          </SubGroup>
        )}
        <StepperField
          label="停利"
          value={cfg.takeProfitPct ?? 0}
          min={0}
          max={200}
          step={10}
          onChange={(v) => patch({ takeProfitPct: v })}
          format={(v) => (v === 0 ? '關' : `賺 ${v}% 賣`)}
        />
        <CycleField
          label="多空過濾"
          value={cfg.regime ?? 'off'}
          options={[
            ['off', '關'],
            ['ma', '均線'],
            ['mom', '動能'],
          ]}
          onChange={(v) => patch({ regime: v })}
        />
        {regimeOn && (
          <SubGroup>
            <StepperField
              label="回看天數"
              value={cfg.regimeDays ?? 200}
              min={20}
              max={300}
              step={10}
              onChange={(v) => patch({ regimeDays: v })}
              format={(v) => `${v} 日`}
            />
            <CycleField
              label="空頭時"
              value={cfg.bearHolding ?? 'cash'}
              options={[
                ['cash', '持有現金'],
                ['inverse', '買台灣50反1'],
              ]}
              onChange={(v) => patch({ bearHolding: v })}
            />
          </SubGroup>
        )}
      </Section>

      <Section title="進階" tone="cost">
        <StepperField
          label={`選股池 前 ${poolShown} 大`}
          value={cfg.poolTopN ?? 50}
          min={10}
          max={80}
          step={5}
          onChange={(v) => patch({ poolTopN: v })}
        />
        {MOMENTUM_KEYS.has(cfg.factor) && (
          <>
            <StepperField
              label="動能回看"
              value={cfg.momDays ?? 0}
              min={0}
              max={300}
              step={5}
              onChange={(v) => patch({ momDays: v })}
              format={(v) => (v === 0 ? '用內建窗' : `${v} 交易日`)}
            />
            {(cfg.momDays ?? 0) > 0 && (
              <StepperField
                label="跳過近期"
                value={cfg.momSkip ?? 0}
                min={0}
                max={60}
                step={5}
                onChange={(v) => patch({ momSkip: v })}
                format={(v) => `${v} 交易日`}
              />
            )}
          </>
        )}
        <CycleField
          label="權重"
          value={cfg.weighting}
          options={[
            ['equal', '等權'],
            ['mcap', '市值權重'],
          ]}
          onChange={(v) => patch({ weighting: v })}
        />
        {cfg.rebalance === 'M' ? (
          <StepperField
            label="換股時點"
            value={cfg.rebalanceDay ?? 1}
            min={1}
            max={23}
            onChange={(v) => patch({ rebalanceDay: v })}
            format={(v) => `每月第 ${v} 個交易日`}
          />
        ) : (
          <CycleField
            label="換股星期"
            value={cfg.rebalanceDay ?? 1}
            options={WEEKDAY_OPTS}
            onChange={(v) => patch({ rebalanceDay: v })}
          />
        )}
        <CycleField
          label="換股成交"
          value={cfg.execLagDays ?? 1}
          options={[
            [1, '隔一日'],
            [0, '訊號日收盤'],
          ]}
          onChange={(v) => patch({ execLagDays: v })}
        />
        {cfg.swapOnBetter && (
          <>
            <CycleField
              label="動能換股門檻"
              value={marginMode}
              options={[
                ['relative', '相對 %'],
                ['absolute', '絕對值'],
              ]}
              onChange={(v) => patch({ swapMarginMode: v })}
            />
            <CycleField
              label="動能換股成交"
              value={(cfg.swapExecNext ?? true) ? 'next' : 'close'}
              options={[
                ['next', '隔一交易日'],
                ['close', '訊號日收盤'],
              ]}
              onChange={(v) => patch({ swapExecNext: v === 'next' })}
            />
          </>
        )}
        {(stopType !== 'none' || (cfg.takeProfitPct ?? 0) > 0) && (
          <CycleField
            label="停損停利成交"
            value={cfg.stopExecNext ? 'next' : 'close'}
            options={[
              ['close', '當日收盤'],
              ['next', '隔一交易日'],
            ]}
            onChange={(v) => patch({ stopExecNext: v === 'next' })}
          />
        )}
        {regimeOn && (
          <CycleField
            label="轉空反應"
            value={cfg.regimeExit ?? 'rebalance'}
            options={[
              ['rebalance', '換股日才空手'],
              ['immediate', '轉空立刻清空'],
            ]}
            onChange={(v) => patch({ regimeExit: v })}
          />
        )}
        <StepperField
          label="手續費"
          value={cfg.feeBps ?? 3.99}
          min={0}
          max={30}
          step={0.01}
          onChange={(v) => patch({ feeBps: Math.round(v * 100) / 100 })}
          format={(v) => `單邊 ${(v / 100).toFixed(4)}%`}
        />
        <StepperField
          label="證交稅"
          value={cfg.taxBps ?? 30}
          min={0}
          max={50}
          step={5}
          onChange={(v) => patch({ taxBps: v })}
          format={(v) => `賣出 ${(v / 100).toFixed(2)}%`}
        />
        <p className={styles.sub} style={{ margin: '6px 2px 0' }}>
          成本與門檻怎麼算
          <InfoHint label="成本與門檻怎麼算">
            <ul>
              <li>
                手續費預設 0.1425% × 2.8 折 = 0.0399%，證交稅個股
                0.3%，對齊你的成交明細。輸入值單位是 bp（1 bp = 0.01%），點數字可直接打 3.99。
              </li>
              <li>
                動能換股門檻「相對 %」＝比最弱持股的因子值再高 X%；「絕對值」＝直接高出
                X（因子原始單位）。因子接近 0 時相對門檻會塌縮，改用絕對值。
              </li>
            </ul>
          </InfoHint>
        </p>
      </Section>
    </>
  )
}
