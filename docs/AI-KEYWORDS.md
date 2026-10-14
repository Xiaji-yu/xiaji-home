# 脱敏关键词集 · 供其他 AI 复刻的项目描述包

> **本文件已脱敏**：原项目中的姓名、昵称、邮箱、GitHub 地址、线上域名、备案号、个人博客、
> 座右铭、城市等全部替换为 `{{占位符}}`，可整段安全外传。
>
> **用途**：把下面任意一节直接粘贴给 ChatGPT / Claude / Gemini / DeepSeek / 通义 等 AI，
> 即可让它复刻、改造或参考实现一个同类项目。
>
> 原项目形态：单页个人主页模板（React + Vite，无图片素材，首屏点阵山由算法现场计算）。

---

## 0. 一分钟速览（先贴这段）

一个**黑白点阵（dither）风格的极简单页个人主页模板**：

- **设计**：编辑排版 / 极简粗野主义（editorial minimal brutalism）—— 米白纸底 `#F5F4F1` + 近黑墨色 `#111111`，细边框、直角、无阴影无渐变；大字号收紧字距的无衬线标题配小号等宽字体标签；板块之间用斜线阴影条（hatching）分隔，页脚做成表格状网格
- **技术**：React 19 + Vite，**零图片素材**，不引任何动画库（`IntersectionObserver` + CSS 过渡 + rAF 手写），生产包 gzip 后约 **80 kB**
- **核心**：首屏约 **1.5 万颗等大、等黑的圆点**，位置由「分形噪声山脊 + 交错梯度噪声抖动 + 有序抖动判定」现场算出，**明暗只靠疏密**表现
- **动效**：开场无序云 → 1.5s 归位成山；光标按出小坑后点慢慢流回（不过冲）；滚动时逐层反向错开（可逆）；换章节时粒子图形直接变形飞往新位置

---

## 1. 关键词集（按主题分组，可整段复制）

### A. 设计风格关键词

```
editorial layout / 编辑排版
minimal brutalism / 极简粗野主义
black & white only / 严格黑白灰
off-white paper background / 米白纸底 (#F5F4F1)
near-black ink / 近黑墨色 (#111111)
hairline borders / 细边框
square corners, no shadows, no gradients / 直角、无阴影、无渐变
tight letter-spacing display sans / 收紧字距的大字号无衬线标题
small monospace labels / 小号等宽字体标签
diagonal hatching dividers / 斜线阴影条分隔
table-like footer grid / 表格状页脚网格
grayscale dither / halftone / stipple aesthetic / 灰度点阵噪点美学
Swiss / International Typographic Style / 瑞士国际主义排版
design tokens via CSS variables / CSS 变量设计令牌
single accent-free palette / 无强调色
```

### B. 技术栈关键词

```
React 19 + Vite / single-page application / SPA
zero image assets / 零图片素材
procedural graphics / 程序化图形
Canvas 2D
pure CSS, no UI framework, no animation library / 无 UI 框架、无动画库
hand-written IntersectionObserver + CSS transitions + requestAnimationFrame
deterministic hash noise (integer hash via Math.imul)
pure-function lib separated from components / 纯函数库与组件分离
vitest unit tests for math
ESLint + Prettier
static dist output, subpath deploy via BASE_PATH
~80 kB gzipped production bundle
```

### C. 核心算法关键词（本项目灵魂）

```
procedural mountain terrain / 程序化山体
fractal Brownian motion (fbm) ridge noise / 分形噪声山脊
multi-layer ridges (4 layers, far = lighter, near = darker)
interleaved gradient noise jitter / 交错梯度噪声抖动
per-cell ink amount 0~1 / 每格墨量
ordered dithering threshold / 有序抖动判定
deterministic hash2(x, y) → same cell always same dot
uniform dot size, uniform color / 所有点等大等黑
density-only shading / 明暗只靠疏密，不靠大小和深浅
~15,000 particles / 约 1.5 万颗粒子
cell size derived from screen area (constant density) / 格子随屏幕面积自适应
intro scattered cloud → easeOutBack staggered settle / 开场无序云错峰归位
mouse crater: radius 38px, depth 26px / 光标按坑
first-order lag exponential return (4.5%/frame, no overshoot) / 一阶滞后回流不过冲
scroll-driven per-layer inverse offset (reversible) / 滚动逐层反向错开可逆
alpha-bucketed batched fill (one fill when idle) / 透明度分桶并集填充
Morton order (space-filling curve) particle pairing /  Morton 序配对变形
offset-only animation: birth position never changes / 只改偏移不改出生位置
pure functions renderable & verifiable in Node / 可在 Node 离线逐帧验证
```

