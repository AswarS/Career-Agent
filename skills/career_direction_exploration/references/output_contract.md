# Output Contract

## Required Fields

| Field | Definition | Required | Notes |
|---|---|---:|---|
| recommended_directions | 3 to 5 plausible career directions | Yes | Include why each direction belongs on the list. |
| fit_scores | Directional fit ratings with rubric | Yes | Avoid false precision; explain meaning. |
| entry_barriers | Skills, portfolio evidence, credentials, and experience gaps | Yes | Include first validation action. |
| risk_warnings | Market, personal fit, execution, timeline, and opportunity-cost risks | Yes | Mark uncertainty clearly. |
| priority_direction | Recommended first direction to validate | Yes | Justify against user constraints and evidence. |

## Recommended Markdown Output

```markdown
## Career Direction Recommendations

### Known Facts and Assumptions

### Recommended Directions

### Fit Scores

### Entry Barriers and Validation Actions

### Risk Warnings

### Priority Direction

### Suggested Next Step
```

## Optional JSON Output

```json
{
  "recommended_directions": [],
  "fit_scores": [],
  "entry_barriers": {},
  "risk_warnings": {},
  "priority_direction": "",
  "assumptions": [],
  "evidence_used": []
}
```

## Constraints

- Do not omit required fields.
- Do not invent unavailable context.
- Mark assumptions explicitly.
- Distinguish user-fit reasoning, market evidence, uncertainty, and next-step recommendations.
