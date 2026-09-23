import { useCallback, useEffect, useRef, useState } from 'react'
import About from './About.jsx'
import Skills from './Skills.jsx'
import Projects from './Projects.jsx'
import Timeline from './Timeline.jsx'
import Contact from './Contact.jsx'
import Notes from './Notes.jsx'
import FigureCanvas from './FigureCanvas.jsx'
import { sectionTabs } from '../data/site.js'
import { prefersReducedMotion } from '../hooks/useCountUp.js'
import './Sections.css'

/* ==========================================================================
   板块选项卡（参考图那种：左边一列竖排选项，右边一块内容）
   --------------------------------------------------------------------------
   · 六个板块**全部挂载**，只有当前那个可见 —— 切回来时留言便签的草稿、
     技能条动画、项目卡片的倾斜状态都还在；隐藏的用 hidden 属性（连同无障碍一起藏）
   · 地址栏和选项联动：#about / #skills … 直接进对应面板，页眉那几个链接
     点一下也是切面板（它们本来就是 <a href="#about">，不用改页眉）
   · 按下方向键 / Home / End 可以在选项间移动（标准的 tablist 键盘操作）
   ========================================================================== */

const PANELS = {
  about: About,
  skills: Skills,
  work: Projects,
  journey: Timeline,
  contact: Contact,
  notes: Notes,
}

/** 读地址栏里的 #xxx，只认六个板块的 id */
function hashId() {
  if (typeof window === 'undefined') return ''
  const id = window.location.hash.replace('#', '')
  return sectionTabs.some((t) => t.id === id) ? id : ''
}

export default function Sections() {
  const [active, setActive] = useState(() => hashId() || sectionTabs[0].id)
  const blockRef = useRef(null)
  const railRef = useRef(null)

  /* 外部改 hash（页眉链接、浏览器前进后退）→ 切到对应面板 */
  useEffect(() => {
    const onHash = () => {
      const id = hashId()
      if (!id) return
      setActive((prev) => (prev === id ? prev : id))
      // 点了页眉链接的话，用户可能还在页面下方 —— 把选项卡区带进视野，
      // 否则内容变了却看不到
      const el = blockRef.current
      if (el) {
        const top = el.getBoundingClientRect().top
        if (top < -8 || top > window.innerHeight * 0.5) {
          el.scrollIntoView({
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
            block: 'start',
          })
        }
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  /** 点选项：切面板 + 只改地址栏（replaceState 不触发 hashchange，免得重复滚动） */
  const select = useCallback((id) => {
    setActive(id)
    if (typeof window !== 'undefined' && window.location.hash !== `#${id}`) {
      window.history.replaceState(null, '', `#${id}`)
    }
    // 窄屏那排标签是横向滚动的：切过去的选项要滑进视野（桌面上是空操作）
    railRef.current?.querySelector(`#tab-${id}`)?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [])

  /* 键盘：上下（窄屏是左右）切换、Home / End 跳首尾 */
  const onKeyDown = (e) => {
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End']
    if (!keys.includes(e.key)) return
    e.preventDefault()
    const i = sectionTabs.findIndex((t) => t.id === active)
    let next = i
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (i + 1) % sectionTabs.length
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft')
      next = (i - 1 + sectionTabs.length) % sectionTabs.length
    if (e.key === 'Home') next = 0
    if (e.key === 'End') next = sectionTabs.length - 1
    const id = sectionTabs[next].id
    select(id)
    railRef.current?.querySelector(`#tab-${id}`)?.focus()
  }

  const activeEn = sectionTabs.find((t) => t.id === active)?.en || ''

  return (
    <section className="tabs" ref={blockRef} aria-label="板块">
      <div className="tabs__inner">
        <div
          className="tabs__rail"
          role="tablist"
          aria-label="板块导航"
          ref={railRef}
          onKeyDown={onKeyDown}
        >
          {sectionTabs.map((t) => {
            const on = t.id === active
            return (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={t.id}
                tabIndex={on ? 0 : -1}
                className={`tab${on ? ' is-on' : ''}`}
                onClick={() => select(t.id)}
              >
                <span className="tab__cn">{t.cn}</span>
                <span className="tab__en mono">{t.en}</span>
              </button>
            )
          })}
        </div>

        <div className="tabs__panel">
          {sectionTabs.map((t) => {
            const Panel = PANELS[t.id]
            return (
              <div
                key={t.id}
                id={t.id}
                role="tabpanel"
                aria-labelledby={`tab-${t.id}`}
                hidden={t.id !== active}
                className="tabs__view"
              >
                <Panel />
              </div>
            )
          })}
        </div>

        {/* 右栏：当前板块的几何图形，粒子聚出来的（换板块会重新聚散） */}
        <div className="tabs__figure">
          <FigureCanvas id={active} />
        </div>

        {/* 当前板块的名字，压成大号幽灵字（参考图左下那个 WORLD）。
            挂在整块上而不是面板里：位置不随面板高度变，切标签时不会跳 */}
        <span className="tabs__mark" aria-hidden="true">
          {activeEn}
        </span>
      </div>
    </section>
  )
}
