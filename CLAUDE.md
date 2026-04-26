# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Start by reading `README.md`, then this file, then `README_zh.md` if a Chinese human-facing explanation is needed.

## Repository Scope

**Upstream dependency**: Backend and agent work live in the `claude-code-rev` repository (suggested sibling checkout: `./claude-code-rev`).

This is a **frontend-only** repository for a career-planning agent workspace. It owns Vue application shell, route-level UI, conversation workspace, profile UI, artifact host UI, frontend state management (Pinia), and API client contracts.

It does NOT own: backend runtime, agent reasoning logic, prompt orchestration, artifact generation logic, persistence, or realtime backend infrastructure. Do not flag missing backend implementation as bugs unless frontend contracts are broken.

## Commands

```bash
npm run dev              # Start Vite dev server
npm run build            # TypeScript check + Vite build
npm run test             # Run vitest tests once
npm run test:watch       # Run vitest in watch mode
npm run preview          # Preview production build

# Development fixtures (for testing artifact host):
npm run canvas:node-fixture      # Start standalone node URL fixture on port 4318
npm run dev:node-canvas-fixture  # Start frontend with node fixture URL/allowlist injected
npm run dev:app-examples         # Start frontend with external app-example URLs/allowlist injected

# Run a single test file:
npx vitest run src/services/createCareerAgentClient.test.ts
```

Run `npm run test` and `npm run build` before opening PRs (Phase 5+ requirement).

For `dev:app-examples`, the external apps must be started separately. See `tests/work-canvas/README.md`; the frontend only consumes their URLs.

## Architecture

**Tech stack**: Vue 3 + Vite + TypeScript + Pinia + Vue Router + Vitest + markdown-it

**Directory structure**:
- `src/app/` — App shell (`AppShell.vue`) and router
- `src/pages/` — Route-level pages (ConversationWorkspace, Profile, Artifacts, Settings)
- `src/modules/` — Feature modules (conversation, profile, artifacts, navigation)
- `src/services/` — API clients and upstream contracts; mock client for development
- `src/stores/` — Pinia stores (`workspace.ts` is the main shell state store)
- `src/config/` — Runtime configuration parsing (`runtime.ts`)
- `src/types/entities.ts` — Core types: Thread, Message, Profile, Artifact
- `src/components/` — Shared components (MarkdownContent)

**Adapter pattern**: Frontend uses typed adapters (`mockCareerAgentClient.ts` for dev, `upstreamCareerAgentClient.ts` for real backend). Both share the same interface. Switch via `VITE_CAREER_AGENT_CLIENT_MODE` env var.

**Workspace store**: `src/stores/workspace.ts` is the central Pinia store managing shell state: current thread, thread list, artifact state, view modes, and loading states. All modules read from and write to this store.

**Artifact host**: `src/modules/artifacts/ArtifactHost.vue` renders generated content via sandboxed iframe (`html` mode) or trusted URL (`url` mode). Supports pane/focus/immersive view modes.

**Shell modes** (see `DESIGN.md` for details):
- Conversation First: left rail + central conversation
- Conversation + Artifact: left rail + conversation + right artifact pane
- Artifact Focus: artifact dominates, conversation reduced
- Immersive Canvas: hides left rail, minimal chrome for simulations/learning flows

## Core Types

Key entities in `src/types/entities.ts`:
- `ThreadSummary`, `ThreadMessage` — conversation threads and messages
- `ProfileRecord`, `ProfileSuggestion` — user profile data
- `ArtifactRecord` — artifacts with renderMode discriminated union (html/url/markdown/cards)
- `ArtifactStatus`, `ArtifactViewMode`, `MessageAction`, `MessageMedia`

**Message actions**: Messages can include `actions` array with `open-artifact` kind, which triggers artifact pane opening. The frontend must not infer work-canvas launches from natural language—only explicit message actions drive canvas state.

## Testing

Tests run in node environment. Test files colocated with source: `src/**/*.test.ts`.

Run a single test: `npx vitest run path/to/file.test.ts`

