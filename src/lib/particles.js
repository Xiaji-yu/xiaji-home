/* ==========================================================================
   粒子山景的"物理"部分
   --------------------------------------------------------------------------
   这个文件不碰 DOM，也不碰 canvas，只做三件事：

     buildParticles()      把点亮的格子采样成一批独立的方块粒子
     setupAssemble()       给每个粒子安排一个"从四面八方飞来"的出发位置
     stepParticles()       推进一帧：汇聚动画 / 鼠标吹散 / 弹簧归位
     particleTransform()   算出某个粒子此刻最终画在哪、多大、多透明

   之所以把纯计算单独拎出来，一是组件里清爽，二是这些函数能在 Node 里直接跑 ——
   开发时就是把任意时刻渲染成图片来对着调的。
   ========================================================================== */

import { hash2, isLit } from './dither.js'

/* ---------------- 目标与外观 ---------------- */

/** 目标粒子数：桌面端取区间上限，手机上少一半左右 */
export const TARGET_DESKTOP = 6000
export const TARGET_SMALL = 2600

/** 粒子边长 = 格子边长 × 这个系数 */
export const SIZE_FACTOR = 1.9

/** 每个粒子的边长再乘上一个 0.6~1.6 的随机系数 —— 有大有小才有"碎屑"感 */
const SIZE_SPREAD_MIN = 0.6
const SIZE_SPREAD_MAX = 1.6

/* ---------------- 鼠标 ---------------- */

/** 鼠标能影响到多远、最多推开多少像素 */
export const MOUSE_RADIUS = 120
export const MOUSE_PUSH = 58

/** 切向分量：让粒子像被风卷着转一点，而不是纯径向弹开 */
const MOUSE_CURL = 0.34

/** 推力跟随速度（越大越"跟手"，也越容易被推飞） */
const MOUSE_FOLLOW = 0.2

/* ---------------- 弹簧 ---------------- */

/** 弹簧刚度。配合下面的阻尼，回弹会有一点点过冲 —— 官网那种手感 */
export const SPRING = 0.055
/** 每帧阻尼（越接近 1 越弹）。0.92 大约相当于阻尼比 0.36，会明显过冲一次再稳住 */
export const DAMPING = 0.92

/* ---------------- 载入汇聚 ---------------- */

/** 开场遮罩要滑走的时候再起飞，这样"汇聚"正好被看到 */
export const ASSEMBLE_DELAY_MS = 1450
/** 单个粒子从远处飞到位的时长 */
export const ASSEMBLE_DURATION_MS = 850
/** 错峰：让粒子先后抵达，而不是齐刷刷一起到 */
export const ASSEMBLE_STAGGER_MS = 320

/** 位移超过这么多像素，粒子就完全显形（否则它和底下的位图重叠，会double变黑） */
const SHOW_AT = 7

/* ---------------- 曲线 ---------------- */

/** 平滑曲线：先慢、中间快、结尾慢 */
export function ease(t) {
  return t * t * (3 - 2 * t)
}

