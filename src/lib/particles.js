/* ==========================================================================
   粒子山景的"物理"部分
   --------------------------------------------------------------------------
   这个文件不碰 DOM，也不碰 canvas，只做几件事：

     buildParticles()     把山体按疏密采样成一批圆形粒子
     setupIntro()         安排"开场无序云"：每个粒子散在画面里的某个随机位置
     stepIntro()          推进一帧无序漂浮（缓慢摇摆，看起来是活的）
     beginSettle()        把此刻的位置记为起点，从这一刻开始归位
     stepSettle()         推进一帧归位插值（带一点过冲，1.5 秒内全部落定）
     stepParticles()      推进一帧常态：鼠标吹散 + 弹簧归位
     particleTransform()  算出某个粒子此刻最终画在哪、多大、多透明

   之所以把纯计算单独拎出来，一是组件里清爽，二是这些函数能在 Node 里直接跑 ——
   开发时就是把任意时刻渲染成图片来对着调的。
   ========================================================================== */

import { hash2, isLit } from './dither.js'

/* ---------------- 目标与外观 ---------------- */

/** 目标粒子数：桌面端取区间上限，手机上少一半左右 */
export const TARGET_DESKTOP = 6000
export const TARGET_SMALL = 2600

/** 粒子直径 = 格子边长 × 这个系数（和换成圆点之前完全一致，所以"大小不变"） */
export const SIZE_FACTOR = 1.9

/** 每个粒子的直径再乘上一个 0.6~1.6 的随机系数 —— 有大有小，疏密层次才自然 */
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

/** 弹簧刚度。配合下面的阻尼，回弹会明显过冲一次 —— 那种弹性手感 */
export const SPRING = 0.055
/** 每帧阻尼（越接近 1 越弹）。0.92 大约相当于阻尼比 0.36 */
export const DAMPING = 0.92

/* ---------------- 开场：无序云 → 归位 ---------------- */

/** 无序漂浮持续多久。必须和开场遮罩时长一致（components/Preloader.jsx 的 DURATION） */
export const INTRO_CLOUD_MS = 1500
/** 归位总时长：错峰 + 单个粒子的飞行时间，加起来正好 1.5 秒 */
export const SETTLE_DURATION_MS = 1150
export const SETTLE_STAGGER_MS = 350

/* ---------------- 曲线 ---------------- */

/** 平滑曲线：先慢、中间快、结尾慢 */
export function ease(t) {
  return t * t * (3 - 2 * t)
}

/** 结尾带一点过冲的缓出曲线：粒子会"冲过头再收回"，所以看起来像有惯性 */
function easeOutBack(t) {
  const c1 = 1.70158
  const c3 = c1 + 1
  const p = t - 1
  return 1 + c3 * p * p * p + c1 * p * p
}

/* ---------------- 构建 ---------------- */

/**
 * 把山体采样成一批粒子。
 * 采样规则和以前一样（按有序抖动挑出"点亮的格子"，再等间隔抽样压到目标数量），
 * 所以山的明暗层次仍然由粒子的疏密表现 —— 靠疏密认轮廓，而不是靠实心色块。
 *
 * @param cols,rows  点阵网格的尺寸
 * @param shade      computeShade() 的结果
 * @param cell       一个格子在屏幕上的边长（CSS 像素）
 * @param target     目标粒子数
 */
