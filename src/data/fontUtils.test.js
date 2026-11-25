/* 字体纯函数的契约：同 id 多格式挑 woff2、排序不能依赖 locale、
   typography → CSS 的拼接（构建期和运行期共用，必须逐字一致）。
   运行：npm test */
import { describe, it, expect } from 'vitest'
import { buildTypographyCss, dedupeFonts, sortFonts } from './fontUtils.js'

const font = (id, ext = 'ttf') => ({
  id,
  name: id,
  ext,
  kind: 'local',
  url: `/f/${id}.${ext}`,
})
const urlOf = (f) => `/${f.id}.${f.ext}`

describe('dedupeFonts', () => {
  it('同一字体有 ttf 和 woff2 时选 woff2', () => {
    const list = dedupeFonts([font('A', 'ttf'), font('A', 'woff2')])
    expect(list).toHaveLength(1)
    expect(list[0].ext).toBe('woff2')
  })

  it('顺序反过来（woff2 在前）也还是 woff2', () => {
    const list = dedupeFonts([font('A', 'woff2'), font('A', 'otf')])
    expect(list).toEqual([expect.objectContaining({ id: 'A', ext: 'woff2' })])
  })

  it('不同 id 全部保留，顺序不变', () => {
    const list = dedupeFonts([font('B'), font('A'), font('B', 'woff2')])
    expect(list.map((f) => `${f.id}:${f.ext}`)).toEqual(['B:woff2', 'A:ttf'])
  })
})

describe('sortFonts', () => {
  it('按代码单元排序（Node / 浏览器一致），不用 localeCompare', () => {
    const list = ['b', 'A', '夏', 'a', 'Z'].map((id) => font(id))
    expect(sortFonts(list).map((f) => f.id)).toEqual(['A', 'Z', 'a', 'b', '夏'])
  })
})

describe('buildTypographyCss', () => {
  const fonts = [font('serif', 'woff2'), font('mono', 'woff2')]

  it('三个角色各生成字体栈，标题字体排在正文字体前面', () => {
    const { css, vars } = buildTypographyCss({
      typo: { body: 'serif', heading: 'mono', mono: 'mono' },
      fonts,
      urlOf,
    })
    expect(css).toContain('font-family:"cf-0"')
    expect(css).toContain('font-family:"cf-1"')
    expect(vars).toContain('--sans:"cf-0", ')
    expect(vars).toContain('--heading:"cf-1", "cf-0", ')
    expect(vars).toContain('--mono:"cf-1", ')
  })

  it('标题和正文同一个字体时不重复拼接', () => {
    const { vars } = buildTypographyCss({
      typo: { body: 'serif', heading: 'serif' },
      fonts,
      urlOf,
    })
    expect(vars).toContain('--heading:"cf-0", ')
    expect(vars).not.toContain('"cf-0", "cf-0"')
  })

  it('选中的 id 已经不在字体库里 → 整个变量块留空（回退默认栈）', () => {
    const { css, vars } = buildTypographyCss({ typo: { body: 'gone' }, fonts, urlOf })
    expect(css).toContain('cf-0') // 默认仍然给所有字体出声明（和以前一致）
    expect(vars).toBe('')
  })

  it('onlySelected 只给选中的字体出 @font-face，并返回去重后的 selected', () => {
    const { css, selected } = buildTypographyCss({
      typo: { body: 'mono', heading: 'mono', mono: 'mono' },
      fonts,
      urlOf,
      onlySelected: true,
    })
    expect(css).toContain('cf-1')
    expect(css).not.toContain('cf-0')
    expect(selected).toHaveLength(1)
    expect(selected[0]).toMatchObject({ family: 'cf-1', ext: 'woff2', url: '/mono.woff2' })
  })

  it('没有任何选择时不产生变量覆盖', () => {
    const { vars, selected } = buildTypographyCss({ typo: {}, fonts, urlOf })
    expect(vars).toBe('')
    expect(selected).toEqual([])
  })
})
