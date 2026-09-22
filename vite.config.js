import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * BASE_PATH 用来兼容 GitHub Pages：
 * 项目页的地址是 https://<用户名>.github.io/<仓库名>/，
 * 所以打包时必须把资源路径前缀设成 /<仓库名>/。
 * 部署工作流会自动注入这个变量；本地开发不用管（默认 '/'）。
 */
const base = process.env.BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    open: false,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
