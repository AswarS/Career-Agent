# DESIGN.md

## Final Direction

This product should use a `Notion-like shell` as the structural baseline,
combined with the project's existing `warm slate + teal + amber` palette.

This is the final design choice for now.

The product is not a landing page, and it is not only a chat app.
It is an `agent workspace` for career planning:

- left navigation and thread history
- central conversation and reading surface
- right-side or full-width live artifact surface
- real-time updates from backend systems
- support for text, markdown, voice, images, and generated HTML

Because of that, the design system must optimize for:

- long-session readability
- modular workspace layout
- mixed-density content
- calm trust rather than flashy AI aesthetics
- easy extension by AI-assisted frontend work

## Document Boundary

This document owns:

- visual mood
- color tokens
- typography
- spacing and density guidance
- component visual language
- shell presentation rules

This document does not own:

- product information architecture
- route definitions
- default application mode
- shell state transitions
- API contracts
- backend behavior
- agent behavior
- module or store boundaries

Those decisions belong to:

- `docs/career-agent-spec.md` for product and integration truth
- `Vue Agent Delivery` skill for frontend implementation structure
- backend and agent owners in the upstream `claude-code-rev` repository for upstream logic

## Inspiration Sources

Primary structural inspiration:

- Notion from `awesome-design-md`

Secondary tonal reference:

- Claude from `awesome-design-md`

Conversation affordance reference:

- Intercom from `awesome-design-md`

Interpretation rule:

- Use Notion for layout calmness and workspace containment
- Use Claude only for warmth and editorial restraint
- Use Intercom only for conversation clarity and action affordance
- Do not copy any of them literally

## Product Theme

Working theme name:

- `Calm Workspace`

Personality:

- trustworthy
- warm
- practical
- reflective
- clear under pressure

Avoid:

- purple-first AI styling
- dark futuristic dashboards by default
- glossy gradients
- overly playful SaaS illustration language
- sharp urgency-heavy support-desk energy

## Core Visual Principles

### 1. Workspace First

The shell should feel like a place where the user can think and act for a long
time. Visual chrome must stay quiet. The artifact surface must be allowed to
become the most visually dominant area when opened.

### 2. Warm Neutral Base

The page should be built on warm light surfaces rather than cold gray.
The background should feel closer to paper or soft sand than to glass.

### 3. One Calm Accent, One Action Accent

Use teal as the main growth / trust accent.
Use amber as the action / opportunity accent.
Do not introduce extra saturated brand colors into the main shell.

### 4. Mixed Content Readability

The app must support:

- markdown reading
- chat turns
- form blocks
- profile summaries
- advice cards
- image previews
- embedded generated HTML

Every surface should remain readable when these coexist on one screen.

### 5. Agent-Compatible Simplicity

The system should be easy for AI to extend without visual drift.
That means:

- clear token ownership
- consistent radius scale
- limited elevation system
- no decorative one-off components

## Shell Surface Guidance

The product shell may contain:

1. left rail
2. main workspace
3. artifact surface

The existence and switching logic of those regions are defined by the product
spec, not by this design document.

This document only defines how they should feel when present.

Visual proportion guidance:

- left rail should feel compact and supportive, not dominant
- main workspace should remain the primary reading surface in non-artifact states
- artifact surface should be allowed to become visually dominant when active

Presentation guidance:

- left rail should read as quiet navigation chrome
- main workspace should prioritize reading comfort and compositional stability
- artifact surface should feel like a hosted work canvas

Mobile presentation guidance:

- one primary visual surface at a time
- transitions should feel like moving between work contexts, not opening random overlays
- navigation chrome should stay lightweight

## Typography

Use a clean sans stack for UI and body.
Use a restrained serif only for large welcome moments or strategic hero lines.
Do not make serif the default for dense product UI.

Recommended stack:

- UI/body: `Inter`, `system-ui`, sans-serif
- display moments: `Iowan Old Style`, `Georgia`, serif
- code/markdown code: `ui-monospace`, `SFMono-Regular`, monospace

Type rules:

- main body: `15px` or `16px`
- metadata: `12px` to `13px`
- dense UI labels: `13px` to `14px`
- section titles: `20px` to `28px`
- welcome hero only: serif, large, restrained

