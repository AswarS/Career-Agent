# Verifier Rubric

## Purpose

This verifier checks whether the skill output satisfies the skill contract.

## Checks

### 1. Profile Consistency Check

Pass criteria:
- The output uses the provided user profile accurately.
- The output does not contradict explicit user constraints.
- Profile facts and assumptions are separated.

Fail criteria:
- The output invents user background.
- The output recommends a primary role that violates hard constraints.
- The output ignores user preferences or timeline.

### 2. Constraint Satisfaction Check

Pass criteria:
- The output honors hard constraints.
- Tradeoffs are explicit.
- The primary role is justified against constraints and alternatives.

Fail criteria:
- The output optimizes for the wrong goal.
- The output ignores location, timeline, risk tolerance, salary, or education constraints.
- Backup and not-recommended roles are not explained.

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
