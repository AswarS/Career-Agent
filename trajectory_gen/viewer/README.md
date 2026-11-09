# Plan Trace Inspector

Reads the ignored task directories under `trajectory_gen/trajectories/syn-tasks/runs/`, including generated artifacts, and pairs each run with its package under `trajectory_gen/syn_tasks/`.

The scanner expects the flat layout `runs/<scenario_id>/` and uses that task's
`summary.json` to select the exact `<runId>.*` trajectory files. Timestamp batch
directories are not scanned. A Qwen export is optional for inspection: when a
run failed structural or semantic SFT acceptance and has no usable
`qwen.messages`, the timeline is reconstructed from the authoritative events
export so rejected runs remain inspectable.

```powershell
# Windows PowerShell; port defaults to 8791
.\trajectory_gen\scripts\start-viewer.ps1
```

```bash
# WSL/Linux; optional first argument overrides the port
bash trajectory_gen/scripts/start-viewer.sh 8791
```

Open `http://127.0.0.1:8791`. The server binds to localhost and never reads or serves `.env` files.

## Inspect source tasks without a trajectory

Use the `任务检查` tab to inspect any package under `trajectory_gen/syn_tasks/`,
including tasks that have never generated a trajectory.

- Select a dataset and search by title, task id, scenario id, or instruction text.
  The server keeps a small in-memory index and returns only the best 10 matches;
  it never sends the complete task catalog to the browser.
- Use `选择任务包目录` to inspect one local `packages/<scenario_id>/` directory,
  or select its JSON and material files manually. Local selections are read by
  the browser and are not uploaded anywhere.
- The detail view shows the instruction, deliverables, acceptance criteria,
  constraints, expected tool chain and input bindings, source materials,
  persona, environment, and static validation/audit reports.
- When a matching trajectory exists, `查看已有轨迹` switches directly back to
  the trace inspector for the same scenario.

## Panels

- 上下文 Token: per-call `usage` from the run's `*.calls.json` — prompt (context)
  size per turn, its growth, the peak context, accumulated prompt/completion/
  reasoning totals, and a character-proportional estimate of the final context
  split across tools / system / user / assistant / tool output. Runs captured
  without a `calls.json` show "no usage data" instead.
- 自动审计: capture integrity, isolation and Plan-SFT readiness.
- 轨迹时间线: uses the normalized Qwen conversation when available and falls
  back to model/tool events for rejected runs. The header marks fallback views
  explicitly as `Events 回退视图`.
- Tool Inventory: initial schemas, deferred names, dynamically loaded tools, and
  tools actually called. It flags loaded tools whose full schema was not captured.
- 选中步骤: full content of the clicked timeline step.
