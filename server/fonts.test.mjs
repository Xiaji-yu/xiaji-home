/* 字体库（上传 / 清单 / 静态服务 / 删除）的测试：
   fontStore 单元测试 + API 集成测试（真实 http server + 登录拿 token）。
   全部跑在临时目录里，不碰真实的 content/。运行：npm test */
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import contentModule from './content.cjs'
import apiModule from './api.cjs'

const { createContentStore, createFontStore, ContentError, FONT_EXTS } = contentModule
const { createApiHandler } = apiModule

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaji-fonts-'))
const PASSWORD = 'test-font-pass-123'

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

/* ---- fontStore 单元测试 ---- */
describe('font store', () => {
  it('空库读出空清单', () => {
    const fonts = createFontStore({ dir: path.join(tmpRoot, 'store-empty') })
    expect(fonts.list()).toEqual([])
  })

  it('保存后清单有完整条目，文件落盘在目录里', () => {
    const fonts = createFontStore({ dir: path.join(tmpRoot, 'store-save') })
    const body = Buffer.from('fake font bytes')
    const entry = fonts.save(body, '我的字体.TTF')
    expect(entry.ext).toBe('ttf')
    expect(entry.name).toBe('我的字体')
    expect(entry.size).toBe(body.length)
    expect(typeof entry.id).toBe('string')
    expect(entry.file.endsWith('.ttf')).toBe(true)
    expect(fs.existsSync(path.join(fonts.dir, entry.file))).toBe(true)
    expect(fonts.list()).toHaveLength(1)
    expect(fonts.list()[0].id).toBe(entry.id)
  })

  it('只认白名单扩展名，其它一律拒绝', () => {
    const fonts = createFontStore({ dir: path.join(tmpRoot, 'store-ext') })
    expect(() => fonts.save(Buffer.from('x'), 'evil.exe')).toThrow(ContentError)
    expect(() => fonts.save(Buffer.from('x'), 'noext')).toThrow(ContentError)
    expect(() => fonts.save(Buffer.from('x'), '')).toThrow(ContentError)
    expect(FONT_EXTS).toEqual(['.ttf', '.otf', '.woff', '.woff2'])
  })

  it('空文件 / 空字节拒绝', () => {
    const fonts = createFontStore({ dir: path.join(tmpRoot, 'store-empty-file') })
    expect(() => fonts.save(Buffer.alloc(0), 'a.ttf')).toThrow(ContentError)
    expect(() => fonts.save('not-a-buffer', 'a.ttf')).toThrow(ContentError)
  })

  it('超大小上限拒绝', () => {
    const fonts = createFontStore({ dir: path.join(tmpRoot, 'store-big') })
    const big = Buffer.alloc(25 * 1024 * 1024 + 1)
    expect(() => fonts.save(big, 'huge.ttf')).toThrow(ContentError)
  })

  it('pathOf 只信清单同款文件名：穿越 / 随便写的名字返回 null', () => {
    const fonts = createFontStore({ dir: path.join(tmpRoot, 'store-path') })
    const entry = fonts.save(Buffer.from('x'), 'ok.woff2')
    expect(fonts.pathOf(entry.file)).toBe(path.join(fonts.dir, entry.file))
    expect(fonts.pathOf('../site.json')).toBeNull()
    expect(fonts.pathOf('nope.ttf')).toBeNull()
    expect(fonts.pathOf(undefined)).toBeNull()
  })

  it('删除摘清单条目也删文件；不存在的 id 返回 false', () => {
    const fonts = createFontStore({ dir: path.join(tmpRoot, 'store-rm') })
    const a = fonts.save(Buffer.from('a'), 'a.ttf')
    const b = fonts.save(Buffer.from('b'), 'b.woff')
    expect(fonts.remove(a.id)).toBe(true)
    expect(fs.existsSync(path.join(fonts.dir, a.file))).toBe(false)
    expect(fonts.list().map((f) => f.id)).toEqual([b.id])
    expect(fonts.remove(a.id)).toBe(false)
  })

  it('坏清单文件自愈成空库（不挡站）', () => {
    const dir = path.join(tmpRoot, 'store-broken-list')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'fonts.json'), '{oops', 'utf8')
    expect(createFontStore({ dir }).list()).toEqual([])
  })
})

