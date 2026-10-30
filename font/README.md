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

## 在后台里叫什么

每个字体的 id = 相对本目录的路径去掉扩展名（如 `SmileySans/SmileySans-Regular`），
前台内容 `site.typography` 的 `body / heading / mono` 存的就是这个 id。
同名不同文件夹不会冲突。

改完这里的内容（增删字体）后，dev 会自动热更新；生产环境重新 `npm run build`
即可。
