import { useEffect } from 'react'
import Header from './components/Header.jsx'
import Sections from './components/Sections.jsx'
import Cursor from './components/Cursor.jsx'
import BackToTop from './components/BackToTop.jsx'
import Hero from './components/Hero.jsx'
import Footer from './components/Footer.jsx'

/**
 * 页面从上到下的顺序，就是下面这个顺序。
 * 想调整板块先后，直接把这几行换位置即可。
 */
export default function App() {
  /* 首屏那条状态栏的高度随字号/换行会变，量出来写进 --status-h ——
     板块高度和滚动落点都用它算（见 tokens.css / base.css） */
  useEffect(() => {
    const measure = () => {
      const el = document.querySelector('.hero__status')
      if (!el) return
      const h = Math.round(el.getBoundingClientRect().height)
      if (h > 0) document.documentElement.style.setProperty('--status-h', `${h}px`)
    }
    measure()
    window.addEventListener('resize', measure)
    document.fonts?.ready?.then(measure).catch(() => {})
    return () => window.removeEventListener('resize', measure)
  }, [])

  return (
    <>
      {/* 页眉同时是开场那根加载条（见 components/Header.jsx）；
          另外两个浮在最上层的东西：自定义光标、右下角的回到顶部 */}
      <Header />
      <Cursor />
      <BackToTop />

      <main>
        <Hero />
        {/* 六个板块装进左侧选项卡（见 components/Sections.jsx） */}
        <Sections />
      </main>

      <Footer />
    </>
  )
}
