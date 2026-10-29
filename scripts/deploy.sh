#!/usr/bin/env bash
#
# 生产一键更新：拉代码 → 重装依赖 → 构建 → 优雅重载 → 健康检查。
# 任一步失败立即退出（set -e），PM2 里跑的仍是上一个可用版本。
#
# 用法（在仓库根目录）：
#   bash scripts/deploy.sh            # 常规更新（默认服务名 xiaji-home）
#   APP_NAME=<别的名字> bash scripts/deploy.sh   # 服务名不同时覆盖
#   APP_NAMESPACE=<命名空间> bash scripts/deploy.sh # PM2 里有同名服务时进一步限定
#   PORT=<端口> bash scripts/deploy.sh           # 覆盖健康检查端口（首次启动也用它）
#   HEALTH_URL=<完整地址> bash scripts/deploy.sh # 完全自定义健康检查地址
#   ALLOW_DIRTY=1 bash scripts/deploy.sh   # 本地有未提交改动时也强制部署
#   RECREATE=1 bash scripts/deploy.sh      # PM2 里同名进程跑的不是本仓库服务端时，删掉重建
#
# 用运行 PM2 的普通用户执行，不要 sudo / root。
# 首次上线先把前置步骤做完，见 docs/PM2-DEPLOY.md。
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_DIR="$(pwd -P)"
EXPECTED_SCRIPT="${REPO_DIR}/server/index.cjs"

if [ "$(id -u)" -eq 0 ]; then
  echo 'ERROR: 不要用 root / sudo 跑部署脚本。' >&2
  echo '      用运行 PM2 的普通用户（例如 xiaji）执行：bash scripts/deploy.sh' >&2
  echo '      sudo 会把 dist/ 和 node_modules/ 改成 root 属主，之后普通用户反而更新不了。' >&2
  exit 1
fi

# 应用名：VPS 上实际在跑的服务名就是 xiaji-home。
# 如果 `pm2 ls` 的 NAME 列不是它，用 APP_NAME=<真实名字> 覆盖。
# 首次启动时 ecosystem.config.cjs 也读这个变量，避免"脚本找一个名字、
# PM2 里却起成另一个名字"。
APP_NAME="${APP_NAME:-xiaji-home}"
APP_NAMESPACE="${APP_NAMESPACE:-}"
export APP_NAME APP_NAMESPACE

if ! command -v pm2 >/dev/null 2>&1; then
  echo 'ERROR: 找不到 pm2。先安装：npm i -g pm2' >&2
  exit 1
fi

# 健康检查端口优先顺序：
#   1. 显式 PORT=<端口>
#   2. PM2 里这个应用实际使用的 PORT（端口由 ecosystem / PM2 决定，脚本不猜）
#   3. 都没取到时退回 4173（和 ecosystem.config.cjs 的默认值一致）
#
# PM2 通常挂着不止一个服务：这里只认 name 等于 APP_NAME 的进程，
# 同名有多个时优先 online 的那个；设了 APP_NAMESPACE 时再按 namespace 过滤。
read_pm2_port() {
  pm2 jlist 2>/dev/null | node -e '
    let raw = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => (raw += chunk))
    process.stdin.on("end", () => {
      try {
        const apps = JSON.parse(raw).filter(
          (item) =>
            item.name === process.env.APP_NAME &&
            (!process.env.APP_NAMESPACE ||
              item.pm2_env?.namespace === process.env.APP_NAMESPACE),
        )
        const app = apps.find((item) => item.pm2_env?.status === "online") ?? apps[0]
        const port = app?.pm2_env?.env?.PORT ?? app?.pm2_env?.PORT
        if (port) process.stdout.write(String(port))
      } catch {
        /* jlist 输出不是 JSON 时留给下面的默认值兜底 */
      }
    })
  '
}

# PM2 里这个应用实际执行的脚本绝对路径 —— 用来确认它真的是本仓库的 server/index.cjs。
# 同名进程跑着别的脚本（比如某个静态文件服务）时，reload 只会继续重启错的东西。
read_pm2_script() {
  pm2 jlist 2>/dev/null | node -e '
    let raw = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => (raw += chunk))
    process.stdin.on("end", () => {
      try {
        const apps = JSON.parse(raw).filter(
          (item) =>
            item.name === process.env.APP_NAME &&
            (!process.env.APP_NAMESPACE ||
              item.pm2_env?.namespace === process.env.APP_NAMESPACE),
        )
        const app = apps.find((item) => item.pm2_env?.status === "online") ?? apps[0]
        const script = app?.pm2_env?.pm_exec_path
        if (script) process.stdout.write(String(script))
      } catch {
        /* 读不到就留空，下面按「不是本仓库服务端」处理 */
      }
    })
  '
}

PORT="${PORT:-$(read_pm2_port || true)}"
PORT="${PORT:-4173}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT}/healthz}"

echo "==> 运行用户：$(id -un) · 应用名：${APP_NAME}（可用 APP_NAME=... 覆盖）"
echo "==> 健康检查：${HEALTH_URL}（可用 PORT=... 或 HEALTH_URL=... 覆盖）"

