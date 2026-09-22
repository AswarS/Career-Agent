# Plan Trace Inspector

Reads the ignored task directories under `trajectory_gen/trajectories/syn-tasks/runs/`, including generated artifacts, and pairs each run with its package under `syn_tasks/`.

The scanner expects the flat layout `runs/<scenario_id>/` and uses that task's
`summary.json` to select the exact `<runId>.*` trajectory files. Timestamp batch
directories are not scanned.

```bash
node trajectory_gen/viewer/server.mjs --port 8790
```

Open `http://127.0.0.1:8790`. The server binds to localhost and never reads or serves `.env` files.

## Panels

- 上下文 Token: per-call `usage` from the run's `*.calls.json` — prompt (context)
  size per turn, its growth, the peak context, accumulated prompt/completion/
  reasoning totals, and a character-proportional estimate of the final context
  split across tools / system / user / assistant / tool output. Runs captured
  without a `calls.json` show "no usage data" instead.
- 自动审计: capture integrity, isolation and Plan-SFT readiness.
- Tool Inventory: initial schemas, deferred names, dynamically loaded tools, and
  tools actually called. It flags loaded tools whose full schema was not captured.
- 选中步骤: full content of the clicked timeline step.
