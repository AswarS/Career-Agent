#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="${ENV_FILE:-$repo_root/Gateway/.env.training}"
output_root="${OUTPUT:-}"
cleanup="${CLEANUP:-0}"

if [[ ! -f "$env_file" ]]; then
  printf 'Training environment file not found: %s\n' "$env_file" >&2
  exit 2
fi
command -v bun >/dev/null || { printf 'Bun is required in WSL.\n' >&2; exit 2; }

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ -z "$line" || "$line" == \#* ]] && continue
  name="${line%%=*}"
  value="${line#*=}"
  [[ "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ && "$line" == *=* ]] \
    || { printf 'Invalid training env line.\n' >&2; exit 2; }
  export "$name=$value"
done < "$env_file"
if [[ -n "${CAREER_AGENT_DATABASE_PATH_OVERRIDE:-}" ]]; then
  export CAREER_AGENT_DATABASE_PATH="$CAREER_AGENT_DATABASE_PATH_OVERRIDE"
fi

backend_dir="$repo_root/CrescoAI-Backend/backend"
runner="$repo_root/trajectory_gen/scripts/run-backend-trajectory.ts"
backend_pid=''

if [[ "$#" -eq 0 ]]; then
  set -- "$repo_root/trajectory_gen/examples/simple-backend-task.json"
fi

if [[ -n "$output_root" ]]; then
  pending=()
  total="$#"
  for task in "$@"; do
    task="$(realpath "$task")"
    leaf="$(basename "${task%.json}")"
    if message="$(bun "$repo_root/trajectory_gen/scripts/check-completed-task.ts" --output "$output_root/$leaf")"; then
      printf '[batch skip] %s: %s\n' "$leaf" "$message"
    else
      pending+=("$task")
    fi
  done
  if [[ "${#pending[@]}" -eq 0 ]]; then
    printf 'All %d task(s) are already complete. No backend or model was started.\n' "$total"
    exit 0
  fi
  set -- "${pending[@]}"
fi

backend_ready() {
  curl --fail --silent --max-time 3 \
    -H "Authorization: Bearer $GATEWAY_HARNESS_TOKEN" \
    "${GATEWAY_HARNESS_URL%/}/runs/readiness" \
    | grep -q '"databaseReachable":true'
}

finish() {
  if [[ -n "$backend_pid" ]] && kill -0 "$backend_pid" 2>/dev/null; then
    kill "$backend_pid" 2>/dev/null || true
    wait "$backend_pid" 2>/dev/null || true
  fi
}
trap finish EXIT INT TERM

if ! backend_ready; then
  mkdir -p "$repo_root/Gateway/data"
  (cd "$backend_dir" && bun run network:start) \
    >"$repo_root/Gateway/data/wsl-backend.log" 2>&1 &
  backend_pid=$!
  for _ in $(seq 1 120); do
    backend_ready && break
    if ! kill -0 "$backend_pid" 2>/dev/null; then
      printf 'Backend exited during startup; see Gateway/data/wsl-backend.log\n' >&2
      exit 2
    fi
    sleep 0.5
  done
  backend_ready || { printf 'Backend readiness timed out.\n' >&2; exit 2; }
fi

total="$#"
index=0
rejected=0
for task in "$@"; do
  index=$((index + 1))
  task="$(realpath "$task")"
  printf '\n[batch %d/%d] %s\n' "$index" "$total" "$(basename "${task%.json}")"
  args=("$runner" --task "$task")
  if [[ -n "$output_root" ]]; then
    leaf="$(basename "${task%.json}")"
    args+=(--output "$output_root/$leaf")
  fi
  [[ "$cleanup" == '1' ]] && args+=(--cleanup)
  if ! bun "${args[@]}"; then
    rejected=$((rejected + 1))
    printf '[batch rejected] %s failed trajectory/SFT acceptance; continuing.\n' "$(basename "${task%.json}")" >&2
  fi
done

printf '\nBatch complete: %d processed, %d rejected.\n' "$total" "$rejected"
[[ "$rejected" -eq 0 ]]
