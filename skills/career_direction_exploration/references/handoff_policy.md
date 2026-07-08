# Handoff Policy

## Purpose

This file explains when Claude should transition from this skill to related skills.

## Possible Next Skills

| Next Skill | Handoff Condition | Required State | Artifact to Pass |
|---|---|---|---|
| role_cognition_analysis | The user selects a direction and needs role reality. | At least one selected direction. | Direction summary, assumptions, evidence, risks. |
| target_role_positioning | The user has multiple candidate roles and needs a primary target. | Candidate directions and constraints. | Ranked directions and fit reasoning. |
| career_path_simulation | The user wants 1/3/5 year comparison. | Candidate roles and market assumptions. | Direction list, barriers, risk notes. |

## Handoff Rules

- Do not hand off until the current skill has produced its required output.
- If the next skill requires missing context, ask for that context or mark it as missing.
- Preserve the current skill's output as an intermediate artifact.
- Do not skip directly to downstream execution if the user is still exploring options.

## State Update

When this skill completes, produce a state update with:

```json
{
  "completed_skill": "career_direction_exploration",
  "intermediate_artifact": {},
  "recommended_next_skills": [],
  "missing_context": [],
  "assumptions": []
}
```
