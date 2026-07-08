# Verifier Rubric

## Purpose

This verifier checks whether the skill output satisfies the skill contract.

## Checks

### 1. Evidence Support Check

Pass criteria:
- Market, salary, and hiring claims are supported by cited or described evidence when available.
- Time-sensitive claims are not presented as timeless facts.
- Uncertain projections are marked as uncertain.

Fail criteria:
- The output guarantees income, promotions, or job offers.
- The output makes unsupported market claims.
- The output uses outdated evidence without warning.

### 2. Constraint Satisfaction Check

Pass criteria:
- The comparison honors user constraints.
- Tradeoffs and opportunity costs are explicit.
- The recommended path is justified against constraints.

Fail criteria:
- The output optimizes for the wrong goal.
- The output ignores timeline, location, income need, risk tolerance, or learning capacity.
- The output omits opportunity cost.

## Overall Judgment

Return one of:

- PASS
- PASS_WITH_MINOR_ISSUES
- FAIL

## Required Feedback Format

```json
{
  "verdict": "PASS | PASS_WITH_MINOR_ISSUES | FAIL",
  "failed_checks": [],
  "notes": "",
  "suggested_revision": ""
}
```
