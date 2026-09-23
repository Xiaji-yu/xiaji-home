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
     ③ 换板块：每颗粒子直接飞向新图形里离自己最近的格子（~780ms，带错峰）——
        看着像形状在变形/平移，而不是散开重聚
     ④ 第一次进入视野时先聚一次；系统开了「减少动态效果」就直接摆好、不动
   ========================================================================== */

/** 粒子总数：固定值 —— 切板块时不会有粒子凭空出现或消失（图形放大了，点也相应变多） */
const COUNT = 6000
/** 采样格子的边长（CSS 像素） */
const CELL = 5
/** 点的直径 = 格子 × 它；留出缝，才看得出一颗颗分明的点（参考图那种点阵） */
const DOT = 0.52
const MORPH = { duration: 780, stagger: 260 }

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

    let size = 0
    let box = { x: 0, y: 0, w: 0, h: 0 }
    let items = []
    let currentId = idRef.current
    let plan = MORPH
    let raf = 0
    let seen = false // 是否已经进过视野

    /* ---------------- 图形 → 要点亮的格子 ---------------- */

    function sampleCells(figureId) {
      if (!offCtx || !size) return []
      off.width = size
      off.height = size
      drawFigure(figureId, offCtx, size)

      const data = offCtx.getImageData(0, 0, size, size).data
      const at = (x, y) => {
        const px = Math.round(x)
        const py = Math.round(y)
        if (px < 0 || py < 0 || px >= size || py >= size) return 0
        return data[(py * size + px) * 4 + 3]
      }

      const cells = []
      for (let y = CELL / 2; y < size; y += CELL) {
        for (let x = CELL / 2; x < size; x += CELL) {
          // 中心 + 四角：细一点的线在网格里也不会断
          const hit =
            (at(x, y) > 128 ? 1 : 0) +
            (at(x - 1, y - 1) > 128 ? 1 : 0) +
            (at(x + 1, y - 1) > 128 ? 1 : 0) +
            (at(x - 1, y + 1) > 128 ? 1 : 0) +
            (at(x + 1, y + 1) > 128 ? 1 : 0)
          if (hit >= 2) cells.push({ x, y })
        }
      }
      return cells
    }

    /* ---------------- 绘制 ---------------- */

    function draw() {
      ctx.clearRect(0, 0, size * dpr, size * dpr)
      if (!items.length) return

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
      plan = MORPH
      planMorph(items, sampleCells(next), box, now, { ...MORPH, cell: CELL })
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
      if (!w) return
      size = w
      canvas.width = size * dpr
      canvas.height = size * dpr
      canvas.style.width = `${size}px`
      canvas.style.height = `${size}px`
      box = { x: 0, y: 0, w: size, h: size }
      items = makeParticles(COUNT, box)

      if (reduced) {
        planMorph(items, sampleCells(currentId), box, 0, {
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
      if (!size || next === currentId) return
      currentId = next

      if (reduced) {
        planMorph(items, sampleCells(next), box, 0, { duration: 1, stagger: 0, cell: CELL })
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
      let last = size
      resizeObserver = new ResizeObserver(() => {
        if (wrap.clientWidth === last) return
        last = wrap.clientWidth
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

  /* 换板块：先散开、再聚成新图形（挂载那一次会因为 id 相同直接跳过） */
  useEffect(() => {
    idRef.current = id
    apiRef.current?.switchTo(id)
  }, [id])

  return (
    <div className="figure" ref={wrapRef} aria-hidden="true">
      <canvas className="figure__canvas" ref={canvasRef} />
    </div>
  )
}
