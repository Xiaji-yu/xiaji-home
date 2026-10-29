import { useSite, useApiAvailable } from '../data/SiteContext.jsx'
import beianIcon from '../assets/beian-icon.png'
import './Footer.css'

const ADMIN_HREF = `${import.meta.env.BASE_URL}admin`

/**
 * 页脚小方块里的后台入口（GH / DC 那一排）。
 *   · 后端 /api 在跑才显示：纯静态托管上点进去也登不上，不如不摆
 *   · site.js 里已经配过 AD 的（老版本的写法）以数据为准，不重复渲染；
 *     配了但 href 是空的，就用内置的这一条补上链接
 *   · 没配过就插在第一个占位符（href 为空）之前，保持 ML / GH / AD / DC 的观感；
 *     全是有效链接时排到最后
 */
function withAdminEntry(list, apiAvailable) {
  const builtin = { code: 'AD', title: '内容后台', href: ADMIN_HREF }
  const own = list.find((item) => item.code === 'AD')
  if (!apiAvailable) {
    return own ? list.filter((item) => item !== own) : list
  }
  if (own) {
    return own.href ? list : list.map((item) => (item === own ? { ...builtin } : item))
  }
  const placeholder = list.findIndex((item) => !item.href)
  if (placeholder === -1) return [...list, builtin]
  return [...list.slice(0, placeholder), builtin, ...list.slice(placeholder)]
}

export default function Footer() {
  const site = useSite()
  const apiAvailable = useApiAvailable()
  const { footer } = site
  const socials = withAdminEntry(footer.socials || [], apiAvailable)

  return (
    <footer>
      {/* 上下的斜线阴影条：缓慢向左流动 */}
      <div className="hatch" aria-hidden="true" />

      <div className="foot__grid">
        <div className="foot__brand">
          <div>
            <div className="foot__brandTop">
              <span className="foot__mark">{site.name.slice(0, 1)}</span>
              <span className="foot__name">
                {site.name}
                <em>{site.nameEn}</em>
              </span>
            </div>
            <p className="foot__tagline" style={{ marginTop: 16 }}>
              {footer.tagline}
            </p>
          </div>

          <div className="foot__socials">
            {socials.map((item) =>
              item.href ? (
                <a
                  className="foot__social"
                  key={item.code}
                  href={item.href}
                  title={item.title}
                  aria-label={item.title}
                  {...(item.href.startsWith('http')
                    ? { target: '_blank', rel: 'noreferrer' }
                    : {})}
                >
                  {item.code}
                </a>
              ) : (
                <span className="foot__social" key={item.code} title={item.title}>
                  {item.code}
                </span>
              ),
            )}
          </div>
        </div>

        {footer.columns.map((col) => (
          <div className="foot__col" key={col.headEn}>
            <div className="foot__colHead mono">
              {col.head} · {col.headEn}
            </div>
            {col.links.map((link) =>
              link.href ? (
                <a
                  className="foot__link"
                  key={link.label}
                  href={link.href}
                  /* 站内路由（/agent-web、#notes）留在当前页；
                     外部站点在新窗口打开，避免把访客带离本站 */
                  {...(/^https?:\/\//i.test(link.href)
                    ? { target: '_blank', rel: 'noreferrer' }
                    : {})}
                >
                  {link.label}
                </a>
              ) : (
                /* 没有 href 的条目是说明文字（如"关于这一页"那一列），不是链接：
                   渲染成纯文本，点击没有反应，也不该有悬停翻转 */
                <span className="foot__link foot__link--plain" key={link.label}>
                  {link.label}
                </span>
              ),
            )}
          </div>
        ))}
      </div>

      <div className="hatch" aria-hidden="true" />

      <div className="foot__bottom mono">
        <span>{footer.copyright}</span>
        <span>{footer.credit}</span>
      </div>

      {/* 备案号：公安网安备（带盾牌图标）+ 工信部 ICP */}
      <div className="foot__beian mono">
        <a
          className="foot__beianLink"
          href={footer.beian.gaUrl}
          target="_blank"
          rel="noreferrer"
          title={footer.beian.gaLabel}
        >
          <img className="foot__beianIcon" src={beianIcon} alt="" width={16} height={18} />
          {footer.beian.gaNumber}
        </a>
        <a
          className="foot__beianLink"
          href={footer.beian.icpUrl}
          target="_blank"
          rel="noreferrer"
          title={footer.beian.icpLabel}
        >
          {footer.beian.icpNumber}
        </a>
      </div>
    </footer>
  )
}
