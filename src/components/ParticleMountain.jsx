import { useEffect, useRef } from 'react'
import { INK, PAPER, renderMountain } from '../lib/dither.js'
import {
  MOUSE_RADIUS,
  TARGET_DESKTOP,
  TARGET_SMALL,
  buildParticles,
  ease,
  particleTransform,
  resetToHome,
  setupAssemble,
  stepParticles,
} from '../lib/particles.js'
import { prefersReducedMotion } from '../hooks/useCountUp.js'
import './ParticleMountain.css'

/* ==========================================================================
   粒子山景
   --------------------------------------------------------------------------
   两层叠在一起：

   ① 位图层（mountain__raster）
      就是最初那张点阵山，低分辨率画布 + pixelated 放大。
      静止时看到的就是它 —— 像素级等同于改造前，且静止时每帧零开销。

   ② 粒子层（mountain__particles）
      把位图里"点亮的格子"采样成约 5000 个独立小方块。它负责三件事：

      · 载入汇聚：每个粒子从画面外的随机方向飞进来，带一点过冲地落到位，
        错峰抵达；落定后位图淡入，看起来就是山"凝聚"成形。
      · 鼠标吹散：光标附近的粒子被推开（径向 + 一点切向旋转），同时在这一层
        用纸色渐变化一个柔边圆盘，把底下的位图"擦"掉 —— 于是真的出现一个空洞，
        颗粒堆在空洞边缘。鼠标离开后粒子按弹簧回弹，会过冲一下再稳住。
      · 滚动散开：往下滚时位图从画面中线柔化裂开并淡出，粒子向左右两侧飞散。
        进度由滚动位置驱动，所以是可逆的：滚回顶部，粒子归位、位图重新合拢。

   手机自动降量；系统开了「减少动态效果」就只留位图，永远不散、不飞。
   ========================================================================== */

