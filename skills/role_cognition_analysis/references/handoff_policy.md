# Handoff Policy

## Purpose

This file explains when Claude should transition from this skill to related skills.

## Possible Next Skills

| Next Skill | Handoff Condition | Required State | Artifact to Pass |
|---|---|---|---|
| target_role_positioning | The user asks whether this role should be primary or backup. | Role explanation plus candidate alternatives. | Role facts, assumptions, risks. |
| role_competency_modeling | The user needs a structured capability model for the role. | Role scope and deliverables are clear. | Core capabilities and deliverables. |
| skill_gap_diagnosis | The user wants to compare their profile to role requirements. | User profile and role requirements are available. | Role requirements and capability list. |

## Handoff Rules

- Do not hand off until the current skill has produced its required output.
- If the next skill requires missing context, ask for that context or mark it as missing.
- Preserve the current skill's output as an intermediate artifact.
- Do not skip directly to downstream execution if the user is still understanding the role.

## State Update

When this skill completes, produce a state update with:

```json
{
  "completed_skill": "role_cognition_analysis",
  "intermediate_artifact": {},
  "recommended_next_skills": [],
  "missing_context": [],
  "assumptions": []
}
```
