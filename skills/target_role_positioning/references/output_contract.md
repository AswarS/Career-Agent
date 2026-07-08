# Output Contract

## Required Fields

| Field | Definition | Required | Notes |
|---|---|---:|---|
| primary_role | The main target role to prioritize | Yes | Include decision confidence and assumptions. |
| backup_roles | Roles worth keeping as secondary options | Yes | Explain strategic value. |
| not_recommended_roles | Roles to defer or avoid for now | Yes | Explain constraints, gaps, or risks. |
| positioning_reason | Decision logic and tradeoffs | Yes | Separate profile fit, market evidence, and judgment. |
| key_evidence_to_build | Portfolio, projects, credentials, or experience signals needed | Yes | Make evidence concrete and role-specific. |

## Recommended Markdown Output

```markdown
## Target Role Positioning

### Known Facts and Assumptions

### Primary Role

### Backup Roles

### Not-Recommended Roles

### Positioning Reason

### Key Evidence to Build

### Next Step
```

## Optional JSON Output

```json
{
  "primary_role": "",
  "backup_roles": [],
  "not_recommended_roles": [],
  "positioning_reason": "",
  "key_evidence_to_build": [],
  "assumptions": [],
  "evidence_used": []
}
```

## Constraints

- Do not omit required fields.
- Do not invent unavailable context.
- Mark assumptions explicitly.
- Distinguish user-fit reasoning, market evidence, uncertainty, and next-step recommendations.
