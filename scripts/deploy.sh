#!/usr/bin/env bash
#
# 生产一键更新：拉代码 → 重装依赖 → 构建 → 优雅重载 → 健康检查。
# 任一步失败立即退出（set -e），PM2 里跑的仍是上一个可用版本。
#
# 用法（在仓库根目录）：
#   bash scripts/deploy.sh            # 常规更新（git pull --ff-only）
#   ALLOW_DIRTY=1 bash scripts/deploy.sh   # 本地有未提交改动时也强制部署
#
# 首次上线先把前置步骤做完，见 docs/PM2-DEPLOY.md。
set -euo pipefail

cd "$(dirname "$0")/.."

APP_NAME="xiaji-home"
PORT="${PORT:-4173}"
HEALTH_URL="http://127.0.0.1:${PORT}/healthz"

echo '==> git pull --ff-only'
if [ -n "$(git status --porcelain --untracked-files=no)" ] && [ "${ALLOW_DIRTY:-0}" != "1" ]; then
  echo 'ERROR: 工作区有未提交的改动。先 commit/stash，或 ALLOW_DIRTY=1 强制部署。' >&2
  git status --short >&2
  exit 1
fi
git pull --ff-only

echo '==> npm ci（锁文件严格安装）'
npm ci

echo '==> npm run build'
npm run build

if ! ls dist/index.html >/dev/null 2>&1; then
  echo 'ERROR: 构建没产出 dist/index.html，不 reload。' >&2
  exit 1
fi

echo "==> pm2 reload ${APP_NAME}"
if npx pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  npx pm2 reload "${APP_NAME}" --update-env
else
  # 首次启动：进程还不存在，走 ecosystem 定义
  npx pm2 start ecosystem.config.cjs --update-env
  npx pm2 save
fi

echo "==> 健康检查 ${HEALTH_URL}"
ok=0
for _ in $(seq 1 20); do
  if curl -fsS --max-time 3 "${HEALTH_URL}" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 0.5
done
if [ "${ok}" != "1" ]; then
  echo "ERROR: 健康检查失败，最近 30 行日志：" >&2
  npx pm2 logs "${APP_NAME}" --lines 30 --nostream >&2 || true
  exit 1
fi

echo "==> 完成：$(npx pm2 describe "${APP_NAME}" | grep -E 'status|script' | head -2)"
