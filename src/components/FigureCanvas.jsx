import { useEffect, useRef } from 'react'
import { drawFigure } from '../lib/figures.js'
import { makeParticles, planMorph, snap, step } from '../lib/figureParticles.js'
import { INK } from '../lib/dither.js'
import { prefersReducedMotion } from '../hooks/useCountUp.js'
import './FigureCanvas.css'

/* ==========================================================================
   右侧的粒子图形
   --------------------------------------------------------------------------
   每个板块有自己的几何图形（lib/figures.js，全部代码画，不引图片）。流程：

     ① 把图形画到一张离屏画布上，按格子采样出"要点亮的格子"
     ② 粒子飞过去聚成它；落定之后主循环停下（和首屏那座山一样不空转）
     ③ 换板块：粒子直接飞向新图形里离自己最近的格子（~780ms，带错峰）——
        看着像形状在变形/平移，而不是散开重聚
     ④ 第一次进入视野时先聚一次；系统开了「减少动态效果」就直接摆好、不动

   画布不是贴在右边一角，而是**铺在整块板块区上**：每个章节里留了一块空白
   （.pane__slot，六个章节位置各不相同），图形就嵌在那块空白里 —— 位置和大小
   都由"当前章节那个穴"量出来。所以切板块时粒子是从一个穴飞到另一个穴。
   ========================================================================== */

/** 粒子总数：固定值 —— 切板块时不会有粒子凭空出现或消失 */
const COUNT = 6000
/** 采样格子的边长（CSS 像素） */
const CELL = 5
/** 点的直径 = 格子 × 它；留出缝，才看得出一颗颗分明的点（参考图那种点阵） */
const DOT = 0.52
const MORPH = { duration: 780, stagger: 260 }
/** 换板块时图形比内容晚一点动：内容先入场，粒子随后跟上，层次更分明 */
const SWITCH_DELAY_MS = 160

