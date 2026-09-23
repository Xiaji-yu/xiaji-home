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
 * 六个图形的"落点差异"现在由章节里的留白穴负责（每个穴位置不同），所以这里统一：
 * 居中、留 6% 内缩（保证描边不会被画布切掉）。想让某一块的图形大一点小一点，
 * 改那个面板里的 data-fig-scale。
 */
const PLACEMENT = {
  about: { scale: 0.94, dx: 0, dy: 0 },
  skills: { scale: 0.94, dx: 0, dy: 0 },
  work: { scale: 0.94, dx: 0, dy: 0 },
  journey: { scale: 0.94, dx: 0, dy: 0 },
  contact: { scale: 0.94, dx: 0, dy: 0 },
  notes: { scale: 0.94, dx: 0, dy: 0 },
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

/** 关于我：人像（头 + 肩 + 脖颈），外面一圈证件照的那种细框，底下压一条地平线 */
function about(ctx) {
  // 证件照外框
  ctx.lineWidth = 3
  strokeRect(ctx, 7, 7, 86, 86)
  // 头
  ctx.beginPath()
  ctx.arc(50, 32, 15, 0, Math.PI * 2)
  ctx.fill()
  // 脖颈
  rect(ctx, 45, 45, 10, 13)
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

/** 技能栈：一段往上走的阶梯（每级踏面一条边线）+ 顶上插一面小旗 */
function skills(ctx) {
  const base = 90
  for (let i = 0; i < 4; i++) {
    const x = 9 + i * 20.5
    const top = 76 - i * 18
    rect(ctx, x, top, 20, base - top)
    rect(ctx, x + 5, top + 5, 15, 3) // 踏面边线
  }
  rect(ctx, 9, 93, 82, 3)
  // 小旗：杆 + 旗面
  rect(ctx, 87, 6, 3, 18)
  ctx.beginPath()
  ctx.moveTo(90, 6)
  ctx.lineTo(99, 11)
  ctx.lineTo(90, 16)
  ctx.closePath()
  ctx.fill()
}

/** 项目作品：一个浏览器窗口（三张卡片叠在一起在点阵尺度下会糊成一团，换成这个） */
function work(ctx) {
  ctx.lineWidth = 5
  strokeRect(ctx, 10, 20, 80, 62)
  rect(ctx, 10, 32, 80, 4) // 标题栏
  for (const x of [18, 26, 34]) rect(ctx, x, 24, 5, 5) // 窗口按钮
  rect(ctx, 32, 36, 3, 46) // 侧栏分隔
  for (const y of [42, 52, 62]) rect(ctx, 39, y, 12, 3) // 侧栏条目
  rect(ctx, 56, 42, 28, 22) // 内容区的图位
  rect(ctx, 56, 70, 28, 3) // 内容线
  rect(ctx, 22, 50, 8, 4)
  rect(ctx, 22, 62, 8, 4)
}

/** 经历：一条蜿蜒向前的路，路边插着三面里程碑小旗，尽头一个箭头 */
function journey(ctx) {
  // 路：两段贝塞尔拼出来的 S 形，粗线点阵化之后是一条有走向的带子
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(6, 72)
  ctx.bezierCurveTo(26, 72, 30, 40, 48, 44)
  ctx.bezierCurveTo(66, 48, 70, 24, 92, 28)
  ctx.stroke()

  // 里程碑：一根杆 + 一面三角旗，立在路的三个位置上
  for (const [x, y] of [
    [24, 58],
    [48, 44],
    [70, 32],
  ]) {
    rect(ctx, x - 1.5, y - 24, 3, 24)
    ctx.beginPath()
    ctx.moveTo(x + 1.5, y - 24)
    ctx.lineTo(x + 14, y - 19)
    ctx.lineTo(x + 1.5, y - 13)
    ctx.closePath()
    ctx.fill()
  }

  // 起点：一个圆点（路的开始）
  ctx.beginPath()
  ctx.arc(6, 72, 4, 0, Math.PI * 2)
  ctx.fill()

  // 里程碑底座：杆下各一小段地面线
  for (const [x, y] of [
    [24, 58],
    [48, 44],
    [70, 32],
  ]) {
    rect(ctx, x - 6, y + 1, 12, 3)
  }

  // 尽头：一个指向右上的箭头
  ctx.beginPath()
  ctx.moveTo(96, 20)
  ctx.lineTo(84, 24)
  ctx.lineTo(89, 31)
  ctx.closePath()
  ctx.fill()
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
  // 邮票
  ctx.lineWidth = 3
  strokeRect(ctx, 70, 33, 13, 15)
  // 收件人两行
  rect(ctx, 18, 60, 24, 3)
  rect(ctx, 18, 66, 16, 3)
}

/** 留言便签：一张折了角的便签纸 + 一支斜放的铅笔（照参考图） */
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
  // 标题线 + 项目符 + 几行字
  rect(ctx, 28, 22, 22, 4)
  for (const [y, w] of [
    [44, 34],
    [56, 42],
    [68, 24],
    [78, 34],
  ]) {
    rect(ctx, 34, y, w, 4)
    rect(ctx, 26, y + 1, 4, 4) // 项目符
  }

  // 右上角斜放一支铅笔（照参考图 3 的手绘）：笔杆 + 金属箍 + 笔尖
  ctx.save()
  ctx.translate(74, 30)
  ctx.rotate(0.62)
  rect(ctx, -5, -30, 10, 44) // 笔杆
  rect(ctx, -5, 14, 10, 5) // 金属箍
  ctx.beginPath() // 笔尖
  ctx.moveTo(-5, 19)
  ctx.lineTo(5, 19)
  ctx.lineTo(0, 30)
  ctx.closePath()
  ctx.fill()
  rect(ctx, -5, -34, 10, 4) // 笔尾
  ctx.restore()
}

const FIGURES = { about, skills, work, journey, contact, notes }
