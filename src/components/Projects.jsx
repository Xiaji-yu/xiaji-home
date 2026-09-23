import { useCallback, useEffect, useRef, useState } from 'react'
import Reveal from './Reveal.jsx'
import { site } from '../data/site.js'
import { prefersReducedMotion } from '../hooks/useCountUp.js'
import './Projects.css'

function ProjectCard({ project }) {
  const ref = useRef(null)
  const [tilt, setTilt] = useState(null)
  const canTilt = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    canTilt.current =
      window.matchMedia('(pointer: fine)').matches && !prefersReducedMotion()
  }, [])

  const handleMove = useCallback((e) => {
    if (!canTilt.current) return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    setTilt({ x: -py * 7, y: px * 7 })
  }, [])

  const handleLeave = useCallback(() => setTilt(null), [])

  const transform = tilt
    ? `perspective(1100px) rotateX(${tilt.x.toFixed(2)}deg) rotateY(${tilt.y.toFixed(2)}deg) translateZ(6px)`
    : 'perspective(1100px)'

  return (
    <article
      ref={ref}
      className="card"
      style={{ transform }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <div className="card__top">
        <span className="card__id">{project.id}</span>
        <span className="card__id">{project.year}</span>
      </div>

      <h3 className="card__title">
        {project.title}
        <span className="card__titleCn">{project.titleCn}</span>
      </h3>

      <p className="card__desc">{project.desc}</p>

      <div className="card__tags">
        {project.tags.map((tag) => (
          <span className="card__tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>

      <div className="card__foot">
        <span>Case {project.id}</span>
        {project.link ? (
          <a className="card__link" href={project.link} target="_blank" rel="noreferrer">
            查看 →
          </a>
        ) : (
          <span>链接待补充</span>
        )}
      </div>
    </article>
  )
}

export default function Projects() {
  return (
    <section className="section" id="work">
      <div className="wrap">
        <Reveal className="sec-head">
          <span className="sec-head__num mono">03</span>
          <h2 className="sec-head__title">项目作品</h2>
          <span className="sec-head__en mono">Work</span>
        </Reveal>

        <Reveal as="p" className="sec-lead">
          下面三张卡片是占位内容 —— 换成你自己的项目就行，改 src/data/site.js 里 projects
          那一段。填上 link 之后，卡片右下角会自动变成可点击的链接。
        </Reveal>

        <div className="work__grid">
          {site.projects.map((project, i) => (
            <Reveal key={project.id} delay={70 + i * 60} className="grid-cell">
              <ProjectCard project={project} />
            </Reveal>
          ))}
        </div>

        <p className="work__hint mono">Hover / 悬停卡片试试 · 它们会跟着鼠标微微倾斜</p>
      </div>
    </section>
  )
}
