import { useEffect, useState } from 'react'

/** 系统是否开启了「减少动态效果」 */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * 数字从 0 增长到 target（技能百分比用的就是这个）
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
