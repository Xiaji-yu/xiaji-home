import { describe, expect, it } from 'vitest'
import { computeShade, hash2, isLit } from './dither.js'

/**
 * 点阵山的数学性质。这些是纯函数，断言的是"契约"而不是具体数值 ——
 * 山的形状参数（LAYERS）随便调，这些性质不该破。
 */

describe('hash2', () => {
  it('同样的输入永远得到同样的值（山景因此可复现）', () => {
    expect(hash2(3, 7)).toBe(hash2(3, 7))
    expect(hash2(-5, 12)).toBe(hash2(-5, 12))
  })

  it('输出落在 [0, 1)', () => {
    for (let i = 0; i < 500; i++) {
      const v = hash2(i * 37 - 100, i * 53 + 9)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('相邻格子的值不同（否则点阵会出现整片同亮同暗的块）', () => {
    expect(hash2(10, 0)).not.toBe(hash2(11, 0))
    expect(hash2(0, 10)).not.toBe(hash2(0, 11))
  })
})

describe('computeShade', () => {
  const cols = 64
  const rows = 40
  const { shade, layer } = computeShade(cols, rows)

  it('数组长度 = 格数', () => {
    expect(shade).toHaveLength(cols * rows)
    expect(layer).toHaveLength(cols * rows)
  })

  it('墨量落在 [0, 1]', () => {
    for (const s of shade) {
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })

  it('layer 只可能是四层山之一', () => {
    for (const l of layer) {
      expect(Number.isInteger(l)).toBe(true)
      expect(l).toBeGreaterThanOrEqual(0)
      expect(l).toBeLessThan(4)
    }
  })

  it('没有墨的格子不属于任何一层（layer 归零）', () => {
    for (let i = 0; i < shade.length; i++) {
      if (shade[i] === 0) expect(layer[i]).toBe(0)
    }
  })

  it('结果是确定的：同样的尺寸算出同样的山', () => {
    const again = computeShade(cols, rows)
    expect(Array.from(again.shade)).toEqual(Array.from(shade))
  })

  it('山确实有内容：既有点亮的格子，也有留白', () => {
    let lit = 0
    for (const s of shade) if (s > 0) lit++
    expect(lit).toBeGreaterThan(100)
    expect(lit).toBeLessThan(shade.length)
  })
})

describe('isLit', () => {
  it('全墨（shade=1）的格子一定点亮', () => {
    for (let c = 0; c < 50; c++) {
      for (let r = 0; r < 50; r += 7) {
        expect(isLit(1, c, r)).toBe(true)
      }
    }
  })

  it('没有墨（shade=0）的格子一定不点亮', () => {
    for (let c = 0; c < 50; c++) {
      for (let r = 0; r < 50; r += 7) {
        expect(isLit(0, c, r)).toBe(false)
      }
    }
  })

  it('点亮率随墨量单调上升（疏密表现明暗的根基）', () => {
    const rate = (shade) => {
      let lit = 0
      const n = 4000
      for (let c = 0; c < n; c++) if (isLit(shade, c, c % 37)) lit++
      return lit / n
    }
    const low = rate(0.2)
    const mid = rate(0.5)
    const high = rate(0.8)
    expect(low).toBeLessThan(mid)
    expect(mid).toBeLessThan(high)
    // 0.5 附近允许有序抖动固有的偏差，但不能偏离一半太多
    expect(mid).toBeGreaterThan(0.3)
    expect(mid).toBeLessThan(0.7)
  })
})
