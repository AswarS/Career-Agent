#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
port="${1:-8791}"

[[ "$port" =~ ^[0-9]+$ ]] && ((port >= 1 && port <= 65535)) \
  || { printf 'Port must be an integer between 1 and 65535.\n' >&2; exit 2; }

if command -v node >/dev/null 2>&1; then
  runtime=node
elif command -v bun >/dev/null 2>&1; then
  runtime=bun
elif [[ -x /root/.bun/bin/bun ]]; then
  runtime=/root/.bun/bin/bun
else
  printf 'Node.js or Bun is required.\n' >&2
  exit 2
fi

printf 'Starting Plan Trace Inspector at http://127.0.0.1:%s\n' "$port"
printf 'Press Ctrl+C to stop.\n'
exec "$runtime" "$repo_root/trajectory_gen/viewer/server.mjs" --port "$port"
