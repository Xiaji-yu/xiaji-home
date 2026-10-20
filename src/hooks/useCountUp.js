import { useEffect, useState } from 'react'

/** 系统是否开启了「减少动态效果」 */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * 0 → 1 的进度（进度条和数字共用，所以两者永远同步）。
 * play 每换一个新值就从头跑一遍 —— 切板块时用它重播。
 * 用法：const p = useProgress(play, { duration: 1250, delay: 120 })
 */
export function useProgress(play, { duration = 1250, delay = 0 } = {}) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // play 为 0 / false：回到起点（切走的那一章慢慢归零，反正看不见）
    if (!play) {
      setProgress(0)
      return
    }
    if (prefersReducedMotion()) {
      setProgress(1)
      return
    }
    let raf = 0
    let start = 0
    setProgress(0)
    const tick = (now) => {
      if (!start) start = now
      const t = Math.max(0, Math.min(1, (now - start - delay) / duration))
      setProgress(1 - Math.pow(1 - t, 3)) // 缓出，和进度条共用同一条曲线
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [play, duration, delay])

  return progress
}

/**
 * 数字从 0 增长到 target
 * 用法：const n = useCountUp(82, inView)
 */
export function useCountUp(target, active, duration = 1300) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!active) return
    if (prefersReducedMotion()) {
      setValue(target)
      return
    }
    let raf = 0
    let start = 0
    const tick = (now) => {
      if (!start) start = now
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3) // 缓出：先快后慢
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, target, duration])

  return value
}
