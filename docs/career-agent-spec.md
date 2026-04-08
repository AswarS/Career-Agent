# Career Agent Product Spec

## Status

Locked v1 for MVP direction review.

## Language Policy

This file is the implementation-facing spec.

A Chinese review copy lives at:

- `docs/zh/career-agent-spec.md`

The two files should stay aligned.
If they drift, reconcile them before implementation continues.

## Product Summary

Build a career-planning agent application with a workspace layout similar to
Codex-style tooling:

- left navigation for threads, profiles, and workspace entry points
- central conversation and reasoning surface
- right-side or full-width live artifact surface

The product helps individuals make decisions about:

- job search
- current work
- learning and upskilling
- life balance and long-term planning

The app should feel like a hybrid of:

- advisor
- workspace
- planning system

It should not feel like:

- a pure chatbot
- a support desk
- a static dashboard

## Primary Users

### 1. Career Explorer

Someone trying to understand what role, direction, or next move makes sense.

Needs:

- structured guidance
- profile building
- reflection prompts
- action suggestions

### 2. Active Job Seeker

Someone preparing resumes, portfolios, applications, and interviews.

Needs:

- targeted advice
- live artifact generation
- progress tracking
- document and strategy support

### 3. Working Professional

Someone balancing current work, growth, and life constraints.

Needs:

- planning support
- prioritization
- learning paths
- sustainable pacing

## Product Goals

### Core Goal

Help a user move from vague concern to concrete next action with the support of
an AI agent and live interactive artifacts.

### Supporting Goals

- maintain trust through clear structure and grounded outputs
- allow the user to see and edit generated artifacts in real time
- support long-running sessions with evolving user context
- allow frontend and backend teams to iterate incrementally

## Non-Goals For Initial Version

- enterprise multi-seat collaboration
- full document editor parity with Notion
- arbitrary plugin marketplace
- highly customized charting or canvas-heavy visual systems
- native mobile-first experience before the desktop shell is stable

## Delivery Scope And Team Responsibility

This repository owns the frontend implementation scope.

### Frontend Repository Owns

- application shell
- route-level UI
- conversation workspace UI
- profile UI
- artifact host UI
- markdown rendering integration
- multimodal input UI
- frontend state management
- API client and adapter design
- loading, empty, success, stale, and error presentation

### Frontend Repository Does Not Own

- backend business logic
- agent reasoning logic
- prompt orchestration
- artifact generation logic
- persistence implementation
- backend event production
- server-side real-time delivery infrastructure

### External Integration Owner

Backend and agent-side second-stage development are handled by another team in:

- the upstream `claude-code-rev` repository

This frontend project should treat that system as an upstream integration
dependency, not as code to be reimplemented here.

### Practical Working Rule

For this repo, "API design" means:

- defining request and response shapes needed by the frontend
- defining frontend-side adapter contracts
- defining artifact payload expectations
- designing how UI state reacts to upstream data

It does not mean implementing the backend or agent runtime here.

## Core Product Logic

The product should operate around three connected systems:

### 1. Persistent User Context

The system stores and updates:

- user profile
- current goals
- constraints
- preferences
- recent plans
- prior conversations

This context informs future responses and generated artifacts.

### 2. Conversational Planning

The user interacts through conversation.
The system should:

- ask clarifying questions
- summarize context
- recommend next steps
- generate concrete outputs

The conversation is not only for answers.
It is also the control surface for planning work.

### 3. Live Artifact Generation

The agent can generate an artifact that opens in the right pane or takes over
the main workspace.

Examples:

- profile summary
- weekly plan
- roadmap
- resume outline
- interview preparation board
- learning schedule
- application tracker

These artifacts must be updateable in real time as backend data arrives.

## Information Architecture

Top-level areas:

1. Home
2. Conversations
3. Profile
4. Plans
5. Artifacts
6. Settings

## Locked Decisions For MVP

These decisions are now treated as approved defaults unless explicitly changed.

### Default Desktop Mode

- default mode: `Conversation First`
- artifact opens on demand in the right pane
- artifact can be promoted into `Artifact Focus`

### First Slice To Build

Build this path first:

- conversation workspace
- profile-lite
- one weekly plan artifact

This is the first realistic path the project should verify end-to-end.

### Artifact Host Model

- generated HTML opens in the right pane by default
- default host model: sandboxed iframe
- full-width artifact mode is supported when needed

### Profile Source Of Truth

- structured profile data is the system source of truth
- conversation may suggest changes
- profile changes should be confirmed and persisted through explicit UI actions

### MVP Modalities

Phase 1:

- text
- markdown
- image preview

Phase 2:

- voice input

### MVP Navigation

Primary navigation for the first implementation pass:

- Threads
- Profile
- Artifacts
- Settings

`Home` should exist only as a lightweight welcome or empty state in MVP.
`Plans` should not be a first-pass top-level destination.

### Locked Profile Schema Outline

The first implementation pass should support this profile structure:

- `display_name`
- `locale`
- `timezone`
- `current_role`
- `employment_status`
- `experience_summary`
- `education_summary`
- `location_region`
- `target_role`
- `target_industries`
- `short_term_goal`
- `long_term_goal`
- `weekly_time_budget`
- `constraints`
- `work_preferences`
- `learning_preferences`
- `key_strengths`
- `risk_signals`
- `portfolio_links`

Editing rule:

- the user edits structured fields through explicit UI
- conversation may propose updates, but does not silently overwrite profile data

### Locked First Three Artifact Types

The first three artifact types to support are:

1. `weekly-plan`
2. `profile-summary`
3. `career-roadmap`

Rationale:

- `weekly-plan` validates near-term planning
- `profile-summary` validates profile-to-artifact transformation
- `career-roadmap` validates longer-range structured visualization

