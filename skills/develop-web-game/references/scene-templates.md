# Scene Templates

Choose one template and keep its information architecture stable. Change content, theme, and domain behavior rather than rebuilding the shell.

## Shared shell

Every scene uses:

1. Header: title, one-sentence goal, progress/status, reset.
2. Main stage: the object being manipulated or attempted.
3. Control rail: only controls needed for the current decision.
4. Feedback region: immediate result, explanation, and next useful action.
5. Session panel: progress summary, privacy note, export/copy feedback controls.

On mobile, stack in that order. On desktop, use stage plus a narrow control/feedback rail. Keep primary action visible without scrolling when practical.

## `visualize`

Use for conceptual models, algorithm/data-structure animation, diagrams, timelines, spatial structures, and relationship exploration.

- State: selection, filters, viewport, visited items, comparisons.
- Primary actions: select, hover/focus, filter, zoom/pan, compare.
- Feedback: reveal relationships and explain the consequence of the current selection.
- Evidence: exploration breadth, sequence, revisits, comparison use, time to first meaningful action.
- Adaptation: surface overlooked regions, slow or step an animation, reduce visual complexity, or suggest a comparison.

Avoid turning the app into a collection of info cards. The main representation must change when the user acts.

## `simulate`

Use for realistic interview/job situations, role-play, causal systems, processes, and time-dependent behavior.

- State: scenario phase, roles, constraints, user choices, time, outputs, checkpoints.
- Primary actions: respond, choose, change a parameter, run/pause/step, revisit, compare runs.
- Feedback: show realistic consequences; preserve prior decisions or runs for reflection.
- Evidence: response structure, decision sequence, revisions, parameter strategy, recovery, target convergence.
- Adaptation: adjust scenario pressure, ask a follow-up, isolate one variable, or offer a reflection checkpoint.

Use a deterministic seed where randomness exists. Keep data state authoritative and derive visuals from it.

## `practice`

Use for learning checks, guided exercises, and skill diagnosis.

- State: item, attempt count, answer state, hints, mastery by objective, queue.
- Primary actions: answer/manipulate, submit, request hint, retry, explain.
- Feedback: specific and immediate; distinguish misconception from accidental input error when evidence allows.
- Evidence: first-attempt accuracy, retries, hint timing, error categories, transfer to a new item.
- Adaptation: adjust one difficulty dimension at a time and provide a similar-but-not-identical next item.

Do not reveal the full answer before a genuine attempt unless the user requests it. Do not store raw free text by default; store correctness and a coarse error category.

## `workspace`

Use for time planning, job-search boards, application tracking, study plans, resume/portfolio assembly, and decision support.

- State: items, lanes/groups, priorities, dependencies, schedule, drafts, filters, committed snapshot.
- Primary actions: create, drag/reorder, group, schedule, edit, compare, undo, export.
- Feedback: feasibility warnings, conflicts, progress, tradeoffs, and a clear next action.
- Evidence: prioritization, plan revisions, constraint handling, abandoned items, completion and export.
- Adaptation: expose overload, suggest a smaller next step, surface conflicts, or provide an alternative arrangement.

Keep editing reversible. Provide undo/reset, keyboard-accessible reordering, persistence, and export. A workspace should produce a useful artifact or committed plan, not merely display advice.

## Secondary mechanics

Animation, gamification, scoring, chat, timers, and dashboards are mechanics rather than primary scenes. Add them inside the selected template when the App Brief requires them. For example, an algorithm lesson is `visualize` with step animation; a timed coding drill is `practice` with challenge mechanics.
