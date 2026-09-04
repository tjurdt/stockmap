import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { Layout } from '../../components/Layout'
import { useAsync } from '../../hooks/useAsync'
import { useLiveQuotes } from '../../hooks/useLiveQuotes'
import { useSnapshot } from '../../hooks/useSnapshot'
import { loadBaselines } from '../../lib/baselines'
import { loadAllFactorHistory } from '../../lib/history'
import { METRICS } from '../../lib/metrics'
import { useHoldings, type Position } from '../../lib/portfolio'
import { rankTargets, rebalanceKey, regimeByDate } from '../backtest/engine'
import { decodeParams } from '../backtest/strategyParams'
import { HoldingsEditor } from './HoldingsEditor'
import styles from './signal.module.css'

const money = (v: number) => Math.round(v).toLocaleString()
const price = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 2 })

export function SignalPage() {
  const search = useLocation().search
  const p = decodeParams(search)
  const hist = useAsync(loadAllFactorHistory, [])
  const bl = useAsync(loadBaselines, [])
  const snap = useSnapshot()
  const [holdings, setHoldings] = useHoldings()

  const names = useMemo(() => {
    const m = new Map<string, string>()
    if (snap.status === 'ready') for (const s of snap.data.stocks) m.set(s.code, s.name)
    return m
  }, [snap])

  const rows = hist.status === 'ready' ? hist.data : []
  const lastRow = rows.at(-1)
  const prevRow = rows.at(-2)

  const model = useMemo(() => {
    if (!lastRow) return null
    const baselines = bl.status === 'ready' ? bl.data : []
    const regime =
      regimeByDate([lastRow.date], baselines, p.regime, p.regimeDays).get(lastRow.date) ?? 'bull'
    const targets = regime === 'bear' ? [] : rankTargets(lastRow, { ...p, costBps: 0 })
    const isRebalDay =
      !!prevRow &&
      rebalanceKey(prevRow.date, p.rebalance) !== rebalanceKey(lastRow.date, p.rebalance)
    // 每檔自買進日以來的最高價（含當日收盤），供移動停損
    const peakSince = (code: string, from: string): number => {
      let mx = 0
      for (const r of rows) {
        if (r.date < from) continue
        const s = r.stocks.find((x) => x.code === code)
        if (s?.close != null) mx = Math.max(mx, s.close)
      }
      return mx
    }
    // 下次換股日（近似：下個月 / 下週一，遇假日順延到週一）
    const d = new Date(`${lastRow.date}T00:00:00Z`)
    if (p.rebalance === 'M') {
      d.setUTCMonth(d.getUTCMonth() + 1, 1)
    } else {
      d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7))
    }
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1)
    const nextRebal = d.toISOString().slice(0, 10)
    return { regime, targets, isRebalDay, peakSince, lastDate: lastRow.date, nextRebal }
  }, [lastRow, prevRow, rows, bl, p])

  const codes = useMemo(
    () => [
      ...new Set([...(model?.targets.map((t) => t.code) ?? []), ...holdings.map((h) => h.code)]),
    ],
    [model, holdings],
  )
  const { quotes, isLive } = useLiveQuotes(codes, true)
  const px = (code: string): number | null =>
    quotes.get(code)?.price ?? lastRow?.stocks.find((s) => s.code === code)?.close ?? null

  if (hist.status === 'loading') return <Layout>載入中…</Layout>
  if (!model || !lastRow)
    return (
      <Layout>
        <p>讀不到因子歷史。</p>
      </Layout>
    )

  const factorLabel = METRICS[p.factor].label
  const targetCodes = new Set(model.targets.map((t) => t.code))
  const heldCodes = new Set(holdings.map((h) => h.code))
  const toBuy = model.targets.filter((t) => !heldCodes.has(t.code))
  const toSell = holdings.filter((h) => !targetCodes.has(h.code))
  const toKeep = holdings.filter((h) => targetCodes.has(h.code))

  const stopHit = (h: Position): { pct: number; hit: boolean } | null => {
    if (p.stopType === 'none') return null
    const now = px(h.code)
    if (now == null) return null
    const ref =
      p.stopType === 'trailing'
        ? Math.max(h.entryPrice, model.peakSince(h.code, h.entryDate))
        : h.entryPrice
    const pct = now / ref - 1
    return { pct, hit: pct <= -p.stopPct / 100 }
  }

  return (
    <Layout asOf={isLive ? '盤中報價（約 15 分鐘延遲）' : `依 ${model.lastDate} 收盤`}>
      <div className={styles.summary}>
        <b>策略</b>：{factorLabel} 高者佳 · 市值前 {p.poolTopN} 選前 {p.topN} 檔 ·{' '}
        {p.rebalance === 'M' ? '每月' : '每週'}再平衡 ·{' '}
        {p.weighting === 'mcap' ? '市值權重' : '等權'}
        {p.stopType !== 'none' &&
          ` · ${p.stopType === 'trailing' ? '移動' : '固定'}停損 ${p.stopPct}%`}
        {p.regime !== 'off' &&
          ` · 多空過濾（${p.regime === 'ma' ? '均線' : '動能'} ${p.regimeDays} 日）`}
        <Link to={`/backtest${search}`} className={styles.back}>
          ← 回回測調整
        </Link>
      </div>

      <div className={model.regime === 'bear' ? styles.bearBox : styles.bullBox}>
        <p>
          大盤環境：<b>{model.regime === 'bear' ? '空頭（策略建議整體空手）' : '多頭'}</b>
        </p>
        {model.isRebalDay ? (
          <p>
            <b>{model.lastDate} 是換股訊號日</b> → 下一個交易日照「明天的動作」換股。
          </p>
        ) : (
          <p>
            <b>今天不是換股日。</b>下次換股：{p.rebalance === 'M' ? '10 月' : '下週'}
            第一個交易日（約 <b>{model.nextRebal}</b>）。在那之前：
            <br />• 已在跑這個策略 → <b>抱著上次換股買的不動</b>，只有跌破停損才賣。
            <br />• 還沒開始跑 → 可以現在照下方「目標持股」進場，之後每逢換股日再平衡。
            <br />※ 下方「目標持股」是「假如今天就是換股日」的排名，到 {model.nextRebal}{' '}
            動能會變、名單可能不同。
          </p>
        )}
      </div>

      <section>
        <h3>
          目標持股{' '}
          <span className={styles.sub}>
            依 {factorLabel} 排名（{model.lastDate} 收盤資料）
          </span>
        </h3>
        {model.targets.length === 0 ? (
          <p className={styles.sub}>（空頭空手）</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>代號</th>
                <th>名稱</th>
                <th>{factorLabel}</th>
                <th>現價</th>
                <th>目標權重</th>
              </tr>
            </thead>
            <tbody>
              {model.targets.map((t, i) => (
                <tr key={t.code} className={heldCodes.has(t.code) ? styles.held : undefined}>
                  <td>{i + 1}</td>
                  <td>{t.code}</td>
                  <td>{names.get(t.code) ?? ''}</td>
                  <td>{METRICS[p.factor].fmt(t.factor)}</td>
                  <td>{price(px(t.code))}</td>
                  <td>{(t.weight * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3>我目前持有</h3>
        <HoldingsEditor value={holdings} onChange={setHoldings} names={names} />
        {holdings.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>代號</th>
                <th>股數</th>
                <th>買進價</th>
                <th>現價</th>
                <th>損益</th>
                <th>停損（{p.stopType === 'none' ? '關' : `${p.stopPct}%`}）</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const now = px(h.code)
                const pl = now != null ? now / h.entryPrice - 1 : null
                const st = stopHit(h)
                return (
                  <tr key={h.code}>
                    <td>
                      {h.code} {names.get(h.code) ?? ''}
                    </td>
                    <td>{h.shares.toLocaleString()}</td>
                    <td>{price(h.entryPrice)}</td>
                    <td>{price(now)}</td>
                    <td className={pl != null && pl < 0 ? styles.neg : styles.pos}>
                      {pl == null ? '—' : `${pl >= 0 ? '+' : ''}${(pl * 100).toFixed(1)}%`}
                    </td>
                    <td className={st?.hit ? styles.neg : undefined}>
                      {!st
                        ? '—'
                        : st.hit
                          ? `已觸發（${(st.pct * 100).toFixed(1)}%）→ 出場`
                          : `距停損 ${((st.pct + p.stopPct / 100) * 100).toFixed(1)}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {p.stopType !== 'none' && holdings.some((h) => stopHit(h)?.hit) && (
        <section>
          <h3>⚠️ 現在就要處理的停損</h3>
          <ul className={styles.actions}>
            {holdings
              .filter((h) => stopHit(h)?.hit)
              .map((h) => (
                <li key={`stop${h.code}`}>
                  <span className={styles.sell}>停損</span> {h.code} {names.get(h.code) ?? ''}
                  　已跌破 {p.stopPct}% → 不用等換股日，<b>今天/明天就出場</b>、持有現金至下次再平衡
                </li>
              ))}
          </ul>
        </section>
      )}

      <section>
        <h3>
          {model.isRebalDay ? '明天的動作（換股日）' : `下次換股日（約 ${model.nextRebal}）要做的`}
        </h3>
        {!model.isRebalDay && (
          <p className={styles.sub}>
            預覽而已 —— 到 {model.nextRebal} 這份清單會依當時動能重算，不要現在就照這個換。
          </p>
        )}
        <ul className={styles.actions}>
          {toSell.map((h) => (
            <li key={h.code}>
              <span className={styles.sell}>賣出</span> {h.code} {names.get(h.code) ?? ''}
              {h.shares.toLocaleString()} 股 · 約 {money((px(h.code) ?? 0) * h.shares)} 元
            </li>
          ))}
          {toBuy.map((t) => (
            <li key={t.code}>
              <span className={styles.buy}>買進</span> {t.code} {names.get(t.code) ?? ''}
              　目標 {(t.weight * 100).toFixed(0)}% · 現價 {price(px(t.code))}
            </li>
          ))}
          {toKeep.map((h) => (
            <li key={h.code}>
              <span className={styles.keep}>續抱</span> {h.code} {names.get(h.code) ?? ''}
            </li>
          ))}
          {toSell.length + toBuy.length === 0 && model.targets.length > 0 && (
            <li className={styles.sub}>組合與目標一致，無需換股。</li>
          )}
        </ul>
      </section>

      <section className={styles.orderTips}>
        <h3>怎麼掛單，才貼近回測的「收盤價成交」</h3>
        <ul>
          <li>
            <b>盤後定價交易（14:00–14:30）</b>
            ：直接用當日收盤價撮合，最貼近回測。大型股幾乎都排得到；
            熱門小型股有超額配售抽籤的風險。
          </li>
          <li>
            <b>或</b>收盤前 5 分鐘的集合競價：買單掛「現價 × 1.005」、賣單掛「現價 × 0.995」的限價
            —— 只要收盤價落在你的限價內，就會用<b>實際收盤價</b>成交（不是你掛的價）。
          </li>
          <li>
            要換的幾檔<b>分開下單</b>；流動性差的用限價、別用市價；成交不完就接受少買一點。
          </li>
          <li>台股一張 = 1000 股，小資金湊不齊目標權重是正常的。</li>
        </ul>
        <p className={styles.sub}>
          這頁只列「照策略該做什麼」，不會幫你下單。設定要改回<Link to="/backtest">回測頁</Link>。
        </p>
      </section>
    </Layout>
  )
}
