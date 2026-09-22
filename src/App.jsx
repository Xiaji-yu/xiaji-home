import Header from './components/Header.jsx'
import Cursor from './components/Cursor.jsx'
import BackToTop from './components/BackToTop.jsx'
import Hero from './components/Hero.jsx'
import About from './components/About.jsx'
import Skills from './components/Skills.jsx'
import Projects from './components/Projects.jsx'
import Timeline from './components/Timeline.jsx'
import Contact from './components/Contact.jsx'
import Notes from './components/Notes.jsx'
import Footer from './components/Footer.jsx'

/**
 * 页面从上到下的顺序，就是下面这个顺序。
 * 想调整板块先后，直接把这几行换位置即可。
 */
export default function App() {
  return (
    <>
      {/* 页眉同时是开场那根加载条（见 components/Header.jsx）；
          另外两个浮在最上层的东西：自定义光标、右下角的回到顶部 */}
      <Header />
      <Cursor />
      <BackToTop />

      <main>
        <Hero />
        <About />
        <Skills />
        <Projects />
        <Timeline />
        <Contact />
        <Notes />
      </main>

      <Footer />
    </>
  )
}
