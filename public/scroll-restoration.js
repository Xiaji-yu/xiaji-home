/**
 * 刷新一律从顶部开始。
 *
 * 浏览器刷新时会恢复上次的滚动位置。如果刷新时人停在页面中间，开场那团粒子
 * 会被"滚动进度"整片淡掉 —— 加载界面上就一颗点都看不见（ParticleMountain.jsx
 * 里还有一道兜底，但地址栏这一侧先处理掉最干净）。
 *
 * 只认刷新：前进 / 后退仍然保留浏览器的位置恢复，用带 #锚点 的地址打开也照常跳锚点。
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
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)
  } catch (e) {
    /* 不支持也没关系，ParticleMountain.jsx 里还有一道兜底 */
  }
})()
