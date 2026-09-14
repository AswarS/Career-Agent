# Quality Gates

Record pass/fail evidence in `progress.md`. A failed critical gate blocks delivery.

## Critical functional gates

- Fresh load reaches a usable state without console errors.
- Primary loop completes through a real user action, not a mocked shortcut.
- Invalid and rapid repeated inputs cannot corrupt state.
- Pause/reset/retry produces one clean authoritative state.
- Completion can be reached and clearly communicated.
- Visual state, `render_game_to_text()`, and emitted telemetry describe the same outcome.
- `getFeedback()` (contract name; `get_agent_feedback()` accepted as an alias) works before and after completion and contains no raw sensitive input.
- Export and clear work offline.

## Scene-specific gates

- Visualize: selecting/filtering/stepping/comparing changes the representation and can be reversed.
- Simulate: scenario choices or start/pause/step/reset paths behave consistently and consequences are traceable.
- Practice: correct, incorrect, hint, retry, mastery, and next-item paths work.
- Workspace: create/edit/reorder/undo/persist/export paths work and conflict feedback is accurate.

## Visual and accessibility gates

- Inspect 360x800 and 1440x900 screenshots plus one active/completion state.
- No clipped text, overlapping controls, invisible focus, or horizontal page scroll.
- Keyboard can reach and activate all essential controls in a logical order.
- Touch targets are at least 44px; essential meaning does not depend on color alone.
- `prefers-reduced-motion` removes nonessential motion and shortens necessary transitions.

## Robustness gates

- Test empty/min/max inputs and at least one malformed action.
- Refresh behavior is intentional and documented.
- Local storage failure degrades to an in-memory session.
- No network dependency is needed for the core loop.
- No uncaught exception or unhandled promise rejection remains.

## Telemetry gates

- Events use the v1.0 envelope and increasing sequence numbers.
- High-frequency pointer/keyboard streams are not stored.
- Each inference cites event sequence IDs and includes confidence plus next action.
- The UI explains local storage and exposes export and clear controls.
- Clearing removes persisted events and creates a distinct new session.