export default function FigureCanvas({ id }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const apiRef = useRef(null)
  const idRef = useRef(id)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = prefersReducedMotion()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const off = document.createElement('canvas')
    const offCtx = off.getContext('2d', { willReadFrequently: true })

    let cw = 0 // 画布（铺在板块区上的那条）的宽高
    let ch = 0
    let items = []
    let currentId = idRef.current
    let plan = MORPH
    let raf = 0
    let seen = false // 是否已经进过视野

    /* ---------------- 量出"当前章节的留白穴" ---------------- */

    function slotBox(figureId) {
      const view = document.querySelector(`#${figureId}`)
      const slot = view?.querySelector('.pane__slot')
      if (!slot) return null
      const r = slot.getBoundingClientRect()
      const w = wrap.getBoundingClientRect()
      if (r.width < 40 || r.height < 40) return null
      return {
        x: r.left - w.left,
        y: r.top - w.top,
        w: r.width,
        h: r.height,
        // 每个章节的图形略大略小（见各面板里的 data-fig-scale），切过去带一点缩放
        scale: Number(slot.dataset.figScale || 1),
      }
    }

    /* ---------------- 图形 → 要点亮的格子 ---------------- */

    let cached = '' // 离屏画布当前画的是哪张图、多大

    function sampleCells(figureId, target) {
      if (!offCtx || !target) return []
      const fig = Math.max(32, Math.round(Math.min(target.w, target.h) * target.scale))
      const key = `${figureId}|${fig}`
      if (key !== cached) {
        off.width = fig
        off.height = fig
        drawFigure(figureId, offCtx, fig)
        cached = key
      }

      const data = offCtx.getImageData(0, 0, fig, fig).data
      const at = (x, y) => {
        const px = Math.round(x)
        const py = Math.round(y)
        if (px < 0 || py < 0 || px >= fig || py >= fig) return 0
        return data[(py * fig + px) * 4 + 3]
      }

      // 图形在穴里居中
      const ox = target.x + (target.w - fig) / 2
      const oy = target.y + (target.h - fig) / 2

      const cells = []
      for (let y = CELL / 2; y < fig; y += CELL) {
        for (let x = CELL / 2; x < fig; x += CELL) {
          // 中心 + 四角：细一点的线在网格里也不会断
          const hit =
            (at(x, y) > 128 ? 1 : 0) +
            (at(x - 1, y - 1) > 128 ? 1 : 0) +
            (at(x + 1, y - 1) > 128 ? 1 : 0) +
            (at(x - 1, y + 1) > 128 ? 1 : 0) +
            (at(x + 1, y + 1) > 128 ? 1 : 0)
          if (hit >= 2) cells.push({ x: ox + x, y: oy + y })
        }
      }
      return cells
    }

    /* ---------------- 绘制 ---------------- */

    /* 画布铺满整块板块区（1500×1000 量级），每帧全清太亏 —— 只清"上一帧的点
       和这一帧的点"覆盖的范围就行。切板块时两帧的并集正好是粒子飞过的那条带。 */
    let dirty = null

    function draw() {
      if (!items.length) {
        ctx.clearRect(0, 0, cw * dpr, ch * dpr)
        dirty = null
        return
      }

      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (const it of items) {
        if (it.x < x0) x0 = it.x
        if (it.x > x1) x1 = it.x
        if (it.y < y0) y0 = it.y
        if (it.y > y1) y1 = it.y
      }

      const pad = (CELL * DOT) / 2 + 1
      const cx0 = Math.max(0, Math.min(x0, dirty ? dirty.x0 : x0) - pad)
      const cy0 = Math.max(0, Math.min(y0, dirty ? dirty.y0 : y0) - pad)
      const cx1 = Math.min(cw, Math.max(x1, dirty ? dirty.x1 : x1) + pad)
      const cy1 = Math.min(ch, Math.max(y1, dirty ? dirty.y1 : y1) + pad)
      ctx.clearRect(cx0 * dpr, cy0 * dpr, (cx1 - cx0) * dpr, (cy1 - cy0) * dpr)
      dirty = { x0, y0, x1, y1 }

      const r = (CELL * DOT * dpr) / 2
      const TAU = Math.PI * 2
      ctx.fillStyle = `rgb(${INK})`
      ctx.beginPath()
      for (const it of items) {
        const x = it.x * dpr
        const y = it.y * dpr
        ctx.moveTo(x + r, y)
        ctx.arc(x, y, r, 0, TAU)
      }
      ctx.fill()
    }

    function schedule() {
      if (!raf) raf = requestAnimationFrame(frame)
    }

    function morphTo(next, now) {
      const target = slotBox(next)
      if (!target) return
      plan = MORPH
      planMorph(items, sampleCells(next, target), target, now, { ...MORPH, cell: CELL })
      schedule()
    }

    /* ---------------- 主循环 ---------------- */

    function frame(now) {
      raf = 0
      const result = step(items, now, plan.duration, plan.stagger)
      draw()

      if (!result.allDone) schedule() // 落定就停，不空转
    }

    /* ---------------- 尺寸与首次聚合 ---------------- */

    function layout() {
      const w = Math.round(wrap.clientWidth)
      const h = Math.round(wrap.clientHeight)
      if (!w || !h) return // 窄屏藏起来了
      cw = w
      ch = h
      canvas.width = cw * dpr
      canvas.height = ch * dpr
      canvas.style.width = `${cw}px`
      canvas.style.height = `${ch}px`
      dirty = null // 改尺寸会重置位图，脏矩形也要跟着清空

      const target = slotBox(currentId)
      if (!target) return
      // 开场那团无序的点铺在整条带子上，等进视野再收进穴里聚成图形
      items = makeParticles(COUNT, { x: 0, y: 0, w: cw, h: ch })

      if (reduced) {
        planMorph(items, sampleCells(currentId, target), target, 0, {
          duration: 1,
          stagger: 0,
          cell: CELL,
        })
        snap(items)
        draw()
        return
      }

      draw() // 先画一团散着的点，等进视野再聚起来
      if (seen) morphTo(currentId, performance.now())
    }

    function switchTo(next) {
      if (!cw || next === currentId) return
      currentId = next
      const target = slotBox(next)
      if (!target) return

      if (reduced) {
        planMorph(items, sampleCells(next, target), target, 0, {
          duration: 1,
          stagger: 0,
          cell: CELL,
        })
        snap(items)
        draw()
        return
      }
      if (!seen) return // 还没进视野：等进去时直接用新图形聚一次

      morphTo(next, performance.now())
    }

    function startIntro() {
      if (seen || !items.length || reduced) return
      seen = true
      morphTo(currentId, performance.now())
    }

    apiRef.current = { switchTo }
    layout()

    let resizeObserver = null
    if (typeof ResizeObserver !== 'undefined') {
      let lastW = cw
      let lastH = ch
      resizeObserver = new ResizeObserver(() => {
        if (wrap.clientWidth === lastW && wrap.clientHeight === lastH) return
        lastW = wrap.clientWidth
        lastH = wrap.clientHeight
        layout()
      })
      resizeObserver.observe(wrap)
    }

    let io = null
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) startIntro()
        },
        { threshold: 0.25 },
      )
      io.observe(wrap)
    } else {
      startIntro()
    }

    return () => {
      cancelAnimationFrame(raf)
      raf = 0
      apiRef.current = null
      if (resizeObserver) resizeObserver.disconnect()
      if (io) io.disconnect()
    }
  }, [])

  /* 换板块：粒子直接变形到新图形（挂载那一次会因为 id 相同直接跳过）。
     延后 SWITCH_DELAY_MS 起步 —— 让左边的正文先入场，粒子随后跟上；连点两下时
     前一次会被取消，只有最后选中的那个图形会动。 */
  useEffect(() => {
    if (idRef.current === id) return
    idRef.current = id
    if (prefersReducedMotion()) {
      apiRef.current?.switchTo(id)
      return
    }
    const t = setTimeout(() => apiRef.current?.switchTo(id), SWITCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [id])

  return (
    <div className="figure" ref={wrapRef} aria-hidden="true">
      <canvas className="figure__canvas" ref={canvasRef} />
    </div>
  )
}
