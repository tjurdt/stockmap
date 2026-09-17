/**
 * 自訂指標編輯區 —— 名稱 + 公式（`lib/formula.ts` 即時驗證）+ 排序方向 + 存成我的指標。
 * 掛在各頁自己的因子選單下面（回測頁的 SubGroup、散佈圖的軸選單旁），
 * 公式/名稱/方向本身內嵌在呼叫端的設定物件裡（不是靠這個元件持有狀態）。
 */
import { useState } from 'react'

import { useCustomIndicators } from '../hooks/useCustomIndicators'
import controlStyles from './controls/controls.module.css'
import styles from './CustomIndicatorEditor.module.css'
import { InfoHint } from './InfoHint'
import { newCustomIndicatorId } from '../lib/customIndicators'
import { parseFormula } from '../lib/formula'

export interface CustomFactorValue {
  formula: string
  label: string
  betterWhen: 'high' | 'low'
}

export function CustomIndicatorEditor({
  value,
  onChange,
}: {
  value: CustomFactorValue
  onChange: (next: CustomFactorValue) => void
}) {
  const { list, save } = useCustomIndicators()
  const [id, setId] = useState(newCustomIndicatorId)
  const [saved, setSaved] = useState(false)
  const parsed = parseFormula(value.formula)

  const patch = (p: Partial<CustomFactorValue>) => {
    setSaved(false)
    onChange({ ...value, ...p })
  }

  return (
    <div className={styles.editor}>
      {list.length > 0 && (
        <div className={controlStyles.row}>
          <span className={controlStyles.label}>選已存的</span>
          <select
            className={styles.select}
            value=""
            onChange={(e) => {
              const ind = list.find((x) => x.id === e.target.value)
              if (!ind) return
              setId(ind.id)
              patch({ formula: ind.formula, label: ind.name, betterWhen: ind.betterWhen })
            }}
          >
            <option value="">— 選一個 —</option>
            {list.map((ind) => (
              <option key={ind.id} value={ind.id}>
                {ind.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className={controlStyles.row}>
        <span className={controlStyles.label}>名稱</span>
        <input
          className={styles.input}
          value={value.label}
          onChange={(e) => patch({ label: e.target.value })}
          placeholder="幫這個指標取個名字"
        />
      </div>
      <div className={controlStyles.row}>
        <span className={controlStyles.label}>
          公式
          <InfoHint label="公式語法">
            <p>
              <code>avg(n)</code> ／ <code>max(n)</code> ／ <code>min(n)</code>：今天到 n
              個交易日前（含）的平均／最大／最小值，例如 <code>avg(20)</code>。
            </p>
            <p>
              <code>avg(a:b)</code>：a 到 b 個交易日前（含）的平均，a、b 順序不拘，
              <code>max</code>／<code>min</code> 同理，例如 <code>avg(9:15)</code>。
            </p>
            <p>
              <code>price(n)</code>：n 個交易日前的股價，例如 <code>price(0)</code> 是今天。
            </p>
            <p>
              <code>chg(n)</code>：今天對 n 個交易日前的漲跌幅 (%)，等於{' '}
              <code>(price(0)-price(n))/price(n)*100</code> 但精簡很多，例如 <code>chg(20)</code>。
            </p>
            <p>
              運算子：<code>+ − × / ^</code> 與括號，例如 <code>2*avg(5)/6</code> 或{' '}
              <code>1/(avg(4)+max(8))</code>。
            </p>
          </InfoHint>
        </span>
        <input
          className={styles.input}
          value={value.formula}
          onChange={(e) => patch({ formula: e.target.value })}
          placeholder="例如 chg(20)"
        />
      </div>
      {!parsed.ok && value.formula.trim() !== '' && (
        <p className={styles.error}>⚠ {parsed.error}</p>
      )}
      <div className={controlStyles.row}>
        <span className={controlStyles.label}>方向</span>
        <div className={styles.toggle}>
          <button
            type="button"
            data-on={value.betterWhen === 'high'}
            onClick={() => patch({ betterWhen: 'high' })}
          >
            越大越好
          </button>
          <button
            type="button"
            data-on={value.betterWhen === 'low'}
            onClick={() => patch({ betterWhen: 'low' })}
          >
            越小越好
          </button>
        </div>
      </div>
      <button
        type="button"
        className={styles.saveBtn}
        disabled={!parsed.ok || !value.label.trim()}
        onClick={() => {
          const ok = save({
            id,
            name: value.label.trim(),
            formula: value.formula,
            betterWhen: value.betterWhen,
          })
          setSaved(ok)
        }}
      >
        {saved ? '✓ 已存成我的指標' : '存成我的指標'}
      </button>
    </div>
  )
}
