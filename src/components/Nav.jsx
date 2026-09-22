import { navLinks, site } from '../data/site.js'
import './Nav.css'

export default function Nav() {
  return (
    <header className="nav">
      <div className="nav__inner">
        <a className="nav__brand" href="#top" aria-label="回到顶部">
          <span className="nav__mark">夏</span>
          <span className="nav__name">
            夏祭
            <em>XIAJI</em>
          </span>
        </a>

        <nav className="nav__links mono" aria-label="页面导航">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        {/* 手机上导航收起，只留一个写信入口 */}
        <a className="nav__mail mono" href={`mailto:${site.email}`}>
          Mail
        </a>
      </div>
    </header>
  )
}
