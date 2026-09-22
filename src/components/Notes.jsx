import { useCallback, useEffect, useState } from 'react'
import Reveal from './Reveal.jsx'
import { site } from '../data/site.js'
import './Notes.css'

/* ==========================================================================
   便签墙
   --------------------------------------------------------------------------
   重要说明：这是一个纯静态页面，没有服务器。所以便签只能存在
   "你自己这台浏览器" 里（localStorage）。刷新、关掉再打开都还在，
   但别人访问这个页面看不到你写的，你也看不到别人写的。
   想做成真的多人共享留言板，就需要后端服务，那是另一个工程了。
   ========================================================================== */

const STORAGE_KEY = 'xiaji-notes-v1'
const MAX_NOTES = 60

function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((n) => n && typeof n.text === 'string' && n.text.trim())
      .slice(0, MAX_NOTES)
  } catch {
    // 浏览器的隐私模式可能会禁用 localStorage，这里静默降级
    return []
  }
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatTime(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

let seq = 0
function makeId() {
  seq += 1
  return `${Date.now().toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export default function Notes() {
  const { notes: config } = site
  const max = config.maxLength || 100

  const [ready, setReady] = useState(false)
  const [items, setItems] = useState([])
  const [text, setText] = useState('')
  const [who, setWho] = useState('')

  // 打开页面时，从本地读回之前写的便签
  useEffect(() => {
    setItems(readStored())
    setReady(true)
  }, [])

  // 便签一变，就写回本地
  useEffect(() => {
    if (!ready) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      /* 存不进去就算了，不影响页面使用 */
    }
  }, [items, ready])

  const submit = useCallback(
    (e) => {
      if (e) e.preventDefault()
      const value = text.trim()
      if (!value) return

      setItems((prev) =>
        [
          {
            id: makeId(),
            name: who.trim() || '匿名',
            text: value.slice(0, max),
            time: Date.now(),
          },
          ...prev,
        ].slice(0, MAX_NOTES),
      )
      setText('')
      setWho('')
    },
    [text, who, max],
  )

  const remove = useCallback((id) => {
    setItems((prev) => prev.filter((note) => note.id !== id))
  }, [])

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e)
  }

  const remaining = max - text.length

  return (
    <section className="section" id="notes">
      <div className="wrap">
        <Reveal className="sec-head">
          <span className="sec-head__num mono">06</span>
          <h2 className="sec-head__title">留言便签</h2>
          <span className="sec-head__en mono">Notes</span>
        </Reveal>

        <Reveal as="h3" className="section-headline">
          {config.headline}
        </Reveal>
        <Reveal as="p" className="section-sub" delay={80}>
          {config.sub}
        </Reveal>

        <Reveal as="form" className="notes__form" delay={120} onSubmit={submit}>
          <div className="notes__field">
            <label className="mono" htmlFor="note-text">
              便签内容 · 最多 {max} 字
            </label>
            <textarea
              id="note-text"
              className="notes__textarea"
              maxLength={max}
              placeholder={config.placeholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>

          <div className="notes__side">
            <input
              className="notes__name"
              type="text"
              maxLength={18}
              placeholder="署名（不填就是匿名）"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              onKeyDown={onKeyDown}
            />

            <div className={`notes__meta mono${remaining <= 10 ? ' is-over' : ''}`}>
              <span>{remaining} 字剩余</span>
              <span>⌘/Ctrl + ↵</span>
            </div>

            <button
              className="btn btn--solid notes__submit"
              type="submit"
              disabled={!text.trim()}
            >
              <span>贴上去</span>
            </button>
          </div>
        </Reveal>

        <div className="notes__wall">
          {ready && items.length === 0 && (
            <div className="notes__empty">
              <div className="notes__ghost">这里是空的</div>
              <div className="notes__ghost">第一张便签，留给你</div>
              <div className="notes__ghost">最多 {max} 字</div>
            </div>
          )}

          {items.map((note) => (
            <article className="note" key={note.id}>
              <header className="note__head">
                <span className="note__who">{note.name}</span>
                <span className="note__when">{formatTime(note.time)}</span>
              </header>
              <p className="note__text">{note.text}</p>
              <button
                className="note__del"
                type="button"
                aria-label="撕掉这张便签"
                title="撕掉这张便签"
                onClick={() => remove(note.id)}
              >
                ×
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