export function buildParticles({ cols, rows, shade, cell, target = TARGET_DESKTOP }) {
  // ① 先按位图版完全相同的规则，找出所有"点亮的格子"
  const lit = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      const s = shade[idx]
      if (s > 0 && isLit(s, c, r)) lit.push(idx)
    }
  }

  // ② 抽样：做"哈希随机抽取"，而不是等间隔抽样。
  //    等间隔抽样会和 Bayer 矩阵的 8×8 周期谐振，归位后整片山会浮出一层
  //    规则的蜂窝状网纹；随机抽取的密度期望值完全一样，但不会出现周期结构。
  const keepRatio = target / lit.length
  const items = []

  for (let i = 0; i < lit.length; i++) {
    const idx = lit[i]
    if (hash2(idx, 97) > keepRatio) continue

    const c = idx % cols
    const r = (idx - c) / cols
    const s = shade[idx]

    const spread = SIZE_SPREAD_MIN + (SIZE_SPREAD_MAX - SIZE_SPREAD_MIN) * hash2(idx, 3)
    // 越大的粒子越"重"，被鼠标推开得越少
    const weight =
      1.35 - 0.6 * ((spread - SIZE_SPREAD_MIN) / (SIZE_SPREAD_MAX - SIZE_SPREAD_MIN))

    // 位置再加一点点抖动（±0.35 格），彻底打散残余的网格感，更像沙
    const jitterX = (hash2(idx, 71) - 0.5) * 0.7 * cell
    const jitterY = (hash2(idx, 73) - 0.5) * 0.7 * cell

    items.push({
      // 出生位置（归位结束后它就落在这里）
      x: (c + 0.5) * cell + jitterX,
      y: (r + 0.5) * cell + jitterY,

      // 墨量大的（近处的黑山）= 更实
      alpha: 0.55 + 0.45 * s,

      // 直径：和换成圆点之前的大小一致
      size: cell * SIZE_FACTOR * spread,
      weight,

      // 横向飞散速度：0.55~1.45 倍，快慢不一 → 滚动散开时有层次
      speed: 0.55 + 0.9 * hash2(idx, 7),

      // 纵向的随机漂移（-0.75 ~ 0.75）
      drift: (hash2(idx, 11) - 0.5) * 1.5,

      // 被风吹时往哪边旋（左旋 / 右旋）
      curl: hash2(idx, 13) > 0.5 ? 1 : -1,

      // ↓ 以下是每帧变化的动态状态
      ox: 0, // 相对出生位置的偏移
      oy: 0,
      vx: 0, // 偏移的速度（弹簧用）
      vy: 0,

      cloudX: 0, // 无序云里它散在哪儿
      cloudY: 0,
      wobbleSpeed: 0, // 摇摆频率（rad/ms）
      wobblePhase: 0,
      wobbleAmpX: 0,
      wobbleAmpY: 0,

      startX: 0, // 归位动画的出发点
      startY: 0,
      delay: 0, // 归位的错峰延时
      t: 1, // 归位进度 0~1
    })
  }

  // ③ 按墨色从深到浅排序：绘制时按透明度分桶批量画，一桶只需一次 fill
  items.sort((a, b) => b.alpha - a.alpha)

  return items
}

/* ---------------- 开场：无序云 ---------------- */

/**
 * 把粒子打散成"无序云"：每个粒子被随机丢在画面里的某个位置，
 * 并给一段缓慢摇摆的参数，让它看起来是漂着的而不是钉死的。
 * 注意：只改视觉偏移，不动出生位置 —— 归位就是把这些偏移收回 0。
 */
export function setupIntro(items, width, height) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i]

    // 在椭圆里均匀撒点（sqrt 让面积分布均匀，不然会全挤在中心）
    const angle = hash2(i, 41) * Math.PI * 2
    const radius = Math.sqrt(hash2(i, 43))
    it.cloudX = Math.cos(angle) * radius * width * 0.52
    it.cloudY = Math.sin(angle) * radius * height * 0.46

    // 缓慢摇摆：周期 3~8 秒，幅度 8~22px
    it.wobbleSpeed = 0.0008 + 0.0012 * hash2(i, 47)
    it.wobblePhase = hash2(i, 53) * Math.PI * 2
    it.wobbleAmpX = 8 + 14 * hash2(i, 59)
    it.wobbleAmpY = 6 + 12 * hash2(i, 61)

    it.ox = it.cloudX
    it.oy = it.cloudY
    it.vx = 0
    it.vy = 0
    it.t = 0
  }
}

