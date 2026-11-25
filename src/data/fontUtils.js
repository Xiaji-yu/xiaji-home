/* ==========================================================================
   字体的纯函数（不碰 glob / 网络 / DOM）
   --------------------------------------------------------------------------
   · 路径 → 字体条目（toLocalFont）
   · 同一份字体的多种格式去重（dedupeFonts）、稳定排序（sortFonts）
   · site.typography → @font-face + CSS 变量（buildTypographyCss）

   浏览器侧（fonts.js / SiteContext）、构建插件（scripts/font-html-plugin.mjs）
   共用这一份。cf-0 / cf-1 的序号必须在构建期和运行期完全一致，
   否则 index.html 里预加载的字体和页面真正用的不是同一个。
   ========================================================================== */

const EXT_RE = /\.(ttf|otf|woff|woff2)$/i

/* 同一份字体存在多种格式时的优先级：woff2（brotli 压缩）体积最小。
   去重、运行时 @font-face、构建期 preload 都按这个顺序挑。 */
const EXT_RANK = { woff2: 0, woff: 1, otf: 2, ttf: 3 }

/* 默认字体栈：和 styles/tokens.css 里的 --sans / --mono 保持一致。
   后台选了自定义字体时，注入的样式把它放在栈的最前面 —— 自定义字体
   缺字形（比如英文-only 字体遇到中文）时回退到这套默认栈，不糊不崩。 */
export const DEFAULT_SANS =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', sans-serif"
export const DEFAULT_MONO =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace"

/** @font-face 的 format 提示按扩展名给，浏览器才认 */
export function formatHint(ext) {
  return { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' }[ext] || 'woff2'
}

/** glob 的 key（'/font/X/xxx.ttf' 或 '../font/X/xxx.ttf'）→ 字体条目。 */
export function toLocalFont(file, url) {
  /* 去掉开头的 ../（可能多层）和 font/ 前缀，得到相对 font/ 的路径 */
  const rel = String(file)
    .replace(/^(?:\.\.\/)+/, '')
    .replace(/^\/?font\//, '')
  const id = rel.replace(EXT_RE, '')
  return {
    id,
    name: id.split('/').pop() || id,
    ext: (rel.match(EXT_RE)?.[1] || '').toLowerCase(),
    url,
    kind: 'local', // 与后台上传的字体（kind: 'uploaded'）区分
  }
}

/** 同 id 多格式只留一份：woff2 > woff > otf > ttf（保持首次出现的顺序） */
export function dedupeFonts(fonts) {
  const best = new Map()
  for (const font of fonts) {
    const seen = best.get(font.id)
    if (!seen || (EXT_RANK[font.ext] ?? 9) < (EXT_RANK[seen.ext] ?? 9)) {
      best.set(font.id, font)
    }
  }
  return [...best.values()]
}

/** 按 id 的代码单元排序。不用 localeCompare：Node 和浏览器 ICU 的
    中文排序可能不同，而 cf-N 序号要求构建期 / 运行期逐位相同。 */
export function sortFonts(fonts) {
  return [...fonts].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * site.typography → @font-face 声明 + :root 变量覆盖。
 *
 * @param {object}   options
 * @param {object}   options.typo          site.typography（body / heading / mono）
 * @param {Array}    options.fonts         与运行时同序的字体列表（本机在前、上传在后）
 * @param {(f: object) => string} options.urlOf  取字体文件 URL
 * @param {boolean} [options.onlySelected] 只给被选中的字体出 @font-face
 *                                         （构建期用：少写无用声明，也方便 preload）
 * @returns {{ css: string, vars: string, selected: Array }}
 *   selected = 去重后的「选中的字体」（family / ext / url），给预加载用
 */
export function buildTypographyCss({ typo, fonts, urlOf, onlySelected = false }) {
  const entries = fonts.map((font, i) => ({
    font,
    family: `cf-${i}`,
    ext: font.ext,
    url: urlOf(font),
  }))
  const byId = new Map(entries.map((e) => [e.font.id, e]))

  const options = typo && typeof typo === 'object' ? typo : {}
  const pick = (id) => (id ? (byId.get(id) ?? null) : null)
  const body = pick(options.body)
  const heading = pick(options.heading)
  const mono = pick(options.mono)

  /* 标题、正文、等宽可能选同一个字体 —— preload 只发一次 */
  const selected = []
  const seen = new Set()
  for (const entry of [body, heading, mono]) {
    if (!entry || seen.has(entry.family)) continue
    seen.add(entry.family)
    selected.push(entry)
  }

  const faceEntries = onlySelected ? selected : entries
  const css = faceEntries
    .map(
      ({ family, ext, url }) =>
        `@font-face{font-family:"${family}";src:url("${url}") format("${formatHint(ext)}");font-display:swap;}`,
    )
    .join('\n')

  /* 选中的 id 必须真的在字体库里（被删过就静默回退默认栈）。
     标题栈把标题字体放最前、正文字体其次：`"标题字体", "正文字体", 默认栈`；
     标题和正文同一个字体时不重复拼接（栈里出现两遍同一个 family 没意义）。 */
  const sansStack = body ? `"${body.family}", ${DEFAULT_SANS}` : DEFAULT_SANS
  const headingStack =
    heading && heading.family !== body?.family
      ? `"${heading.family}", ${sansStack}`
      : sansStack
  const monoStack = mono ? `"${mono.family}", ${DEFAULT_MONO}` : DEFAULT_MONO

  const vars =
    body || heading || mono
      ? `:root{--sans:${sansStack};--heading:${headingStack};--mono:${monoStack};}`
      : ''

  return { css, vars, selected }
}
