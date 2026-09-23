/* ==========================================================================
   六个板块的图形（全部用代码画，不引任何图片）
   --------------------------------------------------------------------------
   每个图形都画在一个 100×100 的归一化画布里，由 FigureCanvas 按点阵采样成
   一颗颗粒子 —— 于是"右侧那个图形"就是粒子聚出来的，换板块时换个形状重聚。

   风格照着参考图来：实心 + 粗线的几何形，没有描边细节堆砌，
   点阵化之后轮廓依然清楚（细于两格的线在低网格里会断掉，所以线宽都给到 6）。
   ========================================================================== */

const INK = '#111111'

/**
 * 每个图形在画布里的落点：scale 是占画布的比例，dx/dy 是相对中心的偏移（画布比例）。
 *
 * **刻意让六个位置各不相同** —— 换板块时粒子不只是原地重排，而是"从这边挪到那边"，
 * 于是过渡里多了一层平移，不会显得生硬。偏移控制在 ±0.06，保证图形不会被画布切掉。
 */
const PLACEMENT = {
  about: { scale: 0.88, dx: -0.06, dy: -0.04 },
  skills: { scale: 0.9, dx: 0.05, dy: 0.05 },
  work: { scale: 0.94, dx: 0.01, dy: -0.05 },
  journey: { scale: 0.96, dx: -0.05, dy: 0.06 },
  contact: { scale: 0.86, dx: 0.06, dy: 0.02 },
  notes: { scale: 0.9, dx: -0.02, dy: 0.05 },
}

/** 统一入口：把某个板块的图形按它自己的落点画进 (0,0)-(size,size) 这块区域 */
export function drawFigure(id, ctx, size) {
  const shape = FIGURES[id]
  if (!shape || size <= 0) return
  const p = PLACEMENT[id] || { scale: 1, dx: 0, dy: 0 }

  ctx.save()
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = INK
  ctx.strokeStyle = INK
  ctx.lineWidth = 6
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'

  const box = size * p.scale
  ctx.translate(size / 2 + p.dx * size - box / 2, size / 2 + p.dy * size - box / 2)
  ctx.scale(box / 100, box / 100)
  shape(ctx)
  ctx.restore()
}

const rect = (ctx, x, y, w, h) => ctx.fillRect(x, y, w, h)

function strokeRect(ctx, x, y, w, h) {
  ctx.strokeRect(x, y, w, h)
}

/** 关于我：人像（头 + 肩），底下压一条地平线 */
function about(ctx) {
  // 头
  ctx.beginPath()
  ctx.arc(50, 32, 15, 0, Math.PI * 2)
  ctx.fill()
  // 肩：从两侧收上去的梯形，顶部带一点圆弧
  ctx.beginPath()
  ctx.moveTo(20, 88)
  ctx.lineTo(23, 68)
  ctx.quadraticCurveTo(34, 57, 50, 57)
  ctx.quadraticCurveTo(66, 57, 77, 68)
  ctx.lineTo(80, 88)
  ctx.closePath()
  ctx.fill()
  // 地平线
  rect(ctx, 14, 93, 72, 4)
}

/** 技能栈：一段往上走的阶梯 */
function skills(ctx) {
  const base = 90
  for (let i = 0; i < 4; i++) {
    const x = 9 + i * 20.5
    const top = 76 - i * 18
    rect(ctx, x, top, 20, base - top)
  }
  rect(ctx, 9, 93, 82, 3)
}

/** 项目作品：一个浏览器窗口（三张卡片叠在一起在点阵尺度下会糊成一团，换成这个） */
function work(ctx) {
  ctx.lineWidth = 5
  strokeRect(ctx, 10, 20, 80, 62)
  rect(ctx, 10, 32, 80, 4) // 标题栏
  for (const x of [18, 26, 34]) rect(ctx, x, 24, 5, 5) // 窗口按钮
  rect(ctx, 22, 50, 30, 4) // 内容两行
  rect(ctx, 22, 64, 46, 4)
}

/** 经历：一条时间轴，三个菱形节点（和板块里那排小方块同一种语言） */
function journey(ctx) {
  rect(ctx, 10, 47, 80, 6)
  for (const x of [22, 50, 78]) {
    ctx.beginPath()
    ctx.moveTo(x, 34)
    ctx.lineTo(x + 10, 50)
    ctx.lineTo(x, 66)
    ctx.lineTo(x - 10, 50)
    ctx.closePath()
    ctx.fill()
  }
}

/** 联系方式：信封 */
function contact(ctx) {
  ctx.lineWidth = 6
  strokeRect(ctx, 11, 27, 78, 46)
  ctx.beginPath()
  ctx.moveTo(11, 27)
  ctx.lineTo(50, 55)
  ctx.lineTo(89, 27)
  ctx.stroke()
}

/** 留言便签：一张折了角的便签纸 */
function notes(ctx) {
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(18, 12)
  ctx.lineTo(64, 12)
  ctx.lineTo(82, 30)
  ctx.lineTo(82, 88)
  ctx.lineTo(18, 88)
  ctx.closePath()
  ctx.stroke()
  // 折角
  ctx.beginPath()
  ctx.moveTo(64, 12)
  ctx.lineTo(64, 30)
  ctx.lineTo(82, 30)
  ctx.stroke()
  // 几行字
  for (const [y, w] of [
    [44, 34],
    [56, 42],
    [68, 24],
  ]) {
    rect(ctx, 28, y, w, 5)
  }
}

const FIGURES = { about, skills, work, journey, contact, notes }
