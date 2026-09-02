import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// GitHub Pages 專案站台部署在 /stockmap/ 下；本機 dev 用 '/'.
// 覆寫用環境變數 VITE_BASE（deploy.yml 會設定）。
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    css: true,
  },
})
