---
description: Create a spec file and feature branch for the next Nudge build-plan item
argument-hint: "Item number and feature name e.g. 5 anthropic mcp wiring"
allowed-tools: Read, Write, Glob, Bash(git:*)
---

You are a senior developer spinning up the next item from the
Nudge build plan. Nudge is a TypeScript monorepo (Vite + React +
Tailwind frontend, Express + TS backend, shared types) building a
"Help Me Decide" food assistant on top of Swiggy's MCP. The
authoritative roadmap lives in `.claude/plans/nudge-build-plan.md`
and the product spec is `nudge_spec.docx`.

User input: $ARGUMENTS

## Step 1 — Check working directory is clean
Run `git status` and check for uncommitted, unstaged, or
untracked files. If any exist, stop immediately and tell
the user to commit or stash changes before proceeding.
DO NOT CONTINUE until the working directory is clean.

## Step 2 — Parse the arguments
From $ARGUMENTS extract:

1. `item_number` — zero-padded to 2 digits: 2 → 02, 11 → 11.
   Must match a numbered item in `.claude/plans/nudge-build-plan.md`
   (Items 1–23 across Phases A–E).

2. `feature_title` — human-readable Title Case title that matches
   or shortens the build-plan item heading.
   - Example: "Anthropic Opus + Swiggy MCP Wiring" or "Single Dish Card Render"

3. `feature_slug` — git and file safe slug
   - Lowercase, kebab-case
   - Only a-z, 0-9 and -
   - Maximum 40 characters
   - Example: `anthropic-mcp-wiring`, `single-dish-card`

4. `branch_name` — format: `feature/<item_number>-<feature_slug>`
   - Example: `feature/05-anthropic-mcp-wiring`

If you cannot infer these from $ARGUMENTS, ask the user
to clarify before proceeding.

## Step 3 — Check branch name is not taken
Run `git branch --list 'feature/*'` to list existing feature branches.
If `branch_name` is already taken, append a suffix:
`feature/05-anthropic-mcp-wiring-01`, `-02` etc.

## Step 4 — Switch to main and pull latest
Run:
```
git checkout main
git pull origin main
```
If there is no `origin` remote yet (early in the project), skip
the `pull` and warn the user, but still continue.

## Step 5 — Create and switch to the feature branch
Run:
```
git checkout -b <branch_name>
```

## Step 6 — Research the codebase
Read these files before writing the spec:
- `.claude/plans/nudge-build-plan.md` — find the numbered item,
  its phase, dependencies, and any locked decisions
- `README.md` — current scripts and structure
- Every file already in `.claude/specs/` — avoid duplicating
  scope and check what previous items have already shipped
- Anything under `frontend/src/`, `backend/src/`, `shared/` that
  the new item is likely to touch (use Glob if unsure)
- `tsconfig.base.json`, root `package.json`, and the workspace
  `package.json` files when the item adds dependencies or scripts

If the item references the product spec (e.g. "§6.4 card anatomy",
"§7.3 output format"), surface those section numbers in the spec
so the implementer knows which part of `nudge_spec.docx` to
re-read — do NOT try to parse the .docx directly.

Confirm the requested item is not already marked ✅ in
`.claude/plans/nudge-build-plan.md`. If it is, warn the user and stop.

## Step 7 — Write the spec
Match the structure of `.claude/specs/01-project-scaffolding.md`.
Use this template:

---
# Spec — Item <item_number>: <feature_title>

**Phase**: <A | B | C | D | E> (<phase name>) · **Status**: Draft, awaiting approval

## Goal
One short paragraph: what ships in this item and why it exists at
this point in the build order. Tie back to the phase's exit criteria.

## Depends on
List the previous build-plan items this requires (by number and
title). If the item is foundational, state "None — foundational item".

## Deliverables
A bulleted list of concrete, demoable outputs (endpoints, screens,
modules, configs). Each bullet should be something a reviewer can
literally see or run.

## File tree after this item ships
A fenced tree showing only the files added or modified by this item
(do not re-list the whole repo). Mark new files with `# new` and
modified files with `# modified`.

## Tech choices (locked)
A small markdown table of any non-obvious decisions for this item
(library picks, model IDs, env vars, schema choices). Skip the table
if the item has no new choices.

## Implementation notes
Bullets covering anything tricky the implementer needs to get right:
- Backend: endpoint shape, Zod schemas, error envelope, logging.
- Anthropic / MCP: model is `claude-opus-4-7`, MCP server URL
  `https://mcp.swiggy.com/food`, beta header `mcp-client-2025-04-04`,
  prompt caching on the static system-prompt prefix.
- Frontend: viewport 390px, Tailwind tokens from §6.2, 44px tap
  targets, animations per §6.5, all screens mobile web only.
- Shared: any new types added to `shared/types.ts`.

Skip subsections that don't apply.

## Rules for implementation
Always include:
- TypeScript strict; no `any` unless justified inline
- Zod for every request/response shape that crosses the network
- Parameterised everything — no string-built queries or URLs
- Tailwind utility classes only; tokens come from `tailwind.config.ts`
  (no hardcoded hex once Item 2 ships)
- Mobile web only, 390px design width, 44px minimum tap targets
- Backend secrets via `process.env` only; never check in `.env`
- Prompt caching is mandatory on any new Anthropic call path
- No ORMs — backend is a thin proxy, no DB layer in V1
- Reuse types from `shared/` rather than redefining FE/BE side

Add item-specific rules below the standard list when needed.

## Verification
A specific, testable checklist. Each item must be runnable:
- `npm run typecheck` passes
- `npm run dev` boots both servers
- Manual browser steps to demo the new behavior
- `curl` examples for any new endpoint, with expected JSON
- Anthropic console / cache-hit checks where the item touches
  the model call path

## Out of scope for this item
Bullets naming things this item explicitly does NOT do, with the
build-plan item number that owns them. Keeps scope honest.

## Open questions
Any ambiguity that needs the user's call before implementation.
Leave empty if there are none.
---

## Step 8 — Save the spec
Save to: `.claude/specs/<item_number>-<feature_slug>.md`

## Step 9 — Report to the user
Print a short summary in this exact format:
```
Branch:    <branch_name>
Spec file: .claude/specs/<item_number>-<feature_slug>.md
Title:     <feature_title>
Phase:     <A | B | C | D | E>
```

Then tell the user:
"Review the spec at `.claude/specs/<item_number>-<feature_slug>.md`
then enter Plan Mode with Shift+Tab twice. Plan should cover
**implementation only** — file changes, function shapes, data flow,
and the spec's manual Verification path. Do NOT plan to write tests
or run security review; those run via `/test-feature
<item_number>-<feature_slug>` and `/code-review-feature
<item_number>-<feature_slug>` after implementation. See CLAUDE.md
'Default feature workflow' for the full sequence."

Do not print the full spec in chat unless explicitly asked.
