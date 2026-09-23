import { useInView } from '../hooks/useInView.js'
import { useCountUp } from '../hooks/useCountUp.js'
import Reveal from './Reveal.jsx'
import { site } from '../data/site.js'
import './Skills.css'

function SkillRow({ skill, index }) {
  const [ref, inView] = useInView({ threshold: 0.4 })
  const count = useCountUp(skill.value, inView)

  return (
    <div className="skill reveal" ref={ref} style={{ '--d': `${70 + index * 55}ms` }}>
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
        <i
          style={{
            width: inView ? `${skill.value}%` : 0,
            transitionDelay: `${index * 70}ms`,
          }}
        />
      </span>

      <span className="skill__val mono">{String(count).padStart(2, '0')}</span>
    </div>
  )
}

export default function Skills() {
  return (
    <section className="section" id="skills">
      <div className="wrap">
        <Reveal className="sec-head">
          <span className="sec-head__num mono">02</span>
          <h2 className="sec-head__title">技能栈</h2>
          <span className="sec-head__en mono">Skills</span>
        </Reveal>

        <Reveal as="p" className="sec-lead">
          下面的百分比是我自己的诚实估计，不是考试分数 ——
          数字会随着我学到的东西一直变。把鼠标放到某一行上，可以看到它对应的方向。
        </Reveal>

        <div className="skills__list">
          {site.skills.map((skill, i) => (
            <SkillRow key={skill.name} skill={skill} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
