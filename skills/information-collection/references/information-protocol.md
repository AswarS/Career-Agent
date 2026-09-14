# Information Resolution Protocol v1.0

The coordinator wraps a renderer `needs_input` response into this request. The renderer and collector do not call each other.

## Request

```json
{
  "schema": "multi-agent-information-request/1.0",
  "requestId": "app-brief-20260810-001",
  "requestedBy": "app-coordinator",
  "returnTo": "app-coordinator",
  "purpose": "complete-app-brief",
  "userId": "trusted-runtime-user-id",
  "missing": [
    {
      "id": "goal.successCriteria",
      "path": "goal.successCriteria",
      "reason": "Required to verify completion",
      "question": "What observable result should count as success?",
      "required": true,
      "acceptableSources": ["conversation", "profile", "memory", "user"]
    }
  ],
  "constraints": {
    "maxQuestions": 3,
    "allowedSources": ["conversation", "profile", "memory", "user"],
    "readOnly": true,
    "forbiddenInferences": ["intelligence", "personality", "emotion", "diagnosis", "hireability"]
  }
}
```

`userId` must come from trusted runtime/coordinator context, not from directory discovery or model inference.

## Result

```json
{
  "schema": "multi-agent-information-result/1.0",
  "requestId": "app-brief-20260810-001",
  "status": "resolved|partial|needs_user_input|blocked",
  "userId": "trusted-runtime-user-id",
  "resolved": [
    {
      "path": "user.level",
      "value": "Understands loops but often misses binary-search boundaries",
      "confidence": "high",
      "source": {
        "type": "memory",
        "location": "learning/algorithm-progress.json",
        "observedAt": "2026-08-01T10:00:00Z"
      }
    }
  ],
  "unresolved": [
    {
      "path": "goal.successCriteria",
      "reason": "No explicit success definition in permitted sources",
      "required": true
    }
  ],
  "conflicts": [],
  "questions": [
    {
      "paths": ["goal.successCriteria"],
      "question": "完成后，你希望看到什么可观察结果，才算这次练习有效？"
    }
  ],
  "warnings": ["user_store_unavailable"],
  "writebackProposal": null
}
```

## Merge rules

The coordinator:

1. verifies the `requestId` and `userId` match its request;
2. accepts only paths originally requested;
3. treats current user answers as stronger than profile or memory;
4. never merges `partial`, `conflict`, or `not_collectable` as confirmed facts;
5. reconstructs and validates the complete App Brief;
6. invokes `develop-web-game` again at most once for the same semantic missing set.
