---
name: "develop-web-game"
description: "Renderer workflow for a validated multi-agent-app-brief/1.0. Build and verify an offline HTML app in the Harness-bound output directory after being loaded into the dedicated Web App Agent, or through the legacy standalone Tool. Do not self-select from raw user intent, collect user information, or reinterpret the coordinator's product decisions."
model-entry: action-tool
model: GLM-5.2
user-invocable: false
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - WebAppPlaywright
  - ReturnSkillResult
---


# Visual & Interactive Development

Build visual/interactive programs in small steps and validate every change. Treat each iteration as: implement → act → pause → observe → adjust. This applies to games, animations, simulations, visualizations, demos, and any output best delivered as a live web page.

Accept only `<skill-action-input>` containing a complete `app_brief` and a Harness-supplied absolute `output_dir`. Validate the brief against [App Brief v1.0](references/app-brief.md). Write every generated file below `output_dir`; do not choose a different destination. If the brief is incomplete, return `needs_input` to the coordinator instead of questioning the end user.

## Narrative Interaction Principle (Required for every app)

An app must explain through visible change, not through decoration or distant prose. Whenever the subject contains a process, transformation, movement, sequence, dependency, or state transition, design it as focused narrative beats.

For every beat, explicitly define:

1. **One primary action** — teach one change at a time and reduce unrelated routes and objects.
2. **The moving or changing object** — the actual molecule, data item, signal, component, or entity must visibly move or transform.
3. **A clear origin and destination** — use stable ports, lanes, anchors, or positions so the user can follow where it came from and where it went.
4. **Co-located explanation** — show a short, prominent sentence beside or immediately below the action while it happens. Never rely on a distant side panel as the primary explanation.
5. **Action → result timing** — focus the origin, show movement/transformation, reveal the result, then hold the concise explanation long enough to understand.
6. **Progressive disclosure** — reveal the full system gradually. Restore the overview after individual actions have been demonstrated.

Default educational beat: focus during 0–400ms, animate the actual change during 400–1400ms, show the result during 1400–1800ms, then reveal and hold the explanation until roughly 2600ms.

Performance rule: prefer a few meaningful SVG/CSS/Web Animations over background video, large decorative images, particle fields, glass blur, or continuous idle animation. Spend animation complexity on the core explanation. If removing an animation would not reduce understanding, remove it.

Quality gate: for each stage, a reviewer must be able to answer “what changed, from where, to where, and why?” by watching the main stage without reading a side panel. If not, redesign the stage before adding polish.

## External Library Selection

External libraries are capability tools, not visual decoration. Start with semantic HTML, CSS, SVG, Canvas, and the Web Animations API. Add a library only when it makes the core explanation more accurate, maintainable, or testable.

Before choosing a dependency:

1. Name the missing capability: timeline choreography, graph layout, standard charting, large-scale rendering, UI behavior, or 3D.
2. Read [`references/cdn-library-guide.md`](references/cdn-library-guide.md) and choose the smallest suitable option.
3. Prefer at most one primary visual/animation library and one small behavior/icon library. Do not stack libraries that solve the same problem.
4. Pin a tested version or major version in every CDN URL; never emit `@latest` in a finished artifact.
5. Provide a usable loading/failure state. If the page must work offline or in a restricted network, vendor the tested files locally or use native browser APIs instead of a CDN.
6. Record the selected library, reason, version, and fallback in `progress.md`.

For process diagrams and educational simulations, use this priority order:

- **SVG + CSS/Web Animations** for a small number of labeled objects moving through stable paths. This is the default because DOM text remains readable and geometry is easy to inspect.
- **GSAP** when several narrative beats need a synchronized, pausable, replayable timeline.
- **Dagre or ELK** when node/edge placement is genuinely complex; compute layout first, then render with SVG. Do not hand-place a dense graph.
- **Chart.js or ECharts** for quantitative charts. Do not force a material-flow or causal process into a statistical chart.
- **PixiJS** for hundreds of moving 2D objects; **Three.js** only when depth, camera, lighting, or a 3D model carries meaning.

Animation libraries do not replace narrative design. Animate the actual entity along a stable route, reveal the local explanation at the moment of change, and keep pause/replay/step controls visible. Respect `prefers-reduced-motion` and stop continuous animation when the page is hidden.

## Workflow

