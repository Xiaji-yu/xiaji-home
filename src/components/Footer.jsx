import { site } from '../data/site.js'
import beianIcon from '../assets/beian-icon.png'
import './Footer.css'

export default function Footer() {
  const { footer } = site
  const socials = footer.socials || []

  return (
    <footer>
      {/* 上下的斜线阴影条：缓慢向左流动 */}
      <div className="hatch" aria-hidden="true" />

      <div className="foot__grid">
        <div className="foot__brand">
          <div>
            <div className="foot__brandTop">
              <span className="foot__mark">夏</span>
              <span className="foot__name">
                夏祭
                <em>XIAJI</em>
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
                <a className="foot__link" key={link.label} href={link.href}>
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
