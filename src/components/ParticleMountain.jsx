import { useEffect, useRef } from 'react'
import { INK, computeShade, renderMountain } from '../lib/dither.js'
import {
  INTRO_CLOUD_MS,
  TARGET_DESKTOP,
  TARGET_SMALL,
  beginSettle,
  buildParticles,
  particleTransform,
  resetToHome,
  setupIntro,
  stepIntro,
  stepParticles,
  stepSettle,
} from '../lib/particles.js'
import { prefersReducedMotion } from '../hooks/useCountUp.js'
import './ParticleMountain.css'

/* ==========================================================================
   粒子山景
   --------------------------------------------------------------------------
   山的本体就是这一片圆形粒子，靠疏密表现明暗轮廓。它只有一块画布，三种阶段：

     ① cloud   开场无序：加载界面上就能看到一团散着的点在缓慢漂浮
                （此时山景层被临时抬到加载界面的背景层之上、文字层之下，
                  所以点是在加载界面上飘，不会盖住进度数字）
     ② settle  归位：加载结束的那一刻开始，1.5 秒内全部落回各自的位置，
                带一点过冲，收尾干脆
     ③ live    常态：鼠标吹散 + 弹簧归位、滚动时向两侧飞散

   静止时不画任何东西也不需要重绘 —— 主循环停稳后自行停止，画布保留最后一帧。

   位图（mountain__raster）只在系统开启「减少动态效果」时使用：那时完全不建粒子，
   直接把静态点阵山显示出来。正常路径下它始终透明。
   ========================================================================== */

