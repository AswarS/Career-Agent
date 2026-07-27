# Output Contract

## Required Fields

| Field | Definition | Required | Notes |
|---|---|---:|---|
| trend_summary | Current industry or role-area trend summary | Yes | Include time horizon and evidence caveats. |
| opportunities | Concrete opportunity areas and why they matter | Yes | Avoid hype-only claims. |
| risks | Market, regulation, saturation, execution, and personal-fit risks | Yes | Mark uncertainty. |
| recommended_roles | Roles or entry points that match the opportunity landscape | Yes | If user profile exists, include fit notes. |
| entry_suggestions | Practical first steps and validation actions | Yes | Prefer reversible exploration. |

## Recommended Markdown Output

```markdown
## Industry Opportunity Analysis

### Scope and Assumptions

### Trend Summary

### Opportunities

### Risks

### Recommended Roles

### Entry Suggestions

### Suggested Next Step
```

## Optional JSON Output

```json
{
  "trend_summary": "",
  "opportunities": [],
  "risks": [],
  "recommended_roles": [],
  "entry_suggestions": [],
  "assumptions": [],
  "evidence_used": []
}
```

## Constraints

- Do not omit required fields.
- Do not invent unavailable context.
- Mark assumptions explicitly.
- Distinguish evidence-backed claims from judgment calls.
