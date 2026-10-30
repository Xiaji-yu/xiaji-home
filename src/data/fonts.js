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
   ========================================================================== */

const EXT_RE = /\.(ttf|otf|woff|woff2)$/i

/** glob 的 key（'/font/X/xxx.ttf' 或 '../font/X/xxx.ttf'）→ 字体条目。纯函数，方便单测。 */
export function toLocalFont(file, url) {
  /* 去掉开头的 ../（可能多层）和 font/ 前缀，得到相对 font/ 的路径 */
  const rel = String(file)
    .replace(/^(?:\.\.\/)+/, '')
    .replace(/^\/?font\//, '')
  const id = rel.replace(EXT_RE, '')
  return {
    id,
    name: id.split('/').pop() || id,
    ext: (rel.match(EXT_RE)?.[1] || '').toLowerCase(),
    url,
    kind: 'local', // 与后台上传的字体（kind: 'uploaded'）区分
  }
}

export const localFonts = Object.entries(
  import.meta.glob('/font/**/*.{ttf,otf,woff,woff2,TTF,OTF,WOFF,WOFF2}', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
)
  .map(([file, url]) => toLocalFont(file, url))
  .sort((a, b) => a.id.localeCompare(b.id))
