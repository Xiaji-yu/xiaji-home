/**
 * PM2 进程定义 —— 用法：pm2 start ecosystem.config.cjs
 * 完整部署步骤（Nginx 反代 / TLS / 开机自启 / 日志轮转 / 更新回滚）
 * 见 docs/PM2-DEPLOY.md。
 */
module.exports = {
  apps: [
    {
      name: 'xiaji-home',
      script: 'server/index.cjs',
      cwd: __dirname,
      // 纯静态站单实例就够；cluster 对本地 localhost 通信反而多一层损耗
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10, // 启动即崩：10 次后停手，交给监控去报人
      min_uptime: '20s', // 活过 20s 算"稳了"，崩溃计数清零
      max_memory_restart: '200M', // 压缩缓存意外泄漏时的兜底（整站才 ~1 MB）
      kill_timeout: 8000, // 优雅退出最多等 8s（server/index.cjs 处理了 SIGTERM）
      listen_timeout: 3000, // 新进程 3s 内没监听成功判定启动失败
      watch: false, // 部署靠 scripts/deploy.sh 显式 reload，不监听文件
      source_map_support: false, // .cjs 没有 source map，开了只会骗人
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true, // 单应用：错误/标准输出合并进同一份，别拆两个文件
      time: true, // 日志带时间戳（配合 pm2-logrotate 才好读）
      env: {
        NODE_ENV: 'production',
        PORT: 4173,
        HOST: '127.0.0.1', // 只监听本地，外部流量一律走 Nginx 反代
      },
    },
  ],
}
