/**
 * 后台口令的存储与校验 —— 零依赖（node:crypto + node:fs）。
 *
 * 口令来源按优先级：
 *   1. content/admin-auth.json —— 后台里改过的口令（scrypt 加盐哈希，权限 0600）
 *   2. ADMIN_PASSWORD 环境变量 —— 部署时注入的初始口令（老部署的兼容路径）
 *   3. DEFAULT_PASSWORD 常量 —— 仓库内置的默认口令，**第一次登录后强制改掉**
 *
 * 「强制修改」的判定很直白：只有当正在用的是第 3 档（默认口令）时才为 true。
 * 改完口令会写入第 1 档文件，此后环境变量不再参与校验；
 * 想回到环境变量 / 默认口令，删掉 content/admin-auth.json 即可（见 docs/ADMIN.md）。
 *
 * token 的 HMAC 密钥由当前口令的哈希派生（见 secret()）：
 * 服务重启不影响已签发的 token，一改口令所有旧 token 立即作废。
 */
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

/** 仓库内置的默认口令：开箱即用，但第一次登录必须改掉 */
const DEFAULT_PASSWORD = 'xiaji-admin'
/** 新口令的最短长度：默认口令也是 10 位，太短的口令不如不加 */
const MIN_LENGTH = 10
const KEYLEN = 32
const DEFAULT_FILE = path.resolve(__dirname, '..', 'content', 'admin-auth.json')

/** 改密失败（长度不够 / 和当前口令相同等），消息直接给前台展示 */
class PasswordPolicyError extends Error {}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, KEYLEN)
}

/** 常数时间比较，防时序侧信道 */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)
}

/** 口令文件记录的形状校验：形状不对就当作没有，回退到默认口令（并打日志） */
function isRecord(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.v === 1 &&
    typeof value.salt === 'string' &&
    /^[0-9a-f]{32}$/.test(value.salt) &&
    typeof value.hash === 'string' &&
    /^[0-9a-f]{64}$/.test(value.hash)
  )
}

/**
 * 创建口令仓库。
 *   options.file        口令文件位置（默认 content/admin-auth.json，测试用临时文件）
 *   options.envPassword 初始口令（默认读 ADMIN_PASSWORD；空串表示没配）
 */
function createAuthStore(options = {}) {
  const file = path.resolve(options.file || process.env.ADMIN_AUTH_FILE || DEFAULT_FILE)
  const envPassword = options.envPassword ?? process.env.ADMIN_PASSWORD ?? ''

  function readRecord() {
    let raw
    try {
      raw = fs.readFileSync(file, 'utf8')
    } catch {
      return null
    }
    try {
      const record = JSON.parse(raw)
      if (!isRecord(record)) throw new Error('字段缺失或格式不对')
      return record
    } catch (error) {
      /* 文件坏了不该把站主锁在门外：回退默认口令，登录后可以立刻改回来 */
      console.error(`[auth] ${file} 解析失败，回退到默认口令：${error.message}`)
      return null
    }
  }

  /** 当前生效的口令来源：file / env / default */
  function current() {
    const record = readRecord()
    if (record) return { kind: 'file', record }
    if (envPassword) return { kind: 'env', password: envPassword }
    return { kind: 'default', password: DEFAULT_PASSWORD }
  }

  /** 是否还在用仓库内置的默认口令（= 还没有人改过） */
  function mustChange() {
    return current().kind === 'default'
  }

  /**
   * token 的签名密钥：从当前口令派生，不保存明文。
   * 口令一换密钥就变，已签发的 token 全部失效。
   */
  function secret() {
    const state = current()
    if (state.kind === 'file') return `file:${state.record.salt}:${state.record.hash}`
    return crypto
      .createHash('sha256')
      .update(`${state.kind}:${state.password}`)
      .digest('hex')
  }

  /** 校验口令（常数时间比较；文件口令走 scrypt） */
  function verify(plain) {
    if (typeof plain !== 'string' || plain.length === 0) return false
    const state = current()
    if (state.kind !== 'file') return safeEqual(state.password, plain)
    const salt = Buffer.from(state.record.salt, 'hex')
    const expected = Buffer.from(state.record.hash, 'hex')
    const actual = hashPassword(plain, salt)
    return safeEqual(expected, actual)
  }

  function writeRecord(record) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
    /* 0600：口令哈希也不该让同机器其他用户读到 */
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 })
    fs.renameSync(tmp, file) // 同目录 rename，原子生效
  }

  /**
   * 设置新口令：先过策略再落盘。
   * 抛 PasswordPolicyError 表示口令不合格（前台直接展示消息）。
   */
  function setPassword(plain) {
    if (typeof plain !== 'string' || plain.trim().length === 0) {
      throw new PasswordPolicyError('新口令不能为空')
    }
    if (plain.length < MIN_LENGTH) {
      throw new PasswordPolicyError(`新口令至少 ${MIN_LENGTH} 个字符`)
    }
    if (plain === DEFAULT_PASSWORD) {
      throw new PasswordPolicyError('不能继续使用默认口令，换一个只有你知道的')
    }
    if (verify(plain)) {
      throw new PasswordPolicyError('新口令不能和当前口令相同')
    }
    const salt = crypto.randomBytes(16)
    const record = {
      v: 1,
      salt: salt.toString('hex'),
      hash: hashPassword(plain, salt).toString('hex'),
      updatedAt: new Date().toISOString(),
    }
    writeRecord(record)
    return record
  }

  /** 删掉口令文件：回退到环境变量 / 默认口令（站主忘了口令时的救援手段） */
  function clear() {
    try {
      fs.unlinkSync(file)
      return true
    } catch {
      return false
    }
  }

  return { file, current, mustChange, secret, verify, setPassword, clear }
}

module.exports = {
  createAuthStore,
  PasswordPolicyError,
  DEFAULT_PASSWORD,
  MIN_LENGTH,
}
