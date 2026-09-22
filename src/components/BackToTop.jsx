import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../hooks/useCountUp.js'
import './BackToTop.css'

/* ==========================================================================
   回到顶部
   --------------------------------------------------------------------------
   右下角一个圆形的向上箭头：滚过一段距离才出现，点一下平滑滚回顶部。
   和导航栏同属"浮在内容之上"的一层，但都在开场遮罩（z-index 9989 起）之下，
   所以开场动画期间它不会冒出来。

   用 scroll 事件驱动、rAF 里只读一次 scrollY，并且值没变就不 setState ——
   滚动过程中几乎没有额外开销。
   ========================================================================== */

/** 滚过这么多像素才把它请出来 */
const SHOW_AFTER = 420

export default function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let raf = 0
    const read = () => {
      raf = 0
      const next = (window.scrollY || window.pageYOffset || 0) > SHOW_AFTER
      setVisible((prev) => (prev === next ? prev : next))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    read()
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  const toTop = () => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }

  return (
    <button
      type="button"
      className={`to-top${visible ? ' is-on' : ''}`}
      onClick={toTop}
      aria-label="回到顶部"
      title="回到顶部"
      tabIndex={visible ? 0 : -1}
      aria-hidden={visible ? undefined : 'true'}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 19.5V6M5.6 12.4 12 6l6.4 6.4" />
      </svg>
    </button>
  )
}
