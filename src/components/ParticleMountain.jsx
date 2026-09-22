import { useEffect, useRef } from 'react'
import { INK, computeShade, renderMountain } from '../lib/dither.js'
import {
  INTRO_MS,
  beginSettle,
  buildParticles,
  particleTransform,
  pickCell,
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
   山的本体就是这一片**大小完全相同**的圆形点，靠疏密表现明暗轮廓。它只有一块画布，
   三个阶段：

     ① cloud   开场无序：加载界面上，点散在一条"和进度条等宽、半屏高、居中"的带子里
                漂浮。这时画布临时铺满视口（.mountain--full），层被抬到加载界面的
                背景层之上、文字层之下，所以点是在加载界面上飘，不会挡住进度数字。
     ② settle  归位：加载结束的那一刻，整片乱点一起收拢，1.5 秒内落到底部
                凝聚成山的轮廓，收尾带一点过冲。
     ③ live    常态：光标按出小坑 + 点慢慢流回、滚动时向两侧飞散。

   全程都是**同一批点**：无序云、山只是两次不同的目标位置。

   坐标系统有个关键换算：粒子的"出生位置"永远是相对山景容器（.hero__mount）算的，
   而开场时画布铺满视口 —— 于是绘制时统一加一个 origin（画布左上角相对视口的偏移）。
   归位结束、画布收回山景那一块时，origin 变回 0，而此刻所有偏移恰好都是 0，
   所以切换的那一帧屏幕上的样子完全不变，看不出接缝。

   静止时不画任何东西也不需要重绘 —— 主循环停稳后自行停止，画布保留最后一帧。

   位图（mountain__raster）只在系统开启「减少动态效果」时使用：那时完全不建粒子，
   直接把静态点阵山显示出来。正常路径下它始终透明。
   ========================================================================== */

const SETTLE = 0.0015 // 滚动进度差值小于它就认为停稳了
const REST_MOTION = 0.4 // 弹性位移小于它就认为粒子都归位了
const ALPHA_BUCKETS = 10 // 按透明度分 10 桶，每桶一次 fill —— 滚动散开时才有多个桶
const TAU = Math.PI * 2

/**
 * 尺寸变化超过这么多像素才重建粒子。
 *
 * 这条阈值是**必需品**，不是优化：网页字体加载完会换一次字体、滚动条出现或消失，
 * 都会让首屏的排版回流几十像素。如果在归位途中重建，粒子会当场跳到新的出生位置
 * （也就是"点突然没了、山上凭空出现一批点"，整个归位过程消失）。
 * 小回流就直接忽略，只把画布对齐一下；真的换了窗口大小（远超阈值）才重建。
 */
const REBUILD_PX = 48

export default function ParticleMountain() {
  const wrapRef = useRef(null)
  const rasterRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const raster = rasterRef.current
    const layer = layerRef.current
    if (!wrap || !raster || !layer) return

    // 山景真正占的那块地方。开场时这一层会被抬起来铺满视口，所以尺寸要从它身上量
    const mount = wrap.parentElement
    if (!mount) return

    const rasterCtx = raster.getContext('2d')
    const layerCtx = layer.getContext('2d')
    if (!rasterCtx || !layerCtx) return

    const reduced = prefersReducedMotion()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const heroEl = wrap.closest('.hero')
    // 开场的计时起点。刻意不在 mount 时取时间，而是在**第一帧**再取：
    // 万一首屏被字体或脚本卡住几百毫秒，无序云也不会还没画出来就被跳过。
    let introStart = 0

    // 位图只在降级路径上用
    raster.style.opacity = reduced ? '1' : '0'

    let stageW = 0 // 山景容器（.hero__mount）的尺寸：粒子的出生坐标系
    let stageH = 0
    let canvasW = 0 // 画布自己的尺寸：开场 = 视口，常态 = 山景容器
    let canvasH = 0
    let originX = 0 // 画布左上角相对视口的偏移（常态下是 0）
    let originY = 0
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
      // 开场期间不做"滚动散开"：此刻这一层铺满视口，点必须一颗不少地看得见。
      // 这也是刷新时那个人为 bug 的兜底 —— 万一把页面停在中间刷新、浏览器又坚持
      // 恢复滚动位置，排在最前面的"淡出"会让整团点变成透明的空屏。
      if (phase !== 'live') {
        targetProgress = 0
        return
      }
      const passed = window.scrollY || window.pageYOffset || 0
      targetProgress = Math.min(1, Math.max(0, passed / (heroHeight * 0.85)))
    }

    /* ---------------- 画布尺寸与坐标原点 ---------------- */

    function layoutCanvas() {
      const full = !reduced && phase !== 'live'
      wrap.classList.toggle('mountain--full', full)

      if (full) {
        // 开场：画布铺满视口，原点就是山景容器在视口里的位置
        const rect = mount.getBoundingClientRect()
        originX = rect.left
        originY = rect.top
        canvasW = window.innerWidth
        canvasH = window.innerHeight
      } else {
        originX = 0
        originY = 0
        canvasW = stageW
        canvasH = stageH
      }

      layer.width = Math.max(1, Math.round(canvasW * dpr))
      layer.height = Math.max(1, Math.round(canvasH * dpr))
    }

    /* ---------------- 绘制 ---------------- */

    function draw() {
      layerCtx.clearRect(0, 0, layer.width, layer.height)
      if (!items.length) return

      for (let b = 0; b < ALPHA_BUCKETS; b++) buckets[b].length = 0
      for (let i = 0; i < items.length; i++) {
        const t = particleTransform(items[i], progress, stageW, stageH)
        if (t.alpha <= 0.02) continue

        const x = (t.x + originX) * dpr
        const y = (t.y + originY) * dpr
        const r = (t.size * dpr) / 2
        if (x + r < 0 || y + r < 0 || x - r > layer.width || y - r > layer.height) continue

        const bucket = Math.min(
          ALPHA_BUCKETS - 1,
          Math.max(0, Math.round(t.alpha * ALPHA_BUCKETS) - 1),
        )
        buckets[bucket].push(x, y, r)
      }

      // 每个透明度桶只调一次 globalAlpha + 一次 fill：
      // 同一个桶里的圆即使互相重叠也不会叠深，这样"疏密"才是干净的灰度层次。
      // 静止时所有点在同一个桶里 —— 整座山就是一次 fill。
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

    /* ---------------- 开场那团点铺在哪儿 ---------------- */

    /**
     * 开场无序云的范围：**宽度和加载进度条一样、高度半屏、垂直居中**的一条带子
     * （不是铺满整个屏幕）。
     *
     * 宽度直接量进度条那张 DOM 元素，跟遮罩的排版永远对得上；
     * 万一度不到（比如遮罩已经卸载了）就退回一个居中的固定宽度。
     */
    function introBox() {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const h = vh * 0.5
      const y = (vh - h) / 2
      const bar = document.querySelector('.pre__bar')
      const rect = bar ? bar.getBoundingClientRect() : null
      if (rect && rect.width > 40) return { x: rect.left, y, w: rect.width, h }
      const w = Math.min(vw * 0.86, 1200)
      return { x: (vw - w) / 2, y, w, h }
    }

    /* ---------------- 构建（首次 + 尺寸真变了时） ---------------- */

    /** 山景容器只回流了几个像素（字体替换、滚动条）—— 不动粒子，只把画布对齐一下 */
    function realign() {
      heroHeight = heroEl ? heroEl.offsetHeight : window.innerHeight
      layoutCanvas()
      readScroll()
      draw()
    }

    function build() {
      stageW = mount.clientWidth
      stageH = mount.clientHeight
      if (!stageW || !stageH) return
      lastW = stageW
      lastH = stageH

      const cell = pickCell(stageW, stageH)
      const cols = Math.max(2, Math.round(stageW / cell))
      const rows = Math.max(2, Math.round(stageH / cell))

      const shade = computeShade(cols, rows)
      if (reduced) renderMountain(raster, cols, rows, shade)

      items = reduced ? [] : buildParticles({ cols, rows, shade, cell })

      // 首屏高度缓存起来：滚动处理里就不再读布局，避免每滚一下都触发布局计算
      heroHeight = heroEl ? heroEl.offsetHeight : window.innerHeight

      layoutCanvas()

      if (items.length) {
        if (phase === 'live') {
          // 已经落定的状态下重建：直接按新的出生位置摆好
          resetToHome(items)
        } else {
          // 开场途中重建（一般是用户真的把窗口拉大了）：重新撒一次开场那团乱点，
          // 并且**把开场从头再走一遍** —— 宁可重播一次，也不能让点当场跳到山上
          if (phase === 'settle') {
            phase = 'cloud'
            introStart = 0
            if (heroEl) heroEl.classList.add('hero--intro')
          }
          setupIntro(items, introBox(), originX, originY)
        }
      }

      readScroll()
      draw()
    }

    /** 尺寸变化的分流：小回流忽略，大变化重建 */
    function onLayoutChange() {
      const w = mount.clientWidth
      const h = mount.clientHeight
      if (!w || !h) return
      if (lastW && Math.abs(w - lastW) < REBUILD_PX && Math.abs(h - lastH) < REBUILD_PX) {
        realign()
        return
      }
      build()
    }

    /* ---------------- 主循环 ---------------- */

    function frame(now) {
      raf = 0
      const dt = lastFrame ? (now - lastFrame) / 16.6667 : 1
      lastFrame = now
      if (!introStart) introStart = now
      const elapsed = now - introStart

      // 滚动进度与鼠标影响都做平滑，动作才不会生硬。
      // 开场（无序云 + 归位）期间进度强制为 0：这一层此刻是铺满视口的，
      // 不能因为页面恰好停在中间就把点整片淡掉。
      if (phase === 'live') {
        progress += (targetProgress - progress) * 0.14
        if (Math.abs(targetProgress - progress) < SETTLE) progress = targetProgress
      } else {
        progress = 0
      }

      // 鼠标的坑很小，所以要跟得紧一点 —— 迟一步的话坑会拖在光标后面
      mouse.x += (mouseTarget.x - mouse.x) * 0.35
      mouse.y += (mouseTarget.y - mouse.y) * 0.35
      const wantStrength = mouseTarget.inside && !reduced ? 1 : 0
      mouse.strength += (wantStrength - mouse.strength) * 0.28

      let maxMotion = 0

      if (phase === 'cloud') {
        // ① 开场无序：在带子里慢慢漂着，等到加载结束的那一刻开始归位
        stepIntro(items, elapsed)
        if (elapsed >= INTRO_MS) {
          phase = 'settle'
          settleStart = now
          beginSettle(items)
        }
      } else if (phase === 'settle') {
        // ② 归位：1.5 秒内全部落定，凝聚成山的轮廓
        const result = stepSettle(items, now - settleStart)
        maxMotion = result.maxMotion
        if (result.allDone) {
          phase = 'live'
          resetToHome(items)
          if (heroEl) heroEl.classList.remove('hero--intro')
          // 画布从"铺满视口"收回山景那一块。此刻所有偏移都是 0，画面不会跳。
          // 顺带把尺寸对齐到此刻真实的容器大小（开场期间可能有被我们忽略的小回流）
          stageW = mount.clientWidth
          stageH = mount.clientHeight
          layoutCanvas()
        }
      } else {
        // ③ 常态：光标一离开首屏就立刻撤掉推力，点按一阶滞后慢慢流回原位
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

    const onResize = () => {
      // 开场时画布铺满视口，视口一变就得重新铺一次；
      // 粒子的几何要不要重建，统一交给 ResizeObserver 那边的 onLayoutChange 分流
      realign()
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
    window.addEventListener('resize', onResize)
    wrap.addEventListener('mousemove', onMouseMove, { passive: true })
    wrap.addEventListener('mouseleave', onMouseLeave)

    let resizeObserver = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        // ResizeObserver 在 observe() 之后会立刻回调一次，尺寸没变就直接忽略
        if (mount.clientWidth === lastW && mount.clientHeight === lastH) return
        onLayoutChange()
      })
      resizeObserver.observe(mount)
    }

    // 开场期间把山景层抬到加载界面的背景层之上（见 Hero.css 的 .hero--intro）
    if (heroEl && phase !== 'live') heroEl.classList.add('hero--intro')

    build()
    schedule()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      wrap.removeEventListener('mousemove', onMouseMove)
      wrap.removeEventListener('mouseleave', onMouseLeave)
      if (resizeObserver) resizeObserver.disconnect()
      if (heroEl) heroEl.classList.remove('hero--intro')
      wrap.classList.remove('mountain--full')
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