### D. 信息架构与工程关键词

```
one data file for all copy (src/data/site.js) / 全站文案集中于一个文件
section order driven by data
per-section components with co-located CSS / 组件与同名 CSS 同目录
design tokens file (colors, fonts, spacing, easing) / 设计令牌文件
lib/ for pure math, components/ for DOM & canvas
offline frame-by-frame render verification during development
chapter = 100vh − header − status bar / 一章一屏
anchor-based deep linking + scroll restoration control / 锚点直达 + 刷新回到顶部
```

### E. 动效清单关键词

```
loading bar morphs into sticky header / 加载条长成页眉（同一 DOM 元素，无跳帧）
paper-colored overlay slides away on load / 纸色遮罩上滑离场
scattered particle cloud drifting during load / 开场无序云漂浮
settle into mountain silhouette (1.5s, slight overshoot) / 归位成山
cursor crater with slow return / 光标按坑慢慢流回
per-layer scatter on scroll / 滚动逐层错开
particle figure morphs between section slots / 粒子图形跨章节变形
ghost oversized text crossfade / 左下角大号幽灵字交叉淡入
custom circle cursor: dot + inertia ring / 自定义圆圈光标（跟手点 + 惯性拖尾）
back-to-top appears after 420px scroll / 滚过 420px 出现回到顶部
hero headline line-by-line push-in / 首屏大标题逐行推入
mouse parallax via CSS variables / CSS 变量鼠标视差
scroll reveal: fade + rise, staggered / 滚动淡入上浮逐条错落
skill bars grow + numbers count up / 技能条生长 + 数字滚动
card 3D tilt on hover / 卡片悬停 3D 倾斜
button fills from left / 按钮从左侧填充
animated hatching footer / 页脚斜线阴影条流动
```

### F. 无障碍与性能关键词

```
prefers-reduced-motion: skip particle system entirely, render static dither image instead / 减动效时不建粒子改用静态点阵图
(pointer: fine) detection before enabling custom cursor
aria-hidden decorative canvas / 装饰层对读屏隐藏
semantic HTML (header/main/section/footer/article/dl)
visible keyboard focus rings / 键盘焦点环
aria-label on icon-only controls
main loop self-stops when settled (zero idle cost) / 静止后主循环自行停止
touch device degradation (no custom cursor, no parallax) / 触屏降级
WCAG AA contrast for small labels (≥4.5:1)
```

---

## 2. 给其他 AI 的完整提示词（直接粘贴）

### 提示词 A · 完整复刻版

