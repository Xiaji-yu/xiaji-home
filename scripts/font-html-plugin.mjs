/* ==========================================================================
   首屏字体：把「后台选中的字体」写进 index.html（构建期）
   --------------------------------------------------------------------------
   不装这个插件时，字体的发现顺序是：
     HTML → JS → GET /api/content → GET /api/fonts → 才拼出 @font-face
     → 浏览器这时才开始下载字体（首次访问还要下几 MB）
   于是没缓存时先看到系统字体，几秒后才切过去。

   插件做两件事（都在构建产物落盘之后、进程退出之前）：
   1. 把选中字体的 @font-face 和 :root 变量覆盖内联进 <head> 末尾
      —— 位置在 Vite 的样式表 <link> 之后，才压得住 tokens.css 的默认栈；
   2. 给选中的字体加 <link rel="preload" as="font">，让下载和 JS 并行。

   字体 URL 带内容 hash，构建前不知道，所以读 dist/.vite/manifest.json
   （vite.config.js 里 build.manifest 打开）。用完就把 .vite 目录删掉。
   ========================================================================== */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  buildTypographyCss,
  dedupeFonts,
  sortFonts,
  toLocalFont,
} from '../src/data/fontUtils.js'

const FONT_MIME = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
}

const BLOCK_RE =
  /[ \t]*<!-- font-preload:start[^>]*-->[\s\S]*?<!-- font-preload:end -->\n?/g

/** BASE_URL（'/' / '/repo/' / './'）+ manifest 里的相对文件名 → 最终 URL */
function joinUrl(base, file) {
  if (!base || base === '/') return `/${file}`
  if (base === './') return `./${file}`
  return `${base.replace(/\/+$/, '')}/${file}`
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** manifest 里属于 font/ 目录的条目 → 与 fonts.js 同形的字体列表 */
function manifestFonts(manifest, base) {
  const fonts = []
  for (const [src, entry] of Object.entries(manifest)) {
    if (!entry || typeof entry.file !== 'string') continue
    if (!/\.(woff2|woff|ttf|otf)$/i.test(entry.file)) continue
    if (!src.replace(/\\/g, '/').startsWith('font/')) continue
    fonts.push({
      ...toLocalFont(`/${src.replace(/\\/g, '/')}`, joinUrl(base, entry.file)),
      file: entry.file,
    })
  }
  return fonts
}

/** 后台内容（content/site.json）里的字体选择；读不到就用构建默认值 */
function readLiveTypography(file) {
  try {
    const json = JSON.parse(readFileSync(file, 'utf8'))
    return json?.site?.typography && typeof json.site.typography === 'object'
      ? json.site.typography
      : null
  } catch {
    return null
  }
}

/** 与 SiteContext 的 deepMerge 对 typography 的效果一致（扁平对象逐键覆盖） */
function mergeTypography(base, live) {
  return {
    ...(base && typeof base === 'object' ? base : {}),
    ...(live ?? {}),
  }
}

function renderBlock({ selected, css, vars, typography }) {
  if (!selected.length) return ''
  const links = selected.map(({ ext, url }) => {
    const type = FONT_MIME[ext] || 'font/woff2'
    return `<link rel="preload" as="font" type="${type}" href="${escapeAttr(encodeURI(url))}" crossorigin />`
  })
  /* 把「构建时选了哪些字体」写进注释：服务端响应 index.html 时比对线上内容，
     后台换过字体就删掉整块，免得预加载上一个已经被换掉的旧字体。 */
  const baked = encodeURIComponent(
    JSON.stringify({
      body: typography.body ?? '',
      heading: typography.heading ?? '',
      mono: typography.mono ?? '',
    }),
  )
  return [
    `<!-- font-preload:start data-typography="${baked}"`,
    '     （由 scripts/font-html-plugin.mjs 生成：首屏就把选中的字体预加载，',
    '      不用等 React 和 /api 回来） -->',
    ...links,
    `<style id="build-typography">${css}${vars ? `\n${vars}` : ''}</style>`,
    '<!-- font-preload:end -->',
  ].join('\n')
}

/** 同 id 的 woff2 赢了之后，原始的 ttf / otf 不再被引用，从产物里删掉 */
function pruneSuperseded(outDir, all, winners) {
  const byId = new Map(winners.map((font) => [font.id, font.file]))
  for (const font of all) {
    if (byId.get(font.id) === font.file) continue
    rmSync(join(outDir, font.file), { force: true })
  }
}

export function fontHtmlPlugin({ site, root, contentFile } = {}) {
  let outDir = ''
  let base = '/'
  let projectRoot = root || process.cwd()

  return {
    name: 'font-preload',
    apply: 'build',

    configResolved(config) {
      projectRoot = root || config.root
      outDir = resolve(config.root, config.build.outDir)
      base = config.base
    },

    /* 用 closeBundle：等 manifest、index.html、字体资源全部落盘之后再改 */
    closeBundle() {
      if (!outDir) return
      const indexPath = join(outDir, 'index.html')
      const manifestPath = join(outDir, '.vite', 'manifest.json')
      if (!existsSync(indexPath)) return
      if (!existsSync(manifestPath)) {
        console.warn(
          `[font-preload] 没有 ${manifestPath}（build.manifest 关了？），跳过首屏字体注入`,
        )
        return
      }

      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        const all = manifestFonts(manifest, base)
        if (!all.length) {
          rmSync(join(outDir, '.vite'), { recursive: true, force: true })
          return
        }

        const fonts = sortFonts(dedupeFonts(all))
        const live = readLiveTypography(
          contentFile ||
            process.env.CONTENT_FILE ||
            join(projectRoot, 'content', 'site.json'),
        )
        const typo = mergeTypography(site?.typography, live)
        const { css, vars, selected } = buildTypographyCss({
          typo,
          fonts,
          urlOf: (font) => font.url,
          onlySelected: true,
        })

        const block = renderBlock({ selected, css, vars, typography: typo })
        if (block) {
          let html = readFileSync(indexPath, 'utf8')
          html = html.replace(BLOCK_RE, '')
          html = html.replace(
            /([ \t]*)<\/head>/,
            (_, indent) => `${block.replace(/^/gm, indent)}\n${indent}</head>`,
          )
          writeFileSync(indexPath, html)
        }

        pruneSuperseded(outDir, all, fonts)
        /* manifest 只在构建期给这个插件用，产物里不需要（也免得被公开访问） */
        rmSync(join(outDir, '.vite'), { recursive: true, force: true })

        if (selected.length) {
          console.log(
            `[font-preload] 首屏预加载 ${selected.length} 个字体：${selected
              .map((s) => `${s.family} (${s.ext})`)
              .join('、')}`,
          )
        }
      } catch (error) {
        console.warn('[font-preload] 首屏字体注入失败，运行时注入仍然有效：', error.message)
      }
    },
  }
}
