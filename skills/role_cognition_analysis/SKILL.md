---
name: role_cognition_analysis
description: This skill should be used when the user wants to understand a specific role's real work, daily tasks, core capabilities, tools, deliverables, pressure, path, and common misconceptions. It produces a practical role explanation grounded in role requirements and organization context when available. It should not be used to choose among multiple roles or plan a full learning path.
---

# Role Cognition Analysis

## Purpose

Explain what a target role actually involves so the user can judge whether it is worth pursuing.

## When to Use This Skill

- The user asks what a role does day to day.
- The user wants to understand tools, outputs, pressures, or misconceptions.
- A previous skill selected or recommended a role for deeper inspection.

## When Not to Use This Skill

- Use `target_role_positioning` to choose among multiple roles.
- Use `role_competency_modeling` to build a competency model.
- Use `skill_gap_diagnosis` to compare the user's skills against requirements.

## Required Inputs

- Required: `role_requirement_resource`.
- Optional: `user_profile_resource`.
- Derived from conversation: target role title, seniority, industry, location, organization type.
- Must be fetched or requested: current job descriptions, official role pages, or organization context if not supplied.

## Missing Context Policy

Ask at most 3 questions if the target role or context is unclear. If the user asks for a first-pass answer, proceed with explicit assumptions and avoid organization-specific claims without evidence.

## Workflow

1. Identify the exact role, seniority, domain, and organization context.
2. Extract role requirements from provided resources or available sources.
3. Explain the role in plain language.
4. Break down daily tasks, core capabilities, tools, deliverables, pressure points, paths, and misconceptions.
5. Separate stable role patterns from organization-specific or market-sensitive evidence.
6. If user profile is available, add brief fit observations without turning the output into positioning.
7. Produce a state update for possible handoff.

## Tool Use Policy

- `WebSearchTool`: Use to find current role descriptions or hiring patterns.
- `WebFetchTool`: Use to fetch specific job descriptions, official pages, reports, or documentation.
- `ReadMcpResourceTool`: Use to read authorized connected resources such as resumes, JDs, or internal documents.
- Do not use tools that are not listed in the metadata.
- If a required tool is unavailable, state the limitation and proceed with assumptions only when safe.

## Output Contract

Return `role_explanation`, `daily_tasks`, `core_capabilities`, `deliverables`, and `misunderstandings`.

See `references/output_contract.md` for the full output schema.

## Verification Checklist

Check evidence support.

See `references/verifier.md` for the full verification rubric.

## Handoff Policy

This skill may hand off to target positioning, competency modeling, or gap diagnosis.

See `references/handoff_policy.md` for detailed handoff conditions.

## Failure Modes

- Describing the role too generically.
- Overfitting to one job posting.
- Confusing tools with capabilities.
- Omitting pressure, deliverables, or misconceptions.
- Making company-specific claims without evidence.

## Final Response Requirements

The response must explain the role concretely, include all required fields, state assumptions, mention sources when used, and recommend a next action when appropriate.
