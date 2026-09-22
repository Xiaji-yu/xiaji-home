import { useEffect, useRef } from 'react'
import { INK, renderMountain } from '../lib/dither.js'
import {
  TARGET_DESKTOP,
  TARGET_SMALL,
  buildParticles,
  ease,
  particleTransform,
} from '../lib/particles.js'
import { prefersReducedMotion } from '../hooks/useCountUp.js'
import './ParticleMountain.css'

/* ==========================================================================
   粒子山景
   --------------------------------------------------------------------------
   两层叠在一起：

   ① 位图层（mountain__raster）
      就是改造前那张点阵山，低分辨率画布 + pixelated 放大。
      静止状态看到的就是它 —— 和以前像素级一致，而且静止时每帧零开销。

   ② 粒子层（mountain__particles）
      把位图里"点亮的格子"采样成约 5000 个独立小方块。
      滚动时位图从画面中线裂开并淡出，粒子同时向左右两侧飞散、变小、淡出。
      进度由滚动位置驱动，所以是**可逆**的：滚回顶部，粒子归位、位图重新合拢。

   手机自动降量；系统开了「减少动态效果」就直接只留位图，永远不散。
   ========================================================================== */

const CELL_DESKTOP = 3 // 一个格子的边长（CSS 像素）：越小越细腻、粒子越多
const CELL_SMALL = 4
const GAP_MAX = 62 // 位图裂开的最大半宽（占容器宽度的百分比）
const GAP_FEATHER = 7 // 裂缝两侧的羽化宽度（百分比）
const RASTER_FADE_AT = 0.45 // 位图在这个进度时彻底淡完，之后画面交给粒子
const SETTLE = 0.0015 // 小于这个差值就认为动画停稳了，可以停掉 rAF

