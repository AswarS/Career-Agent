---
name: app-coordinator
description: The exclusive supported workflow for creating and publishing a Web App in the 多元Agent project. Use on raw requests when an interactive HTML App may materially improve a job-search, interview, learning, assessment, simulation, or productivity outcome. Resolve only blocking information, construct a valid multi-agent-app-brief/1.0, load develop-web-game into the same Agent, and deliver one browser-verified App. If this Action fails, report or retry the Action; never bypass it by writing an App directly in the parent workspace. Do not use when a validated App Brief is already being rendered.
model-entry: action-tool
model: GLM-5.2
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - LS
  - WebSearch
  - WebFetch
  - ImageGenerate
  - profile_read
  - profile_get_basic
  - profile_memory_read
  - WebAppLoadSkill
  - WebAppPlaywright
  - ReturnSkillResult
---

# Interactive App Coordinator

Own the complete task inside the dedicated Web App Agent. Load peer workflow instructions into this same Agent; never create another Agent:

```text
User -> WebApp Agent (app-coordinator already loaded)
                     \-> load information-collection (optional, same context)
                     \-> load develop-web-game (same context)
```

The coordinator owns the loop. The two leaf skills never orchestrate each other, call `ReturnSkillResult`, or create child Agents in this execution mode.

## Outcomes

Finish in exactly one of these states:

1. `no_app` — interaction would not materially improve the requested outcome; continue with the appropriate normal response or handoff.
2. `needs_user_input` — critical product information is unavailable; return focused questions to the parent Agent.
3. `invoke_renderer` — an internal state while a valid App Brief is being handled under the loaded `develop-web-game` instructions.
4. `delivered` — return the renderer's validated output result after successful generation.

The current invocation input is provided in `<skill-action-input>`. Treat its `request` as the current user request, its Harness-bound `output_dir` as the only renderer destination, and the forked conversation as supporting context. Do not ask the end user from this child invocation. Finish every terminal state by calling `ReturnSkillResult` exactly once.

Before any file or shell operation, copy the exact absolute `output_dir` from
`<skill-action-input>`. Never discover it with Glob, Grep, Bash, or directory
listing, and never use an example path from a reference as a real path. The
Harness has already created the directory and will reject every other write
location. The directory's existence is guaranteed: begin with the required
file writes, not `ls` or another existence check.

## Workflow

### 1. Read intent and existing evidence

Extract only what the request and conversation actually establish:

- desired outcome;
- audience and known level/state;
- domain and required content;
- constraints, time horizon, language, device, privacy, and delivery needs;
- whether the user wants understanding, rehearsal, practice, or an editable artifact.

Reuse prior context. Do not ask for information already known, and do not turn harmless design choices such as colors or spacing into user questions.

### 2. Decide whether an App is justified

Read [the decision policy](references/decision-policy.md). Choose an App only when interaction changes what the user can understand, practice, decide, simulate, or produce—not merely because a topic can be drawn.

If an App is not justified, do not invoke `develop-web-game`. Continue with the normal answer or route to a more suitable artifact Skill.

### 3. Select one primary scene

Choose by the dominant user loop:

| Scene | Dominant outcome | Core loop |
|---|---|---|
| `visualize` | understand structures, processes, algorithms, or relationships | inspect/step -> manipulate -> compare -> understand |
| `simulate` | rehearse realistic situations or dynamic consequences | enter scenario -> act -> consequence -> reflect |
| `practice` | improve and demonstrate a skill | attempt -> feedback -> retry -> mastery |
| `workspace` | create and revise a useful plan or artifact | create/arrange -> inspect -> revise -> commit/export |

Animation, chat, scoring, timers, dashboards, and gamification are secondary mechanics. They do not create a new primary scene. When two scenes apply, choose the scene that defines completion and list the other behavior as a required interaction or secondary mechanic.

### 4. Resolve missing information

Read [the collection policy](references/collection-policy.md). Separate blocking information from implementation defaults.

Use this order:

1. derive only direct, high-confidence facts from the request and conversation;
2. use an explicit `unknown` when the App can safely diagnose or adapt during interaction;
3. prepare up to three grouped, outcome-focused questions when answers are truly blocking and return them as `needs_user_input`;
4. call `WebAppLoadSkill` with `skill: "information-collection"` and the scoped information request when collection is multi-step, requires profile/memory access, is reusable across tasks, or is explicitly requested. Follow the returned instructions in this same Agent, then resume this workflow.