function smoothstep(from, to, x) {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

/** 结尾带一点过冲的缓出曲线：粒子会"冲过头再收回"，所以看起来像有惯性 */
function easeOutBack(t) {
  const c1 = 1.70158
  const c3 = c1 + 1
  const p = t - 1
  return 1 + c3 * p * p * p + c1 * p * p
}

/**
 * 位图与粒子的"交接"系数。
 * 位图在 progress≈0.45 时基本淡完，粒子则在这个区间里逐渐加到满，
 * 这样既能早点看到颗粒感，又不会在位图还很清楚的时候叠出一层多余的墨。
 */
function handoff(progress) {
  return 0.35 + 0.65 * smoothstep(0, 0.5, progress)
}

/* ---------------- 构建 ---------------- */

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

    // 边长随机系数
    const spread = SIZE_SPREAD_MIN + (SIZE_SPREAD_MAX - SIZE_SPREAD_MIN) * hash2(idx, 3)
    // 越大的粒子越"重"，被鼠标推开得越少
    const weight =
      1.35 - 0.6 * ((spread - SIZE_SPREAD_MIN) / (SIZE_SPREAD_MAX - SIZE_SPREAD_MIN))

    items.push({
      // 出生位置（静止状态下它就是原来那个方块的位置）
      x: (c + 0.5) * cell,
      y: (r + 0.5) * cell,

      // 墨量大的（近处的黑山）= 更实
      alpha: 0.55 + 0.45 * s,

      // 大小差异：0.6~1.6 倍
      size: cell * SIZE_FACTOR * spread,
      weight,

      // 飞行速度：0.55~1.45 倍，快慢不一 → 散开时有层次
      speed: 0.55 + 0.9 * hash2(idx, 7),

      // 纵向的随机漂移（-0.75 ~ 0.75）
      drift: (hash2(idx, 11) - 0.5) * 1.5,

      // 被风吹时往哪边旋（左旋 / 右旋）
      curl: hash2(idx, 13) > 0.5 ? 1 : -1,

      // ↓ 以下是每帧变化的动态状态
      ox: 0, // 相对出生位置的弹性偏移
      oy: 0,
      vx: 0, // 弹性偏移的速度
      vy: 0,
      delay: 0, // 汇聚动画里的起飞延时
      startX: 0, // 汇聚动画的出发点（相对出生位置的偏移）
      startY: 0,
      t: 1, // 汇聚进度 0~1
    })
  }

  // ③ 按墨色从深到浅排序。
  //    绘制时透明度只会单调变化，fillStyle 每帧只需切换个位数次 —— 这是性能关键。
  items.sort((a, b) => b.alpha - a.alpha)

  return items
}

/**
 * 安排"载入汇聚"：每个粒子从画面外的随机方向飞进来。
 * 距离取容器长边的 0.8~1.8 倍，保证出发点都在画面外。
 */
export function setupAssemble(items, width, height, stagger = ASSEMBLE_STAGGER_MS) {
  const reach = Math.max(width, height)
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const angle = hash2(i, 23) * Math.PI * 2
    // 0.62~1.37 倍长边：保证出发点在画面外，但也不会远到白白飞很久
    const distance = (0.62 + 0.75 * hash2(i, 29)) * reach
    it.startX = Math.cos(angle) * distance
    it.startY = Math.sin(angle) * distance
    it.ox = it.startX
    it.oy = it.startY
    it.vx = 0
    it.vy = 0
    it.delay = hash2(i, 31) * stagger
    it.t = 0
  }
}

/** 把粒子直接按到"已经就位"的状态（尺寸变化后重建、或跳过动画时用） */
export function resetToHome(items) {
  for (const it of items) {
    it.ox = 0
    it.oy = 0
    it.vx = 0
    it.vy = 0
    it.delay = 0
    it.t = 1
  }
}

/**
 * 推进一帧。
 *
 * @param items    粒子数组
 * @param opts.dt         距上一帧的倍数（1 = 正好 60fps 一帧）
 * @param opts.elapsed    从组件挂载算起的毫秒数
 * @param opts.mode       'assemble' | 'live'
 * @param opts.progress   滚动进度 0~1（散开时鼠标影响会递减）
 * @param opts.mouse      { x, y, strength } 或 null
 * @returns { allDone, maxMotion }  —— 用来判断动画是否停稳，可以停掉帧循环
 */
