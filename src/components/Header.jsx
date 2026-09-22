import { useEffect, useState } from 'react'
import { navLinks, site } from '../data/site.js'
import { INTRO_MS } from '../lib/particles.js'
import { prefersReducedMotion } from '../hooks/useCountUp.js'
import './Header.css'

/* ==========================================================================
   页眉 —— 它就是开场那根加载条
   --------------------------------------------------------------------------
   加载时它是屏幕底部的一条"页眉"：左边品牌、右边百分比、底下一条进度条；
   进度到 100% 时**不滑走，而是整体向上停进页眉的位置**，停稳后进度条向两端
   延伸成那条通栏细线，百分比淡出、导航链接淡入。之后它就是普通的吸顶页眉。

   之所以一个元素能演完全程：它始终是 `position: sticky; top: 0`（在文档流里
   占着页眉那 56px，所以页面内容不会因为它在屏幕底部而少一块），加载期间只是
   用 transform 把它"挪"到屏幕底部去 —— 到位那一刻既不用换元素，也不会让页面跳一下。

   时间轴（和粒子的归位对齐，改动请一起改）：
     0            → 进度 0 → 100%，遮罩盖着页面
     INTRO_MS     → 进度满：开始上移（遮罩同时上滑），粒子同时开始归位
     +RISE_MS     → 到位：进度条向两端延伸、百分比淡出、链接淡入
   ========================================================================== */

/** 上移到位用多久（必须和 Header.css 里 .is-rising 的 transition 一致） */
const RISE_MS = 900
/** 遮罩上滑用多久（同样要和 CSS 一致），滑完再把它从页面上摘掉 */
const CURTAIN_OUT_MS = 900

export default function Header() {
  // 开了「减少动态效果」就跳过整个开场：页眉一开始就在位、进度直接 100%
  const reduced = typeof window !== 'undefined' && prefersReducedMotion()
  const [pct, setPct] = useState(reduced ? 100 : 0)
  const [phase, setPhase] = useState(reduced ? 'extended' : 'loading')
  const [curtain, setCurtain] = useState(!reduced)

  useEffect(() => {
    if (reduced) return

    document.body.classList.add('is-locked')
    const start = performance.now()
    const timers = []
    let raf = 0

    const tick = (now) => {
      const p = Math.min(1, (now - start) / INTRO_MS)
      setPct(Math.round(p * 100))

      if (p < 1) {
        raf = requestAnimationFrame(tick)
        return
      }

      // 进度满了：解锁滚动、页眉开始上移、遮罩开始上滑
      document.body.classList.remove('is-locked')
      setPhase('rising')
      timers.push(setTimeout(() => setPhase('extended'), RISE_MS))
      timers.push(setTimeout(() => setCurtain(false), CURTAIN_OUT_MS + 200))
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      timers.forEach((t) => window.clearTimeout(t))
      document.body.classList.remove('is-locked')
    }
  }, [reduced])

  const ready = phase !== 'loading' && phase !== 'rising'

  return (
    <>
      {/* 纸色遮罩：单独一层，不能放进 header 里 —— header 加载时有 transform，
          会变成 fixed 定位的参照物 */}
      {curtain && (
        <div
          className={`load-bg${phase === 'loading' ? '' : ' is-done'}`}
          aria-hidden="true"
        />
      )}

      <header className={`header is-${phase}`}>
        <div className="header__inner">
          <a className="header__brand" href="#top" aria-label="回到顶部">
            <span className="header__mark">夏</span>
            <span className="header__name">
              夏祭
              <em>XIAJI</em>
            </span>
          </a>

          <div className="header__end">
            <nav className="header__links mono" aria-label="页面导航">
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} tabIndex={ready ? undefined : -1}>
                  {link.label}
                </a>
              ))}
            </nav>

            {/* 手机上导航收起，只留一个写信入口 */}
            <a
              className="header__mail mono"
              href={`mailto:${site.email}`}
              tabIndex={ready ? undefined : -1}
            >
              Mail
            </a>

            {/* 加载时的百分比：绝对定位压在链接那一格上，两者原地交叉淡变 */}
            <span className="header__pct mono">{String(pct).padStart(3, '0')}%</span>
          </div>
        </div>

        {/* 进度条：加载时是页眉底下那根短线，到位后向两端延伸成通栏细线 */}
        <div className="header__bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
      </header>
    </>
  )
}
