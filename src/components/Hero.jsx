import { useEffect, useRef } from 'react'
import DotMountain from './DotMountain.jsx'
import { site } from '../data/site.js'
import { prefersReducedMotion } from '../hooks/useCountUp.js'
import './Hero.css'

export default function Hero() {
  const stageRef = useRef(null)
  const mountRef = useRef(null)
  const titleRef = useRef(null)

  /* ---- 鼠标视差：山景和标题随鼠标做反向/同向的轻微位移 ---- */
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const fine = window.matchMedia('(pointer: fine)').matches
    if (!fine || prefersReducedMotion()) return

    const target = { x: 0, y: 0 }
    const cur = { x: 0, y: 0 }
    let raf = 0

    const onMove = (e) => {
      target.x = (e.clientX / window.innerWidth) * 2 - 1 // -1 ~ 1
      target.y = (e.clientY / window.innerHeight) * 2 - 1
    }

    const loop = () => {
      // 插值，让移动有一点惯性，不会生硬
      cur.x += (target.x - cur.x) * 0.07
      cur.y += (target.y - cur.y) * 0.07

      if (mountRef.current) {
        mountRef.current.style.transform = `translate3d(${(-cur.x * 16).toFixed(2)}px, ${(-cur.y * 10).toFixed(2)}px, 0)`
      }
      if (titleRef.current) {
        titleRef.current.style.transform = `translate3d(${(cur.x * 7).toFixed(2)}px, ${(cur.y * 5).toFixed(2)}px, 0)`
      }
      raf = requestAnimationFrame(loop)
    }

    let running = false

    const start = () => {
      if (running) return
      running = true
      raf = requestAnimationFrame(loop)
    }

    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
      raf = 0
    }

    // 只有首屏在视野里的时候才跑动画，滚下去之后自动停，省电
    let observer = null
    if (typeof IntersectionObserver !== 'undefined' && stageRef.current) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) start()
            else stop()
          })
        },
        { threshold: 0 },
      )
      observer.observe(stageRef.current)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    start()

    return () => {
      window.removeEventListener('mousemove', onMove)
      stop()
      if (observer) observer.disconnect()
    }
  }, [])

  return (
    <section className="hero" id="top">
      <div className="hero__inner" ref={titleRef}>
        <h1 className="hero__title">
          {site.heroTitle.map((line) => (
            <span className="hero__line" key={line}>
              <span>{line}</span>
            </span>
          ))}
        </h1>

        <p className="hero__sub">{site.heroSub}</p>

        <div className="hero__cta">
          {site.heroCta.map((cta) => (
            <a
              key={cta.label}
              className={`btn${cta.solid ? ' btn--solid' : ''}`}
              href={cta.href}
            >
              <span>{cta.label}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="hero__stage" ref={stageRef}>
        <div className="hero__mount" ref={mountRef}>
          <DotMountain />
        </div>
        <div className="hero__grid" aria-hidden="true" />
      </div>

      <div className="hero__status mono">
        <span>{site.heroStatus.left}</span>
        <span>{site.heroStatus.right}</span>
      </div>
    </section>
  )
}
