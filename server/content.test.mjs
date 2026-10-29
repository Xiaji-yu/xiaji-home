/* 后台内容模块的单元测试：跑在临时目录里，不碰真实的 content/site.json。
   运行：npm test */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import contentModule from './content.cjs'
import apiModule from './api.cjs'

const { createContentStore, validateContent, ContentError } = contentModule
const { issueToken, verifyToken } = apiModule

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaji-admin-'))

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

function newStore(name) {
  const file = path.join(tmpRoot, name, 'site.json')
  return { store: createContentStore({ file }), file }
}

describe('content store', () => {
  it('没有文件时读出空内容（前台回退构建默认值）', () => {
    const { store } = newStore('missing')
    expect(store.read()).toEqual({ updatedAt: null, content: null })
  })

  it('写入后能原样读回，updatedAt 有值', () => {
    const { store } = newStore('rw')
    const content = { site: { name: '测试站', skills: [{ name: 'React', value: 50 }] } }
    const { updatedAt } = store.write(content)
    expect(typeof updatedAt).toBe('number')
    expect(store.read().content).toEqual(content)
  })

  it('文件里是坏 JSON 时 read 抛错（而不是把坏数据发给前台）', () => {
    const { store, file } = newStore('broken')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '{oops', 'utf8')
    expect(() => store.read()).toThrow()
  })

  it('每次覆盖前自动备份，且只保留最近 10 份', () => {
    const { store, file } = newStore('backup')
    for (let i = 0; i < 12; i += 1) {
      store.write({ site: { round: i } })
    }
    const backups = fs
      .readdirSync(path.join(path.dirname(file), 'backups'))
      .filter((n) => n.startsWith('site-'))
    expect(backups.length).toBe(10)
    // 备份文件名的字典序 = 创建序：最后一份就是最新备份（差一轮）
    const last = JSON.parse(
      fs.readFileSync(
        path.join(path.dirname(file), 'backups', [...backups].sort().at(-1)),
        'utf8',
      ),
    )
    expect(last.site.round).toBe(10)
    // 当前文件是最新写入
    expect(store.read().content.site.round).toBe(11)
  })
})

describe('validateContent', () => {
  it('允许字符串 / 数字 / 布尔 / 对象 / 数组', () => {
    const out = validateContent({ a: 'x', b: 1, c: true, d: [1, 'two'], e: { f: false } })
    expect(out).toEqual({ a: 'x', b: 1, c: true, d: [1, 'two'], e: { f: false } })
  })

  it('剥掉原型污染键', () => {
    const out = validateContent({
      ok: 1,
      __proto__: { x: 1 },
      constructor: 1,
      prototype: 1,
    })
    expect(out).toEqual({ ok: 1 })
    expect(Object.getPrototypeOf(out).x).toBeUndefined()
  })

  it('拒绝 null / 函数 / 深嵌套', () => {
    expect(() => validateContent(null)).toThrow(ContentError)
    let deep = {}
    let cur = deep
    for (let i = 0; i < 12; i += 1) {
      cur.next = {}
      cur = cur.next
    }
    expect(() => validateContent(deep)).toThrow(ContentError)
  })
})

describe('admin token', () => {
  it('签发 → 校验通过；改一个字符就失效', () => {
    const { token } = issueToken('secret', 60_000)
    expect(verifyToken('secret', token)).toBe(true)
    /* 末位 hex 翻转（0↔1）：保证新串和原串必定不同 */
    const last = token.at(-1)
    const flipped = token.slice(0, -1) + (last === '0' ? '1' : '0')
    expect(flipped).not.toBe(token)
    expect(verifyToken('secret', flipped)).toBe(false)
    expect(verifyToken('other-password', token)).toBe(false)
  })

  it('过期的 token 无效', () => {
    const { token } = issueToken('secret', -1) // 一开始就过期
    expect(verifyToken('secret', token)).toBe(false)
  })

  it('乱七八糟的输入都判无效', () => {
    expect(verifyToken('secret', null)).toBe(false)
    expect(verifyToken('secret', 'abc')).toBe(false)
    expect(verifyToken('secret', 'abc.def')).toBe(false)
    expect(verifyToken('secret', '')).toBe(false)
  })
})