```text
请用 React 19 + Vite 实现一个黑白点阵（dither）风格的极简单页个人主页模板，要求如下：

【设计语言】
- 编辑排版 / 极简粗野主义：米白纸底 #F5F4F1 + 近黑墨色 #111111，细边框、直角、无阴影无渐变
- 大字号收紧字距的无衬线标题 + 小号等宽字体标签；板块之间用斜线阴影条（hatching）分隔；
  页脚做成表格状网格
- 全站用 CSS 设计令牌（一个 tokens 文件）集中管理颜色 / 字体 / 间距 / 缓动曲线，
  主缓动 cubic-bezier(0.2, 0.7, 0.2, 1)

【首屏点阵山（核心，零图片素材，Canvas 2D 现场计算）】
- 4 层山脊，从远到近越来越深：每层山脊线由分形噪声（fbm，多 octave，各自 seed/frequency/amplitude）
  生成，左右各一个峰、中间自然成谷
- 每个格子算出 0~1 的"墨量"：山脊线以下按 falloff 衰减，叠加噪声颗粒扰动，
  再叠加一道斜向的亮雾带与底部空气透视
- 用确定性整数哈希（Math.imul 实现）做有序抖动：hash(格子) < 墨量 则点亮该格
- 所有圆点等大、等黑（直径 = 格边长 × 0.95），明暗只靠疏密，没有实心色块
- 格子边长由屏幕面积算出（约 55000 px²/格，桌面 3~4px/格，共约 1.5 万颗点），密度与屏幕大小无关
- 三种状态共用同一批点，只改偏移量 (ox, oy)，出生位置永远不变：
  ① 开场无序云：点散落在"与加载条等宽、半屏高、垂直居中"的带子里缓慢摇摆
  ② 加载到 100% 的瞬间开始归位：1.5 秒内 easeOutBack 错峰落到山的轮廓上（带一点过冲）
  ③ 常态：光标底下按出半径 38px、最深 26px 的小坑（带 0.15 切向分量），
    移开后点以一阶滞后每帧指数收敛约 4.5% 流回原位，不过冲、不余振
- 滚动时粒子按所属山层逐层反向偏移（最前一层往左、下一层往右……），滚回顶部像素级复原（可逆）
- 绘制优化：按透明度分 10 个桶，每桶用一次 path 并集填充；静止时所有点同桶，
  整座山一次 fill 完成；动画停稳后主循环自行停止，零开销
- 相关数学全部写成不碰 DOM / canvas 的纯函数，可在 Node 里逐帧离线渲染验证，并配 vitest 单测

【页面结构】
- 加载条即页眉：开场时页眉是屏幕底部一根加载条（左侧品牌 + 右侧 000→100% + 底部进度线），
  进度满的那一刻它不滑走，而是整体上移停进页眉位置，随后进度线向两端延伸成通栏细线、
  百分比淡出、导航淡入；整个过程同一个 DOM 元素，交接无跳帧；之后是普通吸顶页眉
- 六个章节：关于我 / 技能栈 / 项目作品 / 经历 / 联系方式 / 留言便签，一章一屏
  （章节高 = 100vh − 页眉 56px − 首屏状态栏 45px）
- 每章内容区留一块位置各不相同的"留白穴"（中右/右上/左上/左中/右下/右中），
  穴内嵌一个粒子聚出的几何图形（人像/阶梯/浏览器窗口/时间轴/信封/便签，
  全部用代码画在 100×100 归一化画布里，线宽 ≥6，按 5px 格子采样成 6000 颗点）；
  切换章节时这些点按 Morton 序（空间填充曲线）一一配对，直接变形飞往新穴（约 1 秒，不先散开）
- 章节导航：屏幕两侧左右箭头（到头循环）+ 屏幕底部一条细线（线段长度表示当前在第几章），
  键盘 ←/→ 也可切换；页眉链接和 #锚点 都能切，地址栏同步，刷新/分享可直达某一章
- 其他组件：自定义圆圈光标（跟手小黑点 + 惯性拖尾圆环，悬停放大）、滚动淡入上浮（逐条错落）、
  技能条生长 + 数字滚动、项目卡片 3D 倾斜、按钮从左侧填充、
  右下角回到顶部（滚过 420px 才出现，平滑滚回）、刷新一律从顶部开始
- 留言便签墙：localStorage 存储、100 字上限、最多 60 张、点 × 单条撕掉、纯本地无后端
- 所有文案集中在一个数据文件（src/data/site.js）：姓名/技能/项目/经历/联系方式/页脚链接/章节顺序

【工程与无障碍】
- 尊重 prefers-reduced-motion: reduce：所有动画压到近乎瞬时、开场直接跳过、
  粒子系统完全不构建，改用同一套点阵算法渲染的静态图
- 自定义光标仅在 (pointer: fine) 且未开启减动效时启用；粒子层 aria-hidden
- 语义化标签、键盘可见焦点环、图标按钮有 aria-label
- 触屏设备自动关闭自定义光标与视差；格子边长随屏幕面积自适应
- 完整响应式：≤1279px 撤掉留白穴、隐藏图形、内容收为单列；手机端箭头贴边
- ESLint + Prettier + vitest；构建产物为纯静态 dist/
```

### 提示词 B · 最小可运行单文件版

