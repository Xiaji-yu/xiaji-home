import Reveal from './Reveal.jsx'
import { site } from '../data/site.js'
import './About.css'

export default function About() {
  const { about } = site

  return (
    <section className="section" id="about">
      <div className="wrap">
        <Reveal className="sec-head">
          <span className="sec-head__num mono">01</span>
          <h2 className="sec-head__title">关于我</h2>
          <span className="sec-head__en mono">About</span>
        </Reveal>

        <div className="pane pane--about">
          <div className="about__body">
            <Reveal as="p" className="about__lead">
              {about.lead}
            </Reveal>

            {about.paragraphs.map((text, i) => (
              <Reveal as="p" key={text} delay={70 + i * 60}>
                {text}
              </Reveal>
            ))}
          </div>

          <Reveal className="about__facts" delay={250}>
            <dl style={{ margin: 0 }}>
              {about.facts.map(([label, value]) => {
                const isLink = /^https?:\/\//.test(value)
                return (
                  <div className="about__fact" key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {isLink ? (
                        <a href={value} target="_blank" rel="noopener noreferrer">
                          {value.replace(/^https?:\/\//, '')}
                        </a>
                      ) : label === '邮箱' ? (
                        <a href={`mailto:${value}`}>{value}</a>
                      ) : (
                        value
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </Reveal>

          {/* 留白穴：粒子图形嵌在这里（位置由 Sections.css 的 .pane--about 定）*/}
          <div className="pane__slot" aria-hidden="true" data-fig-scale="1" />
        </div>
      </div>
    </section>
  )
}
