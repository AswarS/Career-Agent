# GitHub Copilot Instructions

## Repository Boundary

The frontend application lives in `CrescoAI-Frontend`.

It owns:

- Vue application shell
- route-level UI
- conversation workspace UI
- profile UI
- artifact host UI
- frontend state management
- API client and adapter contracts

It does not own:

- backend runtime
- agent reasoning logic
- prompt orchestration
- artifact generation logic
- persistence implementation
- realtime backend event production

Do not flag missing backend implementation in the frontend as a bug unless the
frontend contract is broken.

## Source Of Truth

Use these documents as primary frontend guidance:

- `CrescoAI-Frontend/docs/career-agent-spec.md`
- `CrescoAI-Frontend/DESIGN.md`
- `CrescoAI-Frontend/docs/frontend-implementation-plan.md`

## Review Priorities

When reviewing frontend changes, prioritize:

- incorrect frontend state transitions
- broken adapter contracts
- routing mistakes
- artifact host isolation and safety issues
- stale data or state sync bugs
- regressions in loading, empty, ready, stale, and error states

De-prioritize:

- purely stylistic rewrites
- subjective naming suggestions unless they improve correctness
- requests for backend logic that does not belong in the frontend

## Workflow Context

PR descriptions in this repository are written in Chinese for human review.

Copilot reviews should focus on actionable technical issues rather than asking
for marketing copy or stylistic churn.
