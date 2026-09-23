import { useReveal } from '../hooks/useReveal.js'
import Reveal from './Reveal.jsx'
import { site } from '../data/site.js'
import './Timeline.css'

function TimelineItem({ item, index }) {
  const ref = useReveal({ threshold: 0.3 })

  return (
    <div className="tl__item reveal" ref={ref} style={{ '--d': `${70 + index * 55}ms` }}>
      <span className="tl__marker" aria-hidden="true" />
      <span className="tl__year">{item.year}</span>
      <div>
        <h3 className="tl__title">{item.title}</h3>
        <p className="tl__text">{item.text}</p>
      </div>
    </div>
  )
}

export default function Timeline() {
  return (
    <section className="section" id="journey">
      <div className="wrap">
        <Reveal className="sec-head">
          <span className="sec-head__num mono">04</span>
          <h2 className="sec-head__title">经历</h2>
          <span className="sec-head__en mono">Journey</span>
        </Reveal>

        <div className="pane pane--journey">
          <div className="pane__slot" aria-hidden="true" data-fig-scale="0.9" />

          <Reveal as="p" className="sec-lead">
            时间线是我自己记的。比起"做了多厉害的事"，"什么时候开始做"往往更值得记住。
          </Reveal>

          <div className="tl">
            {site.timeline.map((item, i) => (
              <TimelineItem key={item.year} item={item} index={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
