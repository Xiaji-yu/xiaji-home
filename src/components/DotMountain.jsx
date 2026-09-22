import { useEffect, useRef } from 'react'
import { renderMountain } from '../lib/dither.js'
import './DotMountain.css'

/**
 * 用 Canvas 现场算出一座点阵噪点山。
 * 整页没有用任何图片素材，这座山是浏览器纯靠数学算出来的。
 */
const CELL = 3 // 一个"点阵方块"在屏幕上大约占几像素

export default function DotMountain({ className = '' }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    let raf = 0

    const draw = () => {
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      if (!w || !h) return
      const cols = Math.max(2, Math.round(w / CELL))
      const rows = Math.max(2, Math.round(h / CELL))
      renderMountain(canvas, cols, rows)
    }

    // 首帧先画一次，让画面尽快出现（字体还没加载完就先看到山）
    raf = requestAnimationFrame(draw)

    // 窗口尺寸变化时重画（防抖：合并到同一帧）
    let resizeObs = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(() => {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(draw)
      })
      resizeObs.observe(wrap)
    } else {
      window.addEventListener('resize', draw)
    }

    // 等 Web 字体就绪后再画一次，保证尺寸测量是准的
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(draw)
      })
    }

    return () => {
      cancelAnimationFrame(raf)
      if (resizeObs) resizeObs.disconnect()
      else window.removeEventListener('resize', draw)
    }
  }, [])

  return (
    <div ref={wrapRef} className={`mountain ${className}`.trim()} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  )
}
