import { useEffect, useRef, useState } from 'react'

/**
 * 元素是否已经进入过视口（进入过就一直为 true）
 * 用法：const [ref, inView] = useInView()
 */
export function useInView(options) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true)
            obs.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.25, ...(options || {}) },
    )
    obs.observe(el)
    return () => obs.disconnect()
    // 只在挂载时建立一次观察；options 是调用方传入的初始配置，不需要响应式
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return [ref, inView]
}
