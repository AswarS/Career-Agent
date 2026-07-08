# Examples

## Positive Trigger Examples

These user requests should trigger this skill:

1. "I have marketing and data experience but do not know which direction to choose."
2. "Recommend career directions based on my profile and risk tolerance."
3. "I want several career options before choosing a target role."

## Negative Trigger Examples

These user requests should not trigger this skill:

1. "Explain the daily work of a solutions architect."
2. "Choose my primary target from product manager, data analyst, and consultant."
3. "Build a resume for my chosen target role."

## Ambiguous Cases

These requests may require clarification or routing:

1. "What should I do next in my career?" Ask for profile and constraints or proceed with assumptions.
2. "Is AI product manager good?" Route to role or industry analysis if the user asks about one role only.

## Complete Example

### User

"I have 3 years in operations, some SQL, prefer stable income, and can study 8 hours per week. What roles should I explore?"

### Expected Skill Behavior

Identify profile facts, ask only if constraints are blocking, compare several directions, note market uncertainty, and recommend a first validation step.

### Expected Output Outline

Known facts, assumptions, 3 to 5 recommended directions, fit scores, entry barriers, risks, priority direction, and handoff suggestion.

## Bad Output Example

"You should become a data scientist. It pays well and has a future."

### Why It Fails

It gives one unsupported direction, ignores constraints, lacks entry barriers, and overstates market certainty.

## Good Output Outline

Compare operations analyst, business analyst, customer success operations, and data analyst; explain fit, barriers, risks, and choose one low-cost validation path.
