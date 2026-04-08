# Frontend Implementation Plan

## Status

Phase 3 started. The repository now contains the shell, typed mock adapters,
the first conversation workspace pass, and explicit profile draft editing.

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

## Risks To Avoid

- starting with too many pages
- mixing backend logic into frontend modules
- letting generated HTML dictate shell structure
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
