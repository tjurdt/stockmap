import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import styles from './Layout.module.css'

const NAV = [
  { to: '/', label: '因子散佈圖', end: true },
  { to: '/ranking', label: '排行榜', end: false },
  { to: '/backtest', label: '回測', end: false },
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
        <code>TWT49U</code> 除權息）。市值前 60 名單每交易日依全市場市值自動重排。
        盤後收盤資料要等管線抓完才入庫（通常傍晚），在那之前價、市值、估值與動能一律改用 Yahoo
        Finance 報價（約 15–20 分鐘延遲，盤後為當日收盤）推算成<b>暫定值</b>並標示日期，
        資料入庫後自動換回官方數字。僅供研究，不構成投資建議。
      </footer>
    </div>
  )
}
