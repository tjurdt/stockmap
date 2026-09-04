import { useState } from 'react'

import type { Position } from '../../lib/portfolio'
import styles from './signal.module.css'

const blank = (): Position => ({
  code: '',
  shares: 1000,
  entryPrice: 0,
  entryDate: new Date().toISOString().slice(0, 10),
})

export function HoldingsEditor({
  value,
  onChange,
  names,
}: {
  value: Position[]
  onChange: (v: Position[]) => void
  names: Map<string, string>
}) {
  const [draft, setDraft] = useState<Position>(blank)

  const add = () => {
    if (!/^\d{4}$/.test(draft.code) || draft.shares <= 0 || draft.entryPrice <= 0) return
    onChange([...value.filter((p) => p.code !== draft.code), draft])
    setDraft(blank())
  }

  return (
    <div className={styles.editor}>
      <div className={styles.editorRow}>
        <input
          placeholder="代號"
          maxLength={4}
          value={draft.code}
          onChange={(e) => setDraft({ ...draft, code: e.target.value.replace(/\D/g, '') })}
        />
        <span className={styles.name}>{names.get(draft.code) ?? ''}</span>
        <input
          type="number"
          placeholder="股數"
          value={draft.shares || ''}
          onChange={(e) => setDraft({ ...draft, shares: Number(e.target.value) })}
        />
        <input
          type="number"
          placeholder="買進價"
          value={draft.entryPrice || ''}
          onChange={(e) => setDraft({ ...draft, entryPrice: Number(e.target.value) })}
        />
        <input
          type="date"
          value={draft.entryDate}
          onChange={(e) => setDraft({ ...draft, entryDate: e.target.value })}
        />
        <button onClick={add}>加入</button>
      </div>
      {value.length > 0 && (
        <div className={styles.chips}>
          {value.map((p) => (
            <span key={p.code} className={styles.chip}>
              {p.code} {names.get(p.code) ?? ''} · {p.shares.toLocaleString()} 股 @ {p.entryPrice}
              <button onClick={() => onChange(value.filter((x) => x.code !== p.code))}>✕</button>
            </span>
          ))}
        </div>
      )}
      <p className={styles.sub}>存在這台裝置的瀏覽器，不會上傳。</p>
    </div>
  )
}