## Color Tokens

Base tokens should remain semantic.
These values are derived from the original accepted palette.

```css
:root {
  --color-bg: #f3efe7;
  --color-bg-subtle: #fbf8f3;
  --color-surface: #fffcf7;
  --color-surface-strong: #fffaf2;
  --color-text: #23313b;
  --color-text-muted: #61707c;
  --color-primary: #1d736d;
  --color-primary-hover: #155851;
  --color-secondary: #d88f48;
  --color-accent: #f0b058;
  --color-success: #25876c;
  --color-warning: #cc7d2a;
  --color-danger: #bc5d59;
  --color-border: rgba(96, 114, 126, 0.16);
  --color-focus-ring: rgba(29, 115, 109, 0.26);
}
```

Usage rules:

- `--color-primary`: growth, progress, trusted CTA, active navigation
- `--color-secondary`: action moments, important status, opportunity cues
- `--color-accent`: warm highlights, badges, non-critical emphasis
- `--color-danger`: errors only
- `--color-warning`: caution or pending states only

Do not hard-code hex values inside leaf components.

## Component Language

### Navigation

- warm light background
- subtle section labels
- active item uses soft tinted fill, not heavy contrast
- thread list should feel quiet and scannable
- collapsed rail should use intentional glyph or badge-like markers, not raw compressed abbreviations
- collapsed navigation must still feel designed, not like a squeezed full-width sidebar

### Conversation

- message blocks should prioritize readability over bubble styling
- assistant turns can use subtle surface tint instead of strong chat bubbles
- markdown should look native to the product, not embedded from another app

### User Profile / Persona

- use structured cards with short labels and dense summaries
- support avatar, goals, current situation, risk signals, preferences
- allow edit state without visual mode switching chaos

### Artifact Pane / Work Canvas

- border should be subtle
- pane header should show title, source, status, expand/collapse controls
- pane body should support live HTML or previews
- artifact should feel like a working canvas, not a modal
- the surface may host planning outputs, simulations, coding tasks, or visual learning flows
- immersive simulation states may hide the left rail and most conversation chrome
- immersive mode should keep a slim top recovery bar instead of opening a detached window by default

### Input Composer

- must support text first
- voice trigger and attachment controls can live in the same composer
- do not overload the composer with decorative controls

### Markdown

- headings must stay compact
- code blocks should feel integrated, not dev-tool themed
- lists and quotes should remain calm and legible

## Motion

Use only functional motion:

- pane open/close
- streaming appearance
- list insertion
- progress updates

Motion should be:

- short
- low amplitude
- non-bouncy

Avoid ornamental motion.

## Real-Time Artifact Rules

Generated HTML may appear in the right pane or take over the main workspace.
The shell must present that cleanly.

Design constraints:

- artifact pane must visually separate shell chrome from generated content
- generated content area may use its own local design language, but the host
  shell must remain stable
- if the artifact becomes full-screen, the user must still understand how to
  return to the conversation
- the host must still feel appropriate when the canvas is interactive, not just informational

## Multimodal Rules

The visual system must gracefully support:

- voice input
- image upload
- markdown rendering
- structured cards
- generated HTML previews

Future-safe support:

- charts
- diagrams
- timeline views
- document previews

The shell should not assume everything is a chat bubble.

## Do

- keep surfaces warm and calm
- prioritize reading comfort
- keep borders whisper-light
- let the artifact pane become dominant when needed
- use semantic tokens
- keep the shell predictable for AI-assisted extension

## Do Not

- do not make the interface look like a support dashboard
- do not use multiple competing accent colors
- do not make the main shell dark by default
- do not over-style chat turns
- do not make generated HTML feel trapped inside a tiny card

## Prompt Guide For Future AI Work

When asking AI to build UI in this project:

1. preserve the `Calm Workspace` shell
2. use semantic color tokens only
3. treat the app as a workspace, not a marketing site
4. assume chat, markdown, profile cards, and live artifacts may coexist
5. keep components quiet unless they represent user action or system status
6. do not invent backend or agent behavior inside frontend UI prompts
