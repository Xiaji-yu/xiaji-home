import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../hooks/useCountUp.js'
import './Preloader.css'

const DURATION = 1500 // 进度条走完需要的毫秒数
const EXIT_DELAY = 900 // 滑走动画结束后，再过多久把它从页面上彻底移除

export default function Preloader() {
  const [pct, setPct] = useState(0)
  const [done, setDone] = useState(false)
  const [removed, setRemoved] = useState(false)

  useEffect(() => {
    // 系统开了「减少动态效果」就直接跳过开场动画
    if (prefersReducedMotion()) {
      setRemoved(true)
      return
    }

    document.body.classList.add('is-locked')
    const start = performance.now()
    let raf = 0
    let timer = 0

    const tick = (now) => {
      const p = Math.min(1, (now - start) / DURATION)
      setPct(Math.round(p * 100))
      if (p < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        document.body.classList.remove('is-locked')
        setDone(true)
        timer = window.setTimeout(() => setRemoved(true), EXIT_DELAY)
      }
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      document.body.classList.remove('is-locked')
    }
  }, [])

  if (removed) return null

  return (
    <div className={`pre${done ? ' is-done' : ''}`} aria-hidden="true">
      <div className="pre__inner">
        <div className="pre__mark">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="pre__meta mono">
          <span>夏祭 / XIAJI</span>
          <span>{String(pct).padStart(3, '0')}%</span>
        </div>
        <div className="pre__bar">
          <i style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
      </div>
    </div>
  )
}
