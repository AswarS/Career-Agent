# Handoff Policy

## Purpose

This file explains when Claude should transition from this skill to related skills.

## Possible Next Skills

| Next Skill | Handoff Condition | Required State | Artifact to Pass |
|---|---|---|---|
| role_competency_modeling | The primary role is chosen and capability structure is needed. | Primary role and role assumptions. | Positioning decision and required evidence. |
| skill_gap_diagnosis | The user wants to compare current skills to the target role. | Primary role, requirements, user profile. | Primary role, evidence requirements, constraints. |
| project_training_generation | The user needs portfolio projects for the target role. | Primary role and evidence gaps. | Key evidence to build and role rationale. |

## Handoff Rules

- Do not hand off until the current skill has produced its required output.
- If the next skill requires missing context, ask for that context or mark it as missing.
- Preserve the current skill's output as an intermediate artifact.
- Do not skip directly to downstream execution if the user is still comparing options.

## State Update

When this skill completes, produce a state update with:

```json
{
  "completed_skill": "target_role_positioning",
  "intermediate_artifact": {},
  "recommended_next_skills": [],
  "missing_context": [],
  "assumptions": []
}
```
