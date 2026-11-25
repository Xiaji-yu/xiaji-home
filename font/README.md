# 本目录放「跟着项目走的字体」

项目启动时会**自动遍历**这里的所有字体文件（含子文件夹），后台「字体」分区里
可以直接选用，不需要上传、也不需要重新构建之外的任何操作。部署在 GitHub Pages
这类没有后端的平台时，这里的字体同样可用（构建时会被打包进 dist）。

## 怎么放

- **单文件**：直接扔进来就行

  ```
  font/
  ├── PingFang.ttf
  └── ExampleSans.woff2
  ```

- **一个字体一个文件夹**（下载的字体包经常带 LICENSE，就这样放）：

  ```
  font/
  ├── SmileySans/            # 字体包解压后的整个文件夹
  │   ├── SmileySans-Oblique.ttf
  │   ├── SmileySans-Regular.ttf
  │   └── LICENSE.txt         # 许可证等非字体文件放一起，会被自动忽略
  └── LXGWWenKai/
      ├── LXGWWenKai-Regular.ttf
      └── OFL.txt
  ```

- 支持 `.ttf / .otf / .woff / .woff2`（大小写都认），其余文件（LICENSE、
  readme、.zip）自动跳过；**单个文件建议 ≤25MB**（中文字体整包通常 5~20MB，
  超大文件会拖慢首屏外的字体加载，纯展示站点不建议放超大超集字体）。

## 体积：先跑一次字体子集（强烈建议）

中文整包 TTF 通常 3~20MB，没缓存时首屏要等好几秒才能换成自定义字体。
项目带了一个子集脚本，跑一次即可：

```bash
npm run font:optimize            # 常用字：GB2312 一级 3755 字 + 拉丁 + 标点 + 本站文字
npm run font:optimize -- --site  # 只留本站实际用到的字（最小，但后台新增的字会回退）
npm run font:optimize -- --all   # 不裁字形，只转 woff2（最安全）
```

它会在每个 `.ttf / .otf` 旁边生成同名 `.woff2`（如 `屏显臻宋-瘦金风格.woff2`）。
`fonts.js` 遇到同 id 的 ttf / woff2 时自动选 woff2，构建时原始 ttf 不会进
`dist/`，所以原文件留在目录里没问题。**生成的 woff2 请一起提交** ——
GitHub Pages 这类纯静态构建不需要装任何工具链。

> ⚠ 子集化属于「修改字体」。字体许可证（包里自带的 LICENSE）不允许修改 /
> 再分发衍生版本时，请用 `--all` 只转格式，或者不放这个字体。

改了正文、加了不常见的字之后，重跑一次；源文件时间戳没变时脚本会跳过，
加 `--force` 可强制重做。

## 在后台里叫什么

每个字体的 id = 相对本目录的路径去掉扩展名（如 `SmileySans/SmileySans-Regular`），
前台内容 `site.typography` 的 `body / heading / mono` 存的就是这个 id。
同名不同文件夹不会冲突。

改完这里的内容（增删字体）后，dev 会自动热更新；生产环境重新 `npm run build`
即可。构建时会把「后台选中的字体」连同 `@font-face`、`:root` 变量覆盖和
`<link rel="preload" as="font">` 一起写进 `index.html`
（`scripts/font-html-plugin.mjs`），字体下载和 JS 并行，首帧就是自定义字体，
不用等 `/api/content` 回来。构建读的是当时的 `content/site.json`，所以在后台
换了字体后，重新 build 一次才能把这个首屏提速同步过去。
