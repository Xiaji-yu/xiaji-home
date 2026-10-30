/* font/ 目录字体的路径 → 条目推导是纯函数，断言的是契约：
   id 去掉 font/ 前缀和扩展名、name 取文件名、扩展名统一小写。
   运行：npm test */
import { describe, it, expect } from 'vitest'
import { toLocalFont, localFonts } from './fonts.js'

describe('toLocalFont', () => {
  it('单文件：id = 文件名去扩展名', () => {
    expect(toLocalFont('/font/PingFang.ttf', '/font/PingFang.ttf')).toMatchObject({
      id: 'PingFang',
      name: 'PingFang',
      ext: 'ttf',
      kind: 'local',
      url: '/font/PingFang.ttf',
    })
  })

  it('子文件夹（字体包 + LICENSE 那种结构）：id 带目录，name 只取文件名', () => {
    expect(toLocalFont('/font/SmileySans/Oblique.ttf', '/assets/x.woff2')).toMatchObject({
      id: 'SmileySans/Oblique',
      name: 'Oblique',
    })
  })

  it('扩展名大小写都认，且统一小写进 ext', () => {
    expect(toLocalFont('/font/A.TTF', 'u')).toMatchObject({ id: 'A', ext: 'ttf' })
    expect(toLocalFont('/font/B.WOFF2', 'u')).toMatchObject({ id: 'B', ext: 'woff2' })
  })

  it('兼容 ../ 开头的 glob key（老形态）', () => {
    expect(toLocalFont('../font/X.otf', 'u')).toMatchObject({ id: 'X', ext: 'otf' })
    expect(toLocalFont('../../font/Y/Deep.woff', 'u')).toMatchObject({ id: 'Y/Deep' })
  })
})

describe('localFonts（font/ 目录实况）', () => {
  it('数组元素形状合法（仓库自带 font/ 只有 README，条目数随目录内容变化）', () => {
    expect(Array.isArray(localFonts)).toBe(true)
    for (const f of localFonts) {
      expect(typeof f.id).toBe('string')
      expect(f.id.length).toBeGreaterThan(0)
      expect(['ttf', 'otf', 'woff', 'woff2']).toContain(f.ext)
      expect(f.kind).toBe('local')
      expect(typeof f.url).toBe('string')
    }
  })
})
