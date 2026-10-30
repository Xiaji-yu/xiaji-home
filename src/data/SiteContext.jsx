import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  site as defaultSite,
  sectionTabs as defaultTabs,
  navLinks as defaultNav,
} from './site.js'
import { localFonts } from './fonts.js'

/* ==========================================================================
   运行时站点内容
   --------------------------------------------------------------------------
   · 构建时打包的 site.js 是「默认值」：首屏立刻渲染、不闪一下空白，
     部署在 GitHub Pages 这类没有 API 的地方也照常工作
   · 页面打开后再请求 /api/content 拉线上内容（后台编辑的就是这份），
     拉到就和默认值深合并 —— 后台改完内容，刷新页面即可生效，
     不用重新构建、不用重启服务
   · 拉不到（静态托管 / 断网 / 内容文件还没写过）就安静地用默认值
   ========================================================================== */

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 深合并：patch 里的数组整体替换，对象递归，缺的字段保留 base 的默认值 */
export function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch ?? base
  const out = { ...base }
  for (const key of Object.keys(patch)) {
    if (isPlainObject(base[key]) && isPlainObject(patch[key])) {
      out[key] = deepMerge(base[key], patch[key])
    } else {
      out[key] = patch[key]
    }
  }
  return out
}

const SiteContext = createContext(null)

/* 默认字体栈：和 styles/tokens.css 里的 --sans / --mono 保持一致。
   后台选了自定义字体时，注入的样式把它放在栈的最前面 —— 自定义字体
   缺字形（比如英文-only 字体遇到中文）时回退到这套默认栈，不糊不崩。 */
const DEFAULT_SANS =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', sans-serif"
const DEFAULT_MONO =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace"

