import { useEffect, useState } from 'react'

/* ==========================================================================
   字体库管理（后台「字体」分区顶部）
   --------------------------------------------------------------------------
   上传 .ttf / .otf / .woff / .woff2 到服务器（content/fonts/），列表可删除。
   上传/删除只是改字体库；把哪个字体用在哪（正文 / 标题 / 等宽）在下面的
   选择器里选，点右上角「保存」后才真正生效。

   后台不挂在 SiteProvider 里，这里的字体预览自己注入一份 @font-face
   （<style id="adm-font-faces">），卸载时顺手摘掉，不污染前台逻辑。
   ========================================================================== */

const BASE = import.meta.env.BASE_URL

function fmtSize(bytes) {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
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
        内置字体来自项目 font/ 目录（单文件、或带 LICENSE 的字体文件夹都认，
        增删后要重新构建）；这里上传的字体存在服务器上，保存后立即生效。 支持 .ttf / .otf /
        .woff / .woff2，上传单个最大 25MB、最多 20 个。
      </p>
    </section>
  )
}
