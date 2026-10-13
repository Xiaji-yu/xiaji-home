import { describe, expect, it } from 'vitest'
import { computeShade, isLit } from './dither.js'
import {
  SETTLE_MS,
  beginSettle,
  buildParticles,
  particleTransform,
  pickCell,
  resetToHome,
  setupIntro,
  stepIntro,
  stepParticles,
  stepSettle,
} from './particles.js'

/** 建一座小山：64×40 格、格子 4px —— 足够断言行为，又不至于慢 */
function build(cols = 64, rows = 40, cell = 4) {
  const field = computeShade(cols, rows)
  const items = buildParticles({
    cols,
    rows,
    shade: field.shade,
    layer: field.layer,
    cell,
  })
  return { field, items, cols, rows, cell }
}

describe('pickCell', () => {
  it('大画布 → 格子取上限（点不至于密到吃性能）', () => {
    expect(pickCell(3000, 2000)).toBe(4)
  })

  it('小画布 → 格子收到底限（手机上也保持 3px 一格的密度）', () => {
    expect(pickCell(200, 120)).toBe(3)
  })

  it('boost 抬高档位上下限（低端机减半粒子用）', () => {
    expect(pickCell(3000, 2000, 1.4)).toBe(6) // 4 × 1.4 向上取整
    expect(pickCell(200, 120, 1.4)).toBe(4) // 3 × 1.4 向上取整
    expect(pickCell(200, 120, 1)).toBe(3) // 不传就是 1
  })
})

describe('buildParticles', () => {
  const { field, items, cols, rows, cell } = build()

  it('粒子数 = 被点亮的格子数', () => {
    let lit = 0
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (field.shade[r * cols + c] > 0 && isLit(field.shade[r * cols + c], c, r)) lit++
      }
    }
    expect(items).toHaveLength(lit)
  })

  it('所有点一样大、一样黑（明暗只靠疏密，README 的核心卖点）', () => {
    const sizes = new Set(items.map((it) => it.size))
    expect(sizes.size).toBe(1)
    expect(items[0].size).toBeCloseTo(cell * 0.95)
    expect(items.every((it) => it.alpha === 1)).toBe(true)
  })

  it('出生位置 = 格子中心，且都在画布内', () => {
    for (const it of items) {
      expect(it.x).toBeGreaterThan(0)
      expect(it.x).toBeLessThan(cols * cell)
      expect(it.y).toBeGreaterThan(0)
      expect(it.y).toBeLessThan(rows * cell)
    }
  })

  it('每个粒子都记住自己属于哪层山、往哪边飞', () => {
    for (const it of items) {
      expect(it.layer).toBeGreaterThanOrEqual(0)
      expect(it.layer).toBeLessThan(4)
      // 偶数层往右、奇数层往左（滚动时逐层反向错开）
      expect(it.dir).toBe(it.layer % 2 === 0 ? 1 : -1)
    }
  })
})

describe('开场：无序云 → 归位', () => {
  it('散进带子里的点都在带子附近，且归位后偏移收回 0', () => {
    const { items } = build(32, 24)
    const box = { x: 100, y: 200, w: 400, h: 300 }
    setupIntro(items, box, 0, 0)

    for (const it of items) {
      const px = it.x + it.ox
      const py = it.y + it.oy
      expect(px).toBeGreaterThanOrEqual(box.x)
      expect(px).toBeLessThanOrEqual(box.x + box.w)
      expect(py).toBeGreaterThanOrEqual(box.y)
      expect(py).toBeLessThanOrEqual(box.y + box.h)
    }

    // 无序漂浮：位置在动，但出生位置不动
    const before = items.map((it) => ({ ...it }))
    stepIntro(items, 500)
    const moved = items.some((it, i) => it.ox !== before[i].ox)
    expect(moved).toBe(true)
    expect(items.map((it) => it.x)).toEqual(before.map((it) => it.x))

    // 归位：跑到超过 SETTLE_MS + 最大错峰，必须全部落定
    resetToHome(items)
    setupIntro(items, box, 0, 0)
    stepIntro(items, 300)
    // beginSettle 记下"此刻的位置"当起点
    beginSettle(items)
    const result = stepSettle(items, SETTLE_MS + 1000)
    expect(result.allDone).toBe(true)
    for (const it of items) {
      expect(it.ox).toBeCloseTo(0, 6)
      expect(it.oy).toBeCloseTo(0, 6)
      expect(it.t).toBe(1)
    }
  })
})

