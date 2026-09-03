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
        資料來源：FinMind（每日收盤）、臺灣證券交易所 OpenAPI（<code>BWIBBU_ALL</code> 本益比等、
        <code>TWT49U</code> 除權息）。市值前 20
        名單每週依全市場市值自動重排。動能以還原權值收盤價計算。 「盤中報價」為 Yahoo Finance
        資料，約 15–20 分鐘延遲。僅供研究，不構成投資建議。
      </footer>
    </div>
  )
}
