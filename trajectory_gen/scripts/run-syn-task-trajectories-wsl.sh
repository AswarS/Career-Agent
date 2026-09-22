#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export OUTPUT="${OUTPUT:-$repo_root/trajectory_gen/trajectories/syn-tasks/runs}"

# RANGE selects tasks by their 1-based sort ordinal, e.g. '1-100', '101-', '7',
# '1,3,5-9' or 'all'. It needs the source packages, so it is only honoured here
# when they are present; the isolated WSL runner prepares before copying the
# tree, and this script then just consumes the resulting manifest.
range="${RANGE:-}"
manifest="$repo_root/trajectory_gen/trajectories/syn-tasks/manifest.json"
package_source="$repo_root/syn_tasks/eduagentworld_v2_171_tasks_20260921/eduagentworld_v2_171_tasks_20260921"

if [[ -n "$range" ]]; then
  [[ -d "$package_source" ]] || {
    printf 'RANGE=%s requires the source packages at %s.\n' "$range" "$package_source" >&2
    exit 2
  }
  bun "$repo_root/trajectory_gen/scripts/prepare-syn-task-runs.ts" --range "$range" || exit $?
fi

[[ -f "$manifest" ]] || {
  printf 'Missing manifest: %s\nGenerate it with: bun trajectory_gen/scripts/prepare-syn-task-runs.ts --range <spec>\n' "$manifest" >&2
  exit 2
}

# The manifest, not a hardcoded list, decides scope; the runner reads these
# materialized requests directly, and a missing file would otherwise fail deep
# inside the runner as an unreadable task.
mapfile -t tasks < <(bun "$repo_root/trajectory_gen/scripts/list-manifest-requests.ts")
[[ "${#tasks[@]}" -gt 0 ]] || { printf 'The manifest resolves to no requests.\n' >&2; exit 2; }

for task in "${tasks[@]}"; do
  [[ -f "$task" ]] || {
    printf 'Missing materialized request: %s\nGenerate it with: bun trajectory_gen/scripts/prepare-syn-task-runs.ts --range %s\n' "$task" "$range" >&2
    exit 2
  }
done

printf 'Generating %d task(s)\n' "${#tasks[@]}"
exec bash "$repo_root/trajectory_gen/scripts/run-backend-trajectory.sh" "${tasks[@]}"
