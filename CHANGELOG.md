# 更新日志

本项目的所有值得注意的改动都会记录在这个文件里。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增

- **粒子系统重构为带状态的模拟**（`src/lib/particles.js`）：粒子有了弹性偏移与速度，用弹簧 + 阻尼积分，回弹会过冲一次再稳住（阻尼比约 0.36）。
- **载入时粒子汇聚成山**：约 5000 个方块从画面外的随机方向错峰飞入（`easeOutBack`，会冲过头一点再收回），落定后与位图交叉淡变，山体"凝实"。起飞时刻与开场遮罩滑走对齐（1.45s）。
- **鼠标吹散 + 弹簧归位**：光标附近的粒子被径向推开（带切向旋转分量，轻重不同的粒子推开距离不同），同时在粒子层上用纸色柔边圆盘把底下的位图擦掉 —— 于是山上真的出现一个空洞、颗粒堆在洞边。鼠标离开即撤掉推力，粒子弹簧式回弹并过冲。
- 粒子尺寸加入 0.6~1.6 倍的随机差异，越大的粒子越"重"、被推开得越少。
- 静止时仍不绘制任何粒子：未被扰动的粒子按位移量淡出，因此静止画面依旧是那张静态位图，帧循环也会自行停下。
- 手机降量到约 2600 个粒子；系统开启「减少动态效果」时完全不构建粒子。

### 变更

- `components/DotMountain.jsx` 由 `components/ParticleMountain.jsx` 取代（静态位图 + 粒子双图层）
- `lib/dither.js` 拆分为 `computeShade()` / `isLit()` / `renderMountain()`，墨量数据由位图与粒子共用

### 计划中

- 便签墙支持排序与搜索
- 深色模式切换（可选）
- 提供英文版文案

## [1.0.0] - 2026-01-05

### 新增

- 首屏：两行大标题的逐行推入动画、副标题、两颗胶囊按钮
- **点阵山景**：由分形噪声生成四层山脊，再用 8×8 Bayer 有序抖动渲染成方块颗粒，全页零图片素材（`src/lib/dither.js`）
- 鼠标移动时山景与标题的视差位移（仅在精确指针设备上启用）
- 自定义圆圈光标：跟手小黑点 + 带惯性拖尾的圆环，悬停可交互元素时放大
- 开场遮罩：`000 → 100%` 进度 + 2×2 方块标志动画
- 滚动揭示：进入视口时淡入上浮（`IntersectionObserver`，不引第三方动画库）
- 关于我、技能栈（进度条生长 + 数字滚动）、项目作品（悬停 3D 倾斜）、经历时间线、联系方式、留言便签、页脚表格网格
- 留言便签：100 字上限、存 localStorage、可单条撕掉
- 页脚斜线阴影条缓慢流动
- 自适应布局：桌面 / 平板 / 手机
- 无障碍与体验：完整响应 `prefers-reduced-motion`，自定义光标仅在鼠标设备启用，键盘可见焦点，语义化标签与 `aria-label`

### 工程化

- React 19 + Vite 8 工程；文案集中在 `src/data/site.js`
- ESLint 10（扁平配置）+ Prettier，含 `npm run check` 一键全检
- GitHub Actions：CI（lint + 格式 + 构建）与 GitHub Pages 自动部署
- Issue / PR 模板、Dependabot、EditorConfig、Git 属性、VS Code 推荐配置

[Unreleased]: https://github.com/Xiaji-yu/xiaji-home/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Xiaji-yu/xiaji-home/releases/tag/v1.0.0
