# 自托管部署：PM2 + Nginx

这份文档把 `xiaji-home` 部署到自己的服务器上，用 **PM2 看守一个零依赖的静态服务器**，
前面再套一层 **Nginx 反代 + TLS**。和 Cloudflare Workers（当前托管）二选一即可，
互不影响，切哪个只是改 DNS 的事。

```
浏览器 ──HTTPS──> Nginx(:443, TLS 终止) ──> 127.0.0.1:4173
                                              └─ server/index.cjs（PM2 看守）──> dist/
```

仓库里为此新增了四个文件，都不引入新依赖：

| 文件                   | 作用                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `server/index.cjs`     | node 内置 `http`/`fs`/`zlib` 写的静态服务器：SPA 回退、brotli/gzip、缓存头、`/healthz`、SIGTERM 优雅退出 |
| `ecosystem.config.cjs` | PM2 进程定义（fork 单实例、内存/重启上限、只监听 `127.0.0.1`）                                           |
| `scripts/deploy.sh`    | 一键更新：`git pull` → `npm ci` → `build` → `pm2 reload` → 健康检查，任一步失败即停                      |
| 本文档                 | 其余步骤（反代 / TLS / 开机自启 / 日志轮转 / 回滚 / 排错）                                               |

## 0. 前置条件

| 项       | 要求                                                      |
| -------- | --------------------------------------------------------- |
| Node     | ≥ 20.19（仓库 `.nvmrc` 是 22；`node -v` 确认一下）        |
| PM2      | `npm i -g pm2`（Node 24 下亦可 `pnpm add -g pm2`）        |
| 端口     | 应用监听 `127.0.0.1:4173`；对外开放 `80` / `443`（Nginx） |
| 防火墙   | 按需执行下面的 ufw 小节                                   |
| 运行用户 | 用**普通用户**跑 PM2，不要 root                           |

> 应用默认只监听 `127.0.0.1`，外部流量必须走 Nginx 反代。这既是安全习惯，
> 也保证以后想换反代（Caddy/Traefik）或加 Cloudflare 代理时不用改任何代码。

## 1. 首次部署

```bash
# 1) 代码就位（二选一）
git clone <仓库地址> ~/apps/xiaji-home && cd ~/apps/xiaji-home
# 或者直接把现有仓库拷过来；已在本机就 cd 到仓库根目录

# 2) 严格按锁文件装依赖，构建
npm ci
npm run build          # 产物在 dist/；约 100 kB，几秒完成

# 3) 交给 PM2
pm2 start ecosystem.config.cjs
pm2 save               # 把进程清单落盘（开机自启靠它）

# 4) 本地自检
curl -fsS http://127.0.0.1:4173/healthz            # → ok
curl -sI http://127.0.0.1:4173/ | grep -i cache    # → cache-control: no-cache
```

`npm run build` 支持 `BASE_PATH`，默认 `/`。自托管在根路径下**不用设**；
实在要放子路径（`https://example.com/portfolio/`）才需要
`BASE_PATH=/portfolio/ npm run build`（逻辑在 `vite.config.js`）。

### 应用默认行为（`server/index.cjs`）

- 带内容指纹的 `/assets/*`：`Cache-Control: public, max-age=31536000, immutable`
- `index.html`：`no-cache`（每次回源确认，站点更新后才能加载到新 hash 的资源）
- 其他静态文件：`public, max-age=3600`
- `Accept-Encoding` 里带 `br` 走 brotli、否则 `gzip`、都不支持才直出；
  压缩结果首次访问时算好并驻留内存（整站解压后约 1 MB），之后**零 CPU**
- 无扩展名的路径（SPA 路由）一律回退到 `index.html`；带扩展名但找不到的文件老实 404
- 目录穿越（`/../package.json` 这类）一律 404
- `GET`/`HEAD` 之外的方法 405；只暴露 `GET /healthz` 一个探针

## 2. 开机自启

```bash
pm2 startup            # 按它打印的命令执行（通常是 sudo env PATH=$PATH ... pm2 startup systemd）
pm2 save               # 必须 save：startup 只保证 PM2 醒来，save 保证它记得你的应用
```

验证：`sudo reboot` 后 `pm2 ls` 应能看到 `xiaji-home` 处于 `online`。

## 3. Nginx 反代 + TLS

`/etc/nginx/conf.d/xiaji-home.conf`（域名换成自己的，示例 `xiaji.xin`）：

```nginx
# 80 只干两件事：证书续期验证、其他一律跳 https
server {
  listen 80;
  server_name xiaji.xin www.xiaji.xin;
  location /.well-known/acme-challenge/ { root /var/www/html; }
  location / { return 301 https://xiaji.xin$request_uri; }
}

server {
  listen 443 ssl;
  http2 on;
  server_name xiaji.xin;

  ssl_certificate     /etc/letsencrypt/live/xiaji.xin/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/xiaji.xin/privkey.pem;

  access_log /var/log/nginx/xiaji-home.access.log;
  error_log  /var/log/nginx/xiaji-home.error.log;

  location / {
    proxy_pass http://127.0.0.1:4173;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # 后端已按 Accept-Encoding 做 brotli/gzip，Nginx 不要再压一次
    proxy_set_header Accept-Encoding $http_accept_encoding;
  }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx

# 证书：先拿到证再放开 443（用 webroot 模式，80 的验证路径已配好）
sudo certbot certonly --webroot -w /var/www/html -d xiaji.xin -d www.xiaji.xin
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run   # 确认自动续期没问题（certbot 自带 timer）
```