1. **Pick a goal.** Define a single feature or behavior to implement.
2. **Implement small.** Make the smallest change that moves the game forward.
3. **Ensure integration points.** Provide a single canvas and `window.render_game_to_text` so the test loop can read state.
4. **Add `window.advanceTime(ms)`.** Strongly prefer a deterministic step hook so the Playwright script can advance frames reliably; without it, automated tests can be flaky.
5. **Initialize progress.md.** If `progress.md` exists, read it first and confirm the original user prompt is recorded at the top (prefix with `Original prompt:`). Also note any TODOs and suggestions left by the previous agent. If missing, create it and write `Original prompt: <prompt>` at the top before appending updates.
6. **Run the scoped Playwright Tool.** Call `WebAppPlaywright` after each meaningful change. The Tool is bound to the Harness-supplied `output_dir`; do not start a server or invoke Node yourself.
7. **Use the payload reference.** Read [the action payload reference](references/action_payloads.json) when constructing Tool actions.
8. **Inspect state.** Capture screenshots and text state after each burst.
9. **Inspect screenshots.** Open the latest screenshot, verify expected visuals, fix any issues, and rerun the Tool. Repeat until correct.
10. **Verify controls and state (multi-step focus).** Exhaustively exercise all important interactions. For each, think through the full multi-step sequence it implies (cause → intermediate states → outcome) and verify the entire chain works end-to-end. Confirm `render_game_to_text` reflects the same state shown on screen. If anything is off, fix and rerun.
    Examples of important interactions: move, jump, shoot/attack, interact/use, select/confirm/cancel in menus, pause/resume, restart, and any special abilities or puzzle actions defined by the request. Multi-step examples: shooting an enemy should reduce its health; when health reaches 0 it should disappear and update the score; collecting a key should unlock a door and allow level progression.
11. **Check errors.** Review console errors and fix the first new issue before continuing.
12. **Reset between scenarios.** Avoid cross-test state when validating distinct features.
13. **Iterate with small deltas.** Change one variable at a time (frames, inputs, timing, positions), then repeat steps 6–12 until stable.

Example Tool input:
```json
{
  "actions": {
    "steps": [
      { "selector": "[data-answer='a']", "action": "click", "frames": 2 },
      { "selector": "#submit", "action": "click", "frames": 2 },
      { "selector": "#next", "action": "click", "frames": 2 },
      { "selector": "#numeric-answer", "action": "fill", "value": "42" },
      { "selector": "#finish", "action": "click", "frames": 2 }
    ]
  },
  "iterations": 1,
  "pause_ms": 250
}
```

For DOM apps, prefer ordered `selector` steps over screen coordinates. Supported
actions are `click`, `fill`, `check`, `uncheck`, `select`, and `press`. Use
canvas-relative mouse coordinates only for interactions genuinely rendered on a
canvas. A missing, hidden, or disabled selector fails verification.

## Test Checklist

Test any new features added for the request and any areas your logic changes could affect. Identify issues, fix them, and re-run the tests to confirm they’re resolved.

Examples of things to test:
- Primary movement/interaction inputs (e.g., move, jump, shoot, confirm/select).
- Win/lose or success/fail transitions.
- Score/health/resource changes.
- Boundary conditions (collisions, walls, screen edges).
- Menu/pause/start flow if present.
- Any special actions tied to the request (powerups, combos, abilities, puzzles, timers).

## Test Artifacts to Review

- Latest screenshots from the Playwright run.
- Latest `render_game_to_text` JSON output.
- Console error logs (fix the first new error before continuing).
You must actually open and visually inspect the latest screenshots returned by `WebAppPlaywright`, not just generate them. Ensure everything that should be visible on screen is actually visible. Go beyond the start screen and capture screenshots that cover all newly added features. Treat the screenshots as the source of truth; if something is missing, it is missing in the build. If headless rendering appears unreliable, report the verification failure instead of bypassing the scoped Tool. Fix and rerun in a tight loop until the screenshots and text state match. Once fixes are verified, re-test all important interactions and controls and ensure the changes did not introduce regressions.

## Core Game Guidelines

### Canvas + Layout
- Prefer a single canvas centered in the window.

### Visuals
- Keep on-screen text minimal; show controls on a start/menu screen rather than overlaying them during play.
- Avoid overly dark scenes unless the design calls for it. Make key elements easy to see.
- Draw the background on the canvas itself instead of relying on CSS backgrounds.

### Text State Output (render_game_to_text)
Expose a `window.render_game_to_text` function that returns a concise JSON string representing the current game state. The text should include enough information to play the game without visuals.

Minimal pattern:
```js
function renderGameToText() {
  const payload = {
    mode: state.mode,
    player: { x: state.player.x, y: state.player.y, r: state.player.r },
    entities: state.entities.map((e) => ({ x: e.x, y: e.y, r: e.r })),
    score: state.score,
  };
  return JSON.stringify(payload);
}
window.render_game_to_text = renderGameToText;
```

