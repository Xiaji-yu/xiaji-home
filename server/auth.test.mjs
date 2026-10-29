/* 后台口令（默认口令 / 首次登录强制修改 / 改密落盘）的单元测试 + API 流程测试。
   全部跑在临时目录里，不碰真实的 content/。运行：npm test */
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, afterAll, vi } from 'vitest'
import authModule from './auth.cjs'
import apiModule from './api.cjs'
import contentModule from './content.cjs'

const { createAuthStore, PasswordPolicyError, DEFAULT_PASSWORD } = authModule
const { createApiHandler } = apiModule
const { createContentStore } = contentModule

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaji-auth-'))

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

let seq = 0
function tmpFile(name) {
  seq += 1
  return path.join(tmpRoot, `${seq}-${name}`)
}

describe('auth store', () => {
  it('没有文件也没有环境变量时使用默认口令，且要求强制修改', () => {
    const auth = createAuthStore({ file: tmpFile('auth.json'), envPassword: '' })
    expect(auth.mustChange()).toBe(true)
    expect(auth.verify(DEFAULT_PASSWORD)).toBe(true)
    expect(auth.verify('随便什么')).toBe(false)
  })

  it('配了 ADMIN_PASSWORD 就以它为准，不再要求强制修改', () => {
    const auth = createAuthStore({
      file: tmpFile('auth.json'),
      envPassword: 'env-secret-123',
    })
    expect(auth.mustChange()).toBe(false)
    expect(auth.verify('env-secret-123')).toBe(true)
    expect(auth.verify(DEFAULT_PASSWORD)).toBe(false)
  })

  it('改口令后落盘：新口令生效、旧口令失效、token 签名密钥随之变化', () => {
    const file = tmpFile('auth.json')
    const auth = createAuthStore({ file })
    const before = auth.secret()
    auth.setPassword('new-password-123')
    const after = auth.secret()

    expect(after).not.toBe(before)
    expect(auth.mustChange()).toBe(false)
    expect(auth.verify('new-password-123')).toBe(true)
    expect(auth.verify(DEFAULT_PASSWORD)).toBe(false)

    /* 文件权限 0600：口令哈希不给同机其他用户读 */
    if (process.platform !== 'win32') {
      expect(fs.statSync(file).mode & 0o777).toBe(0o600)
    }
    /* 落盘的是哈希不是明文 */
    expect(fs.readFileSync(file, 'utf8')).not.toContain('new-password-123')
  })

  it('改口令有策略：太短 / 等于默认口令 / 等于当前口令都会被拒', () => {
    const auth = createAuthStore({ file: tmpFile('auth.json'), envPassword: '' })
    expect(() => auth.setPassword('short')).toThrow(PasswordPolicyError)
    expect(() => auth.setPassword(DEFAULT_PASSWORD)).toThrow(PasswordPolicyError)
    auth.setPassword('first-password-1')
    expect(() => auth.setPassword('first-password-1')).toThrow(PasswordPolicyError)
  })

  it('口令文件损坏时回退默认口令（不把站主锁在门外）', () => {
    const file = tmpFile('auth.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '{ broken json', 'utf8')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const auth = createAuthStore({ file, envPassword: '' })
    expect(auth.mustChange()).toBe(true)
    expect(auth.verify(DEFAULT_PASSWORD)).toBe(true)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

/** 起一个真实的 http 服务跑 API 流程（fetch 走真请求，不做 mock） */
async function startApi(options = {}) {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'api-'))
  const store = createContentStore({ file: path.join(dir, 'site.json') })
  const authFile = path.join(dir, 'admin-auth.json')
  const handler = createApiHandler({ store, authFile, password: options.password })
  const server = http.createServer((req, res) => handler(req, res))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()

  const base = `http://127.0.0.1:${port}`
  const call = async (method, url, { token, body } = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, data: await res.json().catch(() => ({})) }
  }

  return {
    dir,
    authFile,
    call,
    login: (password) => call('POST', '/api/admin/login', { body: { password } }),
    save: (token, content) => call('PUT', '/api/content', { token, body: content }),
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

describe('admin api：默认口令 + 首次登录强制修改', () => {
  it('默认口令能登录，但返回 mustChangePassword；没改密前保存内容被 403 挡下', async () => {
    const api = await startApi()
    try {
      const login = await api.login(DEFAULT_PASSWORD)
      expect(login.status).toBe(200)
      expect(login.data.mustChangePassword).toBe(true)

      const session = await api.call('GET', '/api/admin/session', {
        token: login.data.token,
      })
      expect(session.status).toBe(200)
      expect(session.data.mustChangePassword).toBe(true)

      const save = await api.save(login.data.token, { site: { name: 'x' } })
      expect(save.status).toBe(403)
      expect(save.data.code).toBe('PASSWORD_CHANGE_REQUIRED')
    } finally {
      await api.close()
    }
  })

  it('改密成功后旧 token 立即失效，新 token 可以保存内容', async () => {
    const api = await startApi()
    try {
      const login = await api.login(DEFAULT_PASSWORD)

      const change = await api.call('POST', '/api/admin/password', {
        token: login.data.token,
        body: { currentPassword: DEFAULT_PASSWORD, newPassword: 'my-own-password-9' },
      })
      expect(change.status).toBe(200)
      expect(change.data.mustChangePassword).toBe(false)
      expect(change.data.token).toBeTruthy()

      /* 旧 token 的签名密钥已变：401 */
      const oldSession = await api.call('GET', '/api/admin/session', {
        token: login.data.token,
      })
      expect(oldSession.status).toBe(401)

      /* 新 token 能写内容 */
      const save = await api.save(change.data.token, { site: { name: '新内容' } })
      expect(save.status).toBe(200)

      /* 再登录：不再要求强制修改 */
      const relogin = await api.login('my-own-password-9')
      expect(relogin.status).toBe(200)
      expect(relogin.data.mustChangePassword).toBe(false)

      /* 默认口令已经不能用了 */
      const oldDefault = await api.login(DEFAULT_PASSWORD)
      expect(oldDefault.status).toBe(401)
    } finally {
      await api.close()
    }
  })

  it('改密时当前口令不对 / 新口令太短都给明确错误', async () => {
    const api = await startApi()
    try {
      const login = await api.login(DEFAULT_PASSWORD)

      const wrong = await api.call('POST', '/api/admin/password', {
        token: login.data.token,
        body: { currentPassword: '不是这个', newPassword: 'my-own-password-9' },
      })
      expect(wrong.status).toBe(401)
      expect(wrong.data.code).toBe('CURRENT_PASSWORD_WRONG')

      const short = await api.call('POST', '/api/admin/password', {
        token: login.data.token,
        body: { currentPassword: DEFAULT_PASSWORD, newPassword: 'short' },
      })
      expect(short.status).toBe(400)
      expect(short.data.error).toContain('10')
    } finally {
      await api.close()
    }
  })

  it('改过的口令持久化在文件里：换一个进程（重新建 handler）照样生效', async () => {
    const api = await startApi()
    try {
      const login = await api.login(DEFAULT_PASSWORD)
      await api.call('POST', '/api/admin/password', {
        token: login.data.token,
        body: { currentPassword: DEFAULT_PASSWORD, newPassword: 'persisted-pass-1' },
      })

      /* 模拟服务重启：同一个 authFile，新 handler，且这次带了不同的环境变量口令 */
      const handler = createApiHandler({
        store: createContentStore({ file: path.join(api.dir, 'site.json') }),
        authFile: api.authFile,
        password: 'env-password-xyz',
      })
      const server = http.createServer((req, res) => handler(req, res))
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
      const { port } = server.address()
      const post = async (body) => {
        const res = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        return { status: res.status, data: await res.json().catch(() => ({})) }
      }
      try {
        /* 文件口令优先于环境变量 */
        expect((await post({ password: 'persisted-pass-1' })).status).toBe(200)
        expect((await post({ password: 'env-password-xyz' })).status).toBe(401)
        expect((await post({ password: DEFAULT_PASSWORD })).status).toBe(401)
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    } finally {
      await api.close()
    }
  })
})
