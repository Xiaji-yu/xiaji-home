# 更新日志

本项目的所有值得注意的改动都会记录在这个文件里。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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
