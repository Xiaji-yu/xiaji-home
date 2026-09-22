/* ==========================================================================
   点阵山景：用数学噪声 + 抖动（dithering）现场算出来
   不依赖任何图片素材

   这个文件只负责"山长什么样"：

     computeShade()   → 每个格子的墨量（0~1），山的全部数学都在这里
     isLit()          → 抖动判定：这个格子要不要放一颗点
     renderMountain() → 把结果画成静态点阵图（只有"减少动态效果"时才用）

   明暗的表达方式是刻意的：**所有点一样大、一样黑，只靠疏密**。
   墨量越大的格子被点亮的概率越高，于是深色的地方点挤成一片、
   浅色的地方只剩零星的几颗 —— 山的轮廓就是这么从"稀疏"里读出来的。
   这和参考图（一格格的白点铺出形状）是同一种语法。

   "把每个点亮的格子变成会飞的粒子"那部分在 lib/particles.js
   ========================================================================== */

/** 墨色（近黑）。位图和粒子用的是同一个颜色，保证视觉一致 */
export const INK = '17, 17, 17'

/** 纸色。和 tokens.css 里的 --paper 一致 */
export const PAPER = '245, 244, 241'

/**
 * 粒子直径 = 格子边长 × 这个系数。**所有点统一大小**，不随机。
 * 0.95 是个折中：点小巧、彼此留得出空隙（就是参考图那种点阵），
 * 而最黑的地方仍然挨得住、能压实成一片。
 * 想要更深就把这个值调大（上限约 1.2），想要更透气就调小（约 0.8）。
 */
export const DOT_FACTOR = 0.95

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

/* 四层山：越靠后（下标越小）越浅、越远；越靠前越黑、越实。
   peaks 里每一项是 [山头高度, 山头中心位置, 山头宽度]（位置与宽度都是 0~1 的比例），
   左右各一个山头，于是中间自然留下一道山谷。
   高度的含义：0 = 完全平地（山脊落在画面最底部），0.86 = 山脊顶到画面上方 14% 处。

   每一层的四个数决定它在点阵里"长什么样"：
     ridgeTone  山脊线上（也就是轮廓最上面那一排）的墨量 —— 决定了这道轮廓有多清楚
     baseTone   这一层最靠下的时候还剩多少墨量
     falloff    从山脊往下淡出的快慢。越大，山脊附近那条"实心剪影"越薄、往下越快变稀
     noise      山脊以下的岩石颗粒，别让大片区域死平 */
const LAYERS = [
  // 远山：山谷里露出来的那几道浅灰山脊，只有薄薄一层点
  {
    ridgeTone: 0.2,
    baseTone: 0,
    falloff: 4.5,
    noise: 0.06,
    seed: 13,
    freq: 1.3,
    amp: 0.13,
    peaks: [
      [0.62, 0.44, 0.42],
      [0.34, 0.86, 0.34],
    ],
  },
  // 中山
  {
    ridgeTone: 0.44,
    baseTone: 0.02,
    falloff: 4,
    noise: 0.07,
    seed: 47,
    freq: 1.7,
    amp: 0.12,
    peaks: [
      [0.68, 0.25, 0.34],
      [0.5, 0.82, 0.3],
    ],
  },
  // 近山
  {
    ridgeTone: 0.95,
    baseTone: 0.06,
    falloff: 2,
    noise: 0.09,
    seed: 89,
    freq: 2.2,
    amp: 0.1,
    peaks: [
      [0.78, 0.16, 0.26],
      [0.6, 0.86, 0.28],
    ],
  },
  // 最前面的黑山：左右各一座，山脊以下一大片是实心的，中间留空露出后面的层次
  {
    ridgeTone: 1,
    baseTone: 0.34,
    falloff: 0.5,
    noise: 0.08,
    seed: 151,
    freq: 3,
    amp: 0.09,
    peaks: [
      [0.86, 0.09, 0.2],
      [0.72, 0.88, 0.24],
    ],
  },
]

/** 山谷里那道斜着穿过去的亮带（雾气 / 河），宽度与最强处能压掉多少墨 */
const MIST = 0.92
const MIST_WIDTH = 0.16

/** 画面最底下再淡出一层，让山"落"在纸面上而不是被硬切一刀 */
const BOTTOM_FADE = 0.9
const BOTTOM_START = 0.86

/** 越靠下整体越亮一点（空气透视），山的底部于是有了一小块亮地板 */
const BOTTOM_LIGHTEN = 0.3

/** 最细的颗粒：让大块区域不至于死平 */
const GRAIN = 0.04

