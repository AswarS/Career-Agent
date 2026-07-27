# Handoff Policy

## Purpose

This file explains when Claude should transition from this skill to related skills.

## Possible Next Skills

| Next Skill | Handoff Condition | Required State | Artifact to Pass |
|---|---|---|---|
| target_role_positioning | The user wants a final primary/backup/not-recommended role decision. | Candidate paths and simulation results. | Path comparison and recommended path. |
| learning_path_planning | The user chooses a path and needs a learning sequence. | Recommended path and constraints. | Recommended path, gaps, timeline assumptions. |

## Handoff Rules

- Do not hand off until the current skill has produced its required output.
- If the next skill requires missing context, ask for that context or mark it as missing.
- Preserve the current skill's output as an intermediate artifact.
- Do not skip directly to downstream execution if the user is still comparing options.

## State Update

When this skill completes, produce a state update with:

```json
{
  "completed_skill": "career_path_simulation",
  "intermediate_artifact": {},
  "recommended_next_skills": [],
  "missing_context": [],
  "assumptions": []
}
```
