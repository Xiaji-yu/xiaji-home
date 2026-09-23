/* ==========================================================================
   右侧那个图形用的粒子（纯计算，不碰 DOM / canvas）
   --------------------------------------------------------------------------
   和首屏那座山是同一套思路，但这里的任务简单得多：

     fitToCells()   把"要点亮的格子"配成固定数量的粒子目标（多了抽稀、少了复制补齐）
     MOUSE          光标按坑：跟主页那座山同一套做法，但半径与深度都小一档
                     （图形本身比山小，坑大了会糊成一片）
     planMorph()    让每颗粒子直接飞向新图形里**离自己最近**的那颗格子（就近配对）
     snap()         不做动画，直接落到目标上（系统开了「减少动态效果」时用）
     step()         推进插值

   每个粒子只做"从 A 插值到 B"这一件事，所以换板块就是一次插值：
   当前形状 → 新形状，就近配对之后看着像形状在变形、平移，而不是散开重排。
   全部落定之后主循环就停，和山那边一样不空转。
   ========================================================================== */

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/**
 * 光标按坑：主页那座山是半径 38 / 深 26，图形比它小一圈，这里按小一档来
 * （半径 30 / 深 20，主页是 38 / 26）—— 既按得出坑，又不至于把图形糊掉。
 */