Keep the payload succinct and biased toward on-screen/interactive elements. Prefer current, visible entities over full history.
Include a clear coordinate system note (origin and axis directions), and encode all player-relevant state: player position/velocity, active obstacles/enemies, collectibles, timers/cooldowns, score, and any mode/state flags needed to make correct decisions. Avoid large histories; only include what's currently relevant and visible.

### Time Stepping Hook
Provide a deterministic time-stepping hook so the Playwright client can advance the game in controlled increments. Expose `window.advanceTime(ms)` (or a thin wrapper that forwards to your game update loop) and have the game loop use it when present.
The Playwright test script uses this hook to step frames deterministically during automated testing.

Minimal pattern:
```js
window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) update(1 / 60);
  render();
};
```

### Fullscreen Toggle
- Use a single key (prefer `f`) to toggle fullscreen on/off.
- Allow `Esc` to exit fullscreen.
- When fullscreen toggles, resize the canvas/rendering so visuals and input mapping stay correct.

## App Manifest (output.json)

Write `output.json` in `output_dir` matching `web-app-manifest/1.0` (see [the manifest contract](references/app-brief.md#versioning-and-manifest)). Required fields: `schema: "web-app-manifest/1.0"`, `app_slug` (from `brief.delivery.slug` when present, otherwise a stable ASCII slug derived from the subject), and `title`. Copy `brief.versioning` verbatim into `lineage` when the brief carries it (absent on first versions). Convert `brief.telemetry.agentQuestions` to manifest `telemetry.agent_questions`; copy `events`, `retention`, and the optional `upload` block. The Harness validates this manifest before publication, so a missing or malformed `output.json` fails the delivery.

## Telemetry and Upload

Implement local telemetry per [the telemetry contract](references/telemetry-contract.md) using the packaged runtime at [assets/agent-telemetry.js](assets/agent-telemetry.js):

```js
const telemetry = createAgentTelemetry({
  appSlug: '<app_slug from output.json>',
  scene: '<brief scene>',
  metricReducer: myMetrics,
  inferenceReducer: myInferences
});
telemetry.attachUploader({
  endpoint: new URL('events', window.location.href).href,
  batchSize: 20,
  flushIntervalMs: 5000
});
```

Upload is best-effort; local retention is unchanged on network failure. Never embed identity, tokens, or free text in events — only allow-listed semantic events with bounded data. Both `getFeedback()` (contract name) and `get_agent_feedback()` (alias) must work before and after completion.

## Progress Retention

Persist app state under `localStorage['multi-agent:<app_slug>:state:1.0']` and restore it on load so re-entry resumes progress. The same `app_slug` is reused across versions of one app, so progress carries over iterations. Degrade to an in-memory session when storage is unavailable.

## Progress Tracking

Create a `progress.md` file if it doesn't exist, and append TODOs, notes, gotchas, and loose ends as you go so another agent can pick up seamlessly.
If a `progress.md` file already exists, read it first, including the original user prompt at the top (you may be continuing another agent's work). Do not overwrite the original prompt; preserve it.
Update `progress.md` after each meaningful chunk of work (feature added, bug found, test run, or decision made).
At the end of your work, leave TODOs and suggestions for the next agent in `progress.md`.

## Completion Format

When `<skill-action-input>.execution_mode` is `in-context`, do not call `ReturnSkillResult`. After implementation and a passing `WebAppPlaywright` run, resume `app-coordinator` and let it complete the outer invocation with the renderer output below. In legacy standalone Action Tool mode, call `ReturnSkillResult` exactly once with the current Harness identifiers.

- Valid but incomplete brief: outcome `insufficient_input`; result is the `needs_input` object defined in [App Brief v1.0](references/app-brief.md).
- Successful generation and verification: outcome `success`; result uses schema `web-app-renderer-result/1.0` and status `delivered`.
- Technical generation or verification failure: outcome `error`; result uses schema `web-app-renderer-result/1.0`, status `error`, plus a stable `code` and concise `message`.

The delivered result must be:

```json
{
  "schema": "web-app-renderer-result/1.0",
  "status": "delivered",
  "output": {
    "kind": "app",
    "directory": "<absolute output_dir>",
    "entry_file": "<absolute output_dir>/index.html",
    "manifest_file": "<absolute output_dir>/output.json",
    "title": "<App title>"
  }
}
```

Do not rely on a natural-language `OUTPUT_ARTIFACT` marker. Do not emit another final answer after `ReturnSkillResult` is accepted.

## References

- [Action payloads](references/action_payloads.json) — example keyboard and mouse actions for each frame burst.
- [Telemetry contract](references/telemetry-contract.md) — local telemetry runtime API and event envelope.
- [App Brief contract](references/app-brief.md) — brief shape, versioning lineage, and the output.json manifest contract.
- [Quality gates](references/quality-gates.md) — delivery-blocking checks, including telemetry gates.
