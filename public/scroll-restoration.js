/**
 * 滚动位置的两件事：
 *   1. 刷新一律从顶部开始 —— 浏览器恢复的滚动位置会让开场那团粒子被
 *      "滚动进度"整片淡掉，加载界面上就一颗点都看不见（ParticleMountain.jsx
 *      里还有一道兜底，但地址栏这一侧先处理掉最干净）。
 *   2. 前进 / 后退回来时，把离开时停的位置放回去 —— 开场那几秒里 body 被
 *      is-locked（overflow: hidden）锁着，浏览器自己的恢复会被夹成 0，人从
 *      页脚的站点链接回来就落到顶上 / 章节区。所以记录交给这里（pagehide 时
 *      存进 sessionStorage），恢复交给 Header 在解锁那一刻做。
 *
 * 用带 #锚点 的地址正常打开（分享链接）不受影响：照常跳到对应章节。
 * （scrollRestoration 是**文档级**开关，但**不要**在 pagehide 里还原成 auto：
 *   浏览器是在页面卸载时读这个值来决定"刷新后要不要恢复滚动"的，卸载时还原
 *   等于把下一次刷新的保护也关掉；bfcache 恢复的页面更是原样带回滚动位置。
 *   所以设了就设着。）
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

  /* ---- 前进 / 后退：记下离开时停在哪，回来交给 Header 在解锁那一刻放回去 ----
     按完整地址（含 #章节）区分：同一页不同锚点各存一份。键要在离开那一刻用
     当时的地址算 —— 站内切章节只改 hash、不重新加载，进来时的地址可能已经
     不是离开时的那个了。用 sessionStorage，关掉标签页就清掉；存不下（隐私
     模式）就算了，顶多是回到顶上。
     浏览器自己也会恢复一次，但它是在 body 还锁着的时候做的 —— 无缓存、
     页面真的重载回来时会被夹成 0，所以这里不能只靠它。 */
  try {
    window.addEventListener('pagehide', function () {
      try {
        sessionStorage.setItem(
          'scroll:' + window.location.href,
          String(window.scrollY || window.pageYOffset || 0),
        )
      } catch (e) {
        /* 存不下就算了 */
      }
    })
    if (type === 'back_forward') {
      var saved = sessionStorage.getItem('scroll:' + window.location.href)
      if (saved !== null && isFinite(Number(saved))) {
        window.__restoreScrollY = Number(saved)
      }
      /* 浏览器的这次恢复会在开场锁着的时候发生（被夹成 0，或者让开场粒子
         被滚动进度淡掉）。关掉它，统一由 Header 在解锁那一刻放回去。 */
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    }
  } catch (e) {
    /* sessionStorage 不可用：保持浏览器默认行为 */
  }

  if (type !== 'reload') return
  try {
    /* 地址栏里要是有 #章节（切章节时写进去的），刷新会被它拽回那一章 ——
       刷新就该从头开始，先把 hash 抹掉。（分享链接首次打开不受影响：
       那不是 reload，hash 不动，照常跳转。） */
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
