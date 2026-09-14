# App Brief Builder

Build `multi-agent-app-brief/1.0` from evidence, not generic filler.

## Field construction

- `invocation.reason`: name the outcome-changing value of interaction.
- `user`: include only relevant known state and constraints; use `unknown` deliberately.
- `goal.outcome`: one user-centered result.
- `goal.successCriteria`: observable evidence achievable within the App.
- `content.required`: facts, tasks, cases, artifacts, and rules needed for success.
- `content.excluded`: scope that would add risk or generation burden without helping the outcome.
- `experience.scene`: one primary template.
- `experience.primaryLoop`: a repeatable action -> feedback -> next-action sentence.
- `experience.requiredInteractions`: capability names, not UI styling.
- `experience.completionState`: state that directly satisfies the success criteria.
- `adaptation.signals`: bounded observations the App can actually collect.
- `adaptation.allowedResponses`: safe changes tied to those signals.
- `adaptation.forbiddenInferences`: unsupported or sensitive labels.
- `telemetry.events`: minimum semantic events needed for Agent questions.
- `telemetry.agentQuestions`: questions that later analysis should answer.
- `telemetry.retention`: default to `local-session` unless the user explicitly authorizes otherwise.
- `delivery`: title, language, offline requirement, and only essential delivery constraints.

## Traceability example

```text
Outcome: apply binary-search interval invariants
Success: solve a transfer problem without a hint
Loop: choose boundary -> feedback -> retry/new item
Signal: boundary error category, hint timing, transfer result
Event: attempt_submitted, hint_requested, session_completed
Agent question: which interval invariant remains unstable?
Adaptation: show one counterexample, then a similar new item
```

If an event cannot help answer an Agent question or drive an allowed adaptation, remove it.

## Final brief envelope

```json
{
  "schema": "multi-agent-app-brief/1.0",
  "invocation": {"requestedBy": "app-coordinator", "reason": "..."},
  "user": {"audience": "...", "level": "...", "constraints": []},
  "goal": {"outcome": "...", "successCriteria": []},
  "content": {"domain": "...", "required": [], "excluded": [], "sourceNotes": []},
  "experience": {"scene": "visualize|simulate|practice|workspace", "primaryLoop": "...", "requiredInteractions": [], "completionState": "..."},
  "adaptation": {"signals": [], "allowedResponses": [], "forbiddenInferences": []},
  "telemetry": {"events": [], "agentQuestions": [], "retention": "local-session"},
  "delivery": {"title": "...", "language": "zh-CN", "offline": true}
}
```
