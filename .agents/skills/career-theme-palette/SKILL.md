---
name: Career Theme Palette
description: Build or revise the visual theme for a career planning product, including brand colors, semantic tokens, state colors, chart colors, and CTA emphasis. Use only for visual direction and theme-token decisions in the frontend. Do not use for app architecture, API integration, routing, state design, or component decomposition.
user-invocable: true
---

# Career Theme Palette

Use this skill only for the product's visual language.

## Responsibility

This skill owns:

- brand tone and visual mood
- semantic color tokens
- state colors
- chart and data-viz color mapping
- CTA and emphasis rules
- accessibility checks related to color

This skill does not own:

- Vue app structure
- route design
- API contracts
- Pinia stores
- component composition
- request or data-flow logic

If a task is about implementation structure rather than visual tokens, use the delivery skill instead.

## Product Mood

The product should feel:

- trustworthy
- warm
- practical
- encouraging
- calm under pressure

Avoid:

- purple-first AI styling by default
- overly cold enterprise blue
- neon-on-black aesthetics
- high-saturation gradients used everywhere

## Default Direction

Start from:

- deep slate or ink for structure
- teal or green-teal for growth
- warm amber or muted coral for action moments
- soft neutral backgrounds for long reading sessions

## Required Output

When used, produce:

1. one-paragraph theme concept
2. 5-8 core colors
3. semantic tokens
4. state colors
5. usage guidance for cards, text, charts, forms, and CTAs
6. implementation tokens for Vue if code is requested

## Required Tokens

At minimum define:

- `--color-bg`
- `--color-bg-subtle`
- `--color-surface`
- `--color-surface-strong`
- `--color-text`
- `--color-text-muted`
- `--color-primary`
- `--color-primary-hover`
- `--color-secondary`
- `--color-accent`
- `--color-success`
- `--color-warning`
- `--color-danger`
- `--color-border`
- `--color-focus-ring`

Use semantic names, not page-specific names.

## Screen Guidance

- Job search: clearer action contrast, stronger urgency signals
- Work planning: stable neutrals with limited emphasis
- Study/growth: fresher accents, slightly more openness
- Life planning: softer backgrounds and lower stress contrast

Keep one coherent system across the app. Change emphasis, not the entire palette.

## Accessibility Rules

- maintain strong text contrast for reading-heavy screens
- do not use color as the only status signal
- keep warning and danger visually distinct
- use one primary CTA color per screen

## Vue Implementation Rules

When code is requested:

- keep tokens in one source such as `src/styles/tokens.css`
- expose semantic variables to components
- do not hard-code raw hex values inside leaf components
- if dark mode is added, map it from the same semantic token set

## Decision Heuristics

- choose green-teal when the product emphasizes growth and reflection
- choose slate-blue when it emphasizes professional planning
- choose warm sand plus deep ink when it emphasizes life balance and lower anxiety

## Anti-Contradiction Rule

This skill may define or revise theme tokens, but it must not alter frontend architecture decisions already owned by the delivery skill.
