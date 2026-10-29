# 内容后台（/admin）

后台用来**在浏览器里直接编辑网页显示内容**：改完点保存，前台刷新就能看到，
不需要登服务器改 `site.js`，也不需要重新构建、重启服务。支持把内容导出成
JSON 留档 / 迁移，以及从 JSON 导入恢复。

## 数据是怎么流动的

```
构建时：src/data/site.js ──vite build──> dist（默认内容，打包进 JS）
运行时：content/site.json ──GET /api/content──> 前台与默认值深合并
         ↑ PUT /api/content（要 token）
         └──── /admin 后台「保存」
```

- `src/data/site.js` 仍是**兜底默认值**：首屏第一帧直接渲染它（不闪空白），
  部署在 GitHub Pages 等没有 API 的地方也照常工作。
- 后台保存写的是 `content/site.json`（全量快照）。前台打开页面时拉这份
  内容与默认值深合并 —— 缺的字段自动回退默认值，所以内容文件旧一点也不会崩。
- `index.html` 的 `<title>` / og 分享卡片由服务器在响应时替换成线上内容里的
  `meta`，微信 / QQ 爬虫（不执行 JS）也能拿到新值。

## 首次启用（生产服务器）

1. 设置后台口令（**必须**，没设置时后台只读不可写）：

   ```bash
   # 首次启动：连口令一起传给 PM2
   ADMIN_PASSWORD='换成你自己的长口令' pm2 start ecosystem.config.cjs

   # 已经在跑的服务补配 / 换口令（所有已登录的 token 立即作废）
   ADMIN_PASSWORD='新口令' pm2 restart xiaji-home --update-env
   ```

2. 打开 `https://你的域名/admin`，输口令登录（一次管 12 小时）。
3. 左侧选分区（基本信息 / 首屏 / 关于我 / …… / 导航），右侧直接改，
   数组项可以增删和上下移动。改完点右上角**保存**。

本地开发不用配置：`npm run dev` 后打开 `/admin`，默认口令 `admin`
（可用环境变量 `ADMIN_PASSWORD` 覆盖）。dev / preview / 生产用的是同一套
API 实现（`server/api.cjs`），行为一致。

## 导入 / 导出

- **导出**：把当前编辑器里的内容下载成 `site-content-日期.json`。
  建议每次大改前导出一份留档。
- **导入**：选择之前导出的 JSON（或手工编辑的），载入**编辑器**——
  此时并没有生效，检查一遍后点**保存**才会写到服务器。
  兼容两种形状：完整的 `{ site, sectionTabs, navLinks }` 或裸的 site 对象。
- 服务器上还有自动备份：每次保存前，旧内容会拷一份到
  `content/backups/site-时间戳.json`，保留最近 10 份。改坏了又没导出过，
  登服务器把最近的备份拷回 `content/site.json` 即可。

## 安全说明

- 写接口（`PUT /api/content`）必须带登录 token；token 是用口令 HMAC 签名
  的时间戳，服务重启不失效，换口令全体作废。
- 登录错误 5 次锁同一 IP 10 分钟。
- 内容写入前做结构校验（只允许字符串 / 数字 / 布尔 / 对象 / 数组，≤512KB，
  嵌套 ≤8 层），并且**原子写**（先写临时文件再 rename）——断电也不会留下
  半个 JSON。
- 前台渲染没有任何 `dangerouslySetInnerHTML`，内容全部按纯文本转义。

## 常见问题

**保存了，前台怎么没变？** 前台是打开页面时拉内容，刷新一下就好；
`index.html` 本身是 `no-cache`，不会吃到旧缓存。

**后台改了 `meta`，微信分享卡片还是旧的？** QQ / 微信的爬虫缓存很顽固，
等它自己过期，或在对应的分享调试工具里刷新。

**想回到构建时的默认内容？** 后台删掉服务器上的 `content/site.json`
（或把它改名），前台就会回退到打包进去的 `site.js`。

**口令忘了？** 口令只在 PM2 环境变量里，登服务器按上面的 restart 命令重设。