Current test coverage: runtime config parsing, client factory selection, artifact normalization, upstream contracts, URL canvas policy, workspace store, message presentation.

## Type Checking

TypeScript checking is part of `npm run build` (runs `vue-tsc --noEmit`). There is no separate lint script; the project relies on TypeScript for type safety.

## Work Canvas Fixtures

`tests/work-canvas/` contains fixtures for testing artifact host with interactive canvases:
- `node-fixture/` — simple Node server for testing `url` render mode
- `public/mock-node-canvas/` — same-origin legacy URL fixture
- external app examples are expected in a sibling `../app_examples` folder unless local commands override that path
- default mock threads include mock-interview, coding-assessment, visual-learning, image/video media examples
- app-example threads are opt-in and appear only when `VITE_CAREER_AGENT_HTML_APP_EXAMPLE_URL` or `VITE_CAREER_AGENT_NODE_APP_EXAMPLE_URL` is configured

Use `npm run canvas:node-fixture` plus `npm run dev:node-canvas-fixture` for the standalone node fixture. Use separate terminals for external app examples, then `npm run dev:app-examples`.

## Environment Variables

Copy `.env.example` to configure runtime:
- `VITE_CAREER_AGENT_CLIENT_MODE` — 'mock' or 'upstream'
- `VITE_CAREER_AGENT_API_BASE_URL` — backend URL
- `VITE_CAREER_AGENT_USER_ID` — upstream user id for user-scoped thread lists; defaults to '1'
- `VITE_CAREER_AGENT_WITH_CREDENTIALS` — send cookies for cross-origin requests; defaults to 'false'
- `VITE_CAREER_AGENT_ARTIFACT_TRANSPORT` — 'polling', 'sse', or 'websocket'
- `VITE_CAREER_AGENT_ENABLE_VOICE_INPUT` — feature flag for voice UI
- `VITE_CAREER_AGENT_TRUSTED_CANVAS_ORIGINS` — trusted iframe origins
- `VITE_CAREER_AGENT_NODE_CANVAS_FIXTURE_URL` — optional node canvas fixture URL
- `VITE_CAREER_AGENT_HTML_APP_EXAMPLE_URL` — optional static HTML app-example URL
- `VITE_CAREER_AGENT_NODE_APP_EXAMPLE_URL` — optional Node/Web app-example URL

## Key Documents

- `docs/career-agent-spec.md` — product spec, locked MVP scope
- `docs/zh/career-agent-spec.md` — Chinese review copy of the product spec
- `DESIGN.md` — visual design system, color tokens, shell modes
- `docs/API.md` — API contract for frontend-backend integration
- `docs/frontend-implementation-plan.md` — phased build plan, current status
- `docs/frontend-testing-strategy.md` — testing requirements by phase
- `docs/pr-workflow.md` — PR workflow and Copilot review process
- `docs/zh/team-sync.md` — Chinese team-facing integration and decision log
- `docs/zh/pr-workflow.md` — Chinese version of PR workflow
- `tests/work-canvas/README.md` — fixture and external app-example validation commands

## Design System

Uses warm slate + teal + amber palette. CSS tokens in `:root` (see DESIGN.md). Shell has left rail, central workspace, and optional artifact pane. Prefer `Calm Workspace` aesthetic—quiet chrome, readable surfaces, not flashy AI styling.

## PR Workflow

PR descriptions written in Chinese. Before opening PR: run `npm run test` and `npm run build`.

Wait for one automatic Copilot review before merge recommendation. Do not summon Copilot immediately; wait about 5-10 minutes first.

After fixing valid Copilot comments, do not wait for a second Copilot review unless there is a blocker.

If automatic review does not appear, request it with: `gh pr edit <pr-number> --add-reviewer @copilot`

## Review Priorities (from Copilot instructions)

When reviewing changes, prioritize:
- Incorrect frontend state transitions
- Broken adapter contracts
- Routing mistakes
- Artifact host isolation and safety issues
- Stale data or state sync bugs
- Regressions in loading, empty, ready, stale, and error states

De-prioritize: purely stylistic rewrites, subjective naming suggestions, requests for backend logic not in this repo.