防火墙（只放行必要的面）：

```bash
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 4. 日常更新

```bash
bash scripts/deploy.sh
```

脚本流程（任一步失败即以非 0 退出，PM2 里跑的还是上一个可用版本）：

1. `git status` 体检——有未提交改动先拒绝（加 `ALLOW_DIRTY=1` 可强制）
2. `git pull --ff-only`
3. `npm ci`
4. `npm run build`，并确认 `dist/index.html` 真的在
5. `pm2 reload xiaji-home --update-env`（进程不存在时首次 `pm2 start` + `save`）
6. 轮询 `http://127.0.0.1:4173/healthz`，20 次内不 OK 就打印最近 30 行日志并失败退出

> PM2 的 fork 模式下 `reload` = 带优雅退出的重启：新进程通过
> `kill_timeout`(8s) 内收到 SIGTERM，旧进程处理完存量连接再退出。
> 静态站的这个窗口是**毫秒级**，访客基本无感知。

### 回滚

源码即部署态，回滚 = 退回去重新构建：

```bash
git log --oneline -5
git reset --hard <上一个好的commit>   # 或 git revert 掉引入问题的那次
bash scripts/deploy.sh
```

## 5. 日志轮转

PM2 的日志不做配置会无限涨，装一次官方模块并设定额：

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M        # 单文件最大 10M
pm2 set pm2-logrotate:retain 14           # 保留 14 份
pm2 set pm2-logrotate:compress true       # 旧文件 gzip
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:rotateModule true   # 连模块自身的日志也一起转
pm2 save                                  # 模块设置随之落盘
```

看日志：`pm2 logs xiaji-home`（实时）、`pm2 logs xiaji-home --lines 100 --nostream`。

## 6. 常用命令

| 操作         | 命令                                               |
| ------------ | -------------------------------------------------- |
| 启动         | `pm2 start ecosystem.config.cjs`                   |
| 重载（更新） | `pm2 reload xiaji-home --update-env`               |
| 重启         | `pm2 restart xiaji-home`                           |
| 停止         | `pm2 stop xiaji-home`                              |
| 删除定义     | `pm2 delete xiaji-home`                            |
| 进程列表     | `pm2 ls`                                           |
| 详情         | `pm2 describe xiaji-home`                          |
| 资源监控     | `pm2 monit`                                        |
| 日志         | `pm2 logs xiaji-home`                              |
| 落盘/自启    | `pm2 save` / `pm2 startup`                         |
| 本地预览     | `npm run build && PORT=4173 node server/index.cjs` |

想先在本机不经过 PM2 快速验证生产包：

```bash
npm run build
PORT=4173 node server/index.cjs    # 或 npm run preview（vite 自带）
```

## 7. 排错

| 现象                         | 原因 / 处理                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| 访问返回 404                 | 先 `curl 127.0.0.1:4173/healthz` 确认应用活着，再查 Nginx 是否 reload                       |
| 刷新子路由 404（别人不 404） | 说明回源的把请求打到了别的服务器；本站的设计本就是 SPA 回退，见 `server/index.cjs`          |
| `EADDRINUSE`                 | `lsof -i:4173` 找到占用者；`vite preview` 默认也占这个端口                                  |
| 页面还是旧版                 | 看 `curl -sI /` 的 `cache-control` 是否 `no-cache`；CDN/Cloudflare 代理也要清缓存           |
| pm2 reload 后不变化          | 确认 deploy.sh 真的重建了：`pm2 describe xiaji-home` 看 uptime 和 script 路径               |
| 日志涨满磁盘                 | 第 5 节的 pm2-logrotate 没配；`logs/` 已被 `.gitignore` 忽略                                |
| 证书过期                     | `sudo certbot renew --dry-run`；systemd timer 坏了就 `sudo systemctl restart certbot.timer` |

## 8. 安全自查清单

- [x] 应用只监听 `127.0.0.1`（`ecosystem.config.cjs` 里写死，改需显式 `HOST`）
- [x] PM2 以普通用户运行；不 `sudo pm2`
- [x] 防火墙只放行 `22/80/443`
- [x] 站点是纯静态，仓库里无密钥；`.env*` 已被 `.gitignore`（真需要环境变量走 PM2 的 `env`，别进仓库）
- [x] Nginx 强制 HTTPS；HTTP 只留 ACME 验证与跳转
- [x] `x-content-type-options` / `referrer-policy` 由应用统一下发（需要 CSP 之类新安全头，加在 `server/index.cjs` 的 `headers` 里即可）

要上监控（多机/告警）可以再 `pm2 plus` 接入 PM2 Plus，纯自用 `pm2 monit` 够看。
