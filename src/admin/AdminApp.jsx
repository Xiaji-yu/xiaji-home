import { useEffect, useRef, useState } from 'react'
import FieldEditor from './FieldEditor.jsx'
import { SECTIONS, labelFor } from './sections.js'
import { defaultSite, defaultTabs, defaultNav } from '../data/SiteContext.jsx'
import './Admin.css'

/* ==========================================================================
   内容后台（/admin）
   --------------------------------------------------------------------------
   登录后表单化编辑全站文案：保存 = 写服务器 content/site.json（自动备份），
   前台刷新即生效，不用重新构建、不用上服务器改文件。
   导入 / 导出就是同一份 JSON：导出留档、换机器迁移、改坏了找回都用它。
   ========================================================================== */

const TOKEN_KEY = 'xiaji-home-admin-token'
const LAST_LOGIN_KEY = 'xiaji-home-last-login'
const BASE = import.meta.env.BASE_URL

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const clone = (v) => JSON.parse(JSON.stringify(v))

/** 时间显示：`10 月 29 日 14:05` 这种 */
function fmtTime(value) {
  if (!value) return '——'
  const d = new Date(value)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${p(d.getHours())}:${p(d.getMinutes())}`
}

const DEFAULT_CONTENT = {
  site: defaultSite,
  sectionTabs: defaultTabs,
  navLinks: defaultNav,
}

/** 不可变地写路径：setIn(draft, ['site','skills','0','name'], v) */
function setIn(obj, keys, value) {
  if (keys.length === 0) return value
  const [head, ...rest] = keys
  if (Array.isArray(obj)) {
    return obj.map((item, i) => (i === Number(head) ? setIn(item, rest, value) : item))
  }
  return { ...obj, [head]: setIn(obj?.[head], rest, value) }
}

/** 读取 content 里的路径值：getIn(draft, 'site.skills') */
function getIn(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj)
}

/** 导入的 JSON 兼容两种形状：完整 {site, sectionTabs, navLinks} 或裸 site 对象 */
function normalizeImport(json) {
  if (!isObj(json)) throw new Error('根节点必须是一个 JSON 对象')
  const content = isObj(json.site) ? json : { site: json }
  if (!isObj(content.site)) throw new Error('缺少 site 字段（或它不是对象）')
  return {
    site: content.site,
    sectionTabs: Array.isArray(content.sectionTabs) ? content.sectionTabs : defaultTabs,
    navLinks: Array.isArray(content.navLinks) ? content.navLinks : defaultNav,
  }
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export default function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  /* boot: loading → 拉内容 + 验 token；login / ready */
  const [boot, setBoot] = useState('loading')
  const [draft, setDraft] = useState(null)
  const [baseline, setBaseline] = useState(null)
  const [section, setSection] = useState(SECTIONS[0].id)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [keep, setKeep] = useState(false)
  const [busy, setBusy] = useState(false)
  const [capsOn, setCapsOn] = useState(false) // 大写锁定警告
  const [shake, setShake] = useState(false) // 口令错误时输入条抖动
  /* 会话信息面板的两条真实数据 */
  const [lastLogin, setLastLogin] = useState(() => localStorage.getItem(LAST_LOGIN_KEY))
  const [contentUpdatedAt, setContentUpdatedAt] = useState(null)
  const fileRef = useRef(null)

  const say = (kind, text) => setToast({ kind, text })
  useEffect(() => {
    if (!toast) return undefined
    const t = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(t)
  }, [toast])

  /* ---- 启动：验会话 + 拉当前内容（线上没有就用构建默认值） ---- */
  useEffect(() => {
    let aborted = false
    ;(async () => {
      let authed = false
      if (token) {
        try {
          const res = await fetch(`${BASE}api/admin/session`, {
            headers: { authorization: `Bearer ${token}` },
          })
          authed = res.ok
        } catch {
          authed = false
        }
      }
      if (!authed && token) {
        localStorage.removeItem(TOKEN_KEY)
        if (!aborted) setToken(null)
      }

      let content = DEFAULT_CONTENT
      try {
        const res = await fetch(`${BASE}api/content`)
        if (res.ok) {
          const data = await res.json()
          const c = data?.content
          if (data?.updatedAt && !aborted) setContentUpdatedAt(data.updatedAt)
          if (isObj(c?.site)) {
            content = {
              site: c.site,
              sectionTabs: Array.isArray(c.sectionTabs) ? c.sectionTabs : defaultTabs,
              navLinks: Array.isArray(c.navLinks) ? c.navLinks : defaultNav,
            }
          }
        }
      } catch {
        /* dev 里 vite 插件会接住这个请求，一般不会走到这 */
      }
      if (aborted) return
      setDraft(clone(content))
      setBaseline(clone(content))
      setBoot(authed ? 'ready' : 'login')
    })()
    return () => {
      aborted = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = draft && baseline && JSON.stringify(draft) !== JSON.stringify(baseline)

  /* 有未保存的修改就拦一下关标签页 */
  useEffect(() => {
    if (!dirty) return undefined
    const onLeave = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [dirty])

  /* ---- 登录 ---- */
  /** 检测大写锁定（键盘事件里同步到状态） */
  function checkCaps(e) {
    if (typeof e.getModifierState === 'function') {
      setCapsOn(e.getModifierState('CapsLock'))
    }
  }

  async function login(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`${BASE}api/admin/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password, remember: keep }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setShake(true) // 口令不对：输入条抖一下、底线变红
        say('err', data.error || '登录失败')
        return
      }
      localStorage.setItem(TOKEN_KEY, data.token)
      const stamp = String(Date.now())
      localStorage.setItem(LAST_LOGIN_KEY, stamp)
      setLastLogin(stamp)
      setToken(data.token)
      setBoot('ready')
      say('ok', '登录成功')
    } catch {
      say('err', '网络错误，连不上服务器')
    } finally {
      setBusy(false)
    }
  }

  function logout(message) {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setBoot('login')
    if (message) say('err', message)
  }

  /* ---- 保存 ---- */
  async function save() {
    if (!dirty || saving) return
    setSaving(true)
    try {
      const res = await fetch(`${BASE}api/content`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(draft),
      })
      if (res.status === 401) {
        logout('登录已过期，请重新登录（修改还在编辑器里）')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        say('err', data.error || '保存失败')
        return
      }
      setBaseline(clone(draft))
      say('ok', '已保存。前台刷新一下就能看到新内容')
    } catch {
      say('err', '网络错误，没保存上')
    } finally {
      setSaving(false)
    }
  }

  /* ---- 导出：下载当前编辑内容的 JSON ---- */
  function exportJson() {
    const blob = new Blob([JSON.stringify(draft, null, 2) + '\n'], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `site-content-${stamp()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ---- 导入：读本地 JSON 进编辑器（不自动保存，确认后才生效） ---- */
  async function importJson(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // 同一个文件再选一次也要触发 change
    if (!file) return
    try {
      const json = JSON.parse(await file.text())
      setDraft(normalizeImport(json))
      say('ok', '已导入编辑器。检查一遍，点「保存」才会真正生效')
    } catch (error) {
      say('err', `导入失败：${error.message}`)
    }
  }

  const current = SECTIONS.find((s) => s.id === section) || SECTIONS[0]

  /* ============================ 登录页 ============================ */
  if (boot !== 'ready') {
    return (
      <div className="adm-login">
        <div className="adm-login__tag mono">● CONTENT ADMIN</div>
        <div className="adm-login__tag adm-login__tag--r mono">PRIVATE AREA · 内部</div>
        <span className="adm-login__foot mono">
          {defaultSite.name} · {defaultSite.nameEn}
        </span>
        <span className="adm-login__foot adm-login__foot--r mono">
          ● SECURED · 口令认证
        </span>

        {/* 四角十字准星 + 屏幕两侧刻度尺（排版打样的对位标记语言） */}
        <i className="adm-login__mark adm-login__mark--tl" aria-hidden="true" />
        <i className="adm-login__mark adm-login__mark--tr" aria-hidden="true" />
        <i className="adm-login__mark adm-login__mark--bl" aria-hidden="true" />
        <i className="adm-login__mark adm-login__mark--br" aria-hidden="true" />
        <i className="adm-login__ticks adm-login__ticks--l" aria-hidden="true" />
        <i className="adm-login__ticks adm-login__ticks--r" aria-hidden="true" />

        {/* 面板：卡片边框向上下左右延伸至屏幕边缘（线条主题） */}
        <section className="adm-login__panel">
          {/* 卡片两侧的纵向标注线（图纸的尺寸标注语言） */}
          <i className="adm-login__vrules adm-login__vrules--l" aria-hidden="true" />
          <i className="adm-login__vrules adm-login__vrules--r" aria-hidden="true" />

          <i className="adm-login__rule adm-login__rule--t" aria-hidden="true" />
          <i className="adm-login__rule adm-login__rule--b" aria-hidden="true" />
          <i className="adm-login__rule adm-login__rule--l" aria-hidden="true" />
          <i className="adm-login__rule adm-login__rule--r" aria-hidden="true" />

          <div className="adm-login__card">
            <header className="adm-login__bar mono">
              <span>CONTENT ADMIN</span>
              <span>内容后台</span>
            </header>

            <form className="adm-login__form" onSubmit={login}>
              <div className="adm-login__no mono">
                <span>01 · AUTH</span>
                <span>密码认证</span>
              </div>

              <h1 className="adm-login__welcome">欢迎回来</h1>
              <p className="adm-login__sub">输入你设置的后台口令，进入内容工作台。</p>

              <div className="adm-login__labelrow">
                <label className="adm-login__label mono" htmlFor="adm-pass">
                  口令
                </label>
                <span className="adm-login__labelen mono">PASSWORD</span>
              </div>
              <div
                className={`adm-login__field${shake ? ' is-error' : ''}`}
                onAnimationEnd={() => setShake(false)}
              >
                <input
                  id="adm-pass"
                  className="adm-login__input"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  autoFocus
                  placeholder="输入后台口令"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={checkCaps}
                  onKeyUp={checkCaps}
                  onBlur={() => setCapsOn(false)}
                />
                <button
                  type="button"
                  className="adm-login__show mono"
                  onClick={() => setShowPass((v) => !v)}
                >
                  {showPass ? '隐藏' : '显示'}
                </button>
                <i className="adm-login__caret" aria-hidden="true" />
              </div>
              {capsOn && (
                <p className="adm-login__caps mono" role="status">
                  ⚠ CAPS LOCK · 大写锁定已开启
                </p>
              )}

              {/* 保持登录：勾选后 token 发 30 天（默认 12 小时） */}
              <div className="adm-login__keeprow">
                <label className="adm-login__keep">
                  <input
                    type="checkbox"
                    checked={keep}
                    onChange={(e) => setKeep(e.target.checked)}
                  />
                  <i aria-hidden="true" />
                  <span className="mono">保持登录 · 30 天</span>
                </label>
                <span className="adm-login__ses mono">{keep ? '30 天' : '12 小时'}</span>
              </div>

              <button
                className="adm-login__submit"
                type="submit"
                disabled={!password || busy}
              >
                {busy ? '验证中…' : '进入后台'}
              </button>

              {import.meta.env.DEV && (
                <p className="adm-login__devhint mono">开发环境默认口令：admin</p>
              )}

              {/* 会话信息面板：左会话 · 右内容 —— 纵向分隔线贯穿全屏 */}
              <div className="adm-login__session">
                <div className="adm-login__sesscol">
                  <span className="adm-login__sesskey mono">SESSION · 本次会话</span>
                  <span className="adm-login__sessval mono">
                    {keep ? '30 天免登录' : '12 小时'}
                  </span>
                  <span className="adm-login__sesskey mono">上次登录</span>
                  <span className="adm-login__sessval mono">{fmtTime(lastLogin)}</span>
                </div>
                <div className="adm-login__sesscol">
                  <span className="adm-login__sesskey mono">CONTENT · 线上内容</span>
                  <span className="adm-login__sessval mono">
                    {contentUpdatedAt
                      ? `更新于 ${fmtTime(contentUpdatedAt)}`
                      : '未自定义 · 用构建默认'}
                  </span>
                  <span className="adm-login__sesskey mono">凭据签名</span>
                  <span className="adm-login__sessval mono">HMAC-SHA256</span>
                </div>
              </div>

              <div className="adm-login__row mono">
                <a href={BASE}>← 返回首页</a>
                <span>仅限站主使用</span>
              </div>
            </form>
          </div>
        </section>

        {toast && <div className={`adm-toast adm-toast--${toast.kind}`}>{toast.text}</div>}
      </div>
    )
  }

  /* ============================ 编辑器 ============================ */
  return (
    <div className="adm-page adm-page--app">
      <header className="adm-top">
        <div className="adm-top__brand">
          <span className="adm-top__dot" data-on={dirty ? '1' : '0'} />
          内容后台
          {dirty && <em className="mono">有未保存的修改</em>}
        </div>
        <div className="adm-top__ops">
          <a className="adm-btn" href={BASE} target="_blank" rel="noreferrer">
            查看站点
          </a>
          <button
            className="adm-btn"
            type="button"
            onClick={() => fileRef.current?.click()}
          >
            导入
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={importJson}
          />
          <button className="adm-btn" type="button" onClick={exportJson}>
            导出
          </button>
          <button
            className="adm-btn"
            type="button"
            disabled={!dirty}
            onClick={() => setDraft(clone(baseline))}
            title="丢弃未保存的修改，回到服务器上的版本"
          >
            撤销修改
          </button>
          <button className="adm-btn" type="button" onClick={() => logout()}>
            退出
          </button>
          <button
            className="adm-btn adm-btn--solid"
            type="button"
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? '保存中…' : dirty ? '保存' : '已保存'}
          </button>
        </div>
      </header>

      <div className="adm-body">
        <nav className="adm-nav" aria-label="内容分区">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`adm-nav__item${s.id === section ? ' is-on' : ''}`}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <main className="adm-main">
          <div className="adm-main__head">
            <h2>{current.label}</h2>
            <p>{current.desc}</p>
          </div>
          {current.fields.map((path) => (
            <section className="adm-group" key={path}>
              <h3 className="adm-group__label mono">
                {labelFor(path.replace(/^site\./, ''))}
              </h3>
              <FieldEditor
                path={path.replace(/^site\./, '')}
                value={getIn(draft, path)}
                onChange={(next) => setDraft((d) => setIn(d, path.split('.'), next))}
              />
            </section>
          ))}
        </main>
      </div>

      {toast && <div className={`adm-toast adm-toast--${toast.kind}`}>{toast.text}</div>}
    </div>
  )
}