describe('stepParticles：光标按坑', () => {
  it('只有光标附近那一圈被推开，其余纹丝不动', () => {
    const { items } = build(48, 32)
    const victim = items[Math.floor(items.length / 2)]
    const far = items[0]
    // 光标放在受害者旁边 10px：压在格心正中心时方向向量是 (0,0)、推力为零，
    // 那是按坑模型的固有边缘情况；真实光标连续移动，偏离格心才是常态
    const mouse = { x: victim.x - 10, y: victim.y - 10, strength: 1 }

    stepParticles(items, { dt: 1, progress: 0, mouse })
    const pushed = Math.hypot(victim.ox, victim.oy)
    expect(pushed).toBeGreaterThan(0.5)
    // 远处的点：只要离得远（超过半径 38px）就不参与
    if (Math.hypot(far.x - mouse.x, far.y - mouse.y) > 38) {
      expect(Math.hypot(far.ox, far.oy)).toBe(0)
    }
  })

  it('移开后点慢慢流回，且永不过冲（一阶滞后）', () => {
    const { items } = build(48, 32)
    const p = items[Math.floor(items.length / 2)]
    const mouse = { x: p.x - 10, y: p.y - 10, strength: 1 }

    // 先按出一个坑
    for (let i = 0; i < 20; i++) stepParticles(items, { dt: 1, progress: 0, mouse })
    const pushed = Math.hypot(p.ox, p.oy)
    expect(pushed).toBeGreaterThan(1)

    // 光标离开：偏移绝对值应该只减不增（不过冲、不余振）
    let prev = pushed
    for (let i = 0; i < 200; i++) {
      stepParticles(items, { dt: 1, progress: 0, mouse: null })
      const d = Math.hypot(p.ox, p.oy)
      expect(d).toBeLessThanOrEqual(prev + 1e-9)
      prev = d
    }
    expect(prev).toBeLessThan(0.01)
  })
})

describe('particleTransform：滚动散开', () => {
  it('progress=0 时山在原地；progress=1 时完全淡出', () => {
    const { items } = build(32, 24)
    const it = items[10]
    const home = particleTransform(it, 0, 800, 400)
    expect(home.x).toBeCloseTo(it.x)
    expect(home.y).toBeCloseTo(it.y)
    expect(home.alpha).toBe(1)
    expect(home.size).toBeCloseTo(it.size)

    const gone = particleTransform(it, 1, 800, 400)
    expect(gone.alpha).toBe(0)
    expect(gone.size).toBeLessThan(home.size)
  })

  it('散开方向逐层反向：相邻层飞向相反的一侧', () => {
    const { items } = build(48, 32)
    const byLayer = new Map()
    for (const it of items) {
      if (!byLayer.has(it.layer)) byLayer.set(it.layer, it)
    }
    const layers = [...byLayer.keys()].sort()
    expect(layers.length).toBeGreaterThan(1)
    const dirs = layers.map((l) => {
      const it = byLayer.get(l)
      const t = particleTransform(it, 0.5, 800, 400)
      return Math.sign(t.x - it.x)
    })
    // 相邻层的方向：奇偶相同则同向、奇偶不同则反向（逐层反向错开）
    for (let i = 1; i < dirs.length; i++) {
      const sameParity = layers[i] % 2 === layers[i - 1] % 2
      expect(dirs[i]).toBe(sameParity ? dirs[i - 1] : -dirs[i - 1])
    }
  })
})
