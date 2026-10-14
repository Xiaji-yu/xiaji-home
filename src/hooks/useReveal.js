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

    // 兜底定时器统一记下来：元素可能撑不到 1.5s 就被卸载
    // （切板块、条件渲染），不清的话回调会拿着已分离的节点跑
    const timers = new Set()

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            obs.unobserve(entry.target)
            // will-change 只是过渡期间的提升提示，过渡一结束就还回去（见 base.css）。
            // 不监听 transitionend：超时兜底更简单，且 reduced-motion 下也照样走到
            const t = window.setTimeout(() => {
              timers.delete(t)
              entry.target.classList.add('is-done')
            }, 1500)
            timers.add(t)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px', ...(options || {}) },
    )

    obs.observe(el)
    return () => {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
      obs.disconnect()
    }
    // 只在挂载时建立一次观察
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return ref
}
