#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/CrescoAI-Frontend"
BACKEND_DIR="$ROOT_DIR/CrescoAI-Backend/backend"
FRONTEND_PID=""
BACKEND_PID=""

cleanup() {
  trap - INT TERM EXIT

  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi

  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi

  wait "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

command -v npm >/dev/null 2>&1 || {
  echo "错误：未找到 npm。" >&2
  exit 1
}

command -v bun >/dev/null 2>&1 || {
  echo "错误：未找到 bun。" >&2
  exit 1
}

echo "[联调] 安装前端依赖..."
(cd "$FRONTEND_DIR" && npm install)

echo "[联调] 安装后端依赖..."
(cd "$BACKEND_DIR" && bun install)

echo "[联调] 启动后端：http://localhost:4000"
(
  cd "$BACKEND_DIR"
  export CAREER_AGENT_SKIP_AUTH="${CAREER_AGENT_SKIP_AUTH:-true}"
  export CAREER_AGENT_SKIP_AUTH_USER_ID="${CAREER_AGENT_SKIP_AUTH_USER_ID:-1}"
  exec bun run network:dev
) &
BACKEND_PID=$!

echo "[联调] 启动前端：http://127.0.0.1:4173"
(
  cd "$FRONTEND_DIR"
  export VITE_CAREER_AGENT_CLIENT_MODE=upstream
  export VITE_CAREER_AGENT_API_BASE_URL=http://localhost:4000
  export VITE_CAREER_AGENT_USER_ID=1
  export VITE_CAREER_AGENT_WITH_CREDENTIALS=false
  export VITE_CAREER_AGENT_SKIP_AUTH="${VITE_CAREER_AGENT_SKIP_AUTH:-true}"
  exec npm run dev -- --host 127.0.0.1 --port 4173
) &
FRONTEND_PID=$!

echo "[联调] 前后端已启动，按 Ctrl+C 停止。"

while kill -0 "$FRONTEND_PID" 2>/dev/null && kill -0 "$BACKEND_PID" 2>/dev/null; do
  sleep 1
done

echo "[联调] 一个服务已退出，正在停止其余服务..."
exit 1
