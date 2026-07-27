# Verifier Rubric

## Purpose

This verifier checks whether the skill output satisfies the skill contract.

## Checks

### 1. Evidence Support Check

Pass criteria:
- Role claims are supported by provided requirements, fetched pages, or clearly described evidence when available.
- Time-sensitive role or hiring claims are not presented as timeless facts.
- Organization-specific claims are marked as assumptions unless sourced.

Fail criteria:
- The output makes unsupported claims about company process or demand.
- The output exaggerates role scope based on one posting.
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
