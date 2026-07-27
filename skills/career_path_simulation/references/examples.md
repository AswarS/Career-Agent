# Examples

## Positive Trigger Examples

These user requests should trigger this skill:

1. "Compare PM, data analyst, and business analyst over 1, 3, and 5 years."
2. "Which path has better upside and lower risk?"
3. "Simulate income, growth, and opportunity cost for these roles."

## Negative Trigger Examples

These user requests should not trigger this skill:

1. "What roles should I explore?"
2. "What does a data analyst do every day?"
3. "Make a 12-week learning plan."

## Ambiguous Cases

These requests may require clarification or routing:

1. "Which career is better long term?" Ask for candidate roles and constraints.
2. "Is AI product manager better than data analyst?" Clarify whether the user wants positioning or time-horizon simulation.

## Complete Example

### User

"Compare business analyst and data analyst for me over 1, 3, and 5 years. I need stable income and can study 8 hours per week."

### Expected Skill Behavior

Compare paths by horizon, evidence, fit, risk, opportunity cost, and validation actions.

### Expected Output Outline

Known facts, assumptions, path comparison, 1/3/5-year outlooks, recommended path, validation actions, handoff suggestion.

## Bad Output Example

"Data analyst will make more money in 5 years, so choose it."

### Why It Fails

It guarantees an outcome, ignores uncertainty, omits 1/3/5-year details, and lacks constraint analysis.

## Good Output Outline

Show qualitative comparison, evidence caveats, horizon-specific milestones, risks, and a recommended path with reversible validation.
