import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  site as defaultSite,
  sectionTabs as defaultTabs,
  navLinks as defaultNav,
} from './site.js'

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

  useEffect(() => {
    let aborted = false
    /* BASE_URL 兼容子路径部署（GitHub Pages），生产是 '/' */
    fetch(`${import.meta.env.BASE_URL}api/content`, {
      headers: { accept: 'application/json' },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!aborted && data && data.content && isPlainObject(data.content)) {
          setLive(data.content)
        }
      })
      .catch(() => {
        /* 静态托管（GitHub Pages）没有这个接口 —— 用默认值就好 */
      })
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
    return { site, sectionTabs, navLinks }
  }, [live])

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

/* 后台导入功能也要用到默认值（「恢复构建版本」按钮） */
export { defaultSite, defaultTabs, defaultNav }
