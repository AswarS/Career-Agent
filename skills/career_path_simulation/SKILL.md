---
name: career_path_simulation
description: This skill should be used when the user wants to compare candidate career paths across 1, 3, and 5 year horizons using profile, market trends, constraints, income/growth expectations, risks, and opportunity costs. It produces a path comparison, time-horizon outlooks, and a recommended path. It should not be used for initial direction discovery or single-role task explanation.
---

# Career Path Simulation

## Purpose

Compare candidate career paths over time so the user can make a strategic career decision under uncertainty.

## When to Use This Skill

- The user asks for 1/3/5 year comparison.
- The user has candidate roles and wants income, growth, risk, and opportunity-cost tradeoffs.
- A previous skill produced candidate directions or target roles.

## When Not to Use This Skill

- Use `career_direction_exploration` when candidate roles are not known.
- Use `target_role_positioning` when the user needs a primary target rather than a timeline simulation.
- Use `learning_path_planning` when a chosen path needs a study plan.

## Required Inputs

- Required: `user_profile_resource`, `candidate_roles`, `market_trend_resource`, `user_intent_constraint_resource`.
- Derived from conversation: current level, timeline, acceptable risk, income needs, location.
- Must be fetched or requested: current market trends and salary/hiring evidence when the output discusses them.

## Missing Context Policy

Ask at most 3 questions if candidate roles, constraints, or timeline are missing. If the user wants a first pass, proceed with assumptions and avoid presenting projections as guarantees.

## Workflow

1. Confirm candidate roles and comparison horizon.
2. Define comparison dimensions: fit, market, income potential, growth, risk, learning burden, opportunity cost.
3. Gather or use market evidence when available.
4. Build a qualitative or lightweight scored comparison.
5. Produce 1-year, 3-year, and 5-year outlooks for each path.
6. Identify risks and reversible validation steps.
7. Recommend a path with confidence level and assumptions.
8. Produce a state update for possible handoff.

## Tool Use Policy

- `WebSearchTool`: Use for current market trends, salary ranges, hiring demand, and role changes.
- `REPLTool`: Use for weighted scoring, tabulation, ranking, or sensitivity analysis.
- Do not use tools that are not listed in the metadata.
- If a required tool is unavailable, state the limitation and proceed with assumptions only when safe.

## Output Contract

Return `path_comparison`, `one_year_outlook`, `three_year_outlook`, `five_year_outlook`, and `recommended_path`.

See `references/output_contract.md` for the full output schema.

## Verification Checklist

Check evidence support and constraint satisfaction.

See `references/verifier.md` for the full verification rubric.

## Handoff Policy

This skill may hand off to target role positioning or learning path planning.

See `references/handoff_policy.md` for detailed handoff conditions.

## Failure Modes

- Treating projections as guaranteed outcomes.
- Ignoring opportunity cost.
- Overusing precise scores without a rubric.
- Comparing paths without user constraints.
- Omitting market uncertainty.

## Final Response Requirements

The response must include all required fields, state assumptions, mention evidence when used, and recommend a next action or next skill.
