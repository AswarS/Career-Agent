# Skill Architecture

This project uses Codex skills with strict responsibility boundaries.

## Official project location

Project skills live in:

- `.agents/skills/<skill-name>/SKILL.md`

This matches current Codex documentation for repository-scoped skills.

## Current skills

### `career-theme-palette`

Owns:

- brand mood
- color palette
- semantic tokens
- state colors
- chart colors
- CTA emphasis rules

Does not own:

- Vue app structure
- routing
- API layers
- stores
- component decomposition

Invocation policy:

- explicit only

Reason:

- theme changes are high leverage and should not be applied implicitly during ordinary implementation work.

### `vue-agent-delivery`

Owns:

- route and page structure
- module boundaries
- API client structure
- shared types
- store boundaries
- UI state handling

Does not own:

- brand identity
- token naming strategy
- color palette decisions

Invocation policy:

- implicit allowed

Reason:

- this is the core implementation workflow for the frontend project.

## Anti-conflict rules

- A skill should own one decision domain.
- A skill may consume another skill's outputs, but should not redefine them.
- Theme decisions flow into delivery decisions, not the reverse.
- If two skills need to touch the same topic, one must be the owner and the other must defer.

## Recommended future skills

Only add these after the first frontend slice is stable:

1. `api-contract-adapter`
2. `frontend-verification`

Do not add more skills until a real coordination problem appears.
