# App Brief Contract v1.0

The single coordinating skill owns intent recognition, decides whether an app is needed, and assembles this brief. When information is missing, it may collect that information itself or invoke a peer information-collection skill. `develop-web-game` only validates and renders the brief; the two leaf skills do not call each other.

## Required shape

```json
{
  "schema": "multi-agent-app-brief/1.0",
  "invocation": {"requestedBy": "skill-or-agent-name", "reason": "why an app was selected"},
  "user": {"audience": "who will use it", "level": "known ability or state", "constraints": []},
  "goal": {"outcome": "observable outcome", "successCriteria": []},
  "content": {"domain": "topic", "required": [], "excluded": [], "sourceNotes": []},
  "experience": {
    "scene": "visualize|simulate|practice|workspace",
    "primaryLoop": "user action -> feedback -> next action",
    "requiredInteractions": [],
    "completionState": "what counts as done"
  },
  "adaptation": {"signals": [], "allowedResponses": [], "forbiddenInferences": []},
  "telemetry": {"events": [], "agentQuestions": [], "retention": "local-session", "upload": {"endpoint": "./events"}},
  "delivery": {"title": "app title", "slug": "fraction-practice", "language": "zh-CN", "offline": true},
  "versioning": {
    "logical_object_type": "web_app",
    "logical_object_id": "fraction-practice",
    "version": 2,
    "previous_artifact_ref": "artifact://web-app-abc123"
  }
}
```

## Versioning and Manifest

Optional fields for iteration and the closed loop:

- `delivery.slug` — stable `[a-z0-9][a-z0-9-]{0,63}` slug for localStorage namespacing. The coordinator derives it from the title when absent. The renderer reuses it as `app_slug` in `output.json`.
- `telemetry.upload.endpoint` — the constant `"./events"`. When present (default on), the app uploads telemetry to its own directory URL (`new URL('events', window.location.href)`) — never hardcode user or app ids.
- `versioning` — present only when the parent supplied a base app for explicit iteration. The coordinator copies it from `<skill-action-input>.base_app.versioning` verbatim; the renderer copies it into `output.json` as `lineage`. Absent on first versions.

The renderer writes `output.json` matching `web-app-manifest/1.0`: `schema`, `app_slug` (== `delivery.slug`), `title`, optional `telemetry`, optional `lineage` (== `versioning`), optional `delivery`. The brief's camelCase `telemetry.agentQuestions` is serialized as manifest `telemetry.agent_questions`. The Harness validates this manifest on delivery.

## Validation

Block generation only when a missing field would change correctness, safety, or the primary interaction loop. Visual theme and minor wording can use implementation defaults.

Required semantic information:

- audience and supplied ability/state;
- observable outcome and at least one success criterion;
- domain plus required content;
- one primary scene and interaction loop;
- completion state;
- behavioral signals the Agent needs, or an explicit `none`;
- local data policy and forbidden inferences.

## Missing-input result

Do not interview the user or invoke the peer collector directly. Return this object to the coordinating skill:

```json
{
  "status": "needs_input",
  "schema": "multi-agent-app-brief/1.0",
  "missingSetId": "goal.successCriteria",
  "missing": [
    {
      "id": "goal.successCriteria",
      "path": "goal.successCriteria",
      "reason": "Required to test completion",
      "questionForUpstream": "What observable result counts as success?",
      "required": true,
      "acceptableSources": ["conversation", "profile", "memory", "user"]
    }
  ],
  "collectionHints": {
    "maxQuestions": 3,
    "forbiddenInferences": ["intelligence", "personality", "emotion", "diagnosis", "hireability"]
  }
}
```

Build `missingSetId` deterministically from sorted missing paths so the coordinator can detect repeated semantic gaps. Do not include a `userId` or read user data; the renderer does not own identity context.

The coordinating skill decides whether to answer the missing fields itself or wrap this result in `multi-agent-information-request/1.0` for the peer `information-collection` Skill. If the brief is valid, proceed without asking the user to reconfirm decisions already present.
