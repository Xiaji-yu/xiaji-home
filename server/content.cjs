/**
 * 线上内容的存取模块 —— 后台编辑的数据落在这里（零依赖，server/index.cjs 和
 * vite dev server 共用）。
 *
 * 内容文件（默认 content/site.json，可用 CONTENT_FILE 覆盖）是「全量快照」：
 * 前台拿到后与构建时打包的 site.js 深合并，缺的字段自动回退默认值，
 * 所以旧版本的内容文件配新版本的代码也不会渲染崩。
 *
 * 写入策略：
 *   · 先写同目录临时文件再 rename —— 断电 / 磁盘满都不会留下半个 JSON
 *   · 每次覆盖前把旧文件挪进 content/backups/（保留最近 10 份），
 *     后台导出失败、导入了坏数据，都能在服务器上找回
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_FILE = path.resolve(__dirname, '..', 'content', 'site.json')
const MAX_BACKUPS = 10
/* 内容上限：全站文案撑死几十 KB，512KB 足够宽裕又能挡住误传整个 dist */
const MAX_BYTES = 512 * 1024

/** 创建一个内容仓库。options.file 覆盖存储位置（测试用）。 */
function createContentStore(options = {}) {
  const file = path.resolve(options.file || process.env.CONTENT_FILE || DEFAULT_FILE)
  const dir = path.dirname(file)
  const backupDir = path.join(dir, 'backups')

  /* 读缓存：文件没变（mtime + size 一致）就直接用上次的解析结果，
     每个静态请求都要查一次内容（index.html 的 meta 替换），不能真读盘 */
  let cached = null
  /* 备份序号：保证备份文件名的字典序 = 创建序，轮转删最老的才删得准 */
  let backupSeq = 0

  function stat() {
    try {
      return fs.statSync(file)
    } catch {
      return null
    }
  }

  /**
   * 读当前内容。返回 { updatedAt, content }：
   *   · 文件不存在 → { updatedAt: null, content: null }（前台回退构建默认值）
   *   · 文件损坏   → 抛错由调用方处理（API 返回 500，静态页跳过 meta 替换）
   */
  function read() {
    const st = stat()
    if (!st) {
      cached = null
      return { updatedAt: null, content: null }
    }
    if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
      return { updatedAt: cached.updatedAt, content: cached.content }
    }
    const content = JSON.parse(fs.readFileSync(file, 'utf8'))
    const checked = validateContent(content) // 双保险：坏文件宁可报错也不上屏
    cached = { mtimeMs: st.mtimeMs, size: st.size, updatedAt: st.mtimeMs, content: checked }
    return { updatedAt: cached.updatedAt, content: checked }
  }

  /** 当前 mtime（给静态服务器判断 index.html 的 meta 要不要重算） */
  function version() {
    const st = stat()
    return st ? `${st.mtimeMs}:${st.size}` : 'none'
  }

  function backup() {
    if (!stat()) return
    fs.mkdirSync(backupDir, { recursive: true })
    /* 时间戳（毫秒）+ 单调序号：名字永不碰撞，且字典序就是创建序 */
    backupSeq += 1
    const name = `site-${Date.now()}-${String(backupSeq).padStart(6, '0')}.json`
    fs.copyFileSync(file, path.join(backupDir, name))
    const olds = fs
      .readdirSync(backupDir)
      .filter((n) => n.startsWith('site-') && n.endsWith('.json'))
      .sort()
    while (olds.length > MAX_BACKUPS) fs.unlinkSync(path.join(backupDir, olds.shift()))
  }

  /**
   * 写入新内容（全量覆盖）。value 必须先过 validateContent。
   * 返回 { updatedAt }。
   */
  function write(value) {
    const checked = validateContent(value)
    const json = JSON.stringify(checked, null, 2) + '\n'
    if (Buffer.byteLength(json, 'utf8') > MAX_BYTES) {
      throw new ContentError('内容超过 512KB 上限，是不是贴错了东西？')
    }
    fs.mkdirSync(dir, { recursive: true })
    backup()
    const tmp = path.join(dir, `.site-${process.pid}-${Date.now()}.tmp`)
    fs.writeFileSync(tmp, json, 'utf8')
    fs.renameSync(tmp, file) // 同目录 rename，原子生效
    cached = null
    const st = stat()
    return { updatedAt: st ? st.mtimeMs : Date.now() }
  }

  return { read, write, version, file }
}

class ContentError extends Error {}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * 结构校验：递归只允许 string / number / boolean / 纯对象 / 数组。
 * 这个站没有任何 dangerouslySetInnerHTML，React 渲染会全部转义，
 * 这里挡的是「导入了奇怪结构的 JSON 把前台组件搞崩」——
 * 字段级的结构（比如 about 必须是对象）由后台编辑器保证：
 * 编辑器只能产出合法形状，导入也走同一个表单。
 */
function validateContent(value, depth = 0) {
  if (depth > 8) throw new ContentError('内容嵌套太深（超过 8 层）')
  if (value === null || value === undefined) throw new ContentError('内容不能是空值')
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return value
  if (Array.isArray(value)) return value.map((item) => validateContent(item, depth + 1))
  if (isPlainObject(value)) {
    const out = {}
    for (const key of Object.keys(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      out[key] = validateContent(value[key], depth + 1)
    }
    return out
  }
  throw new ContentError(`不支持的字段类型：${t}（只允许文本、数字、开关、对象和数组）`)
}

module.exports = { createContentStore, validateContent, ContentError, MAX_BYTES }