```text
写一个自包含的单 HTML 文件（无依赖、无构建、保存后直接打开就能跑），
在米白底 #F5F4F1 上用 Canvas 2D 画一座"点阵山"：

1. 网格：格子边长约 3.5px，覆盖整个视口，共约 1.5 万个格子
2. 山形：4 层山脊，每层山脊线 = 分形噪声（fbm，4 个 octave，各层 seed/频率/振幅不同，
   左右各一个峰、中间成谷）；格子墨量 = 山脊线以下按指数衰减 + 噪声颗粒扰动
3. 抖动：用 Math.imul 实现确定性整数哈希 hash(x,y)∈[0,1)，hash < 墨量 则该格点亮一颗圆点
4. 视觉：所有圆点等大（直径≈3.3px）、等黑（#111111），明暗只靠疏密
5. 动效一：加载 2 秒内所有点无序散落在屏幕中下部一条带子里缓慢摇摆，
   随后 1.5 秒内 easeOutBack 错峰归位成山
6. 动效二：鼠标移动时在光标下按出半径 38px 的坑（越近推得越远，最多 26px），
   离开后每帧按 4.5% 指数收敛流回，不过冲
7. 动效三：页面滚动时整座山按层逐层反向偏移，滚回顶部完全复原
8. 性能：所有点同色同透明度，用一次 path 批量 fill；动画停稳后停止 rAF
```

### 提示词 C · 只复刻「光标按坑 + 回流」手感

```text
用 Canvas 2D 实现一个粒子群的"光标按坑"交互，手感要求：
- 画布上有一批等大等黑的圆点（约 1 万个，网格状排列即可）
- 鼠标移动时，只有光标半径 38px 内的点被推开：径向分量最多 26px，
  另加 0.15 的切向分量让点旋着让开；坑的边缘要利落（跟随系数约 0.5）
- 山的其余部分纹丝不动
- 鼠标移开后，所有点以一阶滞后流回：位移每帧向目标做指数收敛（约 4.5%/帧），
  不用弹簧、不加速度，因此永不过冲、无余振
- 给出可直接运行的完整 HTML，并说明每个常数的作用
```

### 提示词 D · 风格迁移版（改造现有页面）

```text
把现有页面改造成"黑白点阵粗野主义"风格，只做视觉层，不动功能：
- 全站只用两个颜色：纸底 #F5F4F1、墨色 #111111；去掉所有彩色、阴影、圆角、渐变
- 边框统一为 1px 近黑细线，模块四角全直角
- 标题改为大字号、收紧字距的无衬线体；所有小标签改为等宽字体、全大写或小字号
- 板块之间用 45° 斜线阴影条（repeating-linear-gradient）分隔
- 页脚改为表格状网格（细线分栏）
- 所有图片/插图替换为"点阵化"处理：等大圆点按疏密拼出明暗（有序抖动），或用代码画几何图形再点阵化
- 动效统一为"淡入 + 上浮 + 逐条错落"，缓动 cubic-bezier(0.2, 0.7, 0.2, 1)
- 加 prefers-reduced-motion 降级
```

---

## 3. 参数速查表（调参直接抄）

### 点阵山（dither）

| 参数         | 值                                                                   | 作用                                                                                                                   |
| ------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 山脊层数     | 4 层                                                                 | 从远到近越来越深、越实                                                                                                 |
| 每层参数     | `ridgeTone / baseTone / falloff / noise / seed / freq / amp / peaks` | 山脊墨量 / 底部残留墨量 / 向下淡出速度 / 岩石颗粒 / 山形种子 / 噪声频率 / 山脊破碎度 / `[高度, 中心, 宽度]` 左右各一峰 |
| `DOT_FACTOR` | 0.95                                                                 | 点直径 = 格边长 × 它；决定深色能否压实（0.8 透气 ~ 1.2 压实）                                                          |
| 格子边长     | 3~4px（桌面）                                                        | 由屏幕面积算出，密度恒定                                                                                               |
| 粒子总数     | 约 15,000                                                            | 桌面端                                                                                                                 |

### 粒子物理

