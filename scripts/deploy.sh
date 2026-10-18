#!/usr/bin/env bash
#
# 生产一键更新：拉代码 → 重装依赖 → 构建 → 优雅重载 → 健康检查。
# 任一步失败立即退出（set -e），PM2 里跑的仍是上一个可用版本。
#
# 用法（在仓库根目录）：
#   bash scripts/deploy.sh            # 常规更新（默认服务名 xiaji-home）
#   APP_NAME=my-homepage bash scripts/deploy.sh   # 服务名不同时覆盖
#   ALLOW_DIRTY=1 bash scripts/deploy.sh   # 本地有未提交改动时也强制部署
#
# 首次上线先把前置步骤做完，见 docs/PM2-DEPLOY.md。
set -euo pipefail

cd "$(dirname "$0")/.."

# 应用名：VPS 上实际在跑的服务名就是 xiaji-home。
# 如果 `pm2 ls` 的 NAME 列不是它，用 APP_NAME=<真实名字> 覆盖。
# 首次启动时 ecosystem.config.cjs 也读这个变量，避免"脚本找一个名字、
# PM2 里却起成另一个名字"。
APP_NAME="${APP_NAME:-xiaji-home}"
export APP_NAME

PORT="${PORT:-4173}"
HEALTH_URL="http://127.0.0.1:${PORT}/healthz"

echo "==> 应用名：${APP_NAME}（默认 xiaji-home，可用 APP_NAME=... 覆盖）"

if ! command -v pm2 >/dev/null 2>&1; then
  echo 'ERROR: 找不到 pm2。先安装：npm i -g pm2' >&2
  exit 1
fi

# reload 卡住 / 找不到服务时统一提示：怎么查名字、怎么手动重启
pm2_name_hint() {
  {
    echo
    echo '当前 PM2 进程列表（确认 NAME 列）：'
    pm2 ls --no-color 2>/dev/null || true
    echo
    echo '如果服务是用 root 启的，root 的列表里才看得到：'
    echo '  sudo pm2 ls'
    echo
    echo '用真实服务名重跑：'
    echo '  APP_NAME=<pm2 ls 里的名字> bash scripts/deploy.sh'
    echo '  sudo APP_NAME=<pm2 ls 里的名字> bash scripts/deploy.sh   # root 的 PM2'
    echo
    echo '或者手动重启：'
    echo '  pm2 restart <pm2 ls 里的名字> --update-env'
    echo '  sudo pm2 restart <pm2 ls 里的名字> --update-env          # root 的 PM2'
  } >&2
}

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

if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  echo "==> pm2 reload ${APP_NAME}（最多等 10 秒）"
  if ! timeout 10s pm2 reload "${APP_NAME}" --update-env; then
    echo "ERROR: pm2 reload ${APP_NAME} 超过 10 秒没有完成。" >&2
    echo '多半是服务名不对，或者服务跑在另一个用户（例如 root）的 PM2 下。' >&2
    pm2_name_hint
    exit 1
  fi
else
  # 端口已被占、但当前用户的 PM2 里没有这个名字：别再起一个抢端口，
  # 多半是名字 / 用户不一致，直接给出排查命令。
  if ss -ltn 2>/dev/null | awk '{print $4}' | grep -q ":${PORT}$"; then
    echo "ERROR: 当前 PM2 里没有「${APP_NAME}」，但端口 ${PORT} 已被占用。" >&2
    pm2_name_hint
    exit 1
  fi
  echo "==> 首次启动：pm2 start ecosystem.config.cjs（应用名 ${APP_NAME}）"
  pm2 start ecosystem.config.cjs --update-env
  pm2 save
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
  pm2 logs "${APP_NAME}" --lines 30 --nostream >&2 || true
  exit 1
fi

echo "==> 完成：$(pm2 describe "${APP_NAME}" | grep -E 'status|script' | head -2)"
