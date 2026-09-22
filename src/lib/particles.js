/* ==========================================================================
   粒子山景的"物理"部分
   --------------------------------------------------------------------------
   这个文件不碰 DOM，也不碰 canvas，只做几件事：

     pickCell()           按容器大小挑一个格子边长（从而决定粒子数量）
     buildParticles()     把山按疏密采样成一批**大小完全相同**的圆点
     setupIntro()         安排"开场无序云"：每个点撒进开场那条带子里的随机位置
     stepIntro()          推进一帧无序漂浮（缓慢摇摆，看起来是活的）
     beginSettle()        把此刻的位置记为起点，从这一刻开始归位
     stepSettle()         推进一帧归位插值（1.5 秒内全部落到山的轮廓上）
     stepParticles()      推进一帧常态：光标底下按出一个小坑 + 点慢慢流回原位
     particleTransform()  算出某个粒子此刻最终画在哪、多大、多透明

   两条关键约定：

   1. **所有点一样大、一样黑**。山的明暗完全由"哪里有格子被点亮"决定
      （见 dither.js 的 isLit），也就是靠稀疏表达轮廓，不靠点的大小或深浅。
      所以"开场那团乱点"和"归位后的山"是同一批点，只是位置不同。

   2. **归位就是"把偏移收回 0"**。粒子的出生位置 (x, y) 永远不动，
      每一帧只算一个偏移 (ox, oy)。无序云、归位、鼠标按坑全都是在改这个偏移，
      于是三种状态之间可以随时无缝切换。

   之所以把纯计算单独拎出来，一是组件里清爽，二是这些函数能在 Node 里直接跑 ——
   开发时就是把任意时刻渲染成图片来对着调的。
   ========================================================================== */

import { DOT_FACTOR, hash2, isLit } from './dither.js'

/* ---------------- 密度 ---------------- */

/**
 * 一格大约占多少平方像素。格子边长由屏幕面积算出来，于是无论多大的屏幕，
 * 点的**密度**都一致；再配合下面的上下限，桌面端稳定在 3~4px 一格
 * （也就是 1.5 万颗上下的点），手机上大约 3px 一格。
 */
const AREA_PER_CELL = 55000

/** 格子边长的上下限（CSS 像素）：越小越细腻，也越吃性能 */
const CELL_MIN = 3
const CELL_MAX = 4

/**
 * 挑一个格子边长。它同时决定了三件事：
 * 点阵的疏密、每颗点的直径（= cell × DOT_FACTOR）、以及计算量。
 */
export function pickCell(width, height) {
  const raw = Math.sqrt((width * height) / AREA_PER_CELL)
  return Math.min(CELL_MAX, Math.max(CELL_MIN, Math.round(raw)))
}

/* ---------------- 鼠标 ---------------- */

/**
 * 鼠标驱散只做一件事：在光标底下按出一个小坑。
 * 半径 38px（坑的直径 76px）、最深 26px —— 就一小圈，山的其余部分完全不参与。
 */
export const MOUSE_RADIUS = 38
export const MOUSE_PUSH = 26

/** 切向分量：让粒子稍微旋着让开，而不是纯径向弹开；坑很小，给一点就够 */
const MOUSE_CURL = 0.15

/** 跟随光标的速度：越大坑的边缘越利落（0.5 大约两帧到位） */
const MOUSE_FOLLOW = 0.5

/**
 * 回位速度：光标离开后，点按每秒 94% 的比例**慢慢**流回原位。
 *
 * 这里刻意不用弹簧：位移直接朝目标做指数收敛（一阶滞后），数学上永远不过冲，
 * 所以点是"被推走后停在原地、再缓缓流回去"，不会有来回晃动的余振。
 */
const RETURN_RATE = 0.045

/* ---------------- 开场：无序云 → 归位 ---------------- */

/** 点的无序状态持续多久。必须和页眉那根加载条的时长一致（components/Header.jsx） */
export const INTRO_MS = 2000

/** 归位总时长：错峰 + 单个点的飞行时间，加起来正好 1.5 秒 */
export const SETTLE_MS = 1500
export const SETTLE_STAGGER_MS = 420
export const SETTLE_DURATION_MS = SETTLE_MS - SETTLE_STAGGER_MS

/* ---------------- 曲线 ---------------- */

/** 平滑曲线：先慢、中间快、结尾慢 */
export function ease(t) {
  return t * t * (3 - 2 * t)
}

/**
 * 结尾带一点点过冲的缓出曲线：点会"冲过头再收回"，落定时有一点惯性。
 * 系数比标准值（1.70158，过冲约 10%）小很多 —— 这里的位移是从屏幕各处飞向
 * 山体，过冲太大会显得像炸开而不是凝聚，所以只留一点点。
 */
function easeOutBack(t) {
  const c1 = 0.6
  const c3 = c1 + 1
  const p = t - 1
  return 1 + c3 * p * p * p + c1 * p * p
}

/* ---------------- 构建 ---------------- */

/**
 * 把山采样成一批粒子。
 *
 * 采样规则很简单：把点阵里"被点亮"的格子逐个变成一颗点，位置就用格子中心，
 * 不加抖动、不抽样。于是点到点的间距是均匀的，而**哪里有格子被点亮**
 * 由墨量决定 —— 山的明暗、轮廓，全都体现为点的稀疏与密集。
 *
 * @param cols,rows  点阵网格的尺寸
 * @param shade      computeShade() 的 shade（每个格子的墨量）
 * @param layer      computeShade() 的 layer（每个格子属于哪一层山，0 = 最远）
 * @param cell       一个格子在屏幕上的边长（CSS 像素）
 */
