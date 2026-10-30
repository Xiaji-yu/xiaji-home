import { useEffect, useState } from 'react'

/* ==========================================================================
   字体库管理（后台「字体」分区顶部）
   --------------------------------------------------------------------------
   上传 .ttf / .otf / .woff / .woff2 到服务器（content/fonts/），列表可删除。
   上传/删除只是改字体库；把哪个字体用在哪（正文 / 标题 / 等宽）在下面的
   选择器里选，点右上角「保存」后才真正生效。

   后台的界面字体由 main.jsx 包裹的 SiteProvider 统一注入（和前台同一套）；
   这里额外注入一份样字预览专用的 @font-face（<style id="adm-font-faces">），
   让每个字体行用自己的字形渲染「战绩 Aa 09」，卸载时摘掉。
   ========================================================================== */

const BASE = import.meta.env.BASE_URL

/* 简体覆盖探测字：挑日文字体最容易缺的简体特有字形（脑/爱/绩/欢…），
   缺任何一个，整段中文就会「宋黑混排」—— 在列表里直接亮出来 */
const PROBE_CHARS = '脑爱绩欢这摆渐审码东远设计认习实现环标键盘温余状况网银银饭'

function fmtSize(bytes) {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/* 覆盖检测结果徽标：缺简体字是这个站最容易踩的坑（日文字体缺「脑/爱/绩」
   这类简体字形 → 页面宋黑混排），直接在列表里亮出来 */
function CoverageBadge({ coverage, id }) {
  const cov = coverage[id]
  if (!cov?.done)
    return (
      <span className="adm-font__cov mono is-pending" aria-live="polite">
        探测中…
      </span>
    )
  if (cov.missing.length === 0)
    return <span className="adm-font__cov mono is-ok">简体覆盖 ✓</span>
  return (
    <span
      className="adm-font__cov mono is-missing"
      title={`这些常用简体字没有字形，页面会回退系统字体造成混排：${cov.missing.join('')}`}
    >
      简体缺字 {cov.missing.length}：{cov.missing.slice(0, 6).join('')}…
    </span>
  )
}

export default function FontManager({
  fonts,
  localFonts,
  typography,
  token,
  onChange,
  say,
}) {
  const [busy, setBusy] = useState(false)
  /* 字符覆盖检测结果：id -> { missing: string[], done: boolean }。
     document.fonts.check 对「还没加载的字体」恒返回 true（假阳性），
     所以先 load 探测字强制下载，再逐字 check。 */
  const [coverage, setCoverage] = useState({})

  /* 预览用 @font-face：内置 + 上传都注入（本地字体 url 是 Vite 打包地址），
     清单一变就重写，离开后台时摘掉 */
  useEffect(() => {
    const el = document.createElement('style')
    el.id = 'adm-font-faces'
    el.textContent = [...localFonts, ...fonts]
      .map(
        (f) =>
          `@font-face{font-family:"cf-${f.id}";src:url("${f.kind === 'local' ? f.url : `${BASE}api/fonts/file/${encodeURIComponent(f.file)}`}");font-display:block;}`,
      )
      .join('\n')
    document.head.appendChild(el)
    return () => el.remove()
  }, [localFonts, fonts])

  /* 覆盖检测：预览样字本来就要下载字体，顺路逐字探测。
     document.fonts.check 只认 @font-face 的声明范围、不查字体内部
     cmap（缺字也返回 true），所以用 canvas 像素比对：把字分别用
     「探测字体 + serif」和「serif」画出来——字体有这个字形时两幅
     是不同的字形；缺字时两幅都是 serif 的回退渲染，像素完全相同。 */
  useEffect(() => {
    let alive = true
    const all = [...localFonts, ...fonts]
    setCoverage({})
    ;(async () => {
      const cv = document.createElement('canvas')
      cv.width = 32
      cv.height = 32
      const ctx = cv.getContext('2d', { willReadFrequently: true })
      /* 画一个字并返回像素；font 栈末尾的 serif 是对照组 */
      const draw = (font, ch) => {
        ctx.clearRect(0, 0, 32, 32)
        ctx.font = `32px ${font}`
        ctx.textBaseline = 'alphabetic'
        ctx.fillStyle = '#000'
        ctx.fillText(ch, 2, 26)
        return ctx.getImageData(0, 0, 32, 32).data
      }
      /* 字体没渲染自己的字形（缺字回退）→ 与纯 serif 画出来逐字节相同 */
      const isMissing = (family, ch) => {
        const a = draw(`"${family}", serif`, ch)
        const b = draw('serif', ch)
        for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false
        return true
      }
      for (const f of all) {
        const family = `cf-${f.id}`
        let missing = []
        try {
          /* 先确保字体真的加载了，否则画的全是回退、全员误报缺字 */
          await document.fonts.load(`32px "${family}"`, `战绩${PROBE_CHARS}`)
          missing = [...PROBE_CHARS].filter((ch) => isMissing(family, ch))
        } catch {
          missing = [] // 探测失败就当全有，别误报
        }
        if (!alive) return
        setCoverage((c) => ({ ...c, [f.id]: { missing, done: true } }))
      }
    })()
    return () => {
      alive = false
    }
  }, [localFonts, fonts])

  async function upload(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // 同一个文件再选一次也要触发 change
    if (!file || busy) return
    setBusy(true)
    try {
      const res = await fetch(`${BASE}api/fonts?name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          authorization: `Bearer ${token}`,
        },
        body: file,
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) {
        say('err', '登录已过期，请重新登录后再上传')
        return
      }
      if (!res.ok) {
        say('err', data.error || '上传失败')
        return
      }
      say('ok', `已上传「${data.font.name}」。在下面选给哪个角色用，保存后生效`)
      onChange()
    } catch {
      say('err', '网络错误，没传上')
    } finally {
      setBusy(false)
    }
  }

  async function removeFont(f) {
    if (busy) return
    if (!window.confirm(`删除字体「${f.name}」？正在使用它的地方会回退到默认字体。`)) return
    setBusy(true)
    try {
      const res = await fetch(`${BASE}api/fonts/${encodeURIComponent(f.id)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        say('err', '登录已过期，请重新登录后再删除')
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        say('err', data.error || '删除失败')
        return
      }
      say('ok', `已删除「${f.name}」`)
      onChange()
    } catch {
      say('err', '网络错误，没删掉')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="adm-group adm-fonts">
      {localFonts.length > 0 && (
        <>
          <h3 className="adm-group__label mono">
            font/ 目录 · 内置 {localFonts.length} 个
          </h3>
          <div className="adm-fonts__list">
            {localFonts.map((f) => (
              <div className="adm-font adm-font--local" key={f.id}>
                {/* 用这份字体本身渲染样字（@font-face 已在上面注入） */}
                <span
                  className="adm-font__preview"
                  style={{ fontFamily: `"cf-${f.id}", var(--sans)` }}
                  aria-hidden="true"
                >
                  战绩 Aa 09
                </span>
                <span className="adm-font__meta">
                  <span className="adm-font__name">{f.name}</span>
                  <span className="adm-font__sub mono">
                    {String(f.ext || '').toUpperCase()}
                    {f.id !== f.name ? ` · ${f.id}` : ''}
                    {typography && Object.values(typography).includes(f.id) && ' · 使用中'}
                  </span>
                  <CoverageBadge coverage={coverage} id={f.id} />
                </span>
                <span
                  className="adm-font__badge mono"
                  title="来自项目 font/ 目录，随仓库走"
                >
                  内置
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="adm-group__label mono">后台上传 · {fonts.length}/20</h3>

      <div className="adm-fonts__list">
        {fonts.length === 0 && <p className="adm-fonts__empty mono">还没有上传过字体</p>}
        {fonts.map((f) => (
          <div className="adm-font" key={f.id}>
            {/* 用这份字体本身渲染样字（@font-face 已在上面注入） */}
            <span
              className="adm-font__preview"
              style={{ fontFamily: `"cf-${f.id}", var(--sans)` }}
              aria-hidden="true"
            >
              战绩 Aa 09
            </span>
            <span className="adm-font__meta">
              <span className="adm-font__name">{f.name}</span>
              <span className="adm-font__sub mono">
                {String(f.ext || '').toUpperCase()} · {fmtSize(f.size)}
                {typography && Object.values(typography).includes(f.id) && ' · 使用中'}
              </span>
              <CoverageBadge coverage={coverage} id={f.id} />
            </span>
            <button
              type="button"
              className="adm-font__del"
              onClick={() => removeFont(f)}
              disabled={busy}
              title="删除这个字体"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="adm-fonts__ops">
        {/* 不用 JS 的 input.click() 代理：微信 / QQ 内置浏览器等环境会拦住
            「程序化打开文件选择框」，点了没反应。改成 <label> 原生转发 +
            透明 input 铺满按钮 —— 用户点的就是 input 本身，全环境都能弹。 */}
        <label className={`adm-btn adm-fonts__upload${busy ? ' is-busy' : ''}`}>
          {busy ? '处理中…' : '上传字体'}
          <input
            type="file"
            className="adm-fonts__file"
            accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
            disabled={busy}
            onChange={upload}
          />
        </label>
      </div>

      <p className="adm-fonts__hint mono">
        「font/ 目录」的内置字体随项目走，删除 = 在项目里删掉对应文件 / 文件夹；
        「后台上传」的字体点行尾「×」删除。支持 .ttf / .otf / .woff / .woff2，上传单个最大
        25MB、最多 20 个。
      </p>
    </section>
  )
}
