---
description: Writes and runs Vitest tests for a specific Nudge build-plan item. Pass the spec name as argument e.g. /test-feature 05-anthropic-mcp-wiring
allowed-tools: Bash(npm:*), Bash(npx vitest:*)
---

Run the full testing pipeline for the build-plan item
specified in $ARGUMENTS.

If no argument is provided, stop immediately and say:
"Please provide a spec name. Usage: /test-feature
<spec-name> e.g. /test-feature 05-anthropic-mcp-wiring"

If `.claude/specs/$ARGUMENTS.md` does not exist, stop
immediately and say:
"Spec file not found at .claude/specs/$ARGUMENTS.md.
Please check the spec name and try again."

---

## Step 1: Write Tests

Invoke the **nudge-test-writer** subagent with the
following context:

- Spec file to base tests on:
  `.claude/specs/$ARGUMENTS.md`
- Build plan for phase context:
  `.claude/plans/nudge-build-plan.md`
- Source directories to read for module structure (NOT
  for test logic):
  - `backend/src/`
  - `frontend/src/`
  - `shared/`
- Output test file(s): colocated with the file under test
  inside the appropriate workspace, e.g.
  `backend/src/routes/recommend.test.ts`,
  `frontend/src/screens/Questions.test.tsx`,
  `shared/types.test.ts`.
- Instruction: Write tests based on what the spec says the
  item SHOULD do. Do NOT derive test logic from reading the
  implementation. Cover happy paths, edge cases, Zod
  schema validation at boundaries, error envelopes, and
  Anthropic/MCP wiring (mocked). If the workspace does not
  yet have Vitest wired up, add `vitest` (and any required
  testing-library / jsdom / supertest deps) to that
  workspace's `package.json`, plus a `"test": "vitest run"`
  script and a `vitest.config.ts` if needed.

Wait for nudge-test-writer to fully complete and confirm
the test file(s) have been written before proceeding to
Step 2.

---

## Step 2: Run Tests

Once nudge-test-writer has finished, invoke the
**nudge-test-runner** subagent with the following context:

- Test file(s) to execute (the exact paths the writer
  created)
- Spec file for context:
  `.claude/specs/$ARGUMENTS.md`
- Source directories to analyze against when diagnosing
  failures:
  - `backend/src/`
  - `frontend/src/`
  - `shared/`
- Run command: targeted via the workspace's `test` script,
  e.g.
  `npm --workspace backend run test -- src/routes/recommend.test.ts`
  or
  `npm --workspace frontend run test -- src/screens/Questions.test.tsx`
- Instruction: Run ONLY the specified test file(s). Do NOT
  run the full suite. Analyze any failures by
  cross-referencing the test code, the spec, and the source
  files. Classify each failure as a bug or a missing piece
  of the item.

---

## Handoff Rules

- Do NOT start Step 2 until Step 1 is fully complete
- Do NOT attempt to fix any code regardless of what the
  test results show
- Do NOT run any tests beyond the file(s) the writer
  produced for this item
- If nudge-test-writer reports it could not write the test
  file(s), stop and report the reason — do NOT proceed to
  Step 2

---

## Final Output

After both subagents complete, produce a combined summary:

### Testing Pipeline Report — $ARGUMENTS

**Step 1 — Tests Written**
- List each test written with a one-line description of
  which spec requirement (or build-plan item bullet) it
  validates, and the file path it lives in.

**Step 2 — Test Results**
- Mirror the nudge-test-runner's structured report.

**Verdict**
One of:
- ✅ Ready for code review — all tests pass
- ❌ Needs fixes — list the failing tests and their root
  causes
