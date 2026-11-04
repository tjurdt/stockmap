import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

import { InfoHint } from './InfoHint'
import styles from './Layout.module.css'

/** 依使用頻率排：每天看 → 成交後記 → 想改策略 → 逛市場。 */
const NAV = [
  { to: '/plan', label: '今日操作' },
  { to: '/performance', label: '我的績效' },
  { to: '/backtest', label: '回測' },
  { to: '/market', label: '市場' },
]
const MARKET_NAV = [
  { to: '/market', label: '因子散佈圖' },
  { to: '/ranking', label: '排行榜' },
]
const MARKET_PATHS = ['/market', '/ranking', '/stock']

export function Layout({ asOf, children }: { asOf?: ReactNode; children: ReactNode }) {
  const { pathname } = useLocation()
  const inMarket = MARKET_PATHS.some((p) => pathname.startsWith(p))
  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.title}>台股動力投資</h1>
        <nav className={styles.nav}>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                isActive || (n.to === '/market' && inMarket) ? styles.active : undefined
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        {asOf != null && <span className={styles.asof}>{asOf}</span>}
      </header>
      {inMarket && (
        <nav className={styles.subnav}>
          {MARKET_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => (isActive ? styles.subActive : undefined)}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      )}
      {children}
      <footer className={styles.footer}>
        僅供研究，不構成投資建議。
        <InfoHint label="資料來源與更新方式">
          <ul>
            <li>
              收盤價：FinMind；本益比 / 淨值比 / 殖利率：臺灣證券交易所 OpenAPI
              <code>BWIBBU_ALL</code>；除權息：<code>TWT49U</code>。
            </li>
            <li>市值前 60 名單每交易日依全市場市值自動重排；動能以還原權值收盤價計算。</li>
            <li>
              盤後收盤資料要等管線抓完才入庫（通常傍晚）。在那之前，價、市值、估值與動能改用 Yahoo
              Finance 報價（約 15–20 分鐘延遲，盤後為當日收盤）推算成<b>暫定值</b>
              並標示日期，資料入庫後自動換回官方數字。
            </li>
          </ul>
        </InfoHint>
      </footer>
    </div>
  )
}
