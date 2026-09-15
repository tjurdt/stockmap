/**
 * 買賣紀錄（交易日誌）—— 逐筆記，持股與已持有天數由它推算。
 * 只存在這台裝置的瀏覽器 localStorage，不會上傳。
 */
import { useState } from 'react'

import { InfoHint } from '../../components/InfoHint'
import { buildLedger, tradeId, type Trade } from '../../lib/trades'
import styles from './planner.module.css'

const money = (v: number) => Math.round(v).toLocaleString()

interface Draft {
  date: string
  side: 'buy' | 'sell'
  code: string
  shares: string
  price: string
}

const blank = (date: string): Draft => ({ date, side: 'buy', code: '', shares: '1000', price: '' })

export function TradeLog({
  trades,
  onChange,
  names,
  priceOf,
  defaultDate,
}: {
  trades: Trade[]
  onChange: (next: Trade[]) => void
  names: Map<string, string>
  /** 填代號時自動帶入的參考價（最新報價） */
  priceOf: (code: string) => number | null
  /** 新增表單的預設日期（最新交易日） */
  defaultDate: string
}) {
  const [draft, setDraft] = useState<Draft>(() => blank(defaultDate))
  const [err, setErr] = useState('')

  const ledger = buildLedger(trades)
  const held = new Map(ledger.positions.map((p) => [p.code, p.shares]))

  const setCode = (raw: string) => {
    const code = raw.replace(/\D/g, '').slice(0, 4)
    const ref = code.length === 4 ? priceOf(code) : null
    setDraft((d) => ({ ...d, code, price: ref != null && !d.price ? String(ref) : d.price }))
  }

  const add = () => {
    const shares = Number(draft.shares)
    const price = Number(draft.price)
    if (!/^\d{4}$/.test(draft.code)) return setErr('代號要 4 位數字')
    if (!(shares > 0)) return setErr('股數要大於 0')
    if (!(price > 0)) return setErr('成交價要大於 0')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return setErr('請填成交日')
    if (draft.side === 'sell' && (held.get(draft.code) ?? 0) < shares) {
      return setErr(`手上 ${draft.code} 只有 ${(held.get(draft.code) ?? 0).toLocaleString()} 股`)
    }
    setErr('')
    onChange([
      ...trades,
      { id: tradeId(), date: draft.date, code: draft.code, side: draft.side, shares, price },
    ])
    setDraft(blank(draft.date))
  }

  const sorted = [...trades].sort(
    (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
  )

  return (
    <div className={styles.card}>
      <h3>
        買賣紀錄 <span className={styles.sub}>成交後回來記一筆，上面的持股與天數就會自己更新</span>
        <InfoHint label="這份紀錄怎麼用">
          <ul>
            <li>
              加碼同一檔會自動算成<b>加權平均成本</b>，持有天數仍從第一次買進起算。
            </li>
            <li>
              賣光再買回，持有天數<b>重新起算</b>（最短持有、移動停損的高點都跟著重來）。
            </li>
            <li>只存在這台裝置的瀏覽器，不會上傳；換裝置請用下方設定裡的「複製設定 JSON」。</li>
            <li>已實現損益未計手續費與證交稅。</li>
          </ul>
        </InfoHint>
      </h3>

      {err && <p className={styles.err}>{err}</p>}
      <div className={styles.tradeForm}>
        <input
          type="date"
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
        />
        <select
          value={draft.side}
          onChange={(e) => setDraft({ ...draft, side: e.target.value as 'buy' | 'sell' })}
        >
          <option value="buy">買進</option>
          <option value="sell">賣出</option>
        </select>
        <input
          name="code"
          placeholder="代號"
          inputMode="numeric"
          value={draft.code}
          onChange={(e) => setCode(e.target.value)}
        />
        <span className={styles.name}>{names.get(draft.code) ?? ''}</span>
        <input
          type="number"
          placeholder="股數"
          value={draft.shares}
          onChange={(e) => setDraft({ ...draft, shares: e.target.value })}
        />
        <input
          type="number"
          step="0.01"
          placeholder="成交價"
          value={draft.price}
          onChange={(e) => setDraft({ ...draft, price: e.target.value })}
        />
        <button className={styles.addBtn} onClick={add}>
          加入
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className={styles.note}>
          還沒有任何紀錄。買進後把「日期 / 代號 / 股數 /
          成交價」記進來，這頁才知道你手上有什麼、抱了幾天。
        </p>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>成交日</th>
                <th>代號</th>
                <th>買賣</th>
                <th>股數</th>
                <th>成交價</th>
                <th>金額</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>
                    {t.code} {names.get(t.code) ?? ''}
                  </td>
                  <td className={t.side === 'buy' ? styles.pos : styles.neg}>
                    {t.side === 'buy' ? '買進' : '賣出'}
                  </td>
                  <td>{t.shares.toLocaleString()}</td>
                  <td>{t.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td>{money(t.shares * t.price)}</td>
                  <td>
                    <button
                      className={styles.iconBtn}
                      onClick={() => onChange(trades.filter((x) => x.id !== t.id))}
                      aria-label={`刪除 ${t.date} ${t.code}`}
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.note}>
        已實現損益：
        <b className={ledger.realized < 0 ? styles.neg : styles.pos}>
          {ledger.realized >= 0 ? '+' : ''}
          {money(ledger.realized)} 元
        </b>
      </p>
    </div>
  )
}
