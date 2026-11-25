#!/usr/bin/env node
/* ==========================================================================
   字体子集化：font/ 里的 TTF/OTF → 同名 .woff2（放在原文件旁边）
   --------------------------------------------------------------------------
     npm run font:optimize              常用字子集（默认，推荐）
     npm run font:optimize -- --site    只留本站实际用到的字（最小）
     npm run font:optimize -- --all     不裁字形，只转 woff2（最安全）
     npm run font:optimize -- --force   源文件没变也重新生成

   为什么：3.2MB 的全量中文 TTF 首次访问要下好几秒。裁到「GB2312 一级
   常用字 + 拉丁 + 标点 + 本站文字」大约 750KB；只留本站文字约 90KB。

   生成的 .woff2 请一起提交（GitHub Pages 这类纯静态构建不需要装工具链）。
   fonts.js 遇到同 id 的 ttf / woff2 时自动选 woff2，构建时原始 ttf
   不会被打进 dist（见 scripts/font-html-plugin.mjs）。

   ⚠ 子集化属于「修改字体」。字体许可证（font/ 各字体自带的 LICENSE）
     若不允许修改 / 再分发衍生版本，请用 --all 只转格式，或保留原始 TTF。
   ========================================================================== */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import subsetFont from 'subset-font'

const ROOT = process.cwd()
const FONT_DIR = join(ROOT, 'font')
const COMMON_FILE = join(ROOT, 'scripts', 'common-hanzi.txt')

/* 所有模式都保留的基础字符：英文、数字、常见标点和全角 */
const BASE_RANGES = [
  [0x0020, 0x007e], // ASCII
  [0x00a0, 0x00ff], // Latin-1
  [0x2000, 0x206f], // — … “ ” ‘ ’ •
  [0x2190, 0x21ff], // → ← ↑ ↓
  [0x2460, 0x24ff], // ① ② ③
  [0x25a0, 0x25ff], // ■ □ ● ○
  [0x3000, 0x303f], // 中文标点《》「」【】
  [0xff00, 0xffef], // 全角 Ａ １ ？
]

const TEXT_EXT_RE = /\.(js|jsx|json|css|html)$/i
const SOURCE_EXT_RE = /\.(ttf|otf)$/i

const args = new Set(process.argv.slice(2))
const MODE = args.has('--site') ? 'site' : args.has('--all') ? 'all' : 'common'
const FORCE = args.has('--force')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const abs = join(dir, name)
    const stat = statSync(abs)
    if (stat.isDirectory()) walk(abs, out)
    else out.push({ abs, stat })
  }
  return out
}

function baseCharset() {
  let text = ''
  for (const [from, to] of BASE_RANGES) {
    for (let cp = from; cp <= to; cp += 1) text += String.fromCodePoint(cp)
  }
  return text
}

/** 本站实际会渲染的文字：src/ 源码 + content/site.json + index.html */
function siteCharset() {
  const files = [
    ...walk(join(ROOT, 'src')),
    ...walk(join(ROOT, 'content')),
    { abs: join(ROOT, 'index.html'), stat: null },
  ]
  return files
    .filter(({ abs }) => TEXT_EXT_RE.test(abs))
    .map(({ abs }) => readFileSync(abs, 'utf8'))
    .join('')
}

function charsetFor() {
  const site = [...new Set(siteCharset())].filter((ch) => ch.codePointAt(0) > 0x7e).join('')
  if (MODE === 'site') return baseCharset() + site
  const common = readFileSync(COMMON_FILE, 'utf8').replace(/\s+/g, '')
  return baseCharset() + common + site
}

async function main() {
  let sources = []
  try {
    sources = walk(FONT_DIR).filter(({ abs }) => SOURCE_EXT_RE.test(abs))
  } catch (error) {
    console.error(`读不到 font/ 目录：${error.message}`)
    process.exitCode = 1
    return
  }
  if (!sources.length) {
    console.log('font/ 里没有 .ttf / .otf，没什么要做的')
    return
  }

  const text = MODE === 'all' ? undefined : charsetFor()
  let failed = 0

  for (const { abs, stat } of sources) {
    const out = abs.replace(SOURCE_EXT_RE, '.woff2')
    const outStat = FORCE ? null : statSync(out, { throwIfNoEntry: false })
    if (outStat && outStat.mtimeMs >= stat.mtimeMs) {
      console.log(`跳过 ${basename(abs)}（${basename(out)} 已是最新，--force 可重做）`)
      continue
    }

    const started = Date.now()
    try {
      const buffer = await subsetFont(readFileSync(abs), text, {
        targetFormat: 'woff2',
        noHinting: true,
        ...(MODE === 'all' ? { keepAllGlyphs: true } : {}),
      })
      writeFileSync(out, buffer)
      const ratio = Math.round((1 - buffer.length / stat.size) * 100)
      console.log(
        `${basename(abs)}  ${(stat.size / 1048576).toFixed(2)}MB → ` +
          `${(buffer.length / 1024).toFixed(0)}KB（-${ratio}%，${Date.now() - started}ms）`,
      )
    } catch (error) {
      failed += 1
      console.error(`✗ ${basename(abs)}：${error.message}`)
    }
  }

  if (failed) process.exitCode = 1
  else console.log('\n完成。woff2 记得一起提交；npm run build 会把 ttf 从产物里剔掉。')
}

await main()
