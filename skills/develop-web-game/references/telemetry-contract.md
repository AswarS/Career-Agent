# Local Behavioral Telemetry Contract v1.0

The purpose is to give the Agent enough evidence to improve its next response while preserving user control and privacy.

## Runtime API

Implement a dependency-free `window.AgentTelemetry` object:

```js
const AgentTelemetry = {
  record(type, data = {}),
  getEvents(),
  getFeedback(),
  export(),
  clear()
};
window.AgentTelemetry = AgentTelemetry;
```

`record` accepts either the convenience form
`record(type, { milestone: "stage_2" })` or the structured form
`record(type, { target: "stage", data: { milestone: "stage_2" } })`. Prefer the
structured form when a target is useful. Only allow-listed fields are retained
in either form.

Persist to `localStorage` under a namespaced key containing the app slug and telemetry version. If storage is unavailable, continue in memory and disclose that export ends when the page closes.

## Event envelope

Each event follows this shape:

```json
{
  "v": "1.0",
  "sessionId": "random-session-id",
  "seq": 12,
  "at": "2026-08-10T12:34:56.000Z",
  "elapsedMs": 18420,
  "type": "attempt_submitted",
  "scene": "practice",
  "target": "item-3",
  "data": {"correct": false, "errorCategory": "sign-error", "attempt": 2}
}
```

Use allow-listed, bounded fields. Never put DOM text, full user answers, pointer trails, names, email addresses, tokens, or arbitrary form values in `data`.
The packaged runtime accepts these structured keys: `correct`, `errorCategory`,
`attempt`, `hintLevel`, `valueBucket`, `parameter`, `direction`, `outcome`,
`milestone`, `durationBucket`, `itemType`, `difficulty`, `coverage`, `completed`,
`score`, `bestStreak`, and `attempts`. Scores and counts must be numeric; do not
put display labels or free text in them.

Treat `session_completed` as an idempotent state transition. Calling it again
for an already completed session must flush pending data without adding another
completion event.

## Standard events

Emit only events relevant to the scene:

- lifecycle: `session_started`, `session_resumed`, `session_completed`, `session_cleared`;
- navigation: `view_opened`, `object_selected`, `comparison_started`;
- learning: `attempt_started`, `attempt_submitted`, `feedback_viewed`, `hint_requested`, `retry_started`;
- simulation: `parameter_changed`, `run_started`, `run_paused`, `run_completed`, `checkpoint_reached`;
- workspace: `item_created`, `item_reordered`, `conflict_detected`, `plan_committed`, `artifact_exported`;
- optional challenge mechanics: `round_started`, `action_taken`, `milestone_reached`, `round_completed`;
- recovery: `reset_used`, `undo_used`, `invalid_action`, `runtime_error`.

Throttle high-frequency actions. Record semantic state changes, not every mousemove, animation frame, hover, or keystroke.

## Agent feedback output

`getFeedback()` returns JSON-serializable data:

```json
{
  "schema": "multi-agent-feedback/1.0",
  "session": {"durationMs": 90000, "eventCount": 28, "completed": true},
  "observations": [
    {"metric": "firstAttemptAccuracy", "value": 0.67, "evidence": [4, 9, 15]}
  ],
  "inferences": [
    {
      "statement": "Benefits from a worked example before symbolic items.",
      "confidence": "medium",
      "evidence": [9, 10, 12, 15],
      "nextAction": "Start with one visual example, then retry a new symbolic item."
    }
  ],
  "limitations": ["One short local session; do not generalize beyond this task."],
  "recentEvents": []
}
```

Calculate metrics appropriate to the scene. Useful candidates include completion rate, first-attempt accuracy, retries per item, hint rate, time to first action, idle-adjusted active time, exploration coverage, parameter trials, reset count, and repeated error categories.

Every inference needs event evidence, a confidence level, a useful next action, and a limitation. If evidence is weak, return observations only.

## User controls

Provide visible controls to:

- view a plain-language session summary;
- copy or download the Agent feedback JSON;
- clear recorded session data;
- understand that data remains local until exported.

Export a JSON file containing metadata, feedback summary, and events. Clearing must remove both memory and persisted data and begin a fresh session.
