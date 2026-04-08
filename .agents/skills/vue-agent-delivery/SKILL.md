---
name: Vue Agent Delivery
description: Plan and implement the Vue frontend structure for the career planning product, including page shells, module boundaries, shared types, API client structure, stores, routing, and UI state handling. Use for frontend delivery work. Do not use for defining brand theme tokens or visual identity.
user-invocable: true
---

# Vue Agent Delivery

Use this skill for frontend implementation and delivery decisions.

## Responsibility

This skill owns:

- Vue app structure
- route/page decomposition
- module boundaries
- shared types
- API client and adapter layers
- Pinia/store boundaries
- loading, empty, success, and error states
- implementation sequencing

This skill does not own:

- brand mood
- theme palette definition
- color-token naming strategy
- chart color identity

If a task is primarily about colors or visual tone, use the theme skill instead.

## Default Stack

Prefer:

- Vue 3
- Vite
- TypeScript
- Vue Router
- Pinia

Follow the repo's existing patterns if they already exist and are coherent.

## Delivery Order

Use this order unless the repo has a strong reason not to:

1. define the user flow
2. define page shells
3. define shared data types
4. define the API contract or mock contract
5. build the request layer
6. build store or page state
7. build page components
8. connect loading, empty, success, and error states
9. verify with one realistic path

## Recommended Feature Slices

For this product, default slices are:

- onboarding and profile intake
- career dashboard
- recommendation or advice feed
- job application tracking
- work goals and weekly planning
- study and upskilling plan
- life balance reminders

Build one slice at a time.

## Recommended Structure

If the repo does not already define a structure, prefer:

- `src/pages`
- `src/components`
- `src/modules`
- `src/stores`
- `src/services`
- `src/types`
- `src/styles`

Keep domain logic near the feature instead of building one oversized global folder.

## API Rules

- define request and response types first
- centralize HTTP configuration
- keep auth, headers, retries, and base URL in the service layer
- normalize backend responses before components consume them
- do not scatter raw fetch calls across pages

If backend endpoints are unstable, create typed mocks with matching shapes.

## State Rules

Use local state first. Promote to Pinia only when state is shared across modules or routes.

Good store candidates:

- current user profile
- planning preferences
- advice history
- application tracker state
- session-level UI state

## AI Collaboration Rules

- ask AI for one slice at a time
- always include target file paths
- make the data contract explicit before UI wiring
- prefer concrete edits over broad reinvention
- verify each slice before moving on

## Anti-Contradiction Rule

This skill may consume existing theme tokens, but it must not redefine the product's visual identity. If token changes are needed, hand that decision to the theme skill.
