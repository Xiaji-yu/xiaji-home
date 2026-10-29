import { useEffect, useState } from 'react'
import { useApiAvailable } from '../data/SiteContext.jsx'
import './AdminEntry.css'

/* ==========================================================================
   内容后台入口（左下角「AD」）
   --------------------------------------------------------------------------
   只有后端 /api 真的在跑（自托管）时才出现：GitHub Pages 这类纯静态托管上
   没有登录接口，摆一个点进去登不上的按钮只是添乱。
   按钮和「回到顶部」同属浮层（z-index 800）：避开页眉（900）和开场遮罩。
   页脚露头时自动收起 —— 备案号就贴在左下角，别压着它。
   ========================================================================== */

export default function AdminEntry() {
  const apiAvailable = useApiAvailable()
  const [nearFooter, setNearFooter] = useState(false)

  useEffect(() => {
    if (!apiAvailable) return undefined
    const footer = document.querySelector('footer')
    if (!footer || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(([entry]) => setNearFooter(entry.isIntersecting), {
      threshold: 0.12,
    })
    io.observe(footer)
    return () => io.disconnect()
  }, [apiAvailable])

  if (!apiAvailable) return null

  return (
    <a
      className={`ad-entry${nearFooter ? ' is-hidden' : ''}`}
      href={`${import.meta.env.BASE_URL}admin`}
      aria-label="内容后台"
      aria-hidden={nearFooter ? 'true' : undefined}
      tabIndex={nearFooter ? -1 : 0}
      title="内容后台（/admin）"
    >
      <span aria-hidden="true">AD</span>
    </a>
  )
}
