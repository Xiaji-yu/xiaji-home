import { useEffect, useRef, useState } from 'react'
import FieldEditor from './FieldEditor.jsx'
import FontManager from './FontManager.jsx'
import { SECTIONS, labelFor } from './sections.js'
import { localFonts } from '../data/fonts.js'
import {
  defaultSite,
  defaultTabs,
  defaultNav,
  deepMerge,
  normalizeFontList,
} from '../data/SiteContext.jsx'
import './Admin.css'

/* ==========================================================================
   内容后台（/admin）
   --------------------------------------------------------------------------
   登录后表单化编辑全站文案：保存 = 写服务器 content/site.json（自动备份），
   前台刷新即生效，不用重新构建、不用上服务器改文件。
   导入 / 导出就是同一份 JSON：导出留档、换机器迁移、改坏了找回都用它。

   口令：仓库自带默认口令，第一次登录必须改成自己的（服务端同样会拦：
   没改之前 PUT /api/content 直接 403），改完哈希落盘在服务器上。
   ========================================================================== */

const TOKEN_KEY = 'xiaji-home-admin-token'
const LAST_LOGIN_KEY = 'xiaji-home-last-login'
const BASE = import.meta.env.BASE_URL
/* 与 server/auth.cjs 的 MIN_LENGTH 保持一致 */
const MIN_PASSWORD_LENGTH = 10

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const clone = (v) => JSON.parse(JSON.stringify(v))