export const MOUSE = {
  radius: 30,
  push: 20,
  curl: 0.15, // 一点切向，让点旋着让开
  follow: 0.5, // 推开时跟得快
  back: 0.045, // 回位时慢慢流回去
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** 确定性哈希：同一个下标永远得到同一个 0~1 随机数 */
function hash(i, salt) {
  let h = Math.imul(i + 1, 374761393) + Math.imul(salt, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/**
 * 把目标格子配成恰好 count 个位置。
 * 格子多 → 按哈希抽稀；格子少 → 复制补齐（**落在同一个格子中心**，像素上完全重合，
 * 只是让粒子总数恒定、切板块时不会有粒子凭空出现或消失）。
 *
 * 刻意不加抖动：图形要的是参考图那种一格一颗的整齐点阵，
 * 一抖就变成噪点云了（山那边也一样，只是山的"格子"更密）。
 */
export function fitToCells(cells, count, cell) {
  const out = []
  if (!cells.length || count <= 0) return out

  // 格子比粒子多：按哈希抽稀，抽不够就按**均匀间隔**补齐
  if (cells.length >= count) {
    const keep = count / cells.length
    for (let i = 0; i < cells.length && out.length < count; i++) {
      if (hash(i, 17) < keep) out.push(cells[i])
    }
    let k = 0
    while (out.length < count && k < count * 2) {
      out.push(
        cells[Math.min(cells.length - 1, Math.floor(((k + 0.5) * cells.length) / count))],
      )
      k++
    }
    while (out.length < count) out.push(cells[out.length % cells.length])
    return out
  }

  // 粒子比格子多：每个格子先各来一颗，多出来的**均匀摊到整张图上**
  // （从头顺次补的话，会有一半区域密度翻倍 —— 图形上就看出一圈圈深浅不均的印子）
  for (let i = 0; i < cells.length; i++) out.push(cells[i])
  const extra = count - cells.length
  for (let i = 0; i < extra; i++) {
    out.push(
      cells[Math.min(cells.length - 1, Math.floor(((i + 0.5) * cells.length) / extra))],
    )
  }
  void cell
  return out
}

/** 建一批粒子，初始位置在盒子里散着（等着第一次聚拢） */
export function makeParticles(count, box) {
  const items = []
  for (let i = 0; i < count; i++) {
    items.push({
      x: box.x + hash(i, 41) * box.w,
      y: box.y + hash(i, 43) * box.h,
      fromX: 0,
      fromY: 0,
      toX: 0,
      toY: 0,
      start: 0,
      delay: 0,
      // 光标按坑用：ox/oy 是"相对目标位置"的偏移
      ox: 0,
      oy: 0,
      weight: 0.75 + hash(i, 47) * 0.55,
      curl: hash(i, 53) * 2 - 1,
    })
  }
  return items
}

/**
 * 安排一次移动：从"此刻的位置"出发，去 (toX, toY)。
 * 用一份 { fromX, fromY, toX, toY, start, delay } 描述，step() 只做插值。
 */
function plan(items, targetAt, now, { duration, stagger }) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    // 从"看得见的位置"起飞（含按坑偏移），并把偏移归零 ——
    // 否则按坑的位移会被算两次
    it.fromX = it.x + it.ox
    it.fromY = it.y + it.oy
    it.ox = 0
    it.oy = 0
    const to = targetAt(i)
    it.toX = to.x
    it.toY = to.y
    it.start = now
    it.delay = hash(i, 53) * stagger
  }
  return duration + stagger
}

/**
 * 配对：把粒子与新图形的格子一一对上 —— 既要**每个格子都有粒子**（图形完整），
 * 又要**每颗点只走很短一段**（看起来是形状在"移动/流动"，而不是散开重聚）。
 *
 * 踩过的两个坑：
 *  1. 一开始让每颗点找"离自己最近的格子" —— 后一个图形大半格子分不到粒子：
 *     粒子都堆在两个图形重叠的那块，去抢同一个最近点（实测 3267 个格子只分到 539 个粒子，
 *     图形看着是空的）。
 *  2. 改成"两边各自按 上→下、左→右 排序后一一对应" —— 图形是完整了，但配出来的
 *     位移可以很大（人头上的点被配到时间轴左下角），中间帧糊成一团雾。
 *
 * 现在用**空间填充曲线（Morton 序）**：把画布切成小格，按 Z 字递归遍历给每个位置编一个
 * 一维序号。位置相近的点序号也相近，两边都按这个序号排序再一一对应，于是
 * 位移自然就被限制在邻近区域 —— 完整性和"就近"同时拿到，代价只有一次排序。
 */
const MORTON_QUANT = 4 // 先量化到 4px，避免相邻像素互相插队

function mortonKey(x, y) {
  const a = Math.max(0, Math.round(x / MORTON_QUANT)) & 0xffff
  const b = Math.max(0, Math.round(y / MORTON_QUANT)) & 0xffff
  let k = 0
  for (let i = 0; i < 16; i++) {
    k += ((a >> i) & 1) * (1 << (2 * i)) + ((b >> i) & 1) * (1 << (2 * i + 1))
  }
  return k
}

function orderByMorton(arr) {
  const keys = arr.map((p) => mortonKey(p.x, p.y))
  return arr.map((_, i) => i).sort((p, q) => keys[p] - keys[q])
}

function matchTargets(items, targets) {
  const itemOrder = orderByMorton(items)
  const targetOrder = orderByMorton(targets)
  const out = new Array(items.length)
  for (let k = 0; k < itemOrder.length; k++) {
    out[itemOrder[k]] = targets[targetOrder[k]] || targets[targets.length - 1]
  }
  return out
}

/**
 * 变形：每颗粒子直接飞向配对好的格子（不先散开、也不消失），
 * 错峰让动作像一道波，而不是整块一起平移。
 */
export function planMorph(items, cells, box, now, opts = {}) {
  const { duration = 780, stagger = 260, cell = 5 } = opts
  const targets = fitToCells(cells, items.length, cell)
  const paired = matchTargets(items, targets)
  return plan(items, (i) => paired[i], now, { duration, stagger })
}

/** 直接落到目标上（系统开了「减少动态效果」时用，不做动画） */
export function snap(items) {
  for (const it of items) {
    it.x = it.toX
    it.y = it.toY
    it.ox = 0
    it.oy = 0
  }
}

/**
 * 推进一帧；返回 { allDone, maxMotion }。
 * mouse 传 { x, y }（画布坐标）时，光标附近会按出一个坑：坑内快速推开、坑外缓慢流回。
 * 和主页那座山同一套一阶滞后，永远不会过冲。
 */
export function step(items, now, duration, stagger, mouse) {
  let allDone = true
  let maxMotion = 0

  const R2 = MOUSE.radius * MOUSE.radius
  const back = MOUSE.back
  const follow = MOUSE.follow

  for (const it of items) {
    const t = clamp01((now - it.start - it.delay) / Math.max(1, duration))
    if (t < 1) allDone = false
    const e = ease(t)
    it.x = it.fromX + (it.toX - it.fromX) * e
    it.y = it.fromY + (it.toY - it.fromY) * e

    const remaining = Math.abs(1 - e) * Math.hypot(it.toX - it.fromX, it.toY - it.fromY)
    if (remaining > maxMotion) maxMotion = remaining

    // ---- 光标按坑 ----
    let targetX = 0
    let targetY = 0
    let rate = back
    if (mouse) {
      const px = it.x + it.ox
      const py = it.y + it.oy
      const dx = px - mouse.x
      const dy = py - mouse.y
      const d2 = dx * dx + dy * dy
      if (d2 < R2) {
        const d = Math.sqrt(d2) || 0.001
        const nx = dx / d
        const ny = dy / d
        const power = (1 - d / MOUSE.radius) * MOUSE.push * it.weight
        targetX = (nx - ny * MOUSE.curl * it.curl) * power
        targetY = (ny + nx * MOUSE.curl * it.curl) * power
        rate = follow
      }
    }

    const dOx = (targetX - it.ox) * rate
    const dOy = (targetY - it.oy) * rate
    it.ox += dOx
    it.oy += dOy

    const motion = Math.hypot(dOx, dOy)
    if (motion > maxMotion) maxMotion = motion
  }

  return { allDone, maxMotion }
}
