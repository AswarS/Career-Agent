# User Context Read Policy

## Identity and isolation

The internal Tool binds the authenticated `userId`. Do not accept a replacement identity, enumerate user directories, or construct a server storage path.

Use current conversation evidence first. For durable career context, use an authenticated read-only Profile Tool when available. For non-career memory, use only content already injected into the forked context. If a required source is unavailable, return a warning and leave the field unresolved.

The on-disk Network layout is service-owned and is not an Action Skill API. Never use generic `Read`, `Glob`, `Grep`, or shell tools to inspect it. Generic `Read` is reserved for this Skill's trusted references.

## Supported sources

Supported by default:

- explicit current and prior conversation statements visible in context;
- structured results returned by authenticated Profile read Tools;
- user memory already present in trusted context;
- direct answers supplied by the user on a later parent-Agent turn.

Skip unrelated profile fields, raw transcripts, internal database records, caches, logs, and sources with unknown semantics.

## Profile and memory classification

Classify by content and existing metadata, not filename alone:

- profile: relatively stable self-description, preferences, constraints, goals, background;
- memory: dated observations, prior task outcomes, corrections, learned preferences, progress history.

Do not treat model-generated summaries as confirmed user facts unless their metadata records user confirmation.

## Provenance

For each value retain:

- source type: `conversation`, `profile`, `memory`, or `user`;
- a stable source/tool identifier when present, never an absolute host path;
- record identifier when present;
- observed/updated timestamp when present;
- confidence: `high`, `medium`, or `low`;
- whether the value is explicit, inferred, stale, or conflicting.

## Freshness and conflicts

- current explicit user statement wins;
- later confirmed memory wins over older confirmed memory;
- stable profile facts remain usable unless contradicted;
- temporary state, schedule, availability, and goals should be treated as stale quickly;
- if precedence cannot resolve a conflict, ask the user.

## Privacy minimization

Read only fields plausibly relevant to the requested paths. Return only the minimum downstream value and provenance. Never pass raw Profile or memory contents into App Brief `sourceNotes`, telemetry, or generated HTML.
