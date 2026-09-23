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

/** 技能栈：一叠"横向条形"（跟这一页那五行技能条同一种语法）+ 轴 + 趋势线 */
function skills(ctx) {
  // 纵轴
  rect(ctx, 12, 12, 3, 76)
  // 五条：长度各不相同，左侧留出"名称位"
  const rows = [
    [20, 72],
    [32, 62],
    [44, 68],
    [56, 44],
    [68, 54],
  ]
  for (const [y, w] of rows) {
    rect(ctx, 22, y, 12, 5) // 名称块
    rect(ctx, 40, y, w, 5) // 条
    rect(ctx, 40, y, Math.round(w * 0.62), 5) // 已填的那一段（更实）
  }
  // 趋势：折线 + 节点
  ctx.lineWidth = 3
  ctx.beginPath()
  rows.forEach(([y, w], k) => {
    const x = 44 + w
    k === 0 ? ctx.moveTo(x, y + 2) : ctx.lineTo(x, y + 2)
  })
  ctx.stroke()
  for (const [y, w] of rows) {
    ctx.beginPath()
    ctx.arc(44 + w, y + 2, 3, 0, Math.PI * 2)
    ctx.fill()
  }
  rect(ctx, 12, 90, 80, 3) // 底轴
}

/** 项目作品：三张"项目卡片"叠在一起（跟这一页三张卡对应） */
function work(ctx) {
  // 后面四张先画（各带一条标题条），错开露出边角 —— 一叠卡片
  for (const [dx, dy] of [
    [20, 26],
    [15, 19],
    [10, 13],
    [5, 6],
  ]) {
    ctx.lineWidth = 3
    strokeRect(ctx, 6 + dx, 6 + dy, 58, 46)
    rect(ctx, 11 + dx, 11 + dy, 22, 3)
    rect(ctx, 11 + dx, 18 + dy, 14, 3)
  }
  // 最前面那张：标题栏 + 缩略图 + 两行说明 + 标签
  ctx.lineWidth = 5
  strokeRect(ctx, 20, 30, 68, 56)
  rect(ctx, 20, 30, 68, 8) // 标题栏
  rect(ctx, 26, 44, 22, 16) // 缩略图
  rect(ctx, 54, 44, 26, 4) // 说明两行
  rect(ctx, 54, 54, 20, 4)
  rect(ctx, 26, 68, 16, 6) // 标签
  rect(ctx, 46, 68, 20, 6)
  rect(ctx, 26, 78, 46, 3) // 页脚
}

/** 经历：一条时间轴（跟这一页那四条同一种语法）：轴 + 刻度 + 节点 + 上行折线 + 旗 */
function journey(ctx) {
  // 主轴
  rect(ctx, 12, 62, 76, 4)
  // 刻度 + 节点（越往后越大）
  const xs = [26, 42, 58, 74]
  xs.forEach((x, k) => {
    rect(ctx, x, 56, 2, 16) // 刻度
    ctx.beginPath()
    ctx.arc(x, 64, 5 + k * 1.4, 0, Math.PI * 2)
    ctx.fill()
  })
  // 上行折线：从第一个节点爬到最后一个
  ctx.lineWidth = 3
  ctx.beginPath()
  xs.forEach((x, k) => {
    const y = 46 - k * 8
    k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.stroke()
  // 尽头一面旗
  rect(ctx, 74, 6, 3, 14)
  ctx.beginPath()
  ctx.moveTo(77, 6)
  ctx.lineTo(90, 11)
  ctx.lineTo(77, 16)
  ctx.closePath()
  ctx.fill()
  // 底部年份位
  for (const x of xs) rect(ctx, x - 4, 74, 9, 4)
}

/** 联系方式：一个对话气泡 + 从里面飞出去的纸飞机（带虚线航迹） */
function contact(ctx) {
  // 气泡
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(10, 26)
  ctx.lineTo(58, 26)
  ctx.quadraticCurveTo(66, 26, 66, 34)
  ctx.lineTo(66, 50)
  ctx.quadraticCurveTo(66, 58, 58, 58)
  ctx.lineTo(30, 58)
  ctx.lineTo(20, 70) // 小尾巴
  ctx.lineTo(24, 58)
  ctx.lineTo(10, 58)
  ctx.quadraticCurveTo(2, 58, 2, 50)
  ctx.lineTo(2, 34)
  ctx.quadraticCurveTo(2, 26, 10, 26)
  ctx.closePath()
  ctx.stroke()
  // 气泡里两行"话"
  rect(ctx, 12, 38, 34, 4)
  rect(ctx, 12, 48, 22, 4)
  // 虚线航迹
  ctx.lineWidth = 3
  ctx.beginPath()
  for (const [x, y] of [
    [70, 52],
    [76, 44],
    [82, 36],
    [88, 28],
  ]) {
    ctx.moveTo(x - 3, y + 1)
    ctx.lineTo(x + 1, y - 1)
  }
  ctx.stroke()
  // 纸飞机
  ctx.beginPath()
  ctx.moveTo(96, 14)
  ctx.lineTo(72, 30)
  ctx.lineTo(84, 32)
  ctx.lineTo(80, 44)
  ctx.lineTo(88, 34)
  ctx.lineTo(96, 34)
  ctx.closePath()
  ctx.fill()
}

/** 留言便签：一"面"便签（三张叠着，最上面那张斜一点）+ 一支铅笔 */
function notes(ctx) {
  // 后面两张（错开露出边）
  for (const [dx, dy, rot] of [
    [12, 10, -0.05],
    [6, 5, 0.04],
  ]) {
    ctx.save()
    ctx.translate(50 + dx - 6, 52 + dy - 5)
    ctx.rotate(rot)
    ctx.lineWidth = 3
    strokeRect(ctx, -30, -34, 62, 62)
    ctx.restore()
  }
  // 最上面那张：折角 + 标题 + 项目符若干行
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(16, 14)
  ctx.lineTo(60, 14)
  ctx.lineTo(78, 32)
  ctx.lineTo(78, 90)
  ctx.lineTo(16, 90)
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(60, 14)
  ctx.lineTo(60, 32)
  ctx.lineTo(78, 32)
  ctx.stroke()
  rect(ctx, 26, 24, 22, 4) // 标题
  for (const [y, w] of [
    [40, 30],
    [50, 40],
    [60, 34],
    [70, 22],
  ]) {
    rect(ctx, 32, y, w, 4)
    rect(ctx, 24, y + 1, 4, 3) // 项目符
  }
  // 右上角斜放的铅笔
  ctx.save()
  ctx.translate(74, 30)
  ctx.rotate(0.62)
  rect(ctx, -5, -30, 10, 44)
  rect(ctx, -5, 14, 10, 5)
  ctx.beginPath()
  ctx.moveTo(-5, 19)
  ctx.lineTo(5, 19)
  ctx.lineTo(0, 30)
  ctx.closePath()
  ctx.fill()
  rect(ctx, -5, -34, 10, 4)
  ctx.restore()
}

const FIGURES = { about, skills, work, journey, contact, notes }
