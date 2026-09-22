# Trajectory Generation

This directory contains the complete synthetic-task trajectory workflow without
the frontend.

## Layout

- `scripts/`: task materialization, single-run wrappers, and WSL batch runners
- `examples/`: minimal backend trajectory task
- `viewer/`: local Plan Trace Inspector
- `trajectories/`: ignored generated requests, runs, and exports

The scripts reuse the ignored `Gateway/.env.training` configuration used by
the Gateway training workflow.

## Select tasks by ordinal range

All 171 packages under `syn_tasks/<source>/packages` are sorted by scenario id and
addressed by 1-based ordinal, so a run can be scoped without pasting hashes.

```bash
# show the numbered task list (ordinal <TAB> scenario_id)
bun trajectory_gen/scripts/prepare-syn-task-runs.ts --list

# 1-100, 101-, 7, 1,3,5-9 and all are all valid
bun trajectory_gen/scripts/prepare-syn-task-runs.ts --range 1-100
```

Without `--range`, materialization still selects the original two tasks. A range
rewrites `trajectories/syn-tasks/manifest.json`, and the batch runners read that
manifest, so the range you materialize is exactly what gets generated.

## Generate syn_tasks

Prepare the requests after changing their source packages. The WSL runner below
does this automatically before every generation, so it is only needed when you
want to materialize or inspect the requests on their own:

```bash
bun trajectory_gen/scripts/prepare-syn-task-runs.ts [--range <spec>]
```

Run the real model and backend in an isolated WSL environment:

```bash
# all tasks the manifest currently lists
./trajectory_gen/scripts/run-syn-task-trajectories-wsl-isolated.sh

# or materialize and generate a range in one step
RANGE=1-100 ./trajectory_gen/scripts/run-syn-task-trajectories-wsl-isolated.sh
```

The runner shows a live terminal dashboard with the current batch item, elapsed
time, model request/response counts, tool call/result counts, total captured
events, finalization, and export status. Pass `--quiet` directly to
`run-backend-trajectory.ts` only when machine-readable output is preferred.
Rejected trajectories are recorded and the batch continues; the batch exits
non-zero after all selected tasks finish when one or more were rejected.

On Windows PowerShell:

```powershell
pwsh trajectory_gen/scripts/run-syn-task-trajectories.ps1 -Range 101-
```

Materialization embeds the package materials into `workspace.files` at their
declared relative paths and states those paths in the request query, so the agent
reads the mounted materials instead of guessing at the workspace root.

`invocation_bindings.json` is used only to create a private evaluator sidecar
next to each materialized request. The sidecar is never included in the run
request or any Gateway event, message, tool result, or Qwen SFT export. After a
run, the generator compares the captured tool calls with that hidden expectation.
Missing or reordered required calls make `summary.json` report `sftReady=false`,
and no training JSONL is retained for that task.

The same private expectation is supplied to the real teacher model through an
authenticated, in-memory Gateway header. It is injected only into the upstream
request. For these runs, raw model streams and private reasoning fields are not
persisted; public assistant content, tool calls, tool results, usage, and timing
remain in the trajectory. A visible echo of the private guidance rejects the run.

Each task has one stable output directory:

```text
trajectory_gen/trajectories/syn-tasks/runs/<scenario_id>/
```

A task is skipped when its `summary.json` says `completed`, `sftReady=true`, and
its hidden semantic audit passed
and the matching `<runId>.qwen3_5_sft.jsonl` exists. Incomplete task directories
are retried in place. Generated workspace files and the final response are saved
under the same task directory in `artifacts/`, with checksums in
`artifacts.json`.

## Inspect trajectories

```powershell
.\trajectory_gen\scripts\start-viewer.ps1
```

```bash
bash trajectory_gen/scripts/start-viewer.sh 8791
```

Open `http://127.0.0.1:8791`.

To regenerate only the derived Qwen files from an existing immutable Gateway
journal after an exporter update, use `scripts/reexport-qwen.ts` with the run ID,
Gateway trace directory, and stable task output directory. This does not call the
model or alter the authoritative event journal.
