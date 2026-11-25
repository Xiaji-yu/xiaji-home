/* ==========================================================================
   项目内置字体：自动遍历根目录 font/ 文件夹（结构说明见 font/README.md）
   --------------------------------------------------------------------------
   · 单文件（font/X.ttf）和「一个字体一个文件夹」（font/X/xxx.ttf + LICENSE）
     都支持 —— glob 递归收集，非字体文件天然落在收集范围外
   · 扩展名大小写都认：直接列两套，import.meta.glob 的模式匹配大小写敏感
   · Vite 在构建时把这些文件当 asset 打包（query: '?url' 拿最终地址），
     所以 GitHub Pages 这类没有后端的静态部署也能用内置字体
   · id = 相对 font/ 的路径去扩展名（如 `SmileySans/SmileySans-Regular`），
     前台 site.typography 的 body / heading / mono 存的就是它
   · 同一份字体同时有 .ttf 和 .woff2 时只保留 woff2（npm run font:optimize
     生成的子集），体积小、加载快
   ========================================================================== */

import { dedupeFonts, sortFonts, toLocalFont } from './fontUtils.js'

export { toLocalFont }

export const localFonts = sortFonts(
  dedupeFonts(
    Object.entries(
      import.meta.glob('/font/**/*.{ttf,otf,woff,woff2,TTF,OTF,WOFF,WOFF2}', {
        eager: true,
        query: '?url',
        import: 'default',
      }),
    ).map(([file, url]) => toLocalFont(file, url)),
  ),
)
