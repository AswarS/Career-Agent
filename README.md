# career-agent-frontend

Frontend repository for the career-planning agent workspace.

## Scope

This repository owns:

- frontend application shell
- Vue pages and UI modules
- conversation workspace UI
- profile UI
- artifact host UI
- frontend state and adapter layers
- API client and payload contract design

This repository does not own:

- backend business logic
- agent reasoning or prompt orchestration
- artifact generation logic
- persistence implementation
- realtime backend delivery infrastructure

Upstream backend and agent work live in:

- the upstream `claude-code-rev` repository

Suggested local checkout convention:

- `./career-agent-frontend`
- `./claude-code-rev`

## Source Of Truth

Primary product and implementation documents:

- [Product spec](./docs/career-agent-spec.md)
- [Chinese review spec](./docs/zh/career-agent-spec.md)
- [Design system](./DESIGN.md)
- [Skill architecture](./docs/skill-architecture.md)
- [Frontend implementation plan](./docs/frontend-implementation-plan.md)
- [Frontend testing strategy](./docs/frontend-testing-strategy.md)

## Current Status

- product scope is locked for MVP direction
- design direction is locked as a frontend visual system
- demo UI has been reset into a non-product placeholder
- framework skeleton and typed mock integration have started
- first automated adapter-boundary tests have been introduced

## Contribution Workflow

- pull requests should be written in Chinese for human review
- from phase 5 onward, run `npm run test` and `npm run build` before opening a PR
- use the repository PR template
- after local validation, switch the PR to `Ready for review`
- wait for Copilot review before the final merge recommendation
- if automatic review does not appear, request it with `gh pr edit <pr-number> --add-reviewer @copilot`

## Runtime Configuration

Copy `.env.example` when you need to override the default mock runtime.

Supported env vars:

- `VITE_CAREER_AGENT_CLIENT_MODE`
- `VITE_CAREER_AGENT_API_BASE_URL`
- `VITE_CAREER_AGENT_ARTIFACT_TRANSPORT`
- `VITE_CAREER_AGENT_ENABLE_VOICE_INPUT`

Useful references:

- [Chinese PR workflow](./docs/zh/pr-workflow.md)
