# Frontend Implementation Plan

## Status

Phase 6B is partially complete and stable enough for the next focused slice.
The repository now contains the shell, typed mock adapters, conversation-driven
artifact actions, explicit profile draft editing, artifact host mode work,
reasoning / multi-agent message presentation, message media fixtures, and URL
artifact validation paths.

The repository is in a workflow-stable state for frontend iteration.

## Goal

Start framework implementation only after the project has enough clarity to
avoid AI-driven drift.

This document translates the product spec into a practical frontend sequence.

## Source Documents

Implementation should follow:

- `docs/career-agent-spec.md`
- `DESIGN.md`
- `.agents/skills/vue-agent-delivery/SKILL.md`
- `.agents/skills/career-theme-palette/SKILL.md`
- `docs/frontend-testing-strategy.md`

## Boundary Summary

This repository owns:

- Vue frontend shell
- route-level UI
- artifact host
- frontend adapters and client contracts
- placeholder and mock-driven integration development

This repository does not own:

- backend runtime
- agent runtime
- prompt logic
- artifact generation implementation

## Go / No-Go Decision

Decision: `GO`

Reason:

- MVP shell mode is locked
- first slice is locked
- first three artifact types are locked
- profile schema outline is locked
- design system direction is stable enough

## First Slice

Build this slice first:

1. conversation workspace
2. profile-lite
3. weekly plan artifact host

This slice is enough to validate:

- shell layout
- message rendering
- profile read path
- artifact pane lifecycle
- adapter boundaries

## Recommended Technical Start

Adopt this project structure next:

- `src/app`
- `src/pages`
- `src/components`
- `src/modules/conversation`
- `src/modules/profile`
- `src/modules/artifacts`
- `src/services`
- `src/stores`
- `src/types`
- `src/styles`

Suggested baseline dependencies for the next pass:

- Vue 3
- Vite
- TypeScript
- Vue Router
- Pinia

## Phase Plan

### Phase 0: Reset The Demo Surface

- keep the Vite base
- remove demo-specific copy and data
- rename remaining demo concepts into product concepts
- preserve only reusable setup such as tooling and token files

### Phase 1: Shell And Types

- establish route skeleton
- create shell layout
- define shared types for thread, message, profile, artifact
- add placeholder data adapters

Exit criteria:

- app boots into a real shell
- left rail, main workspace, and artifact host all exist
- mock data flows through typed contracts

### Phase 2: Conversation Workspace

- build message list
- build composer
- wire markdown renderer
- add empty/loading/error states

Exit criteria:

- a thread can render from typed mock data
- message states are visually complete

### Phase 3: Profile-Lite

- build structured profile page or panel
- support read view and explicit edit flow
- connect conversation suggestions to non-destructive UI affordances

Exit criteria:

- profile renders from structured data
- edits use explicit confirmation paths

### Phase 4: Artifact Host

- build artifact pane shell
- support right-pane open/close
- support fullscreen promotion
- render `weekly-plan` via sandboxed iframe or controlled host
- show lifecycle states

Exit criteria:

- one artifact opens from the conversation workflow
- lifecycle states render correctly

### Phase 5: Upstream Contract Hardening

- replace mock adapter edges with real API boundaries
- align payloads with upstream team
- preserve frontend contracts where possible

Exit criteria:

- mock and real adapters share the same interface
- frontend shell does not need architectural rewrites
- runtime and adapter boundaries are covered by focused automated tests

### Phase 6A: Shell Behavior Optimization

Status:

- completed for the current desktop shell baseline

Scope:

- make the left rail collapsible
- keep left rail scroll independent from the main workspace
- let long thread lists scroll inside the rail without moving shell chrome
- refine responsive behavior between conversation + artifact and artifact focus
- add an immersive canvas shell mode that can fully hide the left rail
- preserve the current pane + focus model instead of introducing floating windows

Exit criteria:

- left rail can collapse without breaking navigation
- shell regions scroll independently
- artifact pane behavior stays readable across common desktop widths
- no architectural changes are needed before the next workflow phase

### Phase 6B: Conversation-Driven Workflow

Status:

- partially complete and active
- conversation-triggered work-canvas launch, reasoning display, minimal
  multi-agent message presentation, media fixtures, and URL artifact examples
  are implemented
- composer lifecycle, work-canvas feedback events, upload flow, and persistent
  session behavior remain future focused slices

Scope:

- let conversation actions open or update the work canvas
- support message-level `open-artifact` actions as the first conversation-driven
  work-canvas trigger
- add meaningful mock threads for simulated interview, coding assessment, and
  visual learning canvas examples
- let work-canvas interactions send structured feedback back into the agent flow
- support collapsible reasoning blocks for assistant messages
- support minimal multi-agent presentation through message metadata, but only
  enable differentiated agent names/colors when more than one assistant
  identity appears in the same thread
- support `url` render mode for trusted node/web-app work canvases
- add explicit send / pending / error / recovery states to the composer flow
- introduce image-preview-first multimodal behavior
- make the work canvas feel like a result surface driven by conversation, not by debug buttons

Exit criteria:

- at least one conversation path can launch a meaningful canvas state
- message actions replace page-level debug open buttons for the conversation page
- at least one work-canvas path can send interaction feedback upstream and receive a visible update
- assistant messages can render hidden/collapsible reasoning content when present
- multiple agent identities can be distinguished by name and color without changing orchestration logic
- the host can render both `html` and trusted `url` work-canvas surfaces
- the composer reflects real request lifecycle states
- image preview works as the first real multimodal path
- shell behavior changes from Phase 6A remain intact

## Current Working Sequence

The current stable baseline supports:

1. default mock conversation workflow through `thread-001` to `thread-008`
2. message-level `open-artifact` actions for work-canvas launch
3. HTML and trusted URL artifact host paths
4. optional external app-example URL validation through `dev:app-examples`
5. message-level image and video display fixtures
6. a dedicated new-conversation landing page at `/`, where clicking `新建对话`
   or loading the app no longer creates an empty thread up front
7. delayed thread creation semantics: the frontend only calls
   `POST /api/career-agent/threads` on the first submit, then replays the local
   placeholder message into the new thread view until the upstream send API
   exists

The next slice should start from one focused contract or UX gap, not from a
wide rewrite.

Do not mix unrelated backend, agent, upload, session persistence, and work-canvas
event work into one PR.

## Testing Gate

Testing requirements now differ by phase:

- phases 0-1: `npm run build`
- phases 2-4: `npm run build` plus browser walkthrough
- phase 5 onward: `npm run test` and `npm run build`

See `docs/frontend-testing-strategy.md` for the detailed policy.

## Risks To Avoid

- starting with too many pages
- mixing backend logic into frontend modules
- letting generated HTML dictate shell structure
- treating the right-side work canvas like a modal or disposable preview
- building voice before shell and artifact host are stable
- using demo UI as if it were product truth

## Must-Stay Rules

- one slice at a time
- data contract first
- shell before polish
- adapter boundaries before live backend integration
- no direct dependence on undeclared upstream behavior

## Final Defaults Adopted

These defaults are now adopted for the first implementation pass:

1. keep `career-roadmap` as the third artifact type
2. keep voice in phase 2
3. keep `Home` as a lightweight empty or welcome state

These are not considered blockers for starting framework work.

## Deferred UX Decisions

These decisions are intentionally not part of Phase 6A:

- thread folders or project-tree navigation
- separate-browser-window simulations as a default task model
- free-floating draggable artifact windows
- unconstrained pane dragging
- making voice a primary interaction path

These should be revisited only after the shell and conversation-driven canvas workflow are stable.
