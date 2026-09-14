---
name: information-collection
description: Passive information-resolution workflow for the dedicated Web App Agent. Use only when app-coordinator loads it through WebAppLoadSkill for missing App Brief information, or through the legacy standalone Tool. Resolve only requested fields from conversation evidence, authenticated Profile reads, and injected memory; return focused questions for unresolved blockers. Do not decide whether to build an App, invoke the renderer, or write user data.
model-entry: action-tool
model: GLM-5.2
user-invocable: false
allowed-tools:
  - Read
  - profile_read
  - profile_get_basic
  - profile_memory_read
  - ReturnSkillResult
---

# User Information Collection

Resolve specific information gaps for the coordinator. In the dedicated Web App Agent this Skill is loaded into the coordinator's existing context; it does not start or complete a separate Agent invocation.

```text
Web App Agent: app-coordinator -> load information-collection -> resume coordinator
Web App Agent: app-coordinator -> load develop-web-game       -> finish delivery
```

## Input contract

Accept only an explicit [information request](references/information-protocol.md) in `<skill-action-input>.information_request` containing:

- a correlation `requestId`;
- a trusted `userId` supplied by authenticated runtime context through the Harness;
- a narrow purpose;
- requested paths and reasons;
- allowed sources and privacy limits.

`WebAppLoadSkill` (or the legacy standalone Tool) binds `userId` from authenticated runtime context. If it is absent, do not guess it and do not enumerate other user directories. Return `blocked` with `missing_trusted_user_id`.

## Workflow

### 1. Validate scope and identity

Validate the request before reading user data:

- accept `userId` only as a single safe path segment matching `^[A-Za-z0-9_-]{1,128}$`;
- reject separators, `..`, drive prefixes, percent-encoded traversal, or environment-variable expansion;
- collect only fields listed in `missing` or needed to interpret them.

Do not construct, inspect, or enumerate a user directory. The Tool and authenticated Profile read APIs own storage isolation. If an expected context source is unavailable, continue with conversation evidence and return `context_source_unavailable` rather than searching unrelated paths.

### 2. Read sources in order

Use this precedence:

1. explicit current-turn user statements;
2. explicit prior conversation statements;
3. current user profile through an available authenticated Profile read Tool;
4. current user memory already injected into this dedicated Agent context;
5. focused user questions.

Newer explicit user statements override older memory. Profile and memory reduce repeated questions but never override a direct correction from the user.

Read [the storage policy](references/storage-policy.md) before accessing stored context. Never navigate server-owned user directories directly. Preserve source provenance and freshness for every resolved value.

### 3. Classify evidence

For each requested path, return one of:

- `resolved`: directly supported by a reliable source;
- `partial`: useful evidence exists but does not fully answer the requested field;
- `conflict`: sources disagree and user confirmation is required;
- `unresolved`: no relevant evidence exists;
- `not_collectable`: the request is unsafe, unnecessary, or asks for a prohibited inference.

Do not convert behavioral traces into intelligence, personality, emotional, medical, diagnostic, or hiring labels. Do not infer protected or highly sensitive attributes from indirect evidence.

### 4. Ask only necessary questions

If blocking fields remain after permitted reads, prepare up to three grouped questions in the result. Do not ask the end user from this child invocation.

Questions must:

- explain why the information changes the downstream result when not obvious;
- ask for outcome-level information, not UI implementation choices;
- avoid repeating known facts;
- offer concise answer formats when useful;
- allow the user to decline nonessential or sensitive collection.

Do not ask about colors, typography, or layout unless explicitly requested by the coordinator as a real constraint.

### 5. Return a structured result

Build [multi-agent-information-result/1.0](references/information-protocol.md) for the coordinating workflow. Include:

- values only for requested paths;
- source type and file-relative provenance where applicable;
- confidence based on evidence quality, not model certainty;
- unresolved fields and focused questions;
- conflicts, freshness warnings, and skipped unsupported files.

Do not build an App Brief or call `develop-web-game`. The coordinator owns merging, validation, scene selection, and renderer invocation.

When `<skill-action-input>.execution_mode` is `in-context`, do not call `ReturnSkillResult`; retain the complete information result in the current reasoning context and immediately resume `app-coordinator`. In legacy standalone Action Tool mode, call `ReturnSkillResult` exactly once with the current Harness identifiers. Use outcome `success` for `resolved` or `partial`, `insufficient_input` for `needs_user_input`, and `error` for `blocked` or technical failure.

## Memory writeback boundary

Default to read-only access. The path contains durable user data, so collection does not imply permission to modify it.

This Action Skill has no write tools. If durable writeback would be useful and separately authorized, return a `writeback_proposal` for another workflow. Never create or update user storage directly.

## Failure handling

- Missing context source: use conversation plus questions; return a warning.
- Unsupported or malformed Profile result: skip it, record the source identifier and reason, continue.
- Conflicting evidence: prefer direct current user correction; otherwise ask.
- Too many gaps: rank by downstream impact and ask at most three questions per turn.
- Same unresolved fields returned twice: report `collection_stalled` to the coordinator instead of looping.

## Boundaries

- Do not enumerate user IDs or navigate server-owned user storage.
- Do not expose raw Profile or memory content to the renderer or final App.
- Do not return unrelated profile details “just in case.”
- Do not store raw conversation transcripts as profile facts.
- Do not claim a value is confirmed when it is inferred or stale.
- Do not perform silent durable writeback.
