/**
 * 零依赖静态服务器 —— 服务 vite build 产出的 ../dist，外加后台内容 API。
 * 生产环境交给 PM2 看守（ecosystem.config.cjs），
 * 完整部署步骤（Nginx 反代 / TLS / 开机自启 / 日志轮转 / 更新回滚）
 * 见 docs/PM2-DEPLOY.md，后台（/admin）说明见 docs/ADMIN.md。
 *
 * 刻意不引任何 npm 包：这个站整包 gzip 后约 80 kB，
 * node 内置的 http / fs / zlib 完全够用 ——
 * 少一个依赖就少一条供应链风险，部署机上也就不用装 node_modules。
 */
'use strict'

const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const { createContentStore } = require('./content.cjs')
const { createApiHandler } = require('./api.cjs')

const ROOT = path.resolve(__dirname, '..', 'dist')
const INDEX_ABS = path.join(ROOT, 'index.html')
const PORT = Number(process.env.PORT || 4173)
const HOST = process.env.HOST || '127.0.0.1'
const MAX_ENTRIES = 256 // 内存里最多驻留多少份压缩结果（这个站的资源数远到不了）

/* 线上内容仓库（content/site.json）+ /api 路由。
   ADMIN_PASSWORD 在 ecosystem.config.cjs 的 env 里配；没配时后台只读不可写。 */
const contentStore = createContentStore()
const api = createApiHandler({
  store: contentStore,
  password: process.env.ADMIN_PASSWORD,
  isProd: process.env.NODE_ENV === 'production',
})

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const HASHED_ASSET = /(?:\/|^)assets\//
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'
const HTML_CACHE = 'no-cache' // index.html 每次回源确认，站点更新后才能拿到新 hash
const FALLBACK_CACHE = 'public, max-age=3600'

/** abs -> { raw, gz, br, type, mtimeMs }；dist 重建后 mtime 变化，自动失效 */
const cache = new Map()

function compress(abs, ext, stat) {
  return makeEntry(fs.readFileSync(abs), MIME[ext] || 'application/octet-stream')
}

/** 把一份原始字节做成 { raw, gz, br, type } 三件套 */
function makeEntry(raw, type) {
  return {
    raw,
    gz: zlib.gzipSync(raw, { level: zlib.constants.Z_BEST_COMPRESSION }),
    br: zlib.brotliCompressSync(raw),
    type,
  }
}

function entryFor(abs, ext, stat) {
  const hit = cache.get(abs)
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit
  const entry = { ...compress(abs, ext, stat), mtimeMs: stat.mtimeMs }
  cache.set(abs, entry)
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    cache.delete(oldest)
  }
  return entry
}

/* ---- index.html 的线上 meta 替换 ----------------------------------------
   构建时 index.html 的 <title> / og:* 已经被 site.js 的值填死了，
   但后台编辑改的是 content/site.json —— 所以在响应 index.html 时，
   把标题、描述、分享卡片这几处替换成线上内容里的 meta。
   结果按 (dist mtime + 内容版本) 缓存，内容不变就是一次内存查找。 */

const htmlCache = new Map() // abs -> { key, entry }

