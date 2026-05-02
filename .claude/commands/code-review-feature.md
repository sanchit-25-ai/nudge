---
description: Runs parallel security and quality code review for a specific Nudge build-plan item. Pass the spec name as argument e.g. /code-review-feature 05-anthropic-mcp-wiring
allowed-tools: Bash(git diff), Bash(git diff --staged)
---

Run the full code review pipeline for the build-plan item
specified in $ARGUMENTS.

If no argument is provided, stop immediately and say:
"Please provide a spec name. Usage: /code-review-feature
<spec-name> e.g. /code-review-feature 05-anthropic-mcp-wiring"

If `.claude/specs/$ARGUMENTS.md` does not exist, stop
immediately and say:
"Spec file not found at .claude/specs/$ARGUMENTS.md.
Please check the spec name and try again."

## Pre-flight Check

Before invoking any subagents, collect the diff:
- Run `git diff` for unstaged changes
- Run `git diff --staged` for staged changes
- Combine both into a single diff

If both are empty, stop immediately and say:
"No changes detected. Implement the item before running
code review."

---

## Step 1: Parallel Review

Invoke both subagents simultaneously with the same context.

**nudge-security-reviewer** receives:
- The combined diff from the pre-flight check
- Spec file for context: `.claude/specs/$ARGUMENTS.md`
- Build plan for phase context: `.claude/plans/nudge-build-plan.md`
- Source directories to reference as needed:
  - `backend/src/`
  - `frontend/src/`
  - `shared/`
- Instruction: Review only the changed code for security
  concerns — secret handling, input validation at boundaries
  (Zod), prompt injection / tool-use hygiene, network &
  transport (CORS, TLS), and sensitive data exposure. Do not
  comment on code quality, style, or architecture.

**nudge-quality-reviewer** receives:
- The combined diff from the pre-flight check
- Spec file for context: `.claude/specs/$ARGUMENTS.md`
- Build plan for phase context: `.claude/plans/nudge-build-plan.md`
- Source directories to reference as needed:
  - `backend/src/`
  - `frontend/src/`
  - `shared/`
  - `tailwind.config.ts`
- Instruction: Review only the changed code for code
  placement, type quality, Express/Anthropic patterns,
  React/Tailwind patterns, and maintainability. Do not
  comment on security concerns.

Both subagents must run in parallel. Do not wait for one
to finish before starting the other.

---

## Step 2: Unified Report

Once both subagents have completed, combine their findings
into a single unified report. De-duplicate any overlapping
findings — if both agents flagged the same line for different
reasons, merge them into one finding with both perspectives
noted.

Structure the combined report as:

```
Code Review Report — $ARGUMENTS

Security Findings
[nudge-security-reviewer output]

Quality Findings
[nudge-quality-reviewer output]

Combined Action Plan
Ordered checklist of everything that needs to be fixed,
prioritized by severity:
1. [Critical/High security findings first]
2. [Quality CHANGES REQUESTED items second]
3. [Medium/Low security findings third]
4. [Quality APPROVED WITH SUGGESTIONS items last]

Overall Verdict
- APPROVED — ready to commit
- APPROVED WITH SUGGESTIONS — can commit, address
  suggestions in future items
- CHANGES REQUESTED — must fix before committing,
  see action plan above
```

---

## Step 3: Ask for Approval

After presenting the unified report, ask:

"Do you want me to implement the action plan now?"

Wait for explicit user confirmation before making any
changes. Do not touch any files until the user approves.

---

## Rules
- Do NOT edit any files before user approval
- Do NOT start one reviewer before the other — both must
  run in parallel
- Do NOT skip the pre-flight diff check
- Do NOT proceed if the spec file at
  `.claude/specs/$ARGUMENTS.md` does not exist — report it
  and stop
- If either subagent fails or returns no output, report it
  and do not present a partial review as complete
