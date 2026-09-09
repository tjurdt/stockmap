import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import styles from './Layout.module.css'

const NAV = [
  { to: '/', label: '因子散佈圖', end: true },
  { to: '/ranking', label: '排行榜', end: false },
  { to: '/backtest', label: '回測', end: false },
  { to: '/signal', label: '操作訊號', end: false },
  { to: '/plan', label: '操作計畫', end: false },
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
        <code>TWT49U</code> 除權息）。市值前 20 名單每週依全市場市值自動重排。
        <b>現價</b>預設用 Yahoo Finance 即時報價（約 15–20 分延遲，盤後為最近收盤）；管線收盤資料
        落後時，價、市值、近月/季動能一律改用現價 —— 12-1 動能因定義排除最近一個月，維持收盤。
        僅供研究，不構成投資建議。
      </footer>
    </div>
  )
}
