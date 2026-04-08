# Logs

This folder stores handoff notes for future AI or human sessions.

These logs are not the product source of truth.
They summarize iteration context, recent decisions, verification status, and the
recommended next step.

Authoritative documents remain:

- `docs/career-agent-spec.md`
- `DESIGN.md`
- `docs/frontend-implementation-plan.md`
- `docs/frontend-testing-strategy.md`
- `docs/zh/team-sync.md`
- `docs/zh/pr-workflow.md`

## Naming Rule

Use:

- `YYYY-MM-DD-{topic}.md`

Examples:

- `2026-04-08-phase-6a-handoff.md`
- `2026-04-09-conversation-workflow-start.md`

If more than one log is created for the same topic on the same day, append a
numeric suffix:

- `YYYY-MM-DD-{topic}-02.md`

## What To Capture

Each log should include:

- current stable commit or branch context
- what changed in this iteration
- what was verified
- locked decisions made during the iteration
- unresolved risks or cross-team sync items
- the recommended next step

## What Not To Do

- do not use logs to replace or contradict the spec
- do not leave only chat-context decisions without writing them back to source docs
- do not treat old logs as current truth without checking the latest source docs