/** @font-face 的 format 提示按扩展名给，浏览器才认 */
function formatHint(ext) {
  return { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' }[ext] || 'woff2'
}

/** 字体清单条目的最小可信过滤：缺 id / file 的条目不进注入（后台共用） */
export function normalizeFontList(list) {
  return Array.isArray(list)
    ? list.filter((f) => f && typeof f.id === 'string' && typeof f.file === 'string')
    : []
}

function setMetaContent(selector, value) {
  if (!value) return
  const el = document.querySelector(selector)
  if (el) el.setAttribute('content', value)
}

/** favicon 用站点名首字符现画一个（纸底 + 墨色细框 + 首字符），名字改了跟着换 */
function drawFavicon(name) {
  try {
    const cs = getComputedStyle(document.documentElement)
    const paper = cs.getPropertyValue('--paper').trim() || '#f5f4f1'
    const ink = cs.getPropertyValue('--ink').trim() || '#111111'
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 64
    const g = c.getContext('2d')
    if (!g) return
    g.fillStyle = paper
    g.fillRect(0, 0, 64, 64)
    g.strokeStyle = ink
    g.lineWidth = 3
    g.strokeRect(1.5, 1.5, 61, 61)
    g.fillStyle = ink
    g.font =
      '600 30px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", Inter, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(name).slice(0, 1), 32, 34)
    const link = document.querySelector('link[rel="icon"]')
    if (link) link.href = c.toDataURL()
  } catch {
    /* 画不了就静态挂着，无所谓 */
  }
}

export function SiteProvider({ children }) {
  /* null = 还没拉到线上内容（或根本没有），用构建默认值 */
  const [live, setLive] = useState(null)
  /* 后台上传的字体清单（/api/fonts）；拉不到就当空库。
     与 font/ 目录里的内置字体（localFonts）合并成 value.fonts 使用。 */
  const [uploadedFonts, setUploadedFonts] = useState([])
  /* 后端在不在：只有 /api/content 真的回了本项目的 JSON 才算有，
     静态托管（GitHub Pages）把页面回给自己解析失败 → 保持 false。
     首页左下角的「AD」入口靠它决定要不要出现。 */
  const [apiAvailable, setApiAvailable] = useState(false)

  useEffect(() => {
    let aborted = false
    /* BASE_URL 兼容子路径部署（GitHub Pages），生产是 '/' */
    fetch(`${import.meta.env.BASE_URL}api/content`, {
      headers: { accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) return null
        /* 静态托管会把 index.html 回给这个路径：解析不是 JSON，就当没有后端 */
        try {
          return await res.json()
        } catch {
          return null
        }
      })
      .then((data) => {
        if (aborted || !data || typeof data !== 'object') return
        if (!('content' in data) || !('updatedAt' in data)) return
        setApiAvailable(true)
        if (isPlainObject(data.content)) setLive(data.content)
      })
      .catch(() => {
        /* 静态托管（GitHub Pages）没有这个接口 —— 用默认值就好 */
      })
    /* 字体清单：静态托管同样拉不到，安静回退 */
    fetch(`${import.meta.env.BASE_URL}api/fonts`, {
      headers: { accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) return null
        try {
          return await res.json()
        } catch {
          return null
        }
      })
      .then((data) => {
        if (aborted || !data) return
        setUploadedFonts(normalizeFontList(data.fonts))
      })
      .catch(() => {})
    return () => {
      aborted = true
    }
  }, [])

  const value = useMemo(() => {
    const site =
      live && isPlainObject(live.site) ? deepMerge(defaultSite, live.site) : defaultSite
    const sectionTabs =
      Array.isArray(live?.sectionTabs) && live.sectionTabs.length
        ? live.sectionTabs.filter((t) => t && typeof t.id === 'string')
        : defaultTabs
    const navLinks =
      Array.isArray(live?.navLinks) && live.navLinks.length
        ? live.navLinks.filter((t) => t && typeof t.href === 'string')
        : defaultNav
    /* 全部可用字体 = font/ 目录内置 + 后台上传（id 相同以内置为准） */
    const fonts = [
      ...localFonts,
      ...uploadedFonts.filter((f) => !localFonts.some((l) => l.id === f.id)),
    ]
    return { site, sectionTabs, navLinks, fonts, apiAvailable }
  }, [live, uploadedFonts, apiAvailable])

  /* 标签标题 / 分享卡片 meta / favicon 跟随线上内容（index.html 里的是构建期兜底） */
  useEffect(() => {
    const { site } = value
    const meta = site.meta ?? {}
    document.title = meta.title || `${site.name} · 个人主页`
    setMetaContent('meta[name="description"]', meta.description)
    setMetaContent('meta[property="og:title"]', meta.title || `${site.name} · 个人主页`)
    setMetaContent('meta[property="og:description"]', meta.description)
    setMetaContent('meta[property="og:image"]', meta.ogImage)
    setMetaContent('meta[name="twitter:card"]', meta.twitterCard)
    drawFavicon(site.name)
  }, [value])

  /* ---- 字体注入：@font-face + 覆盖 --sans / --heading / --mono ----
     一个 <style id="live-typography"> 承载全部：没有自定义字体时整块
     留空不注入，tokens.css 里的默认栈原样生效。
     family 名统一按序号生成（cf-0 / cf-1…）：字体的 id 可能带中文和
     斜杠（font/ 目录的相对路径），序号永远合法且不会重名。 */
  useEffect(() => {
    const { site, fonts: list } = value
    const typo = isPlainObject(site.typography) ? site.typography : {}
    const entries = list.map((font, i) => ({
      font,
      family: `cf-${i}`,
      src:
        font.kind === 'local'
          ? /* font/ 目录：Vite 打包后的最终地址（已含 BASE_URL） */ font.url
          : `${import.meta.env.BASE_URL}api/fonts/file/${encodeURIComponent(font.file)}`,
    }))
    const byId = new Map(entries.map((e) => [e.font.id, e.family]))

    const css = entries
      .map(
        ({ family, src, font }) =>
          `@font-face{font-family:"${family}";src:url("${src}") format("${formatHint(font.ext)}");font-display:swap;}`,
      )
      .join('\n')

    /* 选中的 id 必须真的在字体库里（被删过就静默回退默认栈）。
       标题栈把标题字体放最前、正文字体其次：`"标题字体", "正文字体", 默认栈` */
    const stackFor = (id, fallback) => {
      const family = id ? byId.get(id) : null
      return family ? `"${family}", ${fallback}` : fallback
    }
    const sansStack = stackFor(typo.body, DEFAULT_SANS)
    const headingStack = stackFor(typo.heading, sansStack)
    const monoStack = stackFor(typo.mono, DEFAULT_MONO)

    const vars =
      typo.body || typo.heading || typo.mono
        ? `:root{--sans:${sansStack};--heading:${headingStack};--mono:${monoStack};}`
        : ''

    let el = document.getElementById('live-typography')
    if (!css && !vars) {
      el?.remove()
      return
    }
    if (!el) {
      el = document.createElement('style')
      el.id = 'live-typography'
      document.head.appendChild(el)
    }
    el.textContent = `${css}\n${vars}`
  }, [value])

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>
}

export function useSite() {
  return useContext(SiteContext).site
}

export function useSectionTabs() {
  return useContext(SiteContext).sectionTabs
}

export function useNavLinks() {
  return useContext(SiteContext).navLinks
}

/* 后台上传的字体清单（前台字体注入用，一般不用直接消费） */
export function useFonts() {
  return useContext(SiteContext).fonts
}

/* 后端 /api 在不在（决定首页要不要显示后台入口） */
export function useApiAvailable() {
  return useContext(SiteContext).apiAvailable
}

/* 后台导入功能也要用到默认值（「恢复构建版本」按钮） */
export { defaultSite, defaultTabs, defaultNav }
