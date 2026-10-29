import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { site } from './src/data/site.js'

const require = createRequire(import.meta.url)
/* 后台内容 API 与生产（server/index.cjs）共用同一套实现：
   dev / preview 里也能完整体验 /admin —— 登录、编辑、保存、导入导出。
   口令与生产同一套规则（默认口令 + 首次登录强制修改，ADMIN_PASSWORD 可覆盖）；
   内容写在 content/site.json。 */
const { createContentStore } = require('./server/content.cjs')
const { createApiHandler } = require('./server/api.cjs')

/**
 * BASE_PATH 用来兼容 GitHub Pages：
 * 项目页的地址是 https://<用户名>.github.io/<仓库名>/，
 * 所以打包时必须把资源路径前缀设成 /<仓库名>/。
 * 部署工作流会自动注入这个变量；本地开发不用管（默认 '/'）。
 */
const base = process.env.BASE_PATH || '/'

/* ==========================================================================
   分享卡片 / SEO 元信息单一数据源
   --------------------------------------------------------------------------
   index.html 和 public/manifest.webmanifest 里写的是 {{...}} 占位符，
   由这里的 siteMetaPlugin 在 dev / build 时替换成 site.js 里的真实值。
   想改 QQ / 微信分享卡片的标题、描述、封面图，只改 site.js 的 site.meta。
   ========================================================================== */

const meta = site.meta ?? {}
const replacements = {
  '{{site.name}}': site.name ?? '',
  '{{site.nameEn}}': site.nameEn ?? '',
  '{{meta.title}}': meta.title ?? `${site.name} · 个人主页`,
  '{{meta.description}}': meta.description ?? `${site.name} 的个人主页`,
  // og:image 必须是绝对地址（QQ / 微信不认相对路径），缺省时退回站内相对路径
  '{{meta.ogImage}}': meta.ogImage ?? '/og-cover.png',
  '{{meta.twitterCard}}': meta.twitterCard ?? 'summary_large_image',
}

/* 把文本里的 {{xxx}} 占位符换成 site.js 的值。
   asHtml=true 时顺道转义 HTML 实体，避免描述里出现 & " < 破坏属性。 */
function fillPlaceholders(text, { asHtml = false } = {}) {
  return text.replace(/\{\{\s*[\w.]+\s*\}\}/g, (match) => {
    const key = match.replace(/\s/g, '')
    const value = replacements[key]
    if (value === undefined) return match
    if (!asHtml) return value
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  })
}

function siteMetaPlugin() {
  return {
    name: 'site-meta',

    /* dev + build 都会跑：index.html 的 <title> 和 og 系列 meta */
    transformIndexHtml(html) {
      return fillPlaceholders(html, { asHtml: true })
    },

    /* build 结束后，把 manifest 的占位符也填上（public/ 里的是模板，
       直接拷进 dist/ 的话占位符不会有人替换） */
    writeBundle(options) {
      const outDir = options.dir ?? 'dist'
      const manifest = readFileSync(
        fileURLToPath(new URL('./public/manifest.webmanifest', import.meta.url)),
        'utf8',
      )
      writeFileSync(join(outDir, 'manifest.webmanifest'), fillPlaceholders(manifest))
    },

    /* dev 模式下 public/ 的 manifest 是静态服务的，这里拦一层换成真实值 */
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res, next) => {
        try {
          const manifest = readFileSync(
            fileURLToPath(new URL('./public/manifest.webmanifest', import.meta.url)),
            'utf8',
          )
          res.setHeader('Content-Type', 'application/manifest+json')
          res.end(fillPlaceholders(manifest))
        } catch {
          next()
        }
      })
    },
  }
}

/* dev / preview 挂后台 API：与生产（server/index.cjs）共用同一套实现，
   npm run dev 打开 /admin 就是完整后台（口令规则与生产一致）。 */
function adminApiPlugin() {
  const store = createContentStore()
  const api = createApiHandler({
    store,
    password: process.env.ADMIN_PASSWORD, // 不配就用仓库默认口令，首次登录强制修改
  })
  const attach = (middlewares) => {
    middlewares.use((req, res, next) => {
      api(req, res).then((handled) => {
        if (!handled) next()
      })
    })
  }
  return {
    name: 'admin-api',
    configureServer(server) {
      attach(server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.middlewares)
    },
  }
}

export default defineConfig({
  base,
  plugins: [react(), siteMetaPlugin(), adminApiPlugin()],
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
