import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import styles from './Layout.module.css'

const NAV = [
  { to: '/', label: '因子散佈圖', end: true },
  { to: '/ranking', label: '排行榜', end: false },
  { to: '/backtest', label: '回測', end: false },
]

export function Layout({ asOf, children }: { asOf?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.title}>台股動力投資</h1>
        <nav className={styles.nav}>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => (isActive ? styles.active : undefined)}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        {asOf != null && <span className={styles.asof}>{asOf}</span>}
      </header>
      {children}
      <footer className={styles.footer}>
        資料來源：臺灣證券交易所 OpenAPI（<code>STOCK_DAY_ALL</code>、<code>BWIBBU_ALL</code>、
        <code>TWT49U</code>
        ），盤後更新，非逐筆即時報價。動能以還原權值收盤價計算。僅供研究，不構成投資建議。
      </footer>
    </div>
  )
}
