# Frontend Testing Strategy

## Purpose

Define when this repository must start adding automated tests and what each
phase should prove before a PR is opened.

## Testing Gate By Phase

### Phase 0 To Phase 1

Required:

- `npm run build`

Reason:

- shell structure and shared types are still moving quickly
- manual verification is enough while the app surface is mostly scaffolding

### Phase 2 To Phase 4

Required:

- `npm run build`
- browser walkthrough for the changed slice

Recommended:

- screenshots for artifact or layout changes

Reason:

- conversation, profile, and artifact host behavior are still UI-heavy
- a focused manual pass catches regressions faster than premature test suites

### Phase 5 And Beyond

Required:

- `npm run test`
- `npm run build`

Tests should cover:

- runtime config parsing
- client factory selection
- upstream payload normalization
- request-layer behavior around optional resources and refresh paths

Reason:

- adapter boundaries are now stable enough to lock with automated tests
- upstream integration drift becomes expensive if contracts are not tested

## Current Baseline

The first automated test baseline should stay small and focused:

1. runtime configuration
2. client factory selection
3. upstream artifact normalization
4. upstream request path behavior

## Expansion Rule

Add broader tests only when a new boundary becomes stable:

- auth and session state
- voice input
- real-time transport
- richer store coordination across routes