# reload 卡住 / 找不到服务时统一提示：怎么查名字、怎么手动重启
pm2_name_hint() {
  {
    echo
    echo '当前 PM2 进程列表（确认 NAME 列）：'
    pm2 ls --no-color 2>/dev/null || true
    echo
    echo '用真实服务名重跑：'
    echo '  APP_NAME=<pm2 ls 里的名字> bash scripts/deploy.sh'
    echo
    echo '或者手动重启：'
    echo '  pm2 restart <pm2 ls 里的名字> --update-env'
  } >&2
}

echo '==> git pull --ff-only'
if [ -n "$(git status --porcelain --untracked-files=no)" ] && [ "${ALLOW_DIRTY:-0}" != "1" ]; then
  echo 'ERROR: 工作区有未提交的改动。先 commit/stash，或 ALLOW_DIRTY=1 强制部署。' >&2
  git status --short >&2
  exit 1
fi
git pull --ff-only

# 个人配置不进仓库：模板是 src/data/site.js.example
if [ ! -f src/data/site.js ]; then
  echo 'ERROR: 缺少 src/data/site.js（个人配置，不进仓库）。' >&2
  echo '      先复制模板再按需修改：cp src/data/site.js.example src/data/site.js' >&2
  exit 1
fi

echo '==> npm ci（锁文件严格安装）'
npm ci

echo '==> npm run build'
npm run build

if ! ls dist/index.html >/dev/null 2>&1; then
  echo 'ERROR: 构建没产出 dist/index.html，不 reload。' >&2
  exit 1
fi

if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  APP_SCRIPT="$(read_pm2_script || true)"
  if [ "${APP_SCRIPT}" != "${EXPECTED_SCRIPT}" ]; then
    echo "ERROR: PM2 里的「${APP_NAME}」跑的不是本仓库的服务端，reload 修不好它。" >&2
    echo "       当前脚本：${APP_SCRIPT:-（读不到，pm2 里可能是旧配置）}" >&2
    echo "       期望脚本：${EXPECTED_SCRIPT}" >&2
    echo '       这种状态下 /api 根本不存在：后台登录不了，`/admin` 也存不进去。' >&2
    echo "       注意：会沿用端口 ${PORT}（读自 PM2 环境，读不到才用 4173）。" >&2
    echo '       先用 sudo nginx -T | grep -n proxy_pass 确认反代端口；不一致就传 PORT：' >&2
    echo '         PORT=<nginx 反代的端口> RECREATE=1 bash scripts/deploy.sh' >&2
    echo '       换成 ecosystem.config.cjs 里的服务端（沿用当前端口）：' >&2
    echo '         RECREATE=1 bash scripts/deploy.sh' >&2
    echo '       或者手动：' >&2
    echo "         pm2 delete ${APP_NAME} && PORT=${PORT} pm2 start ecosystem.config.cjs" >&2
    echo '       起完确认 nginx 反代到同一个端口（server/index.cjs 只监听 127.0.0.1）。' >&2
    if [ "${RECREATE:-0}" != "1" ]; then
      exit 1
    fi
    echo "==> RECREATE：删除旧进程「${APP_NAME}」，按端口 ${PORT} 重新起"
    pm2 delete "${APP_NAME}"
    PORT="${PORT}" pm2 start ecosystem.config.cjs --update-env
    pm2 save
  else
    echo "==> pm2 reload ${APP_NAME}（最多等 10 秒）"
    if ! timeout 10s pm2 reload "${APP_NAME}" --update-env; then
      echo "ERROR: pm2 reload ${APP_NAME} 超过 10 秒没有完成。" >&2
      echo '多半是服务名不对（核对 pm2 ls 的 NAME 列）。' >&2
      pm2_name_hint
      exit 1
    fi
  fi
else
  # 端口已被占、但 PM2 里没有这个名字：别再起一个抢端口，
  # 先让用户核对服务名 / 占用者。
  if ss -ltn 2>/dev/null | awk '{print $4}' | grep -q ":${PORT}$"; then
    echo "ERROR: PM2 里没有「${APP_NAME}」，但端口 ${PORT} 已被占用。" >&2
    echo "先确认占用者：ss -ltnp | grep :${PORT}" >&2
    pm2_name_hint
    exit 1
  fi
  echo "==> 首次启动：pm2 start ecosystem.config.cjs（应用名 ${APP_NAME}，端口 ${PORT}）"
  PORT="${PORT}" pm2 start ecosystem.config.cjs --update-env
  pm2 save
fi

echo "==> 健康检查 ${HEALTH_URL}（响应必须是 ok）"
# 只认 200 不够：静态服务器对 /healthz 也会回 200 的 index.html，
# 那种「假绿」正是进程起错时的典型症状。这里严格比对响应体。
probe_health() {
  curl -fsS --max-time 3 "${HEALTH_URL}" 2>/dev/null || true
}
ok=0
for _ in $(seq 1 20); do
  if [ "$(probe_health)" = "ok" ]; then
    ok=1
    break
  fi
  sleep 0.5
done
if [ "${ok}" != "1" ]; then
  echo "ERROR: 健康检查失败（期望 ok，实际：$(probe_health | head -c 120)）。" >&2
  echo '       如果回的是 HTML，说明端口上答话的不是 server/index.cjs。' >&2
  echo "       最近 30 行日志：" >&2
  pm2 logs "${APP_NAME}" --lines 30 --nostream >&2 || true
  exit 1
fi

echo "==> 完成：$(pm2 describe "${APP_NAME}" | grep -E 'status|script path' | head -2)"
