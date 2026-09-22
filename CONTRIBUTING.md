# 参与贡献

先谢谢你愿意花时间。这个仓库本身是一个个人主页，代码写得比较直白、注释也偏多，就是希望**任何人（包括未来的我自己）都能看懂**。所以请优先保证可读性，而不是炫技。

## 目录

- [开始之前](#开始之前)
- [本地开发](#本地开发)
- [提交规范](#提交规范)
- [代码风格](#代码风格)
- [提 PR 的流程](#提-pr-的流程)

## 开始之前

- Node.js **20 或以上**（仓库里有 `.nvmrc`，装了 nvm 的话直接 `nvm use`）
- 一个编辑器，推荐 VS Code（仓库里带了 `.vscode/` 推荐插件，打开会提示安装）
- 不需要任何后端服务，也不需要注册任何账号

## 本地开发

```bash
# 1. Fork 之后克隆你自己的仓库
git clone https://github.com/<你的用户名>/xiaji-home.git
cd xiaji-home

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

浏览器打开终端里打印的地址（默认 http://127.0.0.1:5173/），改代码会自动刷新。

## 提交规范

提交信息请遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：

```
<类型>(<范围>): <简短描述>
```

常用类型：

| 类型       | 用途                      |
| ---------- | ------------------------- |
| `feat`     | 新功能                    |
| `fix`      | 修复 bug                  |
| `style`    | 只改样式/格式，不影响逻辑 |
| `refactor` | 重构，行为不变            |
| `docs`     | 只改文档                  |
| `chore`    | 工程配置、依赖升级        |
| `perf`     | 性能优化                  |

例子：

```
feat(notes): 便签支持按时间倒序排列
fix(hero): 修复 Safari 下山景视差抖动
docs(readme): 补充 GitHub Pages 部署说明
```

## 代码风格

不要让风格问题占据 review 的篇幅 —— 交给工具：

```bash
npm run format   # Prettier 自动格式化（含 CSS、Markdown、YAML）
npm run lint     # ESLint 检查
npm run lint:fix # 能自动修的自动修
```

几条约定：

- **2 空格缩进、单引号、不加分号**（Prettier 配置里写死了，别手动对抗）
- 需要改文案 **只改 `src/data/site.js`**，不要把中文散落在组件里
- 颜色、间距、字体等一律用 `src/styles/tokens.css` 里的 CSS 变量，不要写死十六进制
- 动效记得考虑 `prefers-reduced-motion`（系统里开了「减少动态效果」时应自动关闭）
- 新增组件请新建自己的 `Xxx.css`，类名用 BEM 风格（`.card__title` 这种）
- 注释写「为什么」，而不是「做了什么」

## 提 PR 的流程

1. 从 `main` 开一个分支，名字能看出意图：`feat/note-search`、`fix/mobile-nav`
2. 提交前跑一遍完整检查：

   ```bash
   npm run check   # = lint + format:check + build
   ```

3. 在浏览器里真的看一眼效果，手机尺寸也确认一下
4. 提 PR，按模板填好，视觉类改动请附截图
5. CI 会跑 lint、格式检查和构建；全绿之后等 review

如果只是想改改自己那份主页（换名字、换内容），那**不需要提 PR** —— 直接 fork 之后在自己的仓库里改就行，MIT 许可证允许你这么做。