const CELL_DESKTOP = 3 // 一个格子的边长（CSS 像素）：越小越细腻、粒子越多
const CELL_SMALL = 4
const GAP_MAX = 62 // 位图裂开的最大半宽（占容器宽度的百分比）
const GAP_FEATHER = 7 // 裂缝两侧的羽化宽度（百分比）
const RASTER_FADE_AT = 0.45 // 位图在这个进度时彻底淡完，之后画面交给粒子
const SETTLE = 0.0015 // 进度差值小于它就认为滚动停了
const REST_MOTION = 0.4 // 弹性位移小于它就认为粒子已经归位
const VOID_SCALE = 1.15 // 鼠标"擦除盘"的半径 = MOUSE_RADIUS × 它

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

    const mountTime = performance.now()
    let width = 0
    let height = 0
    let heroHeight = 0
    let items = []

    // 开场：先是"汇聚"模式；系统开了减少动效就直接进入常态且位图立刻可见
    let mode = reduced ? 'live' : 'assemble'
    let rasterShown = reduced ? 1 : 0
    // 汇聚阶段粒子整体显形；落定后与位图交叉淡变，把画面交还给位图
    let particleFade = reduced ? 0 : 1

    let progress = 0 // 平滑后的散开进度：0 → 1
    let targetProgress = 0
    const mouse = { x: 0, y: 0, strength: 0 }
    const mouseTarget = { x: 0, y: 0, inside: false }

    let raf = 0
    let lastFrame = 0
    let schedule = () => {}

    /* ---------------- 滚动进度 ---------------- */

    function readScroll() {
      if (reduced) {
        targetProgress = 0
        return
      }
      const passed = window.scrollY || window.pageYOffset || 0
      targetProgress = Math.min(1, Math.max(0, passed / (heroHeight * 0.85)))
    }

    /* ---------------- 鼠标"擦除盘" ---------------- */
    // 在粒子层上画一个纸色圆盘盖住底下的位图，于是山上出现一个空洞。
    // 内部必须"实心"（完全盖住），只在最外圈收窄 —— 否则会糊成一团白雾而不是洞。
    function drawVoid(x, y, strength) {
      if (strength <= 0.01) return
      const cx = x * dpr
      const cy = y * dpr
      const r = MOUSE_RADIUS * VOID_SCALE * dpr
      const gradient = layerCtx.createRadialGradient(cx, cy, 0, cx, cy, r)
      gradient.addColorStop(0, `rgba(${PAPER}, ${strength})`)
      gradient.addColorStop(0.62, `rgba(${PAPER}, ${strength})`)
      gradient.addColorStop(0.86, `rgba(${PAPER}, ${strength * 0.94})`)
      gradient.addColorStop(1, `rgba(${PAPER}, 0)`)
      layerCtx.fillStyle = gradient
      layerCtx.beginPath()
      layerCtx.arc(cx, cy, r, 0, Math.PI * 2)
      layerCtx.fill()
    }

    /* ---------------- 绘制 ---------------- */

    function draw() {
      // ① 位图层：随滚动淡出、从中间裂开；载入汇聚期间它整体不可见，
      //    等粒子落定后再淡入 —— 那一下就是山"凝固"成实体的感觉。
      const scrollFade = Math.min(1, progress / RASTER_FADE_AT)
      const opacity = rasterShown * (1 - scrollFade)
      raster.style.opacity = opacity <= 0.003 ? '0' : String(opacity)

      const e = ease(progress)
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

      const voidStrength = mode === 'live' ? mouse.strength * (1 - progress) : 0
      if (voidStrength > 0.01) drawVoid(mouse.x, mouse.y, voidStrength)

      const active = progress > 0.001 || mouse.strength > 0.02 || particleFade > 0.01
      if (!active) return

      let lastAlpha = -1
      for (let i = 0; i < items.length; i++) {
        const t = particleTransform(items[i], progress, width, height, particleFade)
        if (t.alpha <= 0.02) continue // 没被扰动（或已经淡尽）的粒子根本不画

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

    function build(first) {
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

      if (items.length) {
        if (first && mode === 'assemble') setupAssemble(items, width, height)
        else resetToHome(items)
      }

      readScroll()
      draw()
    }

    /* ---------------- 主循环 ---------------- */

    function frame(now) {
      raf = 0
      const dt = lastFrame ? (now - lastFrame) / 16.6667 : 1
      lastFrame = now
      const elapsed = now - mountTime

      // 滚动进度与鼠标影响都做平滑，动作才不会生硬
      progress += (targetProgress - progress) * 0.14
      if (Math.abs(targetProgress - progress) < SETTLE) progress = targetProgress

      mouse.x += (mouseTarget.x - mouse.x) * 0.2
      mouse.y += (mouseTarget.y - mouse.y) * 0.2
      const wantStrength = mouseTarget.inside && !reduced ? 1 : 0
      mouse.strength += (wantStrength - mouse.strength) * 0.16

      // 物理：汇聚中按时间走曲线，常态下是弹簧。
      // 注意：鼠标必须是"离开首屏就立刻撤掉推力"，弹回时的那下过冲才看得出来；
      // 如果让推力随强度慢慢衰减，回弹就被抹平成一条平滑曲线了。
      const pushMouse = mouseTarget.inside && !reduced ? mouse : null
      const result = stepParticles(items, {
        dt,
        elapsed,
        mode,
        progress,
        mouse: pushMouse,
      })

      if (mode === 'assemble' && result.allDone) {
        mode = 'live'
        resetToHome(items)
      }

      // 粒子落定后与位图交叉淡变（"山体凝实"）：
      // 位图逐渐显现的同时粒子整体退场，墨量总量大致守恒，不会出现忽明忽暗
      const wantRaster = mode === 'live' ? 1 : 0
      rasterShown += (wantRaster - rasterShown) * 0.2
      particleFade += (1 - wantRaster - particleFade) * 0.2

      draw()

      const settled =
        mode === 'live' &&
        progress === targetProgress &&
        mouse.strength < 0.02 &&
        result.maxMotion < REST_MOTION &&
        rasterShown > 0.995 &&
        particleFade < 0.005

      if (settled) {
        mouse.strength = 0
        rasterShown = 1
        particleFade = 0
        draw() // 用最终状态收尾，避免停在中间态
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
      resizeObserver = new ResizeObserver(() => build(false))
      resizeObserver.observe(wrap)
    }

    build(true)
    schedule()

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      wrap.removeEventListener('mousemove', onMouseMove)
      wrap.removeEventListener('mouseleave', onMouseLeave)
      if (resizeObserver) resizeObserver.disconnect()
      cancelAnimationFrame(raf)
      raf = 0
      // 清理时把位图恢复成可见，避免热更新后先是一片空白
      raster.style.opacity = '1'
      raster.style.maskImage = ''
      raster.style.webkitMaskImage = ''
    }
  }, [])

  return (
    <div className="mountain" ref={wrapRef} aria-hidden="true">
      <canvas className="mountain__raster" ref={rasterRef} />
      <canvas className="mountain__particles" ref={layerRef} />
    </div>
  )
}
