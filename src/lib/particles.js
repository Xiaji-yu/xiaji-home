/* ==========================================================================
   粒子山景的"物理"部分
   --------------------------------------------------------------------------
   这里只有纯函数，不碰 DOM，也不碰 canvas：
     buildParticles()      → 把点亮的格子采样成一批独立的粒子
     particleTransform()   → 给定"滚动进度"，算出某个粒子此刻的位置/大小/透明度

   之所以把数学和绘制分开，一是组件里清爽，二是这些函数可以在 Node 里直接跑，
   方便把任意进度渲染成图片来检查效果（开发时就是这么调试的）。
   ========================================================================== */

import { hash2, isLit } from './dither.js'

/** 目标粒子数：桌面端取区间上限，手机上少一半左右 */
export const TARGET_DESKTOP = 6000
export const TARGET_SMALL = 2600

/** 粒子边长 = 格子边长 × 这个系数（略大于格子，补偿抽样后整体变稀） */
export const SIZE_FACTOR = 1.9

/** 鼠标推开粒子的作用半径（CSS 像素）与最大推距 */
export const MOUSE_RADIUS = 120
export const MOUSE_PUSH = 54

/** 平滑曲线：先慢、中间快、结尾慢，散开动作更有"惯性" */
export function ease(t) {
  return t * t * (3 - 2 * t)
}

/** 和上面同一条曲线，只是多了起止点参数 */
function smoothstep(from, to, x) {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

/**
 * 位图与粒子的"交接"系数。
 * 位图在 progress≈0.45 时基本淡完，粒子则在这个区间里逐渐加到满，
 * 这样既能早点看到颗粒感，又不会在位图还很清楚的时候叠出一层多余的墨。
 */
function handoff(progress) {
  return 0.35 + 0.65 * smoothstep(0, 0.5, progress)
}

/**
 * 把点亮的格子采样成一批粒子。
 *
 * @param cols,rows  点阵网格的尺寸（和位图版完全一致）
 * @param shade      computeShade() 的结果
 * @param cell       一个格子在屏幕上的边长（CSS 像素）
 * @param target     目标粒子数
 */
export function buildParticles({ cols, rows, shade, cell, target = TARGET_DESKTOP }) {
  // ① 先按位图版完全相同的规则，找出所有"被点亮"的格子
  const lit = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      const s = shade[idx]
      if (s > 0 && isLit(s, c, r)) lit.push(idx)
    }
  }

  // ② 等间隔抽样，把数量压到目标值。
  //    因为是"均匀地抽"，各区域的相对密度不变 —— 山的明暗层次因此得以保留。
  const stride = Math.max(1, Math.ceil(lit.length / target))
  const items = []

  for (let i = 0; i < lit.length; i += stride) {
    const idx = lit[i]
    const c = idx % cols
    const r = (idx - c) / cols
    const s = shade[idx]

    items.push({
      // 出生位置（静止状态下它就是原来那个方块的位置）
      x: (c + 0.5) * cell,
      y: (r + 0.5) * cell,

      // 墨量大的（近处的黑山）= 更实
      alpha: 0.55 + 0.45 * s,

      // 每个粒子的边长略有差异，看起来才像"沙"而不是"瓷砖"
      size: cell * SIZE_FACTOR * (0.75 + 0.5 * hash2(idx, 3)),

      // 飞行速度：0.55~1.45 倍，快慢不一 → 散开时有层次
      speed: 0.55 + 0.9 * hash2(idx, 7),

      // 纵向的随机漂移（-0.75 ~ 0.75）
      drift: (hash2(idx, 11) - 0.5) * 1.5,
    })
  }

  // ③ 按墨色从深到浅排序。
  //    绘制时透明度只会单调变化，fillStyle 每帧只需切换个位数次 —— 这是性能关键。
  items.sort((a, b) => b.alpha - a.alpha)

  return items
}

/**
 * 算出某个粒子此刻的样子。
 *
 * @param item       buildParticles() 里的一个粒子
 * @param progress   滚动进度：0 = 山还在原地，1 = 完全散尽
 * @param width      山景容器的宽度（CSS 像素）
 * @param height     山景容器的高度
 * @param mouse      { x, y, strength } 或 null；strength 是鼠标影响的强度 0~1
 */
export function particleTransform(item, progress, width, height, mouse) {
  const e = ease(progress)

  // ---- 从画面中线向左右推开：中线左边的往左飞，右边的往右飞 ----
  const dir = item.x < width / 2 ? -1 : 1
  let x = item.x + dir * e * item.speed * width * 0.62
  let y = item.y + e * item.drift * height * 0.22

  // ---- 鼠标排斥：靠近光标的粒子被推开，散开过程中影响逐渐变弱 ----
  if (mouse && mouse.strength > 0.01) {
    const dx = x - mouse.x
    const dy = y - mouse.y
    const d2 = dx * dx + dy * dy
    if (d2 < MOUSE_RADIUS * MOUSE_RADIUS) {
      const d = Math.sqrt(d2) || 1
      const push = (1 - d / MOUSE_RADIUS) * mouse.strength * (1 - progress) * MOUSE_PUSH
      x += (dx / d) * push
      y += (dy / d) * push
    }
  }

  return {
    x,
    y,
    // 越飞越小
    size: item.size * (1 - 0.45 * progress),
    // 越飞越淡；乘上交接系数，位图还在的时候粒子不会抢戏
    alpha: item.alpha * handoff(progress) * Math.max(0, 1 - progress * 1.05),
  }
}
