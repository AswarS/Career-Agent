#!/usr/bin/env bash
set -euo pipefail

source_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
runtime_root="${CAREER_AGENT_WSL_RUNTIME:-$HOME/career-agent-trace-runtime}"
mkdir -p "$runtime_root"
runtime_root="$(realpath "$runtime_root")"
[[ "$runtime_root" == "$HOME"/career-agent-trace-runtime* ]] \
  || { printf 'Refusing to clean unexpected WSL runtime: %s\n' "$runtime_root" >&2; exit 2; }
for relative_path in \
  CrescoAI-Backend/backend/src/Network/user \
  CrescoAI-Backend/backend/src/Network/files \
  CrescoAI-Backend/backend/src/Network/data \
  Gateway/data; do
  target="$runtime_root/$relative_path"
  [[ "$target" == "$runtime_root/"* ]] || exit 2
  rm -rf -- "$target"
done
printf '%s\n' "$runtime_root" > "$HOME/.career-agent-last-run-root"

export PATH="${BUN_INSTALL:-/root/.bun}/bin:$PATH"
command -v bun >/dev/null || { printf 'Linux Bun is not installed.\n' >&2; exit 2; }

# Rematerialize the requests from the source packages on every generation, so the
# copied-in requests always exist and match the current materials. The runner
# reads the manifest and fails on a stale or absent request otherwise. RANGE
# selects tasks by 1-based sort ordinal ('1-100', '101-', '7', 'all') and must be
# applied here, before `syn_tasks` is excluded from the runtime copy.
package_source="$source_root/syn_tasks/eduagentworld_v2_171_tasks_20260921/eduagentworld_v2_171_tasks_20260921"
range="${RANGE:-}"
if [[ -d "$package_source" ]]; then
  prepare_args=("$source_root/trajectory_gen/scripts/prepare-syn-task-runs.ts")
  [[ -n "$range" ]] && prepare_args+=(--range "$range")
  bun "${prepare_args[@]}"
else
  printf 'Source packages not found at %s; reusing existing requests.\n' "$package_source" >&2
fi

tar -C "$source_root" \
  --exclude=.git \
  --exclude='*/node_modules' \
  --exclude=syn_tasks \
  --exclude='trajectory_gen/trajectories/syn-tasks/runs' \
  --exclude='Gateway/data' \
  --exclude='CrescoAI-Backend/backend/src/Network/data' \
  --exclude='CrescoAI-Backend/backend/src/Network/files' \
  --exclude='CrescoAI-Backend/backend/src/Network/user' \
  -cf - . | tar -C "$runtime_root" -xf -

(cd "$runtime_root/CrescoAI-Backend/backend" && bun install --frozen-lockfile)

export ENV_FILE="$runtime_root/Gateway/.env.training"
export CAREER_AGENT_DATABASE_PATH_OVERRIDE="$runtime_root/training/training.sqlite"
export OUTPUT="$source_root/trajectory_gen/trajectories/syn-tasks/runs"
export CLEANUP=1
# The range was already applied above and the runtime copy has no source
# packages, so the inner runner must consume the manifest as-is.
unset RANGE

printf 'WSL runtime: %s\n' "$runtime_root"
printf 'Trajectory output: %s\n' "$OUTPUT"
[[ -n "$range" ]] && printf 'Task range: %s\n' "$range"
bash "$runtime_root/trajectory_gen/scripts/run-syn-task-trajectories-wsl.sh"