/**
 * 算出每个格子的"墨量"，以及它属于哪一层山。
 *
 * shade:  长度 cols*rows 的 Float32Array，0 表示这里没有山（留白），越接近 1 越黑
 * layer:  同样长度的 Uint8Array，0 = 最远的山、3 = 最前面的山
 *         （滚动散开时，粒子按这个逐层反向飞开，见 lib/particles.js）
 *
 * 行优先。
 */
export function computeShade(cols, rows) {
  const out = new Float32Array(cols * rows)
  const layerOf = new Uint8Array(cols * rows)

  // 每一层山，逐列算出山脊线的位置（0 = 顶部，1 = 底部）
  const ridges = LAYERS.map((L) => {
    const arr = new Float32Array(cols)
    for (let c = 0; c < cols; c++) {
      const cn = c / Math.max(1, cols - 1)

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

    const fade = 1 - smoothstep(BOTTOM_START, 1, v) * BOTTOM_FADE
    const lift = 1 - smoothstep(0.5, 1, v) * BOTTOM_LIGHTEN

    for (let c = 0; c < cols; c++) {
      const cn = c / Math.max(1, cols - 1)
      let shade = 0

      // 找到"最靠前、并且覆盖了这个格子"的那一层山
      for (let li = LAYERS.length - 1; li >= 0; li--) {
        const ridge = ridges[li][c]
        if (v >= ridge) {
          const L = LAYERS[li]
          const t = (v - ridge) / Math.max(1e-4, 1 - ridge) // 0=山脊线上，1=这一层最底下
          // 山脊线上最实，往下按 falloff 淡出
          shade = L.baseTone + (L.ridgeTone - L.baseTone) * Math.pow(1 - t, L.falloff)
          shade += (hash2(c * 3 + li * 17, r * 5 + li * 29) - 0.5) * L.noise
          layerOf[r * cols + c] = li
          break
        }
      }

      if (shade <= 0) continue
      shade *= fade * lift

      // 山谷里那道斜着穿过去的亮带
      const bandCenter = 0.34 + 0.5 * cn + (fbm(cn * 2.1, 770, 3) - 0.5) * 0.2
      const dist = (v - bandCenter) / MIST_WIDTH
      const band = Math.exp(-dist * dist) * (0.55 + 0.45 * hash2(c, r * 7 + 5))
      shade *= 1 - clamp01(band) * MIST

      // 细颗粒
      shade += (hash2(c * 5 + 7, r * 11 + 3) - 0.5) * GRAIN
      shade = clamp01(shade)

      if (shade > 0.015) {
        out[r * cols + c] = shade
      } else {
        out[r * cols + c] = 0
        layerOf[r * cols + c] = 0
      }
    }
  }

  return { shade: out, layer: layerOf }
}

/**
 * 抖动判定：墨量越大的格子，被点亮的概率越高。
 *
 * 阈值来自"交错梯度噪声"（interleaved gradient noise）：它比 8×8 的 Bayer 矩阵
 * 更接近蓝噪声 —— 点出来的颗粒是自然的沙粒感，而不是一层能看出周期的网点；
 * 又比纯随机数（白噪声）均匀，浅色区域不会结块。
 */
export function isLit(shade, c, r) {
  const x = c + 8.7
  const y = r + 3.1
  const raw = 52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1)
  return shade > raw - Math.floor(raw)
}

/** 每个格子用 R×R 个像素来画那颗圆点，保证圆点是圆的而不是方块 */
const RASTER_SUB = 6

/**
 * 把山画成静态点阵图（圆形点阵，和粒子版长得一样）。
 *
 * 只有系统开启「减少动态效果」时才会走到这里：那时完全不建粒子，
 * 直接把这张静态图显示出来。正常路径下这块画布始终透明。
 *
 * @param shade 可以传入已经算好的 computeShade() 结果，避免重复计算
 */
export function renderMountain(canvas, cols, rows, shade = null) {
  const ctx = canvas.getContext('2d')
  if (!ctx || cols < 2 || rows < 2) return null

  canvas.width = cols * RASTER_SUB
  canvas.height = rows * RASTER_SUB

  const field = shade || computeShade(cols, rows).shade
  const radius = (DOT_FACTOR * RASTER_SUB) / 2
  const TAU = Math.PI * 2

  ctx.fillStyle = `rgb(${INK})`
  ctx.beginPath()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const s = field[r * cols + c]
      if (s <= 0 || !isLit(s, c, r)) continue
      const x = (c + 0.5) * RASTER_SUB
      const y = (r + 0.5) * RASTER_SUB
      ctx.moveTo(x + radius, y)
      ctx.arc(x, y, radius, 0, TAU)
    }
  }
  ctx.fill()

  return field
}
