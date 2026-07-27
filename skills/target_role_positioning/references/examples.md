# Examples

## Positive Trigger Examples

These user requests should trigger this skill:

1. "Choose my target from data analyst, product analyst, and PM."
2. "Which role should be primary and which should be backup?"
3. "I have three directions; help me decide what to pursue first."

## Negative Trigger Examples

These user requests should not trigger this skill:

1. "I have no idea what careers exist for me."
2. "Explain what a data analyst actually does."
3. "Make a portfolio project for my chosen target."

## Ambiguous Cases

These requests may require clarification or routing:

1. "Is product manager right for me?" Ask whether there are alternatives to compare.
2. "What job should I target?" Ask for candidate roles or route to direction exploration.

## Complete Example

### User

"I am choosing between business analyst, data analyst, and product operations. I want stable work and can study 6 hours weekly."

### Expected Skill Behavior

Evaluate each candidate against profile, constraints, market evidence, and evidence-building cost. Assign primary, backup, and not-recommended categories.

### Expected Output Outline

Known facts, rubric, primary role, backup roles, not-recommended roles, positioning reason, evidence to build, next skill.

## Bad Output Example

"Choose data analyst because it is popular."

### Why It Fails

It ignores constraints, does not compare alternatives, gives no evidence-building plan, and over-relies on popularity.

## Good Output Outline

Choose a primary role with rationale, keep one backup, defer one option, explain tradeoffs, and list concrete evidence to build.
