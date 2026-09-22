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

        <div className="about__grid">
          <div className="about__body">
            <Reveal as="p" className="about__lead">
              {about.lead}
            </Reveal>

            {about.paragraphs.map((text, i) => (
              <Reveal as="p" key={text} delay={80 + i * 70}>
                {text}
              </Reveal>
            ))}
          </div>

          <Reveal className="about__facts" delay={120}>
            <dl style={{ margin: 0 }}>
              {about.facts.map(([label, value]) => (
                <div className="about__fact" key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {label === '邮箱' ? <a href={`mailto:${value}`}>{value}</a> : value}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
