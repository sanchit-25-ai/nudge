# Nudge — Project Conventions

A "Help Me Decide" food assistant on Swiggy's MCP. Personal-use prototype. Product spec: `nudge_spec.docx`. Roadmap: `.claude/plans/nudge-build-plan.md`. Per-item specs: `.claude/specs/`.

---

## Default feature workflow

This is the default sequence for shipping a build-plan item. Sanchit may deviate occasionally — when he does, follow his lead. Otherwise default to this flow.

1. **`/create-spec <NN> <feature name>`** — creates `.claude/specs/<NN>-<slug>.md` and a `feature/<NN>-<slug>` branch off `main`. Spec must be reviewed and approved before any code is written.
2. **Enter Plan Mode** (Shift+Tab twice) — produce an implementation plan grounded in the approved spec.
3. **Implement** — exit Plan Mode, write the code.
4. **`/test-feature <NN>-<slug>`** — runs `nudge-test-writer` then `nudge-test-runner`. This is the **only** path for adding tests in this project.
5. **`/code-review-feature <NN>-<slug>`** — runs `nudge-security-reviewer` and `nudge-quality-reviewer` in parallel.
6. Address findings → commit → open PR (or merge to main locally for personal-use cadence).

### Plan Mode scope (avoid double effort)

Plans must cover **implementation only**:

- Files to create / modify
- Function and component shapes
- Data flow and types
- The spec's manual **Verification** checklist (the "open the app and see it work" demo path)

Plans must **NOT** include:

- "Write unit/integration tests" — that's `/test-feature`
- "Run security review" / "Check Zod boundaries for vulnerabilities" — that's `/code-review-feature`
- "Add Vitest" — `/test-feature`'s writer agent will wire it up the first time it's needed

If a plan starts to drift into testing or review territory, trim it. Tests and reviews are commands, not plan items.

### Nudge rule

If Sanchit appears to skip a step in the default flow — e.g. implementing without a spec at `.claude/specs/<NN>-<slug>.md`, or asking to commit before tests have run, or planning without first running `/create-spec` — mention it **once**, name the command that fills the gap, and proceed with what he asked for. Do not insist or repeat. The workflow is a default, not a gate.

---

## Stack quick facts

- **Monorepo**: npm workspaces — `frontend/` (Vite + React 18 + TS + Tailwind), `backend/` (Express + TS, run via `tsx`), `shared/` (TS types)
- **Validation**: Zod at every network boundary (request body, model JSON output, model tool results)
- **Shared types**: live in `shared/types.ts` — single source of truth for FE/BE; reuse `z.infer<typeof Schema>` over re-typed shapes
- **No DB in V1**: backend is a thin proxy. No ORM, no SQL, no migrations.
- **No auth, no users**: single seeded persona in `localStorage`
- **Ports**: frontend `:5173`, backend `:3001`
- **Secrets**: `process.env.ANTHROPIC_API_KEY` only. Never log it, never echo in responses, never thread into FE / `shared/` types.

## Anthropic + Swiggy MCP (locked decisions)

- **Model**: `claude-sonnet-4-6` (revisited in Item 05 — Sonnet handles ranking + MCP tool-use well; materially lower cost and latency than Opus 4.7 with no quality loss for this task)
- **MCP server**: `https://mcp.swiggy.com/food`
- **Beta header**: `mcp-client-2025-04-04`
- **Prompt caching is mandatory** — the static system-prompt prefix (role + ranking algorithm + diversity rules + output schema) carries `cache_control: { type: 'ephemeral' }`. Only the per-request user-context block stays uncached.
- All Anthropic SDK calls live in **one** module: `backend/src/anthropic.ts`. Routes don't construct SDK clients themselves.
- Tool-use loop must be **bounded** (max iterations) so a runaway model can't drain the API budget.

## Frontend conventions

- **Mobile only**: 390px design width. Test at 390×844.
- **Tap targets**: 44px minimum.
- **Tailwind utilities only** — no inline `style={{...}}` for color/spacing once the token set lands (Item 2). Tokens live in `tailwind.config.ts` per spec §6.2.
- **Animations** follow spec §6.5 (e.g. bottom-sheet slide-up 280ms ease-out). Built with Tailwind utilities or small CSS helpers — no heavy animation libraries.

## Testing

- **Runner**: Vitest, per workspace. Backend uses `supertest`; frontend uses `@testing-library/react` + `jsdom`.
- **Test files**: colocated with the file under test (`*.test.ts` / `*.test.tsx`).
- **Tests must mock the Anthropic SDK and the MCP boundary** — no real network calls in tests.
- Tests are written from the spec, not by reading the implementation. `nudge-test-writer` enforces this.

## What lives where

- `backend/src/routes/*.ts` — HTTP handlers (thin: validate → call service → return)
- `backend/src/anthropic.ts` — Anthropic + MCP client wrapper
- `backend/src/prompt.ts` — system-prompt builder (static cached block + dynamic block)
- `backend/src/schema.ts` — Zod request/response schemas
- `frontend/src/screens/*.tsx` — top-level screens (Questions, Results, Orders)
- `frontend/src/components/*.tsx` — leaf components
- `frontend/src/lib/*.ts` — browser helpers (profile, geolocation, passive context)
- `shared/types.ts` — cross-boundary types
- `tailwind.config.ts` — design tokens (spec §6.2)

## Out of scope until further notice

- Public deployment / shareable links — gated on Swiggy Builders Club approval (spec §7.5)
- Authentication, user accounts, server-side persistence
- Any database layer
- CSRF protection, rate limiting (no auth → not meaningful in V1)
- Server-side rendering, edge runtimes