/* ---- API 集成测试：真实 http server ---- */
function makeRoot(name) {
  const root = path.join(tmpRoot, name)
  const store = createContentStore({ file: path.join(root, 'site.json') })
  const handler = createApiHandler({
    store,
    password: PASSWORD, // env 口令：不触发「强制改密」
    authFile: path.join(root, 'admin-auth.json'),
    fontDir: path.join(root, 'fonts'),
  })
  const server = http.createServer((req, res) => {
    if (!handler(req, res)) {
      res.writeHead(404)
      res.end()
    }
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`
      resolve({ base, close: () => new Promise((r) => server.close(r)) })
    })
  })
}

async function login(base) {
  const res = await fetch(`${base}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })
  const data = await res.json()
  expect(res.ok).toBe(true)
  return data.token
}

describe('font api', () => {
  it('上传 → 清单 → 取文件 → 删除，整条链路走通', async () => {
    const { base, close } = await makeRoot('api-roundtrip')
    try {
      const token = await login(base)

      /* 未登录上传被拒 */
      const anon = await fetch(`${base}/api/fonts?name=a.ttf`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: 'abc',
      })
      expect(anon.status).toBe(401)

      /* 坏扩展名被拒（已登录） */
      const badExt = await fetch(`${base}/api/fonts?name=evil.exe`, {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          authorization: `Bearer ${token}`,
        },
        body: 'abc',
      })
      expect(badExt.status).toBe(400)

      /* 正常上传 */
      const up = await fetch(
        `${base}/api/fonts?name=${encodeURIComponent('Demo字体.woff2')}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/octet-stream',
            authorization: `Bearer ${token}`,
          },
          body: 'woff2-bytes-here',
        },
      )
      expect(up.status).toBe(200)
      const { font } = await up.json()
      expect(font.name).toBe('Demo字体')
      expect(font.ext).toBe('woff2')

      /* 清单公开可读 */
      const list = await fetch(`${base}/api/fonts`)
      expect(list.status).toBe(200)
      const { fonts } = await list.json()
      expect(fonts).toHaveLength(1)
      expect(fonts[0].id).toBe(font.id)

      /* 文件本体公开可读，字体 MIME + immutable 缓存 */
      const fileRes = await fetch(`${base}/api/fonts/file/${font.file}`)
      expect(fileRes.status).toBe(200)
      expect(fileRes.headers.get('content-type')).toBe('font/woff2')
      expect(fileRes.headers.get('cache-control')).toContain('immutable')
      expect(await fileRes.text()).toBe('woff2-bytes-here')

      /* 不存在的文件 404（文件名格式合法但没存过），非法文件名 400 */
      expect((await fetch(`${base}/api/fonts/file/abcdefabcdef.woff2`)).status).toBe(404)
      expect((await fetch(`${base}/api/fonts/file/..%2Fsite.json`)).status).toBe(400)

      /* 删除：未登录 401，登录后 200，再删 404 */
      expect(
        (await fetch(`${base}/api/fonts/${font.id}`, { method: 'DELETE' })).status,
      ).toBe(401)
      expect(
        (
          await fetch(`${base}/api/fonts/${font.id}`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${token}` },
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await fetch(`${base}/api/fonts/${font.id}`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${token}` },
          })
        ).status,
      ).toBe(404)

      /* 删完文件也没了 */
      expect((await fetch(`${base}/api/fonts/file/${font.file}`)).status).toBe(404)
    } finally {
      await close()
    }
  })

  it('超上限的字体被 400 挡下', async () => {
    const { base, close } = await makeRoot('api-toolarge')
    try {
      const token = await login(base)
      const big = Buffer.alloc(25 * 1024 * 1024 + 1)
      const res = await fetch(`${base}/api/fonts?name=big.ttf`, {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          authorization: `Bearer ${token}`,
        },
        body: big,
      })
      expect(res.status).toBe(400)
    } finally {
      await close()
    }
  })
})
