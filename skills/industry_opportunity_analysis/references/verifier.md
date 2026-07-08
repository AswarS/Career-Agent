# Verifier Rubric

## Purpose

This verifier checks whether the skill output satisfies the skill contract.

## Checks

### 1. Evidence Support Check

Pass criteria:
- Market, industry, hiring, or trend claims are supported by cited or described evidence when available.
- Time-sensitive claims are not presented as timeless facts.
- Uncertain claims are marked as uncertain.

Fail criteria:
- The output makes unsupported market claims.
- The output exaggerates trends or opportunities.
- The output relies on outdated evidence without warning.

### 2. Shortcut Risk Check

Pass criteria:
- The output avoids overly easy or misleading entry advice.
- The output warns about hype, saturation, timing, and execution risk.
- The output recommends validation steps.

Fail criteria:
- The output suggests a simplistic path for a complex industry transition.
- The output hides major risks.
- The output claims one course, certificate, or project is enough without evidence.

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