/** 时间显示：`10 月 29 日 14:05` 这种 */
function fmtTime(value) {
  if (!value) return '——'
  /* localStorage 里存的是 `String(Date.now())`：13 位数字串不是合法日期字符串，
     直接 new Date('1759…') 会得到 Invalid Date（曾显示成「NAN 月 NAN 日」） */
  const ms = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return '——'
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${p(d.getHours())}:${p(d.getMinutes())}`
}

const DEFAULT_CONTENT = {
  site: { ...defaultSite, typography: { body: '', heading: '', mono: '' } },
  sectionTabs: defaultTabs,
  navLinks: defaultNav,
}

/** 口令强度：0~4，仅用于界面提示，真正的策略在服务端 */
function strengthOf(value) {
  if (!value) return 0
  let score = 1
  if (value.length >= MIN_PASSWORD_LENGTH) score += 1
  if (/[a-zA-Z]/.test(value) && /\d/.test(value)) score += 1
  if (/[^a-zA-Z0-9]/.test(value) || value.length >= 16) score += 1
  return score
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

/** 导入的 JSON 兼容两种形状：完整 {site, sectionTabs, navLinks} 或裸 site 对象。
    site 和构建默认值深合并：老版本内容缺的新字段（如 typography）补上默认值 */
function normalizeImport(json) {
  if (!isObj(json)) throw new Error('根节点必须是一个 JSON 对象')
  const content = isObj(json.site) ? json : { site: json }
  if (!isObj(content.site)) throw new Error('缺少 site 字段（或它不是对象）')
  return {
    site: withTypography(deepMerge(defaultSite, content.site)),
    sectionTabs: Array.isArray(content.sectionTabs) ? content.sectionTabs : defaultTabs,
    navLinks: Array.isArray(content.navLinks) ? content.navLinks : defaultNav,
  }
}

/** typography 兜底成 { body, heading, mono } 三下拉的结构。
    旧版 site.js / 旧内容文件里它可能缺失，甚至被存成字符串（早期渲染成
    文本框时填的）——字符串按字体名迁到 body，其余留空，让表单恢复下拉。 */
function withTypography(site) {
  if (!isObj(site)) return site
  if (isObj(site.typography)) return site
  const legacy = typeof site.typography === 'string' ? site.typography.trim() : ''
  return {
    ...site,
    typography: { body: legacy, heading: '', mono: '' },
  }
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/* 登录 / 改密的共用外壳：四角准星、刻度尺、卡片延伸线。
   两屏换的只是卡片里的表单，装饰层一模一样。 */
function LoginShell({ toast, variant, children }) {
  return (
    <div className={`adm-login${variant === 'change' ? ' adm-login--change' : ''}`}>
      <div className="adm-login__tag mono">● CONTENT ADMIN</div>
      <div className="adm-login__tag adm-login__tag--r mono">PRIVATE AREA · 内部</div>
      <span className="adm-login__foot mono">
        {defaultSite.name} · {defaultSite.nameEn}
      </span>
      <span className="adm-login__foot adm-login__foot--r mono">● SECURED · 口令认证</span>

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

        <div className="adm-login__card">{children}</div>
      </section>

      {toast && <div className={`adm-toast adm-toast--${toast.kind}`}>{toast.text}</div>}
    </div>
  )
}

export default function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  /* boot: loading → 拉内容 + 验 token；login / change（改口令）/ ready */
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
  /* ---- 改口令（首次登录强制 / 编辑器里主动轮换） ---- */
  const [mustChange, setMustChange] = useState(false) // 服务端还在用默认口令
  const [changeForced, setChangeForced] = useState(false) // 强制改密：不给「取消」
  const [curPass, setCurPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [changeBusy, setChangeBusy] = useState(false)
  const [changeShake, setChangeShake] = useState(false)
  /* 会话信息面板的两条真实数据 */
  const [lastLogin, setLastLogin] = useState(() => localStorage.getItem(LAST_LOGIN_KEY))
  const [contentUpdatedAt, setContentUpdatedAt] = useState(null)
  /* 字体库清单（公开接口，不登录也能拉；上传 / 删除才要 token） */
  const [fonts, setFonts] = useState([])
  const fileRef = useRef(null)
  const headerRef = useRef(null)

  const say = (kind, text) => setToast({ kind, text })
  useEffect(() => {
    if (!toast) return undefined
    const t = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(t)
  }, [toast])

  /* 拉字体库清单；上传 / 删除后调一次刷新 */
  async function refreshFonts() {
    try {
      const res = await fetch(`${BASE}api/fonts`, {
        headers: { accept: 'application/json' },
      })
      if (!res.ok) return
      const data = await res.json().catch(() => null)
      if (data) setFonts(normalizeFontList(data.fonts))
    } catch {
      /* 静态托管没有这个接口 —— 字体分区会显示空库 */
    }
  }

  /* 全部可用字体 = font/ 目录内置 + 后台上传（下拉里分组展示） */
  const allFonts = [
    ...localFonts,
    ...fonts.filter((f) => !localFonts.some((l) => l.id === f.id)),
  ]

  /* ---- 启动：验会话 + 拉当前内容（线上没有就用构建默认值） ---- */
  useEffect(() => {
    let aborted = false
    ;(async () => {
      let authed = false
      let needsChange = false
      if (token) {
        try {
          const res = await fetch(`${BASE}api/admin/session`, {
            headers: { authorization: `Bearer ${token}` },
          })
          authed = res.ok
          if (res.ok) {
            const data = await res.json().catch(() => ({}))
            needsChange = Boolean(data.mustChangePassword)
          }
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
          const hasData = data?.updatedAt && !aborted
          if (hasData) setContentUpdatedAt(data.updatedAt)
          if (isObj(c?.site)) {
            /* 与构建默认值深合并：老内容文件缺的新字段（typography 等）补默认值，
               编辑器里始终能编辑全量字段 —— 和前台 SiteContext 同一套合并规则。
               typography 单独兜底：旧 site.js 里没这个字段时也得是三个下拉，
               不能退化成文本框（存成字符串后前台不认，白改一场）。 */
            content = {
              site: withTypography(deepMerge(defaultSite, c.site)),
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
      setMustChange(needsChange)
      refreshFonts()
      if (authed && needsChange) {
        setChangeForced(true)
        setCurPass('')
        setBoot('change')
      } else {
        setBoot(authed ? 'ready' : 'login')
      }
    })()
    return () => {
      aborted = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* 顶栏高度量进 --adm-top-h：窄屏顶栏是两行（品牌 + 操作），
     左侧/顶部的分区导航要正好贴在它下面，不能靠写死的 55px 猜 */
  useEffect(() => {
    const el = headerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const setVar = () => {
      const h = Math.round(el.getBoundingClientRect().height)
      if (h > 0) document.documentElement.style.setProperty('--adm-top-h', `${h}px`)
    }
    setVar()
    const ro = new ResizeObserver(setVar)
    ro.observe(el)
    return () => ro.disconnect()
  }, [boot])

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

      if (data.mustChangePassword) {
        /* 默认口令：先改口令，改完之前不让进编辑器（服务端也会拦保存） */
        setMustChange(true)
        setChangeForced(true)
        setCurPass(password)
        setNewPass('')
        setConfirmPass('')
        setBoot('change')
      } else {
        setMustChange(false)
        setBoot('ready')
        say('ok', '登录成功')
      }
    } catch {
      say('err', '网络错误，连不上服务器')
    } finally {
      setBusy(false)
    }
  }

  function logout(message) {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setMustChange(false)
    setChangeForced(false)
    setCurPass('')
    setNewPass('')
    setConfirmPass('')
    setBoot('login')
    if (message) say('err', message)
  }

  /* ---- 改口令：首次登录强制 / 编辑器里主动轮换 ---- */
  function openChange() {
    setChangeForced(false)
    setCurPass('')
    setNewPass('')
    setConfirmPass('')
    setShowNew(false)
    setBoot('change')
  }

  function cancelChange() {
    setBoot('ready')
  }

  async function changePassword(e) {
    e.preventDefault()
    if (changeBusy) return
    if (newPass.length < MIN_PASSWORD_LENGTH) {
      setChangeShake(true)
      say('err', `新口令至少 ${MIN_PASSWORD_LENGTH} 个字符`)
      return
    }
    if (newPass !== confirmPass) {
      setChangeShake(true)
      say('err', '两次输入的新口令不一致')
      return
    }
    if (newPass === curPass) {
      setChangeShake(true)
      say('err', '新口令不能和当前口令相同')
      return
    }
    setChangeBusy(true)
    try {
      const res = await fetch(`${BASE}api/admin/password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: curPass, newPassword: newPass }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data?.code === 'CURRENT_PASSWORD_WRONG') {
          setChangeShake(true)
          say('err', data.error || '当前口令不对')
          return
        }
        if (res.status === 401) {
          logout('登录已过期，请重新登录')
          return
        }
        setChangeShake(true)
        say('err', data.error || '改口令失败')
        return
      }
      localStorage.setItem(TOKEN_KEY, data.token)
      setToken(data.token)
      setMustChange(false)
      setChangeForced(false)
      setCurPass('')
      setNewPass('')
      setConfirmPass('')
      setBoot('ready')
      say('ok', '口令已更新，以后用新口令登录')
    } catch {
      say('err', '网络错误，没改成功')
    } finally {
      setChangeBusy(false)
    }
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
        if (data?.code === 'PASSWORD_CHANGE_REQUIRED') {
          setMustChange(true)
          setChangeForced(true)
          setBoot('change')
        }
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

  /* ============================ 改口令页 ============================ */
  if (boot === 'change') {
    const strength = strengthOf(newPass)
    return (
      <LoginShell toast={toast} variant="change">
        <header className="adm-login__bar mono">
          <span>CONTENT ADMIN</span>
          <span>{changeForced ? '首次设置' : '修改口令'}</span>
        </header>

        <form className="adm-login__form adm-login__form--change" onSubmit={changePassword}>
          <div className="adm-login__no mono">
            <span>02 · SET PASSWORD</span>
            <span>{changeForced ? '强制修改' : '口令轮换'}</span>
          </div>

          <h1 className="adm-login__welcome">
            {changeForced ? '先设置一个新口令' : '修改口令'}
          </h1>
          <p className="adm-login__sub">
            {changeForced
              ? '你正在使用仓库默认口令。为了站点安全，请改成只有你知道的新口令，改完才能编辑内容。'
              : '输入当前口令，再设置一个新的。改完所有设备上的登录都会立即失效。'}
          </p>

          <div className="adm-login__labelrow">
            <label className="adm-login__label mono" htmlFor="adm-cur">
              当前口令
            </label>
            <span className="adm-login__labelen mono">CURRENT</span>
          </div>
          <div
            className={`adm-login__field${changeShake ? ' is-error' : ''}`}
            onAnimationEnd={() => setChangeShake(false)}
          >
            <input
              id="adm-cur"
              className="adm-login__input"
              type="password"
              autoComplete="current-password"
              autoFocus
              placeholder={changeForced ? '默认口令' : '当前使用的口令'}
              value={curPass}
              onChange={(e) => setCurPass(e.target.value)}
              onKeyDown={checkCaps}
              onKeyUp={checkCaps}
              onBlur={() => setCapsOn(false)}
            />
            <i className="adm-login__caret" aria-hidden="true" />
          </div>
          {capsOn && (
            <p className="adm-login__caps mono" role="status">
              ⚠ CAPS LOCK · 大写锁定已开启
            </p>
          )}

          <div className="adm-login__labelrow">
            <label className="adm-login__label mono" htmlFor="adm-new">
              新口令
            </label>
            <span className="adm-login__labelen mono">NEW · ≥ {MIN_PASSWORD_LENGTH}</span>
          </div>
          <div className="adm-login__field">
            <input
              id="adm-new"
              className="adm-login__input"
              type={showNew ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={`至少 ${MIN_PASSWORD_LENGTH} 个字符`}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              onKeyDown={checkCaps}
              onKeyUp={checkCaps}
            />
            <button
              type="button"
              className="adm-login__show mono"
              onClick={() => setShowNew((v) => !v)}
            >
              {showNew ? '隐藏' : '显示'}
            </button>
            <i className="adm-login__caret" aria-hidden="true" />
          </div>
          <div className="adm-login__strength" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className={i < strength ? 'is-on' : ''} />
            ))}
          </div>
          <p className="adm-login__hint mono">
            建议长句或字母+数字+符号混合，别用生日 / 手机号
          </p>

          <div className="adm-login__labelrow">
            <label className="adm-login__label mono" htmlFor="adm-confirm">
              确认新口令
            </label>
            <span className="adm-login__labelen mono">CONFIRM</span>
          </div>
          <div className="adm-login__field">
            <input
              id="adm-confirm"
              className="adm-login__input"
              type={showNew ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="再输一遍"
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
            />
            <i className="adm-login__caret" aria-hidden="true" />
          </div>

          <button
            className="adm-login__submit"
            type="submit"
            disabled={!curPass || !newPass || !confirmPass || changeBusy}
          >
            {changeBusy ? '保存中…' : changeForced ? '设置口令并进入后台' : '保存新口令'}
          </button>

          <div className="adm-login__row mono">
            {changeForced ? (
              <span>首次使用必须修改口令</span>
            ) : (
              <button type="button" className="adm-login__cancel" onClick={cancelChange}>
                ← 返回编辑器
              </button>
            )}
            <button type="button" className="adm-login__cancel" onClick={() => logout()}>
              退出登录
            </button>
          </div>
        </form>
      </LoginShell>
    )
  }

  /* ============================ 登录页 ============================ */
  if (boot !== 'ready') {
    return (
      <LoginShell toast={toast}>
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

          <button className="adm-login__submit" type="submit" disabled={!password || busy}>
            {busy ? '验证中…' : '进入后台'}
          </button>

          {import.meta.env.DEV && (
            <p className="adm-login__devhint mono">
              开发环境默认口令：xiaji-admin（首次登录需修改）
            </p>
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
          </div>
        </form>
      </LoginShell>
    )
  }

  /* ============================ 编辑器 ============================ */
  return (
    <div className="adm-page adm-page--app">
      <header className="adm-top" ref={headerRef}>
        <div className="adm-top__brand">
          <span className="adm-top__mark mono" aria-hidden="true">
            AD
          </span>
          <span className="adm-top__title">内容后台</span>
          <span className="adm-top__sub mono">CONTENT ADMIN</span>
          <span className="adm-top__dot" data-on={dirty ? '1' : '0'} aria-hidden="true" />
          {dirty && <em className="mono">未保存</em>}
          {mustChange && <em className="mono">默认口令未修改</em>}
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
          <button
            className="adm-btn"
            type="button"
            onClick={openChange}
            title="修改后台口令"
          >
            改口令
          </button>
          <button className="adm-btn" type="button" onClick={() => logout()}>
            退出
          </button>
        </div>
        <button
          className="adm-btn adm-btn--solid adm-top__save"
          type="button"
          onClick={save}
          disabled={!dirty || saving}
        >
          {saving ? '保存中…' : dirty ? '保存' : '已保存'}
        </button>
      </header>

      <div className="adm-body">
        <nav className="adm-nav" aria-label="内容分区">
          {SECTIONS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`adm-nav__item${s.id === section ? ' is-on' : ''}`}
              onClick={() => setSection(s.id)}
            >
              <span className="adm-nav__idx mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="adm-nav__label">{s.label}</span>
            </button>
          ))}
        </nav>

        <main className="adm-main" key={current.id}>
          <div className="adm-main__head">
            <span className="adm-main__eyebrow mono">
              {String(SECTIONS.findIndex((s) => s.id === current.id) + 1).padStart(2, '0')}{' '}
              · {current.id.toUpperCase()}
            </span>
            <h2>{current.label}</h2>
            <p>{current.desc}</p>
          </div>
          {current.id === 'typography' && (
            <FontManager
              fonts={fonts}
              localFonts={localFonts}
              typography={draft.site?.typography}
              token={token}
              onChange={refreshFonts}
              say={say}
            />
          )}
          {current.fields.map((path) => (
            <section className="adm-group" key={path}>
              <h3 className="adm-group__label mono">
                {labelFor(path.replace(/^site\./, ''))}
              </h3>
              <FieldEditor
                path={path.replace(/^site\./, '')}
                value={getIn(draft, path)}
                fonts={allFonts}
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
