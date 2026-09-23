/**
 * 零依赖静态服务器 —— 只服务 vite build 产出的 ../dist。
 * 生产环境交给 PM2 看守（ecosystem.config.cjs），
 * 完整部署步骤（Nginx 反代 / TLS / 开机自启 / 日志轮转 / 更新回滚）
 * 见 docs/PM2-DEPLOY.md。
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

const ROOT = path.resolve(__dirname, '..', 'dist')
const PORT = Number(process.env.PORT || 4173)
const HOST = process.env.HOST || '127.0.0.1'
const MAX_ENTRIES = 256 // 内存里最多驻留多少份压缩结果（这个站的资源数远到不了）

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
  const raw = fs.readFileSync(abs)
  cache.set(abs, {
    raw,
    gz: zlib.gzipSync(raw, { level: zlib.constants.Z_BEST_COMPRESSION }),
    br: zlib.brotliCompressSync(raw),
    type: MIME[ext] || 'application/octet-stream',
    mtimeMs: stat.mtimeMs,
  })
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    cache.delete(oldest)
  }
  return cache.get(abs)
}

function entryFor(abs, ext, stat) {
  const hit = cache.get(abs)
  return hit && hit.mtimeMs === stat.mtimeMs ? hit : compress(abs, ext, stat)
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
    const entry = entryFor(file.abs, file.ext, file.stat)
    const headers = {
      'content-type': entry.type,
      'cache-control': cacheControlFor(pathname, file.ext),
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
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
    console.error('[xiaji-home]', error)
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
  console.error(`[xiaji-home] listen failed: ${error.message}`)
  process.exit(1)
})

server.listen(PORT, HOST, () => {
  console.log(`[xiaji-home] serving ${ROOT} on http://${HOST}:${PORT}`)
})

// 优雅退出（PM2 reload / stop 会先发 SIGTERM）：先停止接收新连接、
// 立刻折断 keep-alive 连接让 res.end 触发，5s 兜底强退。
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[xiaji-home] ${signal} received, draining…`)
    server.close(() => process.exit(0))
    for (const socket of sockets) socket.destroy()
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
