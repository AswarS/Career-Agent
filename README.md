# career-agent-frontend

Frontend repository for the career-planning agent workspace.

中文展示与运行说明见 [README_zh.md](./README_zh.md).

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

- [Claude Code handoff](./CLAUDE.md)
- [Chinese quickstart](./README_zh.md)
- [Product spec](./docs/career-agent-spec.md)
- [Chinese review spec](./docs/zh/career-agent-spec.md)
- [Design system](./DESIGN.md)
- [Skill architecture](./docs/skill-architecture.md)
- [Frontend implementation plan](./docs/frontend-implementation-plan.md)
- [Frontend testing strategy](./docs/frontend-testing-strategy.md)
- [Chinese team sync](./docs/zh/team-sync.md)
- [Chinese PR workflow](./docs/zh/pr-workflow.md)
- [Work canvas fixtures](./tests/work-canvas/README.md)

## Current Status

- product scope and frontend/backend responsibility boundaries are locked for the current MVP direction
- the Vue shell, conversation workspace, profile page, artifact host, mock adapter, and upstream adapter boundary are implemented
- conversation actions can open work canvases through explicit `open-artifact` actions
- assistant reasoning, minimal multi-agent presentation, message media, and trusted URL artifacts are represented in the frontend contract
- `dev:app-examples` can validate external HTML / Node app URL artifacts when sibling examples are running
- phase 5+ validation is active: run `npm run test` and `npm run build` before PRs

## Contribution Workflow

- pull requests should be written in Chinese for human review
- from phase 5 onward, run `npm run test` and `npm run build` before opening a PR
- use the repository PR template
- after local validation, switch the PR to `Ready for review`
- wait for one automatic Copilot review before the final merge recommendation
- do not immediately summon Copilot; wait about 5-10 minutes first
- after fixing valid Copilot comments, do not wait for a second Copilot review unless there is a blocker

## Runtime Configuration

Copy `.env.example` when you need to override the default mock runtime.

Supported env vars:

- `VITE_CAREER_AGENT_CLIENT_MODE`
- `VITE_CAREER_AGENT_API_BASE_URL`
- `VITE_CAREER_AGENT_ARTIFACT_TRANSPORT`
- `VITE_CAREER_AGENT_ENABLE_VOICE_INPUT`
- `VITE_CAREER_AGENT_TRUSTED_CANVAS_ORIGINS`
- `VITE_CAREER_AGENT_NODE_CANVAS_FIXTURE_URL`
- `VITE_CAREER_AGENT_HTML_APP_EXAMPLE_URL`
- `VITE_CAREER_AGENT_NODE_APP_EXAMPLE_URL`

Useful references:

- [Chinese PR workflow](./docs/zh/pr-workflow.md)

## No-Context Agent Handoff

A new model with no chat history should first read:

1. `README.md`
2. `CLAUDE.md`
3. `README_zh.md`
4. `docs/career-agent-spec.md`
5. `docs/frontend-implementation-plan.md`
6. `docs/frontend-testing-strategy.md`
7. `docs/zh/team-sync.md`
8. `docs/zh/pr-workflow.md`
9. `tests/work-canvas/README.md`

This is enough to understand the current stable workflow, run the app, validate work-canvas examples, and follow the PR process.
