# Output Contract

## Required Fields

| Field | Definition | Required | Notes |
|---|---|---:|---|
| path_comparison | Comparison of candidate paths across decision dimensions | Yes | Include user fit, market evidence, uncertainty, and opportunity cost. |
| one_year_outlook | Likely first-year milestones, constraints, income/growth notes, and risks | Yes | Do not guarantee outcomes. |
| three_year_outlook | Plausible medium-term development and tradeoffs | Yes | Mark assumptions. |
| five_year_outlook | Long-term upside, volatility, and strategic optionality | Yes | Explain uncertainty. |
| recommended_path | Path to prioritize with rationale and validation step | Yes | Include confidence level. |

## Recommended Markdown Output

```markdown
## Career Path Simulation

### Known Facts and Assumptions

### Path Comparison

### 1-Year Outlook

### 3-Year Outlook

### 5-Year Outlook

### Recommended Path

### Validation Actions
```

## Optional JSON Output

```json
{
  "path_comparison": [],
  "one_year_outlook": {},
  "three_year_outlook": {},
  "five_year_outlook": {},
  "recommended_path": "",
  "assumptions": [],
  "evidence_used": []
}
```

## Constraints

- Do not omit required fields.
- Do not invent unavailable context.
- Mark assumptions explicitly.
- Distinguish user-fit reasoning, market evidence, uncertainty, and next-step recommendations.
