import { useEffect, useRef } from 'react'

/**
 * 元素进入视口时，给它加上 is-in 类（配合 CSS 做淡入上浮）
 * 用法：const ref = useReveal();  <div ref={ref} className="reveal" />
 */
export function useReveal(options) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in')
      return
    }

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            obs.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px', ...(options || {}) },
    )

    obs.observe(el)
    return () => obs.disconnect()
    // 只在挂载时建立一次观察
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return ref
}
