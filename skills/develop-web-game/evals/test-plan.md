# develop-web-game Test Plan

## Goal

Test the leaf renderer independently from the coordinating and information-collection skills. The suite checks activation boundaries, App Brief validation, four scene templates, local telemetry, visual quality, robustness, and delivery.

## Test layers

### Layer A — invocation boundary

Run all entries in `trigger-evals.json` three times.

- Raw requests must not expose or activate this internal leaf Tool.
- Calls from `app-coordinator` with a complete App Brief must activate it.
- An internal call with an incomplete brief must return `needs_input`; activation does not imply generation.

Pass condition: 100% on the two raw-request negatives and at least 90% overall across repeated runs.

### Layer B — brief validation

Input:

```text
app-coordinator calls DevelopWebGame with an incomplete App Brief for an interview simulator.
```

Expected result:

```json
{
  "status": "needs_input",
  "schema": "multi-agent-app-brief/1.0",
  "missing": [
    {"path": "...", "reason": "...", "questionForUpstream": "..."}
  ]
}
```

Assertions:

- Does not ask the end user a question.
- Does not create an app or invent audience, goals, success criteria, content, telemetry, or privacy policy.
- Each genuinely blocking omission is returned once with a useful upstream question.
- Does not report harmless visual defaults as blocking omissions.

### Layer C — four full generation cases

Use the four cases in `evals.json`, but supply each as a complete `multi-agent-app-brief/1.0` object following `references/app-brief.md`. Run each case twice to expose output variance.

1. `visualize`: red-black-tree insertion and repair animation.
2. `simulate`: realistic frontend interview rehearsal without transcript retention.
3. `practice`: binary-search boundary-condition training and transfer task.
4. `workspace`: two-week job-search planning board with conflict detection and export.

### Layer D — interaction scripts

For every generated app, automate at least these states:

1. fresh load;
2. first meaningful action;
3. invalid or edge action;
4. repeated/rapid action;
5. normal progress;
6. completion;
7. reset or undo;
8. refresh/restore;
9. feedback summary;
10. session export and clear.

Capture desktop 1440x900 and mobile 360x800 screenshots for fresh, active, error, and completion states. Record console errors and `render_game_to_text()` after every state-changing step.

### Layer E — behavioral evidence

Use two scripted personas against each app:

- `direct-success`: few errors, no or one hint, completes efficiently.
- `struggle-and-recover`: repeated domain-specific error, hint use, retry, then completion.

The exported feedback must distinguish the two histories using observations supported by event sequence IDs. It must not infer intelligence, personality, emotion, diagnosis, or facts not present in the events.

## Scoring

Use `evaluation-rubric.json`. Score each criterion from 0 to 4, multiply by its weight, and divide by 4. A run passes at 85/100 or higher.

Critical automatic failures override the numeric score:

- app cannot complete its primary loop;
- critical console exception;
- raw answer/transcript, credentials, or high-frequency pointer/keystroke data is stored;
- `get_agent_feedback` (alias of `getFeedback`), export, or clear is missing/broken;
- output claims completion without executing tests;
- renderer invents critical fields instead of returning `needs_input`.

## Recommended execution order

1. Run Layers A and B first because they are cheap and test the architectural boundary.
2. Generate one `visualize` and one `workspace` app; these exercise the most different shells.
3. Fix systemic problems before generating `simulate` and `practice`.
4. Run all four cases twice.
5. Generate the static eval viewer and review outputs blind where possible.

## Result summary

Report:

- invocation precision/recall;
- brief-validation pass rate;
- score per scene and per rubric dimension;
- critical failures;
- mean generation time and token use;
- cross-run variance;
- repeated defects that should become shared template/runtime improvements.