Do not invoke the peer collector merely to choose colors, labels, or minor layout preferences.

### 5. Build the App Brief

Follow [the builder guide](references/brief-builder.md), which contains the
complete brief envelope required at this stage. Do not read files below a peer
Skill root before that Skill is loaded: those roots are intentionally not
available yet. `WebAppLoadSkill` validates the complete brief when loading the
renderer.

If `<skill-action-input>` contains `base_app`, copy its `versioning` block into the brief verbatim. Set `telemetry.upload = {"endpoint": "./events"}` by default so the app uploads interaction events back to the host.

Every brief must connect:

```text
goal -> success criteria -> interaction loop -> observable signals
     -> semantic events -> Agent questions -> allowed adaptation
```

This traceability is more important than filling fields with generic prose.

### 6. Self-check the handoff

Before invocation, verify:

- the outcome is observable and has at least one success criterion;
- required and excluded content define a usable boundary;
- one primary scene is selected;
- the primary loop describes a user action, feedback, and next action;
- the completion state matches the success criteria;
- telemetry records only evidence needed to answer named Agent questions;
- forbidden inferences and local retention are explicit;
- no critical fact was invented;
- the brief contains no raw sensitive user data that the App does not need.

If any check fails, return to step 4. Do not send a knowingly incomplete brief to make the renderer guess.

### 7. Invoke the renderer

Call `WebAppLoadSkill` with the complete App Brief:

```text
{"skill":"develop-web-game","app_brief":<multi-agent-app-brief/1.0 JSON>}
```

After the instructions load, perform the renderer workflow in this same Agent. Do not reinterpret product decisions while implementing them.

### 8. Handle renderer response

- If rendering and browser verification succeed, preserve the exact Harness-bound output paths when constructing the coordinator result.
- Construct delivered paths from the invocation's exact `output_dir`; do not
  copy literal paths from examples or rediscover the directory.
- If renderer validation identifies missing information, inspect the missing paths. Fill them from existing context or wrap them as `multi-agent-information-request/1.0` using [the information protocol](../information-collection/references/information-protocol.md), then load `information-collection`. `WebAppLoadSkill` binds the trusted runtime `userId`; never invent or request identity.
- Accept the collector result only when `requestId` and `userId` match, and merge only paths from the original missing set. Rebuild and validate the whole brief before invoking again.
- If the same semantic omissions return twice, stop and report the contract mismatch. Do not create an infinite collection/render loop.
- If generation fails for a technical reason, preserve the validated brief and report the failure separately from user-information gaps.

## Completion protocol

Read [the coordinator result contract](references/result-contract.md) before completing. Call `ReturnSkillResult` exactly once with the current Harness `skill_call_id` and `skill_name`.

- `delivered` and `no_app` use outcome `success`.
- `needs_user_input` uses outcome `insufficient_input`.
- Technical or contract failures use outcome `error`.

Put the matching `web-app-dev-result/1.0` object in `result`. Do not emit a second final answer after `ReturnSkillResult` is accepted.

The renderer's internal `web-app-renderer-result/1.0` envelope is never valid
for this outer return. After successful verification, return immediately: do
not inspect the workspace, look for historical sessions, run Bash, or reread
generated files unless a validation failure requires a specific repair.

## App decision explanation

When user-facing explanation is useful, keep it to one sentence:

- App selected: "这个目标需要反复操作和即时反馈，我会把它组织成交互 App。"
- App not selected: "这个问题用简洁说明即可，生成 App 不会增加实质价值。"

Do not force users through a design conversation after sufficient information is already available.

## Boundaries

- Before `develop-web-game` is loaded, this Skill does not write HTML, CSS, JavaScript, telemetry runtime, or screenshots. After loading it, the same Agent performs those implementation steps under the renderer instructions.
- This Skill does not replace `information-collection`; it decides when profile/memory lookup or user questions are needed and owns the merge.
- This Skill does not automatically choose an App for every educational or job-search request.
- This Skill does not pass unsupported psychological, medical, personality, intelligence, or hiring labels into the brief.
- For time-sensitive or high-stakes content, ensure verified source notes are available before invoking the renderer.
