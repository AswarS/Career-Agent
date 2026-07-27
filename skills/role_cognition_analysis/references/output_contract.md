# Output Contract

## Required Fields

| Field | Definition | Required | Notes |
|---|---|---:|---|
| role_explanation | Plain-language explanation of the role's purpose and scope | Yes | Include seniority/domain assumptions. |
| daily_tasks | Typical recurring tasks and workflows | Yes | Distinguish frequent from occasional tasks. |
| core_capabilities | Capabilities required to perform the role | Yes | Separate capabilities from tools. |
| deliverables | Work products and outcomes the role is judged on | Yes | Include examples. |
| misunderstandings | Common misconceptions and reality checks | Yes | Include pressure and tradeoffs where relevant. |

## Recommended Markdown Output

```markdown
## Role Cognition: <Role>

### Known Context and Assumptions

### Role Explanation

### Daily Tasks

### Core Capabilities

### Tools and Deliverables

### Pressure Points and Misunderstandings

### Next Step
```

## Optional JSON Output

```json
{
  "role_explanation": "",
  "daily_tasks": [],
  "core_capabilities": [],
  "deliverables": [],
  "misunderstandings": [],
  "evidence_used": [],
  "assumptions": []
}
```

## Constraints

- Do not omit required fields.
- Do not invent unavailable organization context.
- Mark assumptions explicitly.
- Distinguish evidence-backed role facts from judgment calls.
