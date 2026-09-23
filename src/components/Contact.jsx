import Reveal from './Reveal.jsx'
import { site } from '../data/site.js'
import './Contact.css'

function ChannelCard({ channel }) {
  const inner = (
    <span className="channel__inner">
      <span className="channel__label">{channel.label}</span>
      <span className="channel__value">{channel.value}</span>
      <span className="channel__row">
        <span className="channel__note">{channel.note}</span>
        <span className="channel__arrow" aria-hidden="true">
          ↗
        </span>
      </span>
    </span>
  )

  // 没填链接的通道，就渲染成一个静态卡片，不放空链接
  if (!channel.href) {
    return (
      <div className="channel" tabIndex={0}>
        {inner}
      </div>
    )
  }

  const external = channel.href.startsWith('http')
  return (
    <a
      className="channel"
      href={channel.href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {inner}
    </a>
  )
}

export default function Contact() {
  const { contact } = site

  return (
    <section className="section" id="contact">
      <div className="wrap">
        <Reveal className="sec-head">
          <span className="sec-head__num mono">05</span>
          <h2 className="sec-head__title">联系方式</h2>
          <span className="sec-head__en mono">Contact</span>
        </Reveal>

        {/* 头部统一成"一句引导"（跟关于我 / 技能栈 / 作品 / 经历 一个语法）*/}
        <Reveal as="p" className="sec-lead">
          {contact.headline}
          {contact.sub}
        </Reveal>

        <div className="contact__grid">
          {contact.channels.map((channel, i) => (
            <Reveal key={channel.label} delay={70 + i * 60} className="grid-cell">
              <ChannelCard channel={channel} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
