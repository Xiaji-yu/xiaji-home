import React from 'react'
import { createRoot } from 'react-dom/client'
import { site } from './data/site.js'

// 必须先令牌与全局、再 App（组件）：ESM 按顺序求值，打包后 base.css 才会排在
// 组件 CSS 之前。反过来的话，同特异性下后出现的 .mono 会盖掉组件里的字号/字距
// 声明（.hero__status 的窄屏档、.header__pct、.skill__val、.foot__beian 全中过）
import './styles/tokens.css'
import './styles/base.css'
import App from './App.jsx'

/* 标签标题跟站点名走：改 site.js 一个文件就够（index.html 里的静态 title 只是
   爬虫和首帧前的兜底）。运行时覆盖，模板用户也白捡这个好处。 */
document.title = `${site.name} · 个人主页`

/* favicon 用站点名首字符现画一个（和页眉品牌 .header__mark 同一个逻辑：
   纸底 + 墨色细框 + 首字符）。Canvas 不可用（或贴图失败）时保留 index.html
   里的静态标。颜色读 tokens —— 换配色不会穿帮。 */
try {
  const cs = getComputedStyle(document.documentElement)
  const paper = cs.getPropertyValue('--paper').trim() || '#f5f4f1'
  const ink = cs.getPropertyValue('--ink').trim() || '#111111'
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')
  if (g) {
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
    g.fillText(site.name.slice(0, 1), 32, 34)
    const link = document.querySelector('link[rel="icon"]')
    if (link) link.href = c.toDataURL()
  }
} catch {
  /* 画不了就静态挂着，无所谓 */
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
