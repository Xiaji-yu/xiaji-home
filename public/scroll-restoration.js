/**
 * 刷新一律从顶部开始。
 *
 * 浏览器刷新时会恢复上次的滚动位置。如果刷新时人停在页面中间，开场那团粒子
 * 会被"滚动进度"整片淡掉 —— 加载界面上就一颗点都看不见（ParticleMountain.jsx
 * 里还有一道兜底，但地址栏这一侧先处理掉最干净）。
 *
 * 只认刷新：前进 / 后退仍然保留浏览器的位置恢复，用带 #锚点 的地址打开也照常跳锚点。
 * （scrollRestoration 是**文档级**开关，但**不要**在 pagehide 里还原成 auto：
 *   浏览器是在页面卸载时读这个值来决定"刷新后要不要恢复滚动"的，卸载时还原
 *   等于把下一次刷新的保护也关掉。而前进/后退本来就不受影响 —— 那走的是新
 *   文档（navigation.type 是 back_forward，脚本直接 return，不碰这个开关），
 *   恢复照旧；bfcache 更是不读这个值，原样带回滚动位置。所以设了就设着。）
 *
 * 这段刻意放在 public/ 而不是 index.html 里内联：server/index.cjs 下发了
 * CSP（script-src 'self'），内联脚本会被拦。
 */
;(function () {
  var type = 'reload'
  try {
    var nav = performance.getEntriesByType('navigation')
    if (nav && nav[0] && nav[0].type) type = nav[0].type
  } catch (e) {
    /* 取不到就按刷新处理 */
  }
  if (type !== 'reload') return
  try {
    /* 地址栏里要是有 #章节（切章节时写进去的），刷新会被它拽回那一章 ——
       刷新就该从头开始，先把 hash 抹掉。（分享链接首次打开不受影响：
       那不是 reload，脚本直接 return，hash 照常跳转。） */
    if (window.location.hash) {
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
      )
    }
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)
  } catch (e) {
    /* 不支持也没关系，ParticleMountain.jsx 里还有一道兜底 */
  }
})()
