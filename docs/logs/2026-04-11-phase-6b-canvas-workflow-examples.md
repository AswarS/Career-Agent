# 2026-04-11 Phase 6B Canvas Workflow Examples

## Scope

This iteration moves Phase 6B from "the host can render canvases" toward
"conversation messages can intentionally launch canvases".

## What Changed

- Added message-level `open-artifact` actions to the shared message contract
- Wired assistant message actions to open the referenced work canvas
- Removed page-level debug open buttons from the conversation page
- Added mock threads for:
  - simulated interview
  - coding assessment
  - visual learning
- Added corresponding artifacts for:
  - `mock-interview`
  - `coding-assessment`
  - `visual-learning`
- Kept frontend responsibility narrow:
  - the frontend renders actions
  - the frontend opens the canvas
  - the frontend does not infer actions from natural language
  - backend / agent runtime still owns generation, scoring, and reasoning

## Product Notes

The three examples cover different canvas modes:

- simulated interview uses `immersive`
- coding assessment uses `focus` and the URL/node fixture path
- visual learning uses `pane` to keep chat and canvas side by side

This gives the team concrete examples to judge before building the real
feedback-event path.

## Verified

Run:

- `npm run test`
- `npm run build`

Browser paths to verify:

- `/threads/thread-003`: open simulated interview from the assistant message
- `/threads/thread-004`: open coding assessment from the assistant message
- `/threads/thread-005`: open visual learning from the assistant message

## Still Pending

- composer send / pending / error / recovery states
- typed work-canvas feedback events back to the upstream adapter
- image-preview-first multimodal path
