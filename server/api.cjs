/**
 * 后台 API 处理器 —— server/index.cjs（生产）和 vite dev/preview（开发）共用。
 *
 *   GET  /api/content        读线上内容（公开：前台渲染也要用）
 *   PUT  /api/content        写线上内容（要 token；全量覆盖，写前自动备份）
 *   POST /api/admin/login    口令换 token
 *   GET  /api/admin/session  验 token 还有没有效
 *
 * 鉴权是「口令 + 签名 token」：
 *   · 口令从环境变量 ADMIN_PASSWORD 读（PM2 的 ecosystem 里配）
 *   · token = 过期时间戳 + 口令的 HMAC 签名，无状态，服务重启不失效
 *   · 登录失败限速：同一 IP 10 分钟内错 5 次锁 10 分钟
 *
 * 依旧零依赖：http 之外只用 node:crypto。
 */
'use strict'

const crypto = require('node:crypto')
const { ContentError } = require('./content.cjs')

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000 // 登录一次管 12 小时
const BODY_LIMIT = 512 * 1024
const LOGIN_MAX_FAILS = 5
const LOGIN_LOCK_MS = 10 * 60 * 1000

/** HMAC 签名（截断 32 位 hex）：签名内容绑定过期时间，改一个字符都过不了校验 */
function sign(password, expiry) {
  return crypto
    .createHmac('sha256', password)
    .update(`xiaji-home-admin:${expiry}`)
    .digest('hex')
    .slice(0, 32)
}

function issueToken(password, ttl = TOKEN_TTL_MS) {
  const expiry = Date.now() + ttl
  return { token: `${expiry}.${sign(password, expiry)}`, expiresIn: ttl }
}

/** 常数时间比较，防时序侧信道 */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)
}

function verifyToken(password, token) {
  if (typeof token !== 'string') return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const expiry = Number(token.slice(0, dot))
  if (!Number.isFinite(expiry) || Date.now() > expiry) return false
  return safeEqual(sign(password, expiry), token.slice(dot + 1))
}

function bearerOf(req) {
  const header = req.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7) : null
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

/** 收 JSON 请求体，超过上限 / 解析失败都归一成 Error */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_LIMIT) {
        reject(new ContentError('请求体超过 512KB 上限'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve(null)
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new ContentError('请求体不是合法的 JSON'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * 生成 API 处理器。
 *   password  后台口令；生产（isProd=true）没配就直接拒绝写入并说明原因，
 *             开发环境缺省 'admin' 方便本地体验
 *   store     content.cjs 的内容仓库
 * 返回 (req, res) => boolean：true 表示这个请求归 API 管（已经应答完）。
 */
function createApiHandler({ store, password, isProd = false }) {
  const loginFails = new Map() // ip -> { count, until }

  const configured = () => Boolean(password)

  function loginAllowed(ip) {
    const rec = loginFails.get(ip)
    if (!rec) return true
    if (rec.count >= LOGIN_MAX_FAILS && Date.now() < rec.until) return false
    if (Date.now() >= rec.until) loginFails.delete(ip)
    return true
  }

  async function handle(req, res, pathname) {
    const method = req.method

    /* ---- 读内容：前台每次加载都要拉，公开 ---- */
    if (pathname === '/api/content' && (method === 'GET' || method === 'HEAD')) {
      try {
        const { updatedAt, content } = store.read()
        return sendJson(res, 200, { updatedAt, content })
      } catch (error) {
        console.error('[api] read content failed:', error.message)
        return sendJson(res, 500, { error: '内容文件读取失败，请检查服务器日志' })
      }
    }

    /* ---- 写内容：要 token ---- */
    if (pathname === '/api/content' && method === 'PUT') {
      if (!configured()) {
        return sendJson(res, 503, {
          error: isProd
            ? '服务器没有配置 ADMIN_PASSWORD，后台写入未开放。在 ecosystem.config.cjs 的 env 里加上后重启。'
            : '没有配置口令。',
        })
      }
      if (!verifyToken(password, bearerOf(req))) {
        return sendJson(res, 401, { error: '登录已过期，请重新登录' })
      }
      let body
      try {
        body = await readBody(req)
      } catch (error) {
        return sendJson(res, 400, { error: error.message })
      }
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return sendJson(res, 400, { error: '内容必须是一个 JSON 对象' })
      }
      try {
        const { updatedAt } = store.write(body)
        console.log(`[api] content updated at ${new Date(updatedAt).toISOString()}`)
        return sendJson(res, 200, { updatedAt })
      } catch (error) {
        if (error instanceof ContentError)
          return sendJson(res, 400, { error: error.message })
        console.error('[api] write content failed:', error)
        return sendJson(res, 500, { error: '写入失败，请查看服务器日志' })
      }
    }

    /* ---- 登录：口令换 token ---- */
    if (pathname === '/api/admin/login' && method === 'POST') {
      if (!configured()) {
        return sendJson(res, 503, {
          error: isProd
            ? '服务器没有配置 ADMIN_PASSWORD。请在 ecosystem.config.cjs 的 env 里设置后 pm2 restart，再来登录。'
            : '开发口令未配置（默认 admin）。',
        })
      }
      const ip = req.socket?.remoteAddress || 'unknown'
      if (!loginAllowed(ip)) {
        const rec = loginFails.get(ip)
        const wait = Math.ceil((rec.until - Date.now()) / 60000)
        return sendJson(res, 429, { error: `错误次数太多，${wait} 分钟后再试` })
      }
      let body
      try {
        body = await readBody(req)
      } catch (error) {
        return sendJson(res, 400, { error: error.message })
      }
      if (typeof body?.password !== 'string' || !safeEqual(body.password, password)) {
        const rec = loginFails.get(ip) || { count: 0, until: 0 }
        rec.count += 1
        if (rec.count >= LOGIN_MAX_FAILS) rec.until = Date.now() + LOGIN_LOCK_MS
        loginFails.set(ip, rec)
        return sendJson(res, 401, { error: '口令不对' })
      }
      loginFails.delete(ip)
      /* 勾了「保持登录」token 发 30 天，否则默认 12 小时 */
      const ttl = body.remember === true ? 30 * 24 * 60 * 60 * 1000 : TOKEN_TTL_MS
      const { token, expiresIn } = issueToken(password, ttl)
      return sendJson(res, 200, { token, expiresIn })
    }

    /* ---- 验 token：后台打开时先问一声，过期直接回登录页 ---- */
    if (pathname === '/api/admin/session' && method === 'GET') {
      if (!configured()) return sendJson(res, 503, { error: '未配置口令' })
      if (!verifyToken(password, bearerOf(req)))
        return sendJson(res, 401, { error: '未登录' })
      return sendJson(res, 200, { ok: true })
    }

    return sendJson(res, 404, { error: '没有这个接口' })
  }

  return async (req, res) => {
    let pathname
    try {
      pathname = new URL(req.url, 'http://127.0.0.1').pathname
    } catch {
      return false
    }
    if (!pathname.startsWith('/api/')) return false
    try {
      await handle(req, res, pathname)
    } catch (error) {
      console.error('[api] unexpected:', error)
      try {
        sendJson(res, 500, { error: '服务器开小差了' })
      } catch {
        /* 响应头已发出去就没办法了 */
      }
    }
    return true
  }
}

module.exports = { createApiHandler, issueToken, verifyToken }
