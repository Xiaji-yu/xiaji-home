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
   · 导航只有三处：屏幕两侧的箭头（照参考图）、页眉那几个锚点链接、键盘 ←/→
     —— 左侧那列文字选项整个取消了，位置改由屏幕底部那根细线表示
   · 底部条只有一条通栏细线 + 一段"当前位置"，里面不写字
   · 面板里的内容在"整块滚进视野"那一刻开始错落入场，之后每次切板块都重放一次
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
  /* 幽灵字交叉淡入：留住上一个名字，让它淡出的同时新的淡入 */
  const [mark, setMark] = useState({ cur: '', prev: '' })
  /* 整块入场动画的"保险栓"：整块滚进视野之前先别演，滚到了才放行 */
  const [armed, setArmed] = useState(false)
  const blockRef = useRef(null)

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

  /** 切面板 + 只改地址栏（replaceState 不触发 hashchange，免得重复滚动） */
  const select = useCallback((id) => {
    setActive(id)
    if (typeof window !== 'undefined' && window.location.hash !== `#${id}`) {
      window.history.replaceState(null, '', `#${id}`)
    }
  }, [])

  /** 左右箭头：在六章之间循环 */
  const step = useCallback(
    (d) => {
      const i = sectionTabs.findIndex((t) => t.id === active)
      select(sectionTabs[(i + d + sectionTabs.length) % sectionTabs.length].id)
    },
    [active, select],
  )

  /* 键盘：←/→ 切相邻章节（填表单时让开，不抢光标键） */
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const t = e.target
      if (t?.closest?.('input, textarea, select, [contenteditable]')) return
      e.preventDefault()
      step(e.key === 'ArrowRight' ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  const activeEn = sectionTabs.find((t) => t.id === active)?.en || ''

  /* 幽灵字换名字：把当前这个名字挪到 prev，新的成为 cur */
  useEffect(() => {
    setMark((m) => (m.cur === activeEn ? m : { cur: activeEn, prev: m.cur }))
  }, [activeEn])

  /* 整块第一次滚进视野 → 放行入场动画（只放一次，之后就靠切板块自己重放） */
  useEffect(() => {
    const el = blockRef.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setArmed(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setArmed(true)
          io.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const index = Math.max(
    0,
    sectionTabs.findIndex((t) => t.id === active),
  )
  const chevron = (d) => (
    <svg width="20" height="34" viewBox="0 0 20 34" fill="none" aria-hidden="true">
      <path
        d={d < 0 ? 'M17 2 3 17l14 15' : 'M3 2l14 15-14 15'}
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="square"
      />
    </svg>
  )

  return (
    <>
      <section
        className={`tabs${armed ? ' is-armed' : ''}`}
        ref={blockRef}
        aria-label="板块"
      >
        <div className="tabs__inner">
          <div className="tabs__panel">
            {sectionTabs.map((t) => {
              const Panel = PANELS[t.id]
              return (
                <div
                  key={t.id}
                  id={t.id}
                  role="tabpanel"
                  aria-label={t.cn}
                  hidden={t.id !== active}
                  className="tabs__view"
                >
                  <Panel />
                </div>
              )
            })}
          </div>

          {/* 粒子画布：铺在整块板块区上，图形落在当前章节的留白穴里 */}
          <div className="tabs__figure">
            <FigureCanvas id={active} />
          </div>

          {/* 当前板块的名字，压成大号幽灵字（参考图左下那个 WORLD）。
              挂在整块上而不是面板里：位置不随面板高度变，切标签时不会跳 */}
          <span className="tabs__mark" aria-hidden="true">
            {mark.prev ? (
              <span key={`out-${mark.prev}`} className="tabs__mark-i is-out">
                {mark.prev}
              </span>
            ) : null}
            <span key={`in-${mark.cur}`} className="tabs__mark-i">
              {mark.cur}
            </span>
          </span>
        </div>
      </section>

      {/* 左右箭头：贴在屏幕两侧、竖直居中（照参考图），到头循环。
          放在 section 外面 —— .tabs 上有 clip-path，fixed 子元素会被它裁掉 */}
      {armed ? (
        <>
          <button
            className="tabs__arrow tabs__arrow--prev"
            type="button"
            aria-label="上一章"
            onClick={() => step(-1)}
          >
            {chevron(-1)}
          </button>
          <button
            className="tabs__arrow tabs__arrow--next"
            type="button"
            aria-label="下一章"
            onClick={() => step(1)}
          >
            {chevron(1)}
          </button>

          {/* 底部条：一条通栏细线 + 一段"当前位置"，不写字 */}
          <div className="tabs__bar" aria-hidden="true">
            <span
              className="tabs__bar-i"
              style={{
                width: `${100 / sectionTabs.length}%`,
                transform: `translateX(${index * 100}%)`,
              }}
            />
          </div>
        </>
      ) : null}
    </>
  )
}
