# Frontend Implementation Plan

## Status

Phase 5 completed. The repository now contains the shell, typed mock adapters,
the conversation workspace pass, explicit profile draft editing, artifact host mode work,
and the first upstream contract hardening pass.

The repository is now in a foundation-stable state.

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

Execution window:

- April 8, 2026: finish this phase before starting new workflow work

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

Execution window:

- April 9, 2026: start only after Phase 6A is complete

Scope:

- let conversation actions open or update the work canvas
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
- at least one work-canvas path can send interaction feedback upstream and receive a visible update
- assistant messages can render hidden/collapsible reasoning content when present
- multiple agent identities can be distinguished by name and color without changing orchestration logic
- the host can render both `html` and trusted `url` work-canvas surfaces
- the composer reflects real request lifecycle states
- image preview works as the first real multimodal path
- shell behavior changes from Phase 6A remain intact

## Current Working Sequence

The next two implementation steps are intentionally split:

1. April 8, 2026: finish shell behavior optimization only
2. April 9, 2026: begin conversation-driven workflow

Do not mix these into one PR unless a bug fix directly spans both.

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
