# 2026-04-10 Phase 6B Message Polish

## Scope

This iteration was a targeted polish slice on top of the first Phase 6B merge.

The goals were:

1. fix visible inline `<think>` leakage in the mock conversation path
2. narrow multi-agent presentation so it only appears when a thread actually
   contains multiple assistant identities
3. add local validation assets for `html`, same-origin `url`, and cross-origin
   node/web work-canvas examples

## What Changed

### Conversation presentation

- Added a presentation helper for assistant reasoning fallback extraction:
  - `src/modules/conversation/messagePresentation.ts`
- The UI now hides inline `<think>...</think>` even if the message came from a
  mock source that skipped upstream normalization
- Single-agent threads now keep the default assistant presentation
- Multi-agent name and accent differences only activate when more than one
  assistant identity appears in the same thread

### Local work-canvas fixtures

- Added a repo-level validation folder:
  - `tests/work-canvas/README.md`
- Added a minimal node fixture server:
  - `tests/work-canvas/node-fixture/server.mjs`
- Added runtime support for overriding the mock roadmap canvas URL:
  - `VITE_CAREER_AGENT_NODE_CANVAS_FIXTURE_URL`
- Added convenience scripts:
  - `npm run canvas:node-fixture`
  - `npm run dev:node-canvas-fixture`

## Verified

- `npm run test`
- `npm run build`
- browser check: `thread-002` no longer shows literal `<think>` in visible copy
- browser check: `thread-002` now shows default assistant presentation
- browser check: `thread-001` still shows differentiated multi-agent names
- browser check: cross-origin node fixture loads in the work canvas from
  `http://127.0.0.1:4318`

## Locked Decisions

- reasoning disclosure is a UI capability, not a prompt/debug leak
- mock paths should be resilient even if they do not go through upstream
  normalization
- single-agent threads should not look “multi-agent by accident”
- frontend only consumes node/web canvas URLs; it does not own their runtime

## Next Recommended Step

Continue the main Phase 6B workflow slice:

1. remove remaining debug-style canvas open actions
2. add composer request lifecycle states
3. define the first typed canvas interaction event back to the upstream adapter
