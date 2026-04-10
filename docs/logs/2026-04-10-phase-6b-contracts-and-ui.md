# 2026-04-10 Phase 6B Contracts And UI

## Branch Context

- working branch: `codex/phase-6b-reasoning-url-canvas`
- starting point before commit: dirty changes carried from `main`
- purpose of this slice: begin Phase 6B without yet finishing the full
  conversation-driven workflow

## What Changed In This Iteration

### 1. Message contract expansion

The frontend now supports a larger message shape for Phase 6B:

- optional `reasoning` content
- fallback extraction from inline `<think>...</think>` blocks
- optional `agent_id`
- optional `agent_name`
- optional `agent_accent`

This is intentionally a presentation-level change only.
It does not introduce full multi-agent orchestration in the frontend.

### 2. Work canvas host expansion

The artifact host now supports two meaningful hosted surface types:

- `html`: rendered through `srcdoc`
- `url`: rendered through iframe `src` for trusted upstream node/web apps

This is the first step toward simulation canvases, coding tasks, and explorable
learning surfaces that are more than static HTML snippets.

### 3. Conversation UI changes

Assistant messages can now:

- show agent-specific names
- render subtle agent color differences
- hide reasoning by default behind a disclosure block

This keeps the default reading surface clean while still exposing model
thinking traces when the upstream runtime provides them.

### 4. Mock data and browser demo path

Mock data now includes:

- explicit reasoning text
- inline `<think>` extraction coverage
- multiple agent names and accents
- a URL-based work canvas example at `/mock-node-canvas/index.html`

This gives the frontend a concrete demo path before upstream integration is
wired.

## What Was Verified

Validated in this iteration:

- `npm run test`
- `npm run build`
- browser walkthrough for conversation reasoning disclosure
- browser walkthrough for URL-hosted work canvas rendering

Representative screenshots:

- `output/playwright/conversation-reasoning-multi-agent.png`
- `output/playwright/workspace-canvas-url.png`

## Locked Decisions

- reasoning is optional UI metadata, not the main message body
- inline `<think>` should be stripped from visible content and surfaced as a
  collapsed reasoning block
- minimal multi-agent support in this phase means name + accent only
- `url` work canvases are allowed only for trusted upstream-controlled
  applications
- first-pass `url` iframe hosting should start from the minimum sandbox surface
  and currently only allows `allow-scripts`

## What Is Not Done Yet

This slice does not complete all of Phase 6B.
Still pending:

1. composer send / pending / error / recovery states
2. conversation-triggered canvas actions replacing remaining debug-style entry
   points
3. first typed feedback event path from work canvas back into the agent flow
4. image-preview-first multimodal behavior

## Cross-Team Sync Items

Upstream team still needs to align on:

- whether reasoning arrives in a dedicated field, inline `<think>`, or both
- the final source of `agent_id`, `agent_name`, and `agent_accent`
- which trusted origins may host `url` work canvases
- whether URL-based canvases require a `postMessage` protocol for interaction
  feedback

## Recommended Next Step

Continue with the next Phase 6B sub-slice:

1. upgrade the composer into a real request lifecycle surface
2. replace debug-style canvas launch actions with conversation-driven triggers
3. define one typed feedback event path from work canvas to upstream adapter