/** HTML 属性值转义（和 vite.config.js 的 fillPlaceholders 同一套） */
function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function applyLiveMeta(html, content) {
  const site = content?.site
  if (!site) return html
  const meta = site.meta || {}
  const title = meta.title || (site.name ? `${site.name} · 个人主页` : '')
  const replacements = [
    [/([<]title[^>]*>)[^<]*(<\/title>)/, title],
    [/([<]meta\s+property="og:title"\s+content=")[^"]*(")/, title],
    [/([<]meta\s+property="og:description"\s+content=")[^"]*(")/, meta.description],
    [/([<]meta\s+property="og:image"\s+content=")[^"]*(")/, meta.ogImage],
    [/([<]meta\s+name="twitter:card"\s+content=")[^"]*(")/, meta.twitterCard],
    [/([<]meta\s+name="description"\s+content=")[^"]*(")/, meta.description],
  ]
  for (const [pattern, value] of replacements) {
    if (!value) continue
    html = html.replace(pattern, (m, before, after) => before + escapeAttr(value) + after)
  }
  return html
}

function htmlEntryFor(abs) {
  let stat
  try {
    stat = fs.statSync(abs)
  } catch {
    return null
  }
  const key = `${stat.mtimeMs}:${stat.size}:${contentStore.version()}`
  const hit = htmlCache.get(abs)
  if (hit && hit.key === key) return hit.entry
  let html = fs.readFileSync(abs, 'utf8')
  try {
    const { content } = contentStore.read()
    html = applyLiveMeta(html, content)
  } catch (error) {
    console.error('[my-homepage] live meta skipped:', error.message) // 内容坏了就出构建版
  }
  const entry = makeEntry(Buffer.from(html, 'utf8'), 'text/html; charset=utf-8')
  htmlCache.set(abs, { key, entry })
  return entry
}

/** 把 URL 路径收敛到 dist 内；越界 / 不存在返回 null（404 还是 SPA 回退由调用方决定） */
function resolveFile(urlPath) {
  let rel
  try {
    rel = decodeURIComponent(urlPath)
  } catch {
    return null // URL 里带了非法的 % 转义
  }
  const abs = path.normalize(path.join(ROOT, rel))
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null // 目录穿越
  let stat
  try {
    stat = fs.statSync(abs)
  } catch {
    return null
  }
  if (stat.isDirectory()) {
    const index = path.join(abs, 'index.html')
    try {
      return { abs: index, ext: '.html', stat: fs.statSync(index) }
    } catch {
      return null
    }
  }
  return { abs, ext: path.extname(abs).toLowerCase(), stat }
}

function cacheControlFor(pathname, ext) {
  if (HASHED_ASSET.test(pathname)) return IMMUTABLE_CACHE // 资源名带内容指纹
  if (ext === '.html') return HTML_CACHE
  return FALLBACK_CACHE
}

function handle(req, res) {
  let pathname
  try {
    pathname = new URL(req.url, 'http://127.0.0.1').pathname
  } catch {
    res.writeHead(400)
    return res.end()
  }

  if (pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    return res.end('ok')
  }

  /* /api/* 交给后台内容 API（内部处理 POST/PUT 和鉴权），其余仍是只读静态站 */
  if (pathname.startsWith('/api/')) {
    api(req, res)
    return
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    return res.end()
  }

  let file = resolveFile(pathname)
  if (!file && path.extname(pathname) === '') {
    file = resolveFile('/') // SPA 回退：没有扩展名的路径一律交给前端路由
  }
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    return res.end('404')
  }

  try {
    /* index.html 单独走：注入线上内容的 meta（分享卡片跟随后台编辑，即时生效） */
    const entry =
      file.abs === INDEX_ABS
        ? htmlEntryFor(file.abs)
        : entryFor(file.abs, file.ext, file.stat)
    if (!entry) {
      res.writeHead(500)
      return res.end()
    }
    const headers = {
      'content-type': entry.type,
      'cache-control': cacheControlFor(pathname, file.ext),
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      /* 内容安全策略：这个站没有任何用户输入出口（便签只存本地、不渲染给别人），
         CSP 属于纵深防御。script-src 落到 default-src 'self' —— 构建产物里没有
         内联脚本（scrollRestoration 那段已外置到 public/）；style-src 放行
         'unsafe-inline' 是给 React 的 style 属性和 Google Fonts 的样式表。
         部署在 GitHub Pages 之类拿不到响应头的地方时这一条不生效，属已知取舍。 */
      'content-security-policy': [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "img-src 'self' data:",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self'",
        "manifest-src 'self'",
      ].join('; '),
    }
    // 压缩结果首次访问时算好并驻留内存（整站 ~1 MB，之后零 CPU）
    let body = entry.raw
    const accept = String(req.headers['accept-encoding'] || '')
    if (accept.includes('br')) {
      body = entry.br
      headers['content-encoding'] = 'br'
    } else if (accept.includes('gzip')) {
      body = entry.gz
      headers['content-encoding'] = 'gzip'
    }
    headers['content-length'] = body.length
    res.writeHead(200, headers)
    if (req.method === 'HEAD') return res.end()
    res.end(body)
  } catch (error) {
    console.error('[my-homepage]', error)
    res.writeHead(500)
    res.end()
  }
}

const sockets = new Set()
const server = http.createServer(handle)
server.on('connection', (socket) => {
  sockets.add(socket)
  socket.on('close', () => sockets.delete(socket))
})
server.on('error', (error) => {
  console.error(`[my-homepage] listen failed: ${error.message}`)
  process.exit(1)
})

server.listen(PORT, HOST, () => {
  console.log(`[my-homepage] serving ${ROOT} on http://${HOST}:${PORT}`)
})

// 优雅退出（PM2 reload / stop 会先发 SIGTERM）：先停止接收新连接、
// 立刻折断 keep-alive 连接让 res.end 触发，5s 兜底强退。
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[my-homepage] ${signal} received, draining…`)
    server.close(() => process.exit(0))
    for (const socket of sockets) socket.destroy()
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
