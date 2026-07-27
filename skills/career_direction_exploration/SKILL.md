---
name: career_direction_exploration
description: This skill should be used when the user is exploring career directions and needs multiple plausible career paths based on user profile, intent constraints, and market information. It produces recommended directions, fit scores, entry barriers, risk warnings, and a priority direction. It should not be used for detailed role explanation, resume rewriting, or interview preparation.
---

# Career Direction Exploration

## Purpose

Generate several realistic career directions for a user who has not yet committed to one target role.

## When to Use This Skill

- The user asks what career directions are worth exploring.
- The user has a profile and constraints but no clear target role.
- A previous skill produced user context that can support direction recommendations.

## When Not to Use This Skill

- Use `role_cognition_analysis` when the user already wants to understand one role deeply.
- Use `target_role_positioning` when the user has a candidate-role list and needs a primary target.
- Use `career_path_simulation` when the user needs 1/3/5 year path comparison.

## Required Inputs

- Required: `user_profile_resource`, `user_intent_constraint_resource`.
- Optional: `market_trend_resource`.
- Derived from conversation: motivations, disliked work, risk tolerance, location, timeline.
- Must be fetched or requested: current market evidence if claims about demand, salary, hiring, or trends are needed.

## Missing Context Policy

Ask at most 3 high-information questions if profile or hard constraints are missing. If the user asks for a first-pass answer, proceed with explicit assumptions. Never fabricate user background, market facts, constraints, or tool results. Clearly separate known facts from assumptions.

## Workflow

1. Extract known user profile facts and hard constraints.
2. Identify 3 to 5 plausible directions that fit the profile and constraints.
3. Use market evidence when available to test whether each direction is realistic.
4. Score each direction with a simple explained rubric, avoiding false precision.
5. For each direction, list entry barriers, evidence to build, and first validation action.
6. Compare risks across personal fit, market conditions, execution, timeline, and opportunity cost.
7. Choose one priority direction and explain why it should be explored first.
8. Produce a state update for possible handoff.

## Tool Use Policy

- `WebSearchTool`: Use for current market trends, hiring demand, salary ranges, and role changes. Do not use for private user data or unsupported speculation.
- `AskUserQuestionTool`: Ask up to 3 targeted questions only when missing context blocks useful recommendations.
- Do not use tools that are not listed in the metadata.
- If market, salary, hiring, or time-sensitive claims are involved, prefer evidence-backed retrieval when search is available.
- If a required tool is unavailable, state the limitation and proceed with assumptions only when safe.

## Output Contract

Return `recommended_directions`, `fit_scores`, `entry_barriers`, `risk_warnings`, and `priority_direction`.

See `references/output_contract.md` for the full output schema.

## Verification Checklist

Check profile consistency and evidence support.

See `references/verifier.md` for the full verification rubric.

## Handoff Policy

This skill may hand off to role understanding, target positioning, or path simulation after producing direction recommendations.

See `references/handoff_policy.md` for detailed handoff conditions.

## Failure Modes

- Recommending generic directions without profile grounding.
- Treating market assumptions as facts.
- Ignoring hard constraints.
- Producing scores without explaining the rubric.
- Omitting entry barriers or risk warnings.

## Final Response Requirements

The response must be directly useful, include all required output fields, state assumptions, mention evidence when external evidence was used, and recommend the next skill or next action when appropriate.
