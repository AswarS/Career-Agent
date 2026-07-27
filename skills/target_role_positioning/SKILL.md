---
name: target_role_positioning
description: This skill should be used when the user has multiple candidate roles and needs to choose a primary target, backup roles, and roles to avoid based on profile, constraints, role requirements, and market evidence. It produces primary role, backup roles, not-recommended roles, positioning reasons, and key evidence to build. It should not be used for broad direction discovery or detailed role education.
---

# Target Role Positioning

## Purpose

Help the user commit to a practical role-positioning decision from multiple candidate roles.

## When to Use This Skill

- The user has several candidate roles and asks which to target.
- A previous skill produced recommended directions that need prioritization.
- The user needs primary, backup, and not-recommended role categories.

## When Not to Use This Skill

- Use `career_direction_exploration` when no candidate roles exist.
- Use `role_cognition_analysis` when the user wants to understand one role.
- Use `project_training_generation` when the target is already chosen and proof projects are needed.

## Required Inputs

- Required: `user_profile_resource`, `user_intent_constraint_resource`.
- Optional: `role_requirement_resource`, `market_trend_resource`.
- Derived from conversation: candidate role list, hard constraints, timeline, risk tolerance.
- Must be fetched or requested: current market or role requirements if role demand or evidence is central.

## Missing Context Policy

Ask at most 3 questions when candidate roles, profile, or constraints are missing. If the user requests a first pass, proceed with assumptions and label them clearly.

## Workflow

1. Confirm candidate roles and user constraints.
2. Define a simple positioning rubric covering profile fit, feasibility, market evidence, constraint fit, and evidence-building cost.
3. Evaluate each candidate role against the rubric.
4. Assign one primary role, one or more backup roles, and not-recommended roles.
5. Explain the positioning reason and tradeoffs.
6. Specify key evidence the user must build for the chosen role.
7. If file writing is available and requested, save the positioning artifact.
8. Produce a state update for possible handoff.

## Tool Use Policy

- `WebSearchTool`: Use for current role demand, hiring signals, salary or market trend claims.
- `AskUserQuestionTool`: Ask up to 3 targeted questions only when missing context blocks positioning.
- `FileWriteTool`: Write a positioning report only when the runtime supports file writing and the user wants an artifact.
- Do not use tools that are not listed in the metadata.
- If a required tool is unavailable, state the limitation and proceed with assumptions only when safe.

## Output Contract

Return `primary_role`, `backup_roles`, `not_recommended_roles`, `positioning_reason`, and `key_evidence_to_build`.

See `references/output_contract.md` for the full output schema.

## Verification Checklist

Check profile consistency and constraint satisfaction.

See `references/verifier.md` for the full verification rubric.

## Handoff Policy

This skill may hand off to competency modeling, skill gap diagnosis, or project training generation.

See `references/handoff_policy.md` for detailed handoff conditions.

## Failure Modes

- Choosing a primary role without explaining tradeoffs.
- Ignoring user constraints or risk tolerance.
- Treating backup roles as consolation rather than strategy.
- Omitting evidence the user needs to build.
- Overstating market certainty.

## Final Response Requirements

The response must include all required fields, state assumptions, explain why the primary role is prioritized, and recommend a next action or next skill.