/** 推进一帧无序漂浮：绕着各自的散点缓慢摇摆 */
export function stepIntro(items, elapsed) {
  for (const it of items) {
    const phase = elapsed * it.wobbleSpeed + it.wobblePhase
    it.ox = it.cloudX + Math.sin(phase) * it.wobbleAmpX
    it.oy = it.cloudY + Math.cos(phase * 0.82) * it.wobbleAmpY
  }
}

/* ---------------- 开场：归位 ---------------- */

/** 把"此刻的位置"记作归位的起点，并给每个粒子分配错峰延时 */
export function beginSettle(items) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    it.startX = it.ox
    it.startY = it.oy
    it.vx = 0
    it.vy = 0
    it.delay = hash2(i, 31) * SETTLE_STAGGER_MS
    it.t = 0
  }
}

/**
 * 推进一帧归位。
 *
 * @param elapsed 从"开始归位"那一刻算起的毫秒数
 * @returns { allDone, maxMotion }
 */
export function stepSettle(items, elapsed) {
  let allDone = true
  let maxMotion = 0

  for (const it of items) {
    const raw = (elapsed - it.delay) / SETTLE_DURATION_MS
    const t = raw <= 0 ? 0 : raw >= 1 ? 1 : raw
    if (t < 1) allDone = false
    it.t = t

    // 起点 → 出生位置的插值；easeOutBack 会冲过头一点点再收回
    const remain = 1 - easeOutBack(t)
    it.ox = it.startX * remain
    it.oy = it.startY * remain

    const d = it.ox * it.ox + it.oy * it.oy
    if (d > maxMotion) maxMotion = d
  }

  return { allDone, maxMotion: Math.sqrt(maxMotion) }
}

/** 直接按到"已经就位"的状态（尺寸变化后重建、或跳过开场动画时用） */
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

/* ---------------- 常态：鼠标吹散 + 弹簧归位 ---------------- */

/**
 * 推进一帧常态物理。
 *
 * @param items          粒子数组
 * @param opts.dt        距上一帧的倍数（1 = 正好 60fps 一帧）
 * @param opts.progress  滚动进度 0~1（散开时鼠标影响会递减）
 * @param opts.mouse     { x, y, strength } 或 null
 * @returns { maxMotion }
 */
export function stepParticles(items, opts) {
  const { dt, progress = 0, mouse = null } = opts
  const step = Math.min(2, Math.max(0.5, dt))
  const dampStep = Math.pow(DAMPING, step)
  const springStep = SPRING * step
  const R2 = MOUSE_RADIUS * MOUSE_RADIUS
  const pushScale = mouse ? mouse.strength * Math.max(0, 1 - progress) : 0
  let maxMotion = 0

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

  return { maxMotion: Math.sqrt(maxMotion) }
}

/* ---------------- 取最终画面 ---------------- */

/**
 * 算出某个粒子此刻最终的样子。
 *
 * @param item      粒子
 * @param progress  滚动进度：0 = 山还在原地，1 = 完全散尽
 * @param width     山景容器的宽度（CSS 像素）
 * @param height    山景容器的高度
 */
export function particleTransform(item, progress, width, height) {
  const e = ease(progress)

  // ① 滚动散开：从画面中线向左右推开（中线左边的往左飞，右边的往右飞）
  const dir = item.x < width / 2 ? -1 : 1
  const scrollX = dir * e * item.speed * width * 0.62
  const scrollY = e * item.drift * height * 0.22

  // ② 偏移（无序云 / 归位 / 鼠标吹散）直接叠加在上面
  // ③ 越散越淡、越散越小
  return {
    x: item.x + scrollX + item.ox,
    y: item.y + scrollY + item.oy,
    size: item.size * (1 - 0.45 * progress),
    alpha: item.alpha * Math.max(0, 1 - progress * 1.05),
  }
}