export function buildParticles({ cols, rows, shade, layer, cell }) {
  const items = []
  const size = cell * DOT_FACTOR // 统一大小：全篇只有这一个尺寸

  // 按墨色从深到浅排序：绘制时按透明度分桶批量画（静止时它们都在同一个桶里，
  // 也就是一次 fill 画完整座山）
  const lit = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      const s = shade[idx]
      if (s > 0 && isLit(s, c, r)) lit.push(idx)
    }
  }
  lit.sort((a, b) => shade[b] - shade[a])

  for (let i = 0; i < lit.length; i++) {
    const idx = lit[i]

    items.push({
      // 出生位置（归位结束后它就落在这里）
      x: ((idx % cols) + 0.5) * cell,
      y: (Math.floor(idx / cols) + 0.5) * cell,

      // ↓ 外观：所有点完全一致
      size,
      alpha: 1,

      // ↓ 以下的数值只影响"怎么动"，不影响"长什么样"
      // 被鼠标推开时的响应（略有差异，散开的样子才自然）
      weight: 0.85 + 0.3 * hash2(idx, 3),
      // 滚动时往哪边飞：**按山的层逐层反向** —— 最前面那层往左，
      // 往后依次右、左、右。于是下滑时整座山像被拆成几张纸片错开滑走，
      // 而不是从画面中线往两边裂开。
      layer: layer[idx],
      dir: layer[idx] % 2 === 0 ? 1 : -1,
      // 横向飞散速度：0.55~1.45 倍，快慢不一 → 滚动散开时有层次
      speed: 0.55 + 0.9 * hash2(idx, 7),
      // 纵向的随机漂移（-0.75 ~ 0.75）
      drift: (hash2(idx, 11) - 0.5) * 1.5,
      // 被风吹时往哪边旋（左旋 / 右旋）
      curl: hash2(idx, 13) > 0.5 ? 1 : -1,

      // ↓ 以下是每帧变化的动态状态
      ox: 0, // 相对出生位置的偏移
      oy: 0,

      cloudX: 0, // 无序云里它散在哪儿（同样是"偏移"）
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

  return items
}

/* ---------------- 开场：无序云 ---------------- */

/**
 * 把粒子打散成"无序云"：每个点被随机丢进 box 这个矩形里的某个位置，
 * 并给一段缓慢摇摆的参数，让它看起来是漂着的而不是钉死的。
 *
 * 只改视觉偏移，不动出生位置 —— 归位就是把这些偏移收回 0。
 *
 * @param box      撒点区域（视口坐标 { x, y, w, h }）。开场用的是一条
 *                 "和加载进度条一样宽、半屏高、垂直居中"的带子，见 ParticleMountain.jsx
 * @param originX,originY  画布左上角相对视口的偏移：开场时画布铺满视口，
 *                 而出生位置是相对山景容器算的，需要这个换算才能"在视口里撒点"
 */
export function setupIntro(items, box, originX = 0, originY = 0) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i]

    // 目标是视口里的一个随机点；而当前点（偏移为 0 时）在视口里的位置是
    // (x + originX, y + originY)，所以偏移就是两者之差。
    const targetX = box.x + hash2(i, 41) * box.w
    const targetY = box.y + hash2(i, 43) * box.h
    it.cloudX = targetX - it.x - originX
    it.cloudY = targetY - it.y - originY

    // 缓慢摇摆：周期 3~8 秒，幅度 4~12px（带子比整屏小，晃动也收小一点）
    it.wobbleSpeed = 0.0008 + 0.0012 * hash2(i, 47)
    it.wobblePhase = hash2(i, 53) * Math.PI * 2
    it.wobbleAmpX = 4 + 8 * hash2(i, 59)
    it.wobbleAmpY = 3 + 7 * hash2(i, 61)

    it.ox = it.cloudX
    it.oy = it.cloudY
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
    it.delay = 0
    it.t = 1
  }
}

/* ---------------- 常态：鼠标按坑 + 慢慢流回 ---------------- */

/**
 * 推进一帧常态物理。
 *
 * 这是一个一阶滞后模型：每个点的偏移朝"目标偏移"按固定比例收敛。
 * 目标是"被光标推开的位置"（光标够得着的时候）或 0（够不着的时候），
 * 因为永远只是朝目标逼近、不会越过它，所以既没有余振，也不需要阻尼参数。
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
  const follow = 1 - Math.pow(1 - MOUSE_FOLLOW, step)
  const back = 1 - Math.pow(1 - RETURN_RATE, step)
  const R2 = MOUSE_RADIUS * MOUSE_RADIUS
  const pushScale = mouse ? mouse.strength * Math.max(0, 1 - progress) : 0
  let maxMotion = 0

  for (const it of items) {
    let targetX = 0
    let targetY = 0
    let rate = back

    // 光标够得着：目标就是被它推开的位置，跟得快
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
        targetX = (nx - ny * MOUSE_CURL * it.curl) * power
        targetY = (ny + nx * MOUSE_CURL * it.curl) * power
        rate = follow
      }
    }

    // 朝目标收敛：推走时快，回来时慢，且永远不会冲过头
    it.ox += (targetX - it.ox) * rate
    it.oy += (targetY - it.oy) * rate

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

  // ① 滚动散开：按"它属于哪一层山"逐层反向飞开（item.dir 在 buildParticles 里定好），
  //    同一层里再按各自的 speed 有快有慢，于是层与层错开、层内又有疏密
  const scrollX = item.dir * e * item.speed * width * 0.62
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
