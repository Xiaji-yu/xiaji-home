/**
 * 后台 API 处理器 —— server/index.cjs（生产）和 vite dev/preview（开发）共用。
 *
 *   GET  /api/content          读线上内容（公开：前台渲染也要用）
 *   PUT  /api/content          写线上内容（要 token；全量覆盖，写前自动备份）
 *   POST /api/admin/login      口令换 token
 *   POST /api/admin/password   改口令（要 token + 当前口令），返回新 token
 *   GET  /api/admin/session    验 token 还有没有效（顺带告诉前台要不要强制改密）
 *
 * 口令与「首次登录强制修改」见 server/auth.cjs：
 *   · 没配环境变量、也没改过口令时，用仓库内置的默认口令
 *   · 用默认口令登录 → 只能改口令，PUT /api/content 会被 403 挡下
 *   · 改完口令落盘 content/admin-auth.json（scrypt 哈希），此后以文件为准
 *
 * token = 过期时间戳 + 签名，签名密钥由当前口令派生（见 auth.secret()）：
 * 无状态、服务重启不失效；一改口令，旧 token 立即全部作废。
 * 登录 / 改密失败限速：同一 IP 10 分钟内错 5 次锁 10 分钟。
 *
 * 依旧零依赖：http 之外只用 node:crypto。
 */
'use strict'

const crypto = require('node:crypto')
const path = require('node:path')
const { ContentError } = require('./content.cjs')
const { createAuthStore, PasswordPolicyError } = require('./auth.cjs')

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000 // 登录一次管 12 小时
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 「保持登录」管 30 天
const BODY_LIMIT = 512 * 1024
const LOGIN_MAX_FAILS = 5
const LOGIN_LOCK_MS = 10 * 60 * 1000

/** HMAC 签名（截断 32 位 hex）：签名内容绑定过期时间，改一个字符都过不了校验 */
function sign(secret, expiry) {
  return crypto
    .createHmac('sha256', secret)
    .update(`xiaji-home-admin:${expiry}`)
    .digest('hex')
    .slice(0, 32)
}

function issueToken(secret, ttl = TOKEN_TTL_MS) {
  const expiry = Date.now() + ttl
  return { token: `${expiry}.${sign(secret, expiry)}`, expiresIn: ttl }
}

/** 常数时间比较，防时序侧信道 */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)
}