export function stepParticles(items, opts) {
  const { dt, elapsed, mode, progress = 0, mouse = null } = opts
  const step = Math.min(2, Math.max(0.5, dt))
  let maxMotion = 0

  /* ---------------- 载入汇聚 ---------------- */
  if (mode === 'assemble') {
    let allDone = true
    for (const it of items) {
      const raw = (elapsed - ASSEMBLE_DELAY_MS - it.delay) / ASSEMBLE_DURATION_MS
      const t = raw <= 0 ? 0 : raw >= 1 ? 1 : raw
      if (t < 1) allDone = false
      it.t = t

      // 出发点 → 出生位置的插值；easeOutBack 会冲过头一点点再收回
      const remain = 1 - easeOutBack(t)
      it.ox = it.startX * remain
      it.oy = it.startY * remain

      const d = it.ox * it.ox + it.oy * it.oy
      if (d > maxMotion) maxMotion = d
    }
    return { allDone, maxMotion: Math.sqrt(maxMotion) }
  }

  /* ---------------- 正常状态：鼠标吹散 + 弹簧归位 ---------------- */
  const dampStep = Math.pow(DAMPING, step)
  const springStep = SPRING * step
  const R2 = MOUSE_RADIUS * MOUSE_RADIUS
  const pushScale = mouse ? mouse.strength * Math.max(0, 1 - progress) : 0

  for (const it of items) {
    // ① 鼠标推力：把偏移"软性"地拉向被推开的位置
    if (pushScale > 0.01) {
      const px = it.x + it.ox
      const py = it.y + it.oy
      const dx = px - mouse.x
      const dy = py - mouse.y
      const d2 = dx * dx + dy * dy
      if (d2 < R2) {
        const d = Math.sqrt(d2) || 0.001
        const nx = dx / d
        const ny = dy / d
        const falloff = 1 - d / MOUSE_RADIUS
        const power = falloff * MOUSE_PUSH * it.weight * pushScale
        // 径向 + 一点切向旋转
        const tx = (nx - ny * MOUSE_CURL * it.curl) * power
        const ty = (ny + nx * MOUSE_CURL * it.curl) * power
        it.vx += (tx - it.ox) * MOUSE_FOLLOW * step
        it.vy += (ty - it.oy) * MOUSE_FOLLOW * step
      }
    }

    // ② 弹簧 + 阻尼：偏移被拉回 0，回弹时会过冲一下
    it.vx += -springStep * it.ox
    it.vy += -springStep * it.oy
    it.vx *= dampStep
    it.vy *= dampStep
    it.ox += it.vx * step
    it.oy += it.vy * step

    const d = it.ox * it.ox + it.oy * it.oy
    if (d > maxMotion) maxMotion = d
  }

  return { allDone: true, maxMotion: Math.sqrt(maxMotion) }
}

/**
 * 算出某个粒子此刻最终的样子。
 *
 * @param item        粒子
 * @param progress    滚动进度：0 = 山还在原地，1 = 完全散尽
 * @param width       山景容器的宽度（CSS 像素）
 * @param height      山景容器的高度
 * @param assembleFade 汇聚阶段的整体显形系数（1 = 全部可见，0 = 交给位图）
 */
export function particleTransform(item, progress, width, height, assembleFade = 0) {
  const e = ease(progress)

  // ① 滚动散开：从画面中线向左右推开（中线左边的往左飞，右边的往右飞）
  const dir = item.x < width / 2 ? -1 : 1
  const scrollX = dir * e * item.speed * width * 0.62
  const scrollY = e * item.drift * height * 0.22

  // ② 弹性偏移（鼠标吹散 / 载入汇聚）直接叠加在上面
  const x = item.x + scrollX + item.ox
  const y = item.y + scrollY + item.oy

  // ③ 显形系数。常态下"没被扰动的粒子是看不见的"——
  //    因为静止时底下的位图已经把它画出来了，再叠一层只会让山发黑；
  //    一旦被吹开，它就"从山体里浮出来"。而汇聚阶段（assembleFade≈1）必须全都可见，
  //    否则粒子刚落位就消失，山根本聚不起来。
  const offset = Math.sqrt(item.ox * item.ox + item.oy * item.oy)
  const emerging = Math.min(1, offset / SHOW_AT)
  const scrolling = Math.min(1, progress * 12)
  const visible = Math.max(assembleFade, emerging, scrolling)

  // ④ 汇聚过程中顺便淡入 + 稍微放大一点，看起来像"碎屑落定"
  const settling = item.t >= 1 ? 1 : smoothstep(0, 0.3, item.t)

  return {
    x,
    y,
    size: item.size * (1 - 0.45 * progress) * (0.72 + 0.28 * (item.t >= 1 ? 1 : item.t)),
    alpha:
      item.alpha *
      handoff(progress) *
      Math.max(0, 1 - progress * 1.05) *
      visible *
      settling,
  }
}
