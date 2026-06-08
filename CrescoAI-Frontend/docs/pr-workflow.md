# PR Workflow

## Goal

Standardize the PR submission process for frontend work, reducing omissions and making it easier for human reviewers to judge merge readiness.

## Default Workflow

### 1. Complete local changes

Requirements:

- Clear scope of changes
- Aligned with current slice
- No unrelated changes

### 2. Local validation

At minimum:

- `npm run build`

If page behavior changed, also perform necessary manual checks.

### 3. Commit and push branch

Requirements:

- Concise commit message
- Branch name with `codex/` prefix

### 4. Create PR

Requirements:

- Use the Chinese PR template in the repo
- Can start as draft or directly ready

### 5. Switch to ready for review

If PR started as draft, switch to `Ready for review` after self-check.

Purpose:

- Let Copilot and human review work in the same formal state

### 6. Wait for Copilot auto review

Usually takes `5+` minutes.

Requirements:

- Do NOT immediately summon Copilot after PR creation
- Wait for auto review to queue and return
- Do NOT request merge before Copilot review returns

Recommended wait window:

- Wait about `5-10` minutes first
- Then check PR review status again

If still no review after this window, take remedial action:

- Confirm PR is `Ready for review`
- Confirm GitHub is not just queuing delay
- Only then may actively request Copilot reviewer

### 7. Review Copilot comments

Handling principles:

- Real bugs, state sync, isolation, security, portability issues: prioritize fixing
- Pure style suggestions: may decline
- Declined suggestions need clear rationale

### 8. Re-validate after fixes

At minimum run again:

- `npm run test` (from Phase 5)
- `npm run build`

### 9. Merge directly or report results

Final report should explain:

- What was changed
- What valid issues Copilot raised
- Which issues were fixed
- Which suggestions declined and why
- Whether already merged

Current default execution:

- Each PR waits for only 1 round of Copilot review
- After fixing valid issues in that round, do NOT wait for second round
- If no blocking issues, Codex may directly `squash and merge`
- After merge, sync results and next phase judgment to human

## Current Default Standards

- PRs written in Chinese for human review
- Copilot review returns 1 round then close out
- If auto review doesn't trigger after reasonable wait window, Codex actively requests via `gh`
- If no blocking issues, Codex merges directly after fixing valid comments

## Small Change Exception

The following situations may skip full PR workflow, but require "explicit user consent":

- Pure documentation additions or fixes
- Very small visual tweaks
- Shell refinements that don't change interface contracts or main flows

Still must complete:

- Local validation
- Clear explanation of what changed
- Direct commit to `main`

Note:

- This is exception, not default path
- Once changes touch real business flows, state boundaries, API contracts, or multi-file coordination, resume normal PR workflow

## Codex Execution Constraints

To avoid flow stopping at intermediate git points, default to:

- `git checkout -b`
- `git add`
- `git commit`
- `git push`

These are intermediate steps, not standalone stopping points.

Only two situations may pause:

- Completed `PR -> Copilot 1 round review -> fix -> squash merge`
- Real blocking issue: permissions, conflicts, conflicting reviews, or unresolvable technical questions

If only completed one of branch/stage/commit/push, Codex should continue pushing forward, not stop and wait.

## Exception Cases

The following situations may be directly explained and paused:

- Copilot didn't return comments
- Comments conflict with each other
- Comments request changes beyond frontend repo boundary (backend or agent logic)
- Comments too vague to judge whether to fix