# Handoff Policy

## Purpose

This file explains when Claude should transition from this skill to related skills.

## Possible Next Skills

| Next Skill | Handoff Condition | Required State | Artifact to Pass |
|---|---|---|---|
| target_role_positioning | The user wants to choose target roles from recommended roles. | Recommended roles and user constraints. | Opportunities, risks, role list, assumptions. |
| career_risk_assessment | The user wants a deeper risk analysis before committing. | Industry risks and user's tentative direction. | Risk list, uncertainty, context. |
| application_strategy_planning | The user wants to start applying to roles in the industry. | Target industry and likely roles. | Entry suggestions, role recommendations, evidence. |

## Handoff Rules

- Do not hand off until the current skill has produced its required output.
- If the next skill requires missing context, ask for that context or mark it as missing.
- Preserve the current skill's output as an intermediate artifact.
- Do not skip directly to downstream execution if the user is still exploring options.

## State Update

When this skill completes, produce a state update with:

```json
{
  "completed_skill": "industry_opportunity_analysis",
  "intermediate_artifact": {},
  "recommended_next_skills": [],
  "missing_context": [],
  "assumptions": []
}
```
