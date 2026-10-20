import { useProgress } from '../hooks/useCountUp.js'
import Reveal from './Reveal.jsx'
import { site } from '../data/site.js'
import './Skills.css'

/* play 由 Sections 给：每次切进「技能栈」这一章都会换一个新值，
   进度条和右边的百分比数字就用同一个 0→1 进度一起重播。 */
function SkillRow({ skill, index, play }) {
  const progress = useProgress(play, {
    duration: 1250,
    delay: 130 + index * 85,
  })
  const count = Math.round(skill.value * progress)

  return (
    <div className="skill reveal" style={{ '--d': `${70 + index * 55}ms` }}>
      <span className="skill__idx mono">{String(index + 1).padStart(2, '0')}</span>

      <span className="skill__name">
        {skill.name}
        <small>{skill.note}</small>
      </span>

      <span
        className="skill__bar"
        role="img"
        aria-label={`${skill.name} 熟练度 ${skill.value}%`}
      >
        <i style={{ width: `${skill.value * progress}%` }} />
      </span>

      <span className="skill__val mono" aria-hidden="true">
        {String(count).padStart(2, '0')}
      </span>
    </div>
  )
}

export default function Skills({ play = 0 }) {
  return (
    <section className="section" id="skills">
      <div className="wrap">
        <Reveal className="sec-head">
          <span className="sec-head__num mono">02</span>
          <h2 className="sec-head__title">技能栈</h2>
          <span className="sec-head__en mono">Skills</span>
        </Reveal>

        <div className="pane pane--skills">
          <Reveal as="p" className="sec-lead">
            下面的百分比是我自己的诚实估计，不是考试分数 ——
            数字会随着我学到的东西一直变。每次切到这一章，进度条都会从头再长一遍。
          </Reveal>

          <div className="skills__list">
            {site.skills.map((skill, i) => (
              <SkillRow key={skill.name} skill={skill} index={i} play={play} />
            ))}
          </div>

          <div className="pane__slot" aria-hidden="true" data-fig-scale="0.95" />
        </div>
      </div>
    </section>
  )
}