export default function ParticleMountain() {
  const wrapRef = useRef(null)
  const rasterRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const raster = rasterRef.current
    const layer = layerRef.current
    if (!wrap || !raster || !layer) return

    const rasterCtx = raster.getContext('2d')
    const layerCtx = layer.getContext('2d')
    if (!rasterCtx || !layerCtx) return

    const reduced = prefersReducedMotion()
    const small = window.matchMedia('(max-width: 760px)').matches
    const cell = small ? CELL_SMALL : CELL_DESKTOP
    const target = small ? TARGET_SMALL : TARGET_DESKTOP
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    let width = 0
    let height = 0
    let heroHeight = 0
    let items = []

    let progress = 0 // 平滑后的散开进度：0 → 1
    let targetProgress = 0
    const mouse = { x: 0, y: 0, strength: 0 }
    const mouseTarget = { x: 0, y: 0, inside: false }

    let raf = 0
    let schedule = () => {}

    /* ---------------- 滚动进度 ---------------- */

    function readScroll() {
      if (reduced) {
        targetProgress = 0
        return
      }
      // 山景差不多滑出视野时，进度刚好到 1
      const passed = window.scrollY || window.pageYOffset || 0
      targetProgress = Math.min(1, Math.max(0, passed / (heroHeight * 0.85)))
    }

    /* ---------------- 绘制 ---------------- */

    function draw() {
      // ① 位图层：先于粒子退场，并从画面中线裂开一道缝。
      //    缝的宽度和粒子让开的距离一致，看起来就是"山被从中间掰开、碎成颗粒"。
      //    缝隙两侧留 7% 的羽化，避免出现一条生硬的竖直切口（那会像幕布而不是粒子）。
      const e = ease(progress)
      const faded = Math.min(1, progress / RASTER_FADE_AT)
      raster.style.opacity = faded >= 1 ? '0' : String(1 - faded)

      if (e > 0.001) {
        const half = e * GAP_MAX
        const feather = Math.min(GAP_FEATHER, half)
        const mask =
          `linear-gradient(to right, #000 0% ${50 - half}%, ` +
          `transparent ${50 - half + feather}% ${50 + half - feather}%, ` +
          `#000 ${50 + half}% 100%)`
        raster.style.maskImage = mask
        raster.style.webkitMaskImage = mask
      } else if (raster.style.maskImage) {
        raster.style.maskImage = ''
        raster.style.webkitMaskImage = ''
      }

      // ② 粒子层
      layerCtx.clearRect(0, 0, layer.width, layer.height)
      if (!items.length) return
      if (progress <= 0.001 && mouse.strength <= 0.02) return // 静止：什么都不用画

      const m = mouse.strength > 0.02 ? mouse : null
      let lastAlpha = -1

      for (let i = 0; i < items.length; i++) {
        const t = particleTransform(items[i], progress, width, height, m)
        if (t.alpha <= 0.02) continue // 已经淡到看不见

        const size = Math.max(1, Math.round(t.size * dpr))
        const x = Math.round(t.x * dpr)
        const y = Math.round(t.y * dpr)
        if (x < -size || y < -size || x > layer.width || y > layer.height) continue

        // 粒子按墨色排过序，所以这里的 alpha 是单调的，fillStyle 每帧只换几次
        const alpha = Math.round(t.alpha * 10) / 10
        if (alpha !== lastAlpha) {
          layerCtx.fillStyle = `rgba(${INK}, ${alpha})`
          lastAlpha = alpha
        }
        layerCtx.fillRect(x, y, size, size)
      }
    }

    /* ---------------- 构建（首次 + 尺寸变化时） ---------------- */

    function build() {
      width = wrap.clientWidth
      height = wrap.clientHeight
      if (!width || !height) return

      const cols = Math.max(2, Math.round(width / cell))
      const rows = Math.max(2, Math.round(height / cell))

      // 位图层；顺便拿到墨量数组，供粒子采样复用，不用算第二遍
      const shade = renderMountain(raster, cols, rows)

      // 粒子层画布按设备像素比分配，粒子才是硬边方块而不是糊的
      layer.width = Math.round(width * dpr)
      layer.height = Math.round(height * dpr)

      items = reduced || !shade ? [] : buildParticles({ cols, rows, shade, cell, target })

      // 首屏高度缓存起来：滚动处理里就不再读布局，避免每滚一下都触发布局计算
      const heroEl = wrap.closest('.hero')
      heroHeight = heroEl ? heroEl.offsetHeight : window.innerHeight

      readScroll()
      draw()
    }

    /* ---------------- 主循环 ---------------- */

    function frame() {
      raf = 0

      progress += (targetProgress - progress) * 0.14
      if (Math.abs(targetProgress - progress) < SETTLE) progress = targetProgress

      mouse.x += (mouseTarget.x - mouse.x) * 0.18
      mouse.y += (mouseTarget.y - mouse.y) * 0.18
      const wantStrength = mouseTarget.inside && !reduced ? 1 : 0
      mouse.strength += (wantStrength - mouse.strength) * 0.16

      draw()

      const settled =
        progress === targetProgress &&
        Math.abs(wantStrength - mouse.strength) < 0.02 &&
        Math.abs(mouseTarget.x - mouse.x) < 0.5 &&
        Math.abs(mouseTarget.y - mouse.y) < 0.5

      if (settled) {
        // 归位到最终值再收工，避免停在中间态
        mouse.strength = wantStrength
        mouse.x = mouseTarget.x
        mouse.y = mouseTarget.y
        draw()
      } else {
        schedule()
      }
    }

    schedule = () => {
      if (!raf) raf = requestAnimationFrame(frame)
    }

    /* ---------------- 事件 ---------------- */

    const onScroll = () => {
      readScroll()
      schedule()
    }

    const onMouseMove = (event) => {
      if (reduced) return
      const rect = wrap.getBoundingClientRect()
      mouseTarget.x = event.clientX - rect.left
      mouseTarget.y = event.clientY - rect.top
      mouseTarget.inside = true
      schedule()
    }

    const onMouseLeave = () => {
      mouseTarget.inside = false
      schedule()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    wrap.addEventListener('mousemove', onMouseMove, { passive: true })
    wrap.addEventListener('mouseleave', onMouseLeave)

    let resizeObserver = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => build())
      resizeObserver.observe(wrap)
    }

    build()

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      wrap.removeEventListener('mousemove', onMouseMove)
      wrap.removeEventListener('mouseleave', onMouseLeave)
      if (resizeObserver) resizeObserver.disconnect()
      cancelAnimationFrame(raf)
      raf = 0
    }
  }, [])

  return (
    <div className="mountain" ref={wrapRef} aria-hidden="true">
      <canvas className="mountain__raster" ref={rasterRef} />
      <canvas className="mountain__particles" ref={layerRef} />
    </div>
  )
}
