import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../hooks/useCountUp.js'
import './Cursor.css'

/**
 * 圆圈跟随光标。
 * 只在「有精确指针（鼠标）」且没开减少动效的设备上启用；
 * 手机上会完全消失，不会留下一个卡住的圆圈。
 */
export default function Cursor() {
  const ringRef = useRef(null)
  const dotRef = useRef(null)
  const [enabled, setEnabled] = useState(false)

  // 判断设备类型
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(pointer: fine)')
    const update = () => setEnabled(mq.matches && !prefersReducedMotion())
    update()
    if (mq.addEventListener) mq.addEventListener('change', update)
    else mq.addListener(update)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', update)
      else mq.removeListener(update)
    }
  }, [])

  // 只在真正启用自定义光标时，才把系统箭头藏掉
  useEffect(() => {
    const root = document.documentElement
    if (enabled) root.classList.add('has-cursor-none')
    else root.classList.remove('has-cursor-none')
    return () => root.classList.remove('has-cursor-none')
  }, [enabled])

  useEffect(() => {
    if (!enabled) return

    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const ring = { x: target.x, y: target.y }
    let raf = 0

    const onMove = (e) => {
      target.x = e.clientX
      target.y = e.clientY
      // 小黑点直接跟手，不做缓动
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`
      }
    }

    const onOver = (e) => {
      const el = e.target
      if (!el || typeof el.closest !== 'function') return
      const hit = el.closest('a, button, input, textarea, select, [data-cursor="hover"]')
      const hovering = Boolean(hit)
      if (ringRef.current) ringRef.current.classList.toggle('is-hover', hovering)
      if (dotRef.current) dotRef.current.classList.toggle('is-hover', hovering)
    }

    const loop = () => {
      // 圆环用插值追赶，形成一点点拖尾
      ring.x += (target.x - ring.x) * 0.16
      ring.y += (target.y - ring.y) * 0.16
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ring.x.toFixed(2)}px, ${ring.y.toFixed(2)}px, 0)`
      }
      raf = requestAnimationFrame(loop)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mouseover', onOver, true)
    raf = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseover', onOver, true)
      cancelAnimationFrame(raf)
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <>
      <div ref={ringRef} className="cur-ring" aria-hidden="true" />
      <div ref={dotRef} className="cur-dot" aria-hidden="true" />
    </>
  )
}