| 参数                        | 值          | 作用                         |
| --------------------------- | ----------- | ---------------------------- |
| `AREA_PER_CELL`             | 55,000 px²  | 每格占多少平方像素 → 密度    |
| `CELL_MIN / CELL_MAX`       | 3 / 4       | 格子边长上下限               |
| `MOUSE_RADIUS / MOUSE_PUSH` | 38px / 26px | 坑半径 / 最深推距            |
| `MOUSE_CURL`                | 0.15        | 切向旋转分量                 |
| `MOUSE_FOLLOW`              | 0.5         | 坑边缘利落度                 |
| `RETURN_RATE`               | 4.5%/帧     | 回流速度（指数收敛，不过冲） |
| `INTRO_MS`                  | 2000ms      | 开场时长（= 加载条时长）     |
| 归位时长                    | 1.5s        | `easeOutBack` 错峰           |

### 版式与组件

| 参数              | 值                                                         |
| ----------------- | ---------------------------------------------------------- |
| 纸底 / 墨色       | `#F5F4F1` / `#111111`                                      |
| 主缓动            | `cubic-bezier(0.2, 0.7, 0.2, 1)`                           |
| 页眉高 / 状态栏高 | 56px / 45px                                                |
| 内容最大宽        | 1440px（章节列宽 `clamp(620px, 82vw, 1680px)`）            |
| 回到顶部出现阈值  | 滚动 420px                                                 |
| 便签上限          | 100 字 / 60 张 / localStorage                              |
| 章节图形          | 100×100 归一化画布、5px 格子、6000 点、线宽 6              |
| 减动效断点        | ≤1279px 隐藏留白穴与图形                                   |
| 字体              | Inter（标题/正文）+ JetBrains Mono（标签），可降级系统字体 |

---

## 4. 数据结构（site.js schema，供 AI 复刻）

```js
{
  site: {
    name, nameEn, email, github,           // 基本信息
    heroTitle: [两行英文大标题],
    heroSub, heroCta: [{label, href, solid}],
    heroStatus: { left, right },
    about:   { lead, paragraphs: [], facts: [[k, v]] },
    skills:  [{ name, note, value: 0~100 }],
    projects:[{ id, title, titleCn, desc, tags: [], year, link }],
    timeline:[{ year, title, text }],
    contact: { headline, sub, channels: [{label, value, href, note}] },
    notes:   { headline, sub, maxLength: 100, placeholder },
    footer:  { tagline, copyright, credit, beian: {...}, socials: [], columns: [] }
  },
  sectionTabs: [{ id, cn, en }],           // 六章顺序与中英文名
  navLinks:    [{ label, href }]
}
```

---

## 5. 脱敏映射表（原文 → 通用示例值）

本仓库已按此表完成就地脱敏（`main` 分支），直接取用即可：

| 原文（敏感）                      | 通用示例值（已采用）                 |
| --------------------------------- | ------------------------------------ |
| 姓名 / 昵称（中文与罗马字）       | `Your Name` / `YOUR NAME`            |
| 个人邮箱                          | `your-name@example.com`              |
| GitHub 用户名与主页               | `github.com/your-name`               |
| 线上域名                          | `example.com`                        |
| Workers 线上地址                  | `your-home.your-account.workers.dev` |
| 个人博客地址                      | `https://example.com`                |
| ICP 备案号                        | `你的ICP备案号`                      |
| 公网安备备案号                    | `你的公网安备备案号`                 |
| 座右铭 / 个人 slogan              | `保持好奇，持续构建`                 |
| 所在城市                          | `你的城市`                           |
| 仓库名 / 应用名 / PM2 进程名      | `my-homepage`                        |
| localStorage 键名（原含个人标识） | `my-homepage-notes-v1`               |
| 版权行                            | `© 2026 Your Name`                   |
| og:image 绝对地址                 | `https://example.com/og-cover.png`   |

> `docs/` 下三张效果图中的页眉品牌、加载条品牌、「关于我」信息表，均改为**擦除后用占位内容重绘**
> （`Y / Your Name / YOUR NAME`、`your-name@example.com` 等），与代码里的占位值一致 —— 整组图片
> 看起来就是脱敏后模板站的真实截图，别人拿到即可直接套用；`dist/` 为 gitignore 的本地构建产物，
> 改完后重新 `npm run build` 即可同步。