const CELL_DESKTOP = 3 // 采样格子的边长（CSS 像素）：越小越细腻、粒子越多
const CELL_SMALL = 4
const SETTLE = 0.0015 // 滚动进度差值小于它就认为停稳了
const REST_MOTION = 0.4 // 弹性位移小于它就认为粒子都归位了
const ALPHA_BUCKETS = 10 // 按透明度分 10 桶，每桶一次 fill —— 圆形粒子也能跑满帧
const TAU = Math.PI * 2

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

    const heroEl = wrap.closest('.hero')
    const mountTime = performance.now()

    // 位图只在降级路径上用
    raster.style.opacity = reduced ? '1' : '0'

    let width = 0
    let height = 0
    let heroHeight = 0
    let items = []
    let lastW = 0 // 上一次构建时的尺寸，用来忽略 ResizeObserver 的首次空回调
    let lastH = 0

    // 'cloud' → 'settle' → 'live'
    let phase = reduced ? 'live' : 'cloud'
    let settleStart = 0

    let progress = 0 // 平滑后的散开进度：0 → 1
    let targetProgress = 0
    const mouse = { x: 0, y: 0, strength: 0 }
    const mouseTarget = { x: 0, y: 0, inside: false }

    let raf = 0
    let lastFrame = 0
    let schedule = () => {}

    // 按透明度分桶：每个桶存 [x, y, r, x, y, r, ...]
    const buckets = Array.from({ length: ALPHA_BUCKETS }, () => [])

    /* ---------------- 滚动进度 ---------------- */

    function readScroll() {
      if (reduced) {
        targetProgress = 0
        return
      }
      const passed = window.scrollY || window.pageYOffset || 0
      targetProgress = Math.min(1, Math.max(0, passed / (heroHeight * 0.85)))
    }

    /* ---------------- 绘制 ---------------- */

    function draw() {
      layerCtx.clearRect(0, 0, layer.width, layer.height)
      if (!items.length) return

      for (let b = 0; b < ALPHA_BUCKETS; b++) buckets[b].length = 0
      for (let i = 0; i < items.length; i++) {
        const t = particleTransform(items[i], progress, width, height)
        if (t.alpha <= 0.02) continue

        const x = t.x * dpr
        const y = t.y * dpr
        const r = (t.size * dpr) / 2
        if (x + r < 0 || y + r < 0 || x - r > layer.width || y - r > layer.height) continue

        const bucket = Math.min(
          ALPHA_BUCKETS - 1,
          Math.max(0, Math.round(t.alpha * ALPHA_BUCKETS) - 1),
        )
        buckets[bucket].push(x, y, r)
      }

      // 每个透明度桶只调一次 globalAlpha + 一次 fill：
      // 同一个桶里的圆即使互相重叠也不会叠深，这样"疏密"才是干净的灰度层次
      layerCtx.fillStyle = `rgb(${INK})`
      for (let b = 0; b < ALPHA_BUCKETS; b++) {
        const arr = buckets[b]
        if (!arr.length) continue
        layerCtx.globalAlpha = (b + 1) / ALPHA_BUCKETS
        layerCtx.beginPath()
        for (let i = 0; i < arr.length; i += 3) {
          layerCtx.moveTo(arr[i] + arr[i + 2], arr[i + 1])
          layerCtx.arc(arr[i], arr[i + 1], arr[i + 2], 0, TAU)
        }
        layerCtx.fill()
      }
      layerCtx.globalAlpha = 1
    }

    /* ---------------- 构建（首次 + 尺寸变化时） ---------------- */

    function build() {
      width = wrap.clientWidth
      height = wrap.clientHeight
      if (!width || !height) return
      lastW = width
      lastH = height

      const cols = Math.max(2, Math.round(width / cell))
      const rows = Math.max(2, Math.round(height / cell))

      const shade = computeShade(cols, rows)
      if (reduced) renderMountain(raster, cols, rows, shade)

      layer.width = Math.round(width * dpr)
      layer.height = Math.round(height * dpr)

      items = reduced ? [] : buildParticles({ cols, rows, shade, cell, target })

      // 首屏高度缓存起来：滚动处理里就不再读布局，避免每滚一下都触发布局计算
      heroHeight = heroEl ? heroEl.offsetHeight : window.innerHeight

      if (items.length) {
        // 开场期间重建（比如用户放大窗口）就重新撒一次云，别直接跳到归位
        if (phase === 'cloud') setupIntro(items, width, height)
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

      let maxMotion = 0

      if (phase === 'cloud') {
        // ① 开场无序：缓慢摇摆，等到加载结束的那一刻开始归位
        stepIntro(items, elapsed)
        if (elapsed >= INTRO_CLOUD_MS) {
          phase = 'settle'
          settleStart = now
          beginSettle(items)
        }
      } else if (phase === 'settle') {
        // ② 归位：1.5 秒内全部落定
        const result = stepSettle(items, now - settleStart)
        maxMotion = result.maxMotion
        if (result.allDone) {
          phase = 'live'
          resetToHome(items)
          if (heroEl) heroEl.classList.remove('hero--intro')
        }
      } else {
        // ③ 常态：鼠标一离开首屏就立刻撤掉推力，弹簧回弹的那下过冲才看得出来
        const result = stepParticles(items, {
          dt,
          progress,
          mouse: mouseTarget.inside && !reduced ? mouse : null,
        })
        maxMotion = result.maxMotion
      }

      draw()

      const settled =
        phase === 'live' &&
        progress === targetProgress &&
        mouse.strength < 0.02 &&
        maxMotion < REST_MOTION

      if (settled) {
        mouse.strength = 0
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
      resizeObserver = new ResizeObserver(() => {
        // ResizeObserver 在 observe() 之后会立刻回调一次，尺寸没变就直接忽略，
        // 否则开场那团无序云会被瞬间重置归位
        if (wrap.clientWidth === lastW && wrap.clientHeight === lastH) return
        build()
      })
      resizeObserver.observe(wrap)
    }

    // 开场期间把山景层抬到加载界面的背景层之上（见 Hero.css 的 .hero--intro）
    if (heroEl && phase !== 'live') heroEl.classList.add('hero--intro')

    build()
    schedule()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      wrap.removeEventListener('mousemove', onMouseMove)
      wrap.removeEventListener('mouseleave', onMouseLeave)
      if (resizeObserver) resizeObserver.disconnect()
      if (heroEl) heroEl.classList.remove('hero--intro')
      cancelAnimationFrame(raf)
      raf = 0
      // 清理时把位图恢复成可见，避免热更新后先是一片空白
      raster.style.opacity = '1'
    }
  }, [])

  return (
    <div className="mountain" ref={wrapRef} aria-hidden="true">
      <canvas className="mountain__raster" ref={rasterRef} />
      <canvas className="mountain__particles" ref={layerRef} />
    </div>
  )
}