function verifyToken(secret, token) {
  if (typeof token !== 'string') return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const expiry = Number(token.slice(0, dot))
  if (!Number.isFinite(expiry) || Date.now() > expiry) return false
  return safeEqual(sign(secret, expiry), token.slice(dot + 1))
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
 *   store     内容仓库（content.cjs），口令文件默认放在它旁边
 *   password  初始口令（ADMIN_PASSWORD）；不传就用仓库内置默认口令
 *   authFile  口令文件位置覆盖（测试用；默认 content/admin-auth.json）
 * 返回 (req, res) => boolean：true 表示这个请求归 API 管（已经应答完）。
 */
function createApiHandler({ store, password, authFile } = {}) {
  const auth = createAuthStore({
    file: authFile || path.join(path.dirname(store.file), 'admin-auth.json'),
    envPassword: password,
  })
  const loginFails = new Map() // ip -> { count, until }

  /* 启动时打一行「口令从哪来」——排查「为什么登不上」先看这一行。
     只报来源，不报口令值：日志会被 pm2 logs / 轮转文件带走，口令不该落进去。 */
  if (process.env.NODE_ENV !== 'test') {
    const source = auth.current().kind
    const label =
      source === 'default'
        ? '仓库默认口令（首次登录会强制修改）'
        : source === 'env'
          ? 'ADMIN_PASSWORD 环境变量'
          : 'content/admin-auth.json'
    console.log(`[auth] 口令来源：${label}`)
  }

  function loginAllowed(ip) {
    const rec = loginFails.get(ip)
    if (!rec) return true
    if (rec.count >= LOGIN_MAX_FAILS && Date.now() < rec.until) return false
    if (Date.now() >= rec.until) loginFails.delete(ip)
    return true
  }

  /** 记一次失败；返回锁定时长（分钟），没锁返回 0 */
  function noteFail(ip) {
    const rec = loginFails.get(ip) || { count: 0, until: 0 }
    rec.count += 1
    if (rec.count >= LOGIN_MAX_FAILS) rec.until = Date.now() + LOGIN_LOCK_MS
    loginFails.set(ip, rec)
    return rec.count >= LOGIN_MAX_FAILS ? Math.ceil(LOGIN_LOCK_MS / 60000) : 0
  }

  function lockedResponse(res) {
    return sendJson(res, 429, { error: '错误次数太多，10 分钟后再试' })
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

    /* ---- 写内容：要 token；还在用默认口令时一律拒绝 ---- */
    if (pathname === '/api/content' && method === 'PUT') {
      if (!verifyToken(auth.secret(), bearerOf(req))) {
        return sendJson(res, 401, { error: '登录已过期，请重新登录' })
      }
      if (auth.mustChange()) {
        return sendJson(res, 403, {
          error: '还在用默认口令，先设置新口令再保存内容',
          code: 'PASSWORD_CHANGE_REQUIRED',
        })
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
      const ip = req.socket?.remoteAddress || 'unknown'
      if (!loginAllowed(ip)) return lockedResponse(res)
      let body
      try {
        body = await readBody(req)
      } catch (error) {
        return sendJson(res, 400, { error: error.message })
      }
      if (typeof body?.password !== 'string' || !auth.verify(body.password)) {
        noteFail(ip)
        return sendJson(res, 401, { error: '口令不对' })
      }
      loginFails.delete(ip)
      /* 勾了「保持登录」token 发 30 天，否则默认 12 小时 */
      const ttl = body.remember === true ? REMEMBER_TTL_MS : TOKEN_TTL_MS
      const { token, expiresIn } = issueToken(auth.secret(), ttl)
      return sendJson(res, 200, {
        token,
        expiresIn,
        /* 还在用默认口令：前台据此渲染「先设置新口令」，改完之前不能保存内容 */
        mustChangePassword: auth.mustChange(),
      })
    }

    /* ---- 改口令：要已登录 + 当前口令；成功后旧 token 全部作废，返回新 token ---- */
    if (pathname === '/api/admin/password' && method === 'POST') {
      if (!verifyToken(auth.secret(), bearerOf(req))) {
        return sendJson(res, 401, { error: '登录已过期，请重新登录' })
      }
      const ip = req.socket?.remoteAddress || 'unknown'
      if (!loginAllowed(ip)) return lockedResponse(res)
      let body
      try {
        body = await readBody(req)
      } catch (error) {
        return sendJson(res, 400, { error: error.message })
      }
      if (typeof body?.currentPassword !== 'string' || !auth.verify(body.currentPassword)) {
        noteFail(ip)
        return sendJson(res, 401, { error: '当前口令不对', code: 'CURRENT_PASSWORD_WRONG' })
      }
      try {
        auth.setPassword(body.newPassword)
      } catch (error) {
        if (error instanceof PasswordPolicyError) {
          return sendJson(res, 400, { error: error.message })
        }
        throw error
      }
      loginFails.delete(ip)
      const { token, expiresIn } = issueToken(auth.secret())
      console.log('[api] admin password updated')
      return sendJson(res, 200, { token, expiresIn, mustChangePassword: false })
    }

    /* ---- 验 token：后台打开时先问一声，过期直接回登录页 ---- */
    if (pathname === '/api/admin/session' && method === 'GET') {
      if (!verifyToken(auth.secret(), bearerOf(req)))
        return sendJson(res, 401, { error: '未登录' })
      return sendJson(res, 200, { ok: true, mustChangePassword: auth.mustChange() })
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
