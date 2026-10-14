import { describe, expect, it } from 'vitest'
import {
  MOUSE,
  fitToCells,
  makeParticles,
  planMorph,
  snap,
  step,
} from './figureParticles.js'

/** 造一排假格子（figures.js 采样出来的就是这种 { x, y }） */
function cells(n, spacing = 10) {
  return Array.from({ length: n }, (_, i) => ({
    x: (i % 20) * spacing,
    y: Math.floor(i / 20) * spacing,
  }))
}

describe('fitToCells', () => {
  it('格子比粒子多 → 抽稀到正好 count 个', () => {
    const src = cells(500)
    const out = fitToCells(src, 100, 4)
    expect(out).toHaveLength(100)
  })

  it('格子比粒子少 → 复制补齐到正好 count 个', () => {
    const src = cells(30)
    const out = fitToCells(src, 100, 4)
    expect(out).toHaveLength(100)
  })

  it('刚好一样多 → 原样返回', () => {
    const src = cells(100)
    const out = fitToCells(src, 100, 4)
    expect(out).toHaveLength(100)
  })

  it('补齐/抽稀都只落在既有格子上（图形不会多出点）', () => {
    const src = cells(30)
    const key = new Set(src.map((c) => `${c.x},${c.y}`))
    for (const c of fitToCells(src, 100, 4)) {
      expect(key.has(`${c.x},${c.y}`)).toBe(true)
    }
    const src2 = cells(500)
    const key2 = new Set(src2.map((c) => `${c.x},${c.y}`))
    for (const c of fitToCells(src2, 100, 4)) {
      expect(key2.has(`${c.x},${c.y}`)).toBe(true)
    }
  })

  it('空输入 / 0 粒子 → 空输出（不抛）', () => {
    expect(fitToCells([], 100, 4)).toEqual([])
    expect(fitToCells(cells(10), 0, 4)).toEqual([])
  })
})

describe('makeParticles', () => {
  it('数量对得上，且都散在盒子里', () => {
    const box = { x: 10, y: 20, w: 300, h: 200 }
    const items = makeParticles(200, box)
    expect(items).toHaveLength(200)
    for (const it of items) {
      expect(it.x).toBeGreaterThanOrEqual(box.x)
      expect(it.x).toBeLessThanOrEqual(box.x + box.w)
      expect(it.y).toBeGreaterThanOrEqual(box.y)
      expect(it.y).toBeLessThanOrEqual(box.y + box.h)
      expect(it.ox).toBe(0)
      expect(it.oy).toBe(0)
    }
  })
})

describe('planMorph / step / snap', () => {
  const box = { x: 0, y: 0, w: 400, h: 400 }

  it('变形会收敛：跑到时长+错峰之外一定全部落定', () => {
    const items = makeParticles(120, box)
    const target = cells(80)
    const total = planMorph(items, target, box, 0, { duration: 100, stagger: 50, cell: 4 })
    const r = step(items, total + 10, 100, 50, null)
    expect(r.allDone).toBe(true)
    for (const it of items) {
      expect(it.x).toBeCloseTo(it.toX, 6)
      expect(it.y).toBeCloseTo(it.toY, 6)
    }
  })

  it('cells 为空时冻结在原地：不抛错、不乱跑', () => {
    const items = makeParticles(30, box)
    const before = items.map((it) => ({ x: it.x, y: it.y }))
    // 模拟被光标推开的状态：冻结时偏移要收回、形状不动
    for (const it of items) {
      it.ox = 3
      it.oy = -2
    }
    const total = planMorph(items, [], box, 0, { duration: 100, stagger: 50, cell: 4 })
    expect(total).toBe(150)
    const r = step(items, total + 10, 100, 50, null)
    expect(r.allDone).toBe(true)
    items.forEach((it, i) => {
      expect(it.x).toBeCloseTo(before[i].x, 6)
      expect(it.y).toBeCloseTo(before[i].y, 6)
      expect(it.ox).toBe(0)
      expect(it.oy).toBe(0)
    })
  })

  it('snap 直接落到目标上', () => {
    const items = makeParticles(50, box)
    planMorph(items, cells(60), box, 0, { duration: 100, stagger: 50, cell: 4 })
    snap(items)
    for (const it of items) {
      expect(it.x).toBe(it.toX)
      expect(it.y).toBe(it.toY)
      expect(it.ox).toBe(0)
      expect(it.oy).toBe(0)
    }
  })

  it('A → B → A 之后，粒子回到 A 的格子里（形状复原；具体哪颗配哪格允许不同）', () => {
    const items = makeParticles(100, box)
    const shapeA = cells(70, 8)
    const shapeB = cells(45, 12)
    const keyA = new Set(shapeA.map((c) => `${c.x},${c.y}`))

    const total = 400
    planMorph(items, shapeA, box, 0, { duration: total, stagger: 0, cell: 4 })
    step(items, total + 10, total, 0, null)

    planMorph(items, shapeB, box, 0, { duration: total, stagger: 0, cell: 4 })
    step(items, total + 10, total, 0, null)

    planMorph(items, shapeA, box, 0, { duration: total, stagger: 0, cell: 4 })
    step(items, total + 10, total, 0, null)

    // 配对是按"当前位置"动态算的（就近优先），所以不要求逐颗回到原位；
    // 但形状必须复原：每颗粒子都落在 A 的格子上
    for (const it of items) {
      expect(keyA.has(`${it.x},${it.y}`)).toBe(true)
    }
  })

  it('配对比"每颗点找最近格子"完整：每个格子都分得到粒子', () => {
    // 两个几乎不重叠的形状：就近配对会让大半格子空着（CHANGELOG 里记着这个坑）
    const items = makeParticles(100, box)
    const left = cells(40, 5).map((c) => ({ x: c.x, y: c.y + 100 }))
    const right = cells(40, 5).map((c) => ({ x: c.x + 250, y: c.y + 100 }))
    planMorph(items, left, box, 0, { duration: 1, stagger: 0, cell: 4 })
    snap(items)

    planMorph(items, right, box, 0, { duration: 1, stagger: 0, cell: 4 })
    snap(items)

    const hit = new Set(right.map((c) => `${c.x},${c.y}`))
    const used = new Set(items.map((it) => `${it.x},${it.y}`))
    expect(used.size).toBeGreaterThan(hit.size * 0.9)
  })

  it('光标按坑：坑内推开、离开后流回、不过冲', () => {
    const items = makeParticles(60, box)
    planMorph(items, cells(50, 8), box, 0, { duration: 1, stagger: 0, cell: 4 })
    snap(items)
    const p = items[10]
    // 光标放旁边 10px：压格心正中心时方向向量是 (0,0)、推力为零（模型固有边缘情况）
    const mouse = { x: p.x - 10, y: p.y }

    for (let i = 0; i < 20; i++) step(items, i * 16, 1, 0, mouse)
    const pushed = Math.hypot(p.ox, p.oy)
    expect(pushed).toBeGreaterThan(0.5)
    // 推力不会超过设定深度（weight 上限 1.3 时最多 push*1.3）
    expect(pushed).toBeLessThanOrEqual(MOUSE.push * 1.31)

    let prev = pushed
    for (let i = 20; i < 220; i++) {
      step(items, i * 16, 1, 0, null)
      const d = Math.hypot(p.ox, p.oy)
      expect(d).toBeLessThanOrEqual(prev + 1e-9)
      prev = d
    }
    expect(prev).toBeLessThan(0.01)
  })
})