### Locked Frontend Integration Objects

The frontend should build around these core integration objects:

- `thread`
- `message`
- `profile`
- `artifact`
- `artifact_revision`
- `attachment`

Minimum artifact fields:

- `id`
- `type`
- `title`
- `status`
- `render_mode`
- `revision`
- `payload`
- `updated_at`

### Locked Integration Assumption For Frontend Start

Framework implementation may start before backend contracts are final if the UI
uses typed frontend placeholders that mirror the expected upstream shape.

This means:

- frontend may use mock adapters first
- upstream integration points must stay typed and replaceable
- no frontend page should directly depend on undeclared backend internals

### Home

Purpose:

- welcome entry
- show current priorities
- resume recent threads
- surface recommended next actions

### Conversations

Purpose:

- long-form agent interaction
- markdown and multimodal exchange
- launch point for artifacts

### Profile

Purpose:

- collect and edit user persona data
- show goals, constraints, preferences, and progress markers

### Plans

Purpose:

- structured views of career, work, learning, and life plans

### Artifacts

Purpose:

- list generated outputs
- reopen, compare, revise, and export artifacts

## Shell Modes

The app needs explicit layout modes.

### Mode A: Conversation First

Use when:

- the user is exploring
- the artifact is not yet active

Layout:

- left rail
- central conversation

### Mode B: Conversation + Artifact

Use when:

- the user is discussing a generated plan while inspecting it

Layout:

- left rail
- conversation
- right artifact pane

### Mode C: Artifact Focus

Use when:

- the generated HTML output is the main task surface
- the user needs to inspect or interact with a live plan or tool

Layout:

- left rail optional
- artifact takes most of the screen
- conversation reduced to tray, tab, or collapsible panel

### Mode D: Profile Setup

Use when:

- onboarding or large edits to profile data happen

Layout:

- guided form or interview flow
- conversation support may remain visible but secondary

## Real-Time Rendering Spec

The backend may return structured data and rendered HTML updates to the agent.
The frontend must support a stable host shell around a changing artifact.

### Required Behavior

- open generated HTML in the right pane by default
- allow promote-to-fullscreen behavior
- support streaming updates without full page resets
- preserve user scroll position where reasonable
- show render state: loading, streaming, ready, stale, error

### Recommended Integration Model

The frontend host should accept artifact payloads like:

- artifact id
- title
- render mode
- html payload or structured payload
- revision number
- status
- metadata

Recommended host communication shape:

- artifact lifecycle event
- full artifact replacement
- partial artifact metadata update
- render-state update

### Host Responsibilities

- display artifact lifecycle state
- isolate shell layout from artifact internals
- preserve navigation and recovery paths
- support re-render and version replacement

### Safety Constraints

Generated HTML should be treated as a controlled artifact surface.
The implementation should plan for:

- sanitization strategy
- style isolation strategy
- script execution policy
- host-to-artifact communication contract

Initial recommendation:

- prefer sandboxed iframe or controlled render container for risky content
- keep host shell and generated artifact styles isolated

## Multimodal Support

Initial supported modalities:

- text
- markdown
- image input
- voice input

Planned rendered outputs:

- markdown responses
- image previews
- generated HTML
- structured cards
- plans and timelines

### Voice

Voice should be integrated as an alternate input path, not a separate product.
The composer should support:

- start/stop recording
- transcription preview
- send edited transcript

### Images

Images should support:

- upload
- preview
- attachment to a conversation turn
- future analysis workflows

### Markdown

Markdown is first-class.
The renderer should support:

- headings
- lists
- links
- code blocks
- tables if needed
- callouts or quote blocks

## Core Screens For MVP

### 1. Home

Includes:

- welcome state
- active goals
- recent threads
- suggested next step

### 2. Conversation Workspace

Includes:

- threaded messages
- rich assistant responses
- composer with multimodal actions
- artifact launch region

### 3. Profile

Includes:

- identity and current situation
- target role or direction
- constraints
- strengths and risks

### 4. Artifact Workspace

Includes:

- artifact header
- render container
- revision state
- action controls

## Suggested Build Order

Because the team is early in AI-assisted development, the implementation should
avoid over-designing the first pass.

### Phase 1

- app shell
- left rail
- conversation view
- static profile page
- artifact pane host
- markdown rendering
- frontend API client contract placeholders
- typed mock data for `thread`, `profile`, and `artifact`

### Phase 2

- live artifact switching
- user profile persistence
- image and voice input
- loading and streaming states

### Phase 3

- richer plans
- artifact history
- compare revisions
- more advanced multimodal workflows

## AI Collaboration Workflow

Recommended working method for this project:

1. define one slice at a time
2. write the data contract first
3. build the host shell before fancy artifact content
4. verify loading, empty, success, and error states
5. only then polish visuals

This reduces the risk of AI-generated frontend drift.

## Open Questions For Review

These items still deserve review, but they are no longer blocking the first implementation pass:

1. How strong should the `Home` recommendation engine be once the shell is stable?
2. Which artifact type should come after `weekly plan`?
3. How much editing should happen directly inside an artifact versus the conversation?
4. When should voice move from phase 2 into the primary workflow?
5. Should `Plans` eventually become a first-class navigation destination or remain artifact-driven?

## Review Decision To Lock

If approved, the next implementation pass should lock:

- final design token file

## Readiness Decision

Current readiness: `GO` for frontend framework implementation.

Reason:

- product shell direction is locked
- repository scope is locked
- first slice is locked
- profile schema outline is sufficient for initial frontend work
- initial artifact set is sufficient for host design

The project does not need backend completion to begin frontend framework work.
It only needs stable typed placeholders and disciplined adapter boundaries.
