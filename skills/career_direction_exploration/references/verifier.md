# Verifier Rubric

## Purpose

This verifier checks whether the skill output satisfies the skill contract.

## Checks

### 1. Profile Consistency Check

Pass criteria:
- The output uses the provided user profile accurately.
- The output does not contradict explicit constraints.
- The output distinguishes profile facts from assumptions.

Fail criteria:
- The output invents user background.
- The output recommends directions that violate hard constraints.
- The output ignores important preferences.

### 2. Evidence Support Check

Pass criteria:
- Market or role claims are supported by cited or described evidence when available.
- Time-sensitive claims are not presented as timeless facts.
- Uncertain claims are marked as uncertain.

Fail criteria:
- The output makes unsupported market claims.
- The output exaggerates trends or opportunities.
- The output relies on outdated evidence without warning.

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
