/* ==========================================================================
   点阵山景：用数学噪声 + 有序抖动（Bayer dithering）现场算出来
   不依赖任何图片素材

   这个文件只负责"山长什么样"：
     computeShade()   → 每个格子的墨量（0~1），山的全部数学都在这里
     isLit()          → 有序抖动判定：这个格子要不要被点亮
     renderMountain() → 把墨量画成点阵位图（静止状态用的就是它）

   "把每个点亮的格子变成会飞的粒子"那部分在 lib/particles.js
   ========================================================================== */

/* 8x8 Bayer 矩阵：有序抖动的核心。
   它决定"一个像素该不该被点亮"，用 8x8 的小图案模拟出灰阶的疏密。 */
const BAYER8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
]

/** 墨色（近黑）。位图和粒子用的是同一个颜色，保证视觉一致 */
export const INK = '17, 17, 17'

/** 纸色。鼠标"擦除盘"用它把底下的位图盖掉，所以必须和 tokens.css 里的 --paper 一致 */
export const PAPER = '245, 244, 241'

/** 确定性哈希：同样的 (x, y) 永远得到同样的 0~1 随机数 */
export function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const smooth = (t) => t * t * (3 - 2 * t)
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** 一维平滑噪声 */
function noise1(x, seed) {
  const i = Math.floor(x)
  const f = x - i
  const a = hash2(i, seed)
  const b = hash2(i + 1, seed)
  return a + (b - a) * smooth(f)
}

/** 分形噪声：把多层噪声叠加，得到自然的山脊起伏 */
function fbm(x, seed, octaves) {
  let sum = 0
  let amp = 1
  let freq = 1
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += noise1(x * freq, seed + o * 131) * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

/* 四层山：越靠后（下标越小）越浅、越远；越靠前越黑越高。
   peaks 里每一项是 [山头高度, 山头中心位置, 山头宽度]（位置和宽度都是 0~1 的比例），
   左右各一个山头，于是中间自然留下一道山谷。
   高度的含义：0 = 完全平地（山脊落在画面最底部），0.82 = 山脊顶到画面上方 18% 处。 */
const LAYERS = [
  // 远山：山谷里露出来的那几道浅灰色山脊
  {
    dark: 0.36,
    seed: 13,
    freq: 1.3,
    amp: 0.12,
    peaks: [
      [0.55, 0.42, 0.4],
      [0.3, 0.85, 0.36],
    ],
  },
  // 中山
  {
    dark: 0.54,
    seed: 47,
    freq: 1.7,
    amp: 0.11,
    peaks: [
      [0.62, 0.25, 0.34],
      [0.52, 0.82, 0.3],
    ],
  },
  // 近山
  {
    dark: 0.78,
    seed: 89,
    freq: 2.2,
    amp: 0.1,
    peaks: [
      [0.72, 0.16, 0.26],
      [0.62, 0.86, 0.28],
    ],
  },
  // 最前面的黑山：左右各一座高峰，中间留空（露出后面的层次）
  {
    dark: 1.0,
    seed: 151,
    freq: 3.0,
    amp: 0.09,
    peaks: [
      [0.82, 0.09, 0.2],
      [0.7, 0.88, 0.24],
    ],
  },
]

/**
 * 算出每个格子的"墨量"。
 * 0 表示这里没有山（留白），越接近 1 越黑。
 * 返回一个长度 cols*rows 的 Float32Array，行优先。
 */
export function computeShade(cols, rows) {
  const out = new Float32Array(cols * rows)

  // 每一层山，逐列算出山脊线的位置（0 = 顶部，1 = 底部）
  const ridges = LAYERS.map((L) => {
    const arr = new Float32Array(cols)
    for (let c = 0; c < cols; c++) {
      const cn = c / (cols - 1)

      // 把左右两个山头的高斯"鼓包"叠起来
      let peak = 0
      for (let p = 0; p < L.peaks.length; p++) {
        const d = (cn - L.peaks[p][1]) / L.peaks[p][2]
        peak += L.peaks[p][0] * Math.exp(-d * d)
      }
      peak = clamp01(peak)

      // 叠上分形噪声，山脊就不会是一条光滑的曲线
      const detail = (fbm(cn * 3.4 * L.freq, L.seed, 5) - 0.5) * 2 * L.amp
      arr[c] = clamp01(1 - peak + detail)
    }
    return arr
  })

  for (let r = 0; r < rows; r++) {
    const v = r / Math.max(1, rows - 1)

    // 底部整体淡出，避免在画布最后一像素处出现一条硬边
    const bottomFade = 1 - smoothstep(0.88, 1.0, v) * 0.9

    for (let c = 0; c < cols; c++) {
      const cn = c / Math.max(1, cols - 1)

      // 找到"最靠前、并且覆盖了这个格子"的那一层山
      let shade = 0
      for (let li = LAYERS.length - 1; li >= 0; li--) {
        const ridge = ridges[li][c]
        if (v >= ridge) {
          const t = (v - ridge) / Math.max(1e-4, 1 - ridge) // 0=山脊线上，1=最底部
          // 山脊附近更深（几乎实心剪影），越往下越亮；再叠一点岩石纹理
          shade = LAYERS[li].dark * (1.3 - 0.78 * t)
          shade += (hash2(c * 3 + li * 17, r * 5 + li * 29) - 0.5) * 0.46
          break
        }
      }

      if (shade <= 0) continue
      shade *= bottomFade

      // 一道斜着穿过去的亮带，模拟山谷里的雾气/河流
      const bandCenter = 0.34 + 0.5 * cn + (fbm(cn * 2.1, 770, 3) - 0.5) * 0.2
      const dist = (v - bandCenter) / 0.11
      const band = Math.exp(-dist * dist) * (0.55 + 0.45 * hash2(c, r * 7 + 5))
      shade *= 1 - clamp01(band) * 0.9

      // 细颗粒
      shade += (hash2(c * 5 + 7, r * 11 + 3) - 0.5) * 0.34
      shade = clamp01(shade)

      out[r * cols + c] = shade > 0.02 ? shade : 0
    }
  }

  return out
}

/** 有序抖动判定：墨量越大的格子，被点亮的概率越高 */
export function isLit(shade, c, r) {
  const threshold = (BAYER8[r & 7][c & 7] + 0.5) / 64
  return shade > threshold
}

/**
 * 把山画成点阵位图。
 * canvas 的"像素"故意做得很大（cols x rows 大约是 CSS 尺寸的 1/3），
 * 再靠 CSS 的 image-rendering: pixelated 放大 —— 这样得到的就是参考图那种
 * 颗粒方块质感，而且计算量极小。
 * 这是"静止状态"看到的那张图。
 */
export function renderMountain(canvas, cols, rows) {
  const ctx = canvas.getContext('2d')
  if (!ctx || cols < 2 || rows < 2) return null

  canvas.width = cols
  canvas.height = rows

  const shade = computeShade(cols, rows)
  const img = ctx.createImageData(cols, rows)
  const data = img.data

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const s = shade[r * cols + c]
      if (s <= 0 || !isLit(s, c, r)) continue

      const i = (r * cols + c) * 4
      data[i] = 17
      data[i + 1] = 17
      data[i + 2] = 17
      data[i + 3] = s > 0.94 ? 255 : 232
    }
  }

  ctx.putImageData(img, 0, 0)
  return shade
}
