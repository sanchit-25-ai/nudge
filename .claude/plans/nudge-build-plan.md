# Nudge — Build Plan (Help Me Decide, V1)

## Context

Building **Nudge**, a mobile web app that adds a "Help Me Decide" smart food assistant on top of Swiggy's MCP. Spec is fully defined in `nudge_spec.docx` (v1.0). Goal of this plan: break the build into discrete, spec-driven work items so each can get its own focused implementation cycle.

The product is a 3-question adaptive flow → ranked 5-card dish output, powered by a Node/Express backend that calls the Anthropic API with the Swiggy MCP server attached. Frontend is React 18 + Vite + Tailwind, mobile web at 390px, Swiggy design language.

The plan is intentionally a **roadmap of items**, not an implementation. Each numbered item below is the unit we'll spec individually before coding. Development will span multiple sessions.

---

## Decisions locked in

- **Model**: `claude-sonnet-4-6` — strong tool-use and JSON adherence for the recommend endpoint at materially lower cost/latency than Opus 4.7 (revisited in Item 05; quality is more than sufficient for this prototype). Prompt caching is still mandatory — the static system prompt prefix (role + ranking algorithm + diversity rules + output schema) gets cached; only the per-request user-context block stays uncached.
- **Swiggy MCP**: real MCP from day one (`https://mcp.swiggy.com/food`), personal-use only. No public deployment until Builders Club access is approved.
- **Cadence**: vertical-slice first — get one end-to-end flow working before fanning out to the full feature set. De-risks the Anthropic + MCP + structured-output integration earliest.

---

## Repo layout

Single folder, two workspaces + shared types:

```
nudge/
├── frontend/              # Vite + React 18 + TS + Tailwind
├── backend/               # Node + Express + TS proxy
├── shared/                # TS types shared between FE/BE
├── package.json           # workspaces root
└── README.md
```

---

## Build order — vertical slice first, then expand

### Phase A — Vertical slice (E2E, one Q → one card)

**Goal**: prove the full pipeline works end-to-end with a single question and a single rendered dish card. De-risks the Anthropic + MCP + JSON-output integration before any UI investment.

1. **Project scaffolding** — workspaces root, `frontend/` (Vite + React + TS + Tailwind), `backend/` (Express + TS), `shared/` types, dev script that runs both, `.env.example` with `ANTHROPIC_API_KEY`.
2. **Minimal design tokens** — primary `#FC8019`, surfaces, text, font stack as Tailwind theme. Full §6.2 token set lands here so we don't revisit later.
3. **Seed user profile** — `localStorage` schema from spec §7.4. One seeded demo persona (Mumbai non-veg) + a "reset profile" dev affordance.
4. **`/api/recommend` skeleton** — Express endpoint, Zod request validation, structured logger, CORS for local FE, typed error envelope.
5. **Anthropic Sonnet + Swiggy MCP wiring** — single SDK call with `model: "claude-sonnet-4-6"`, `mcp_servers: [{ url: "https://mcp.swiggy.com/food", ... }]`, `betas: ["mcp-client-2025-04-04"]`, **prompt caching on the static system-prompt prefix**. Tool-use loop until model returns final JSON.
6. **System-prompt builder** — assembles role + cached static block (ranking algorithm §5, diversity rules, JSON output schema) + dynamic user-context block (time, location, history summary, Q answers).
7. **Response parser + validator** — Zod schema for the 5-card array (spec §7.3 output format), retry-once on malformed JSON, surface typed error to FE on second failure.
8. **Single-question screen** — Q1 (hunger level) only. Pill buttons, 44px tap, "Find my meal" CTA. Submit hits `/api/recommend` with passive context.
9. **Passive-context collector** — time of day, day of week, location (browser geolocation w/ Mumbai fallback), order-history summary. Bundled into recommend request.
10. **Single dish card render** — render *just card 1* of the response with full §6.4 anatomy (image, name, restaurant, rating dot, ETA, price). Tap → restaurant on Swiggy.

✅ **Slice exit criteria**: open app → answer Q1 → see one real Swiggy dish card returned via Opus + Swiggy MCP → tap → land on Swiggy.

### Phase B — Full question flow

11. **Q2 + Q3 implementation** — meal type (4 options), constraint chips (veg/fast/budget/high-rated). Adaptive: veg-pattern auto-selects Veg chip; Budget chip opens inline party-size prompt; Q3 collapses after 3 sessions of skips (skip-counter in localStorage).
12. **Three-dot progress + state machine** — Q1 → Q2 → Q3 → freetext → submit; back-navigation preserves answers.
13. **Freetext describe box** — pre-filled with deterministic NL summary of Q1–Q3 ("Something comforting and filling, under ₹300"); editable; passes through as primary intent override per spec §4.3.
14. **5-card render + entry animation** — render full 5-card list; bottom-sheet slide-up from `translateY(100%)`, 280ms ease-out per §6.5.
15. **Loading skeletons** — shimmer cards matching §6.5 spec while `/api/recommend` is in flight.

### Phase C — Result interactions

16. **Same dish elsewhere panel** — inline expand, list 2–3 alt restaurants from MCP, Pick swaps in-card via cross-fade. Current restaurant badged. Likely needs a second MCP query scoped to the dish name.
17. **Health nudge** — conditional render when card has `health_nudge: true`, light-green surface, 11px italic copy.
18. **Not quite refinement loop** — single follow-up question (heavy / cuisine / faster), max 2 iterations. After cap, surface `Browse freely` prominently. Each refinement = a new `/api/recommend` call carrying prior context.

### Phase D — App shell

19. **Bottom navigation** — 2 tabs: Help Me Decide (default), My Orders. Persistent across screens.
20. **My Orders tab** — past-order list from seeded localStorage; "Edit profile" affordance to swap demo personas (veg-only, budget-conscious) for testing different signal paths.
21. **Home entry point** — floating button + banner that launches the question flow. Always-visible `Browse freely` exit.

### Phase E — Polish & ship

22. **Error + empty states** — MCP failure copy, Anthropic timeout, geolocation denied fallback, "no dishes pass hard filters" empty state.
23. **Deploy** — frontend on Vercel, backend on Railway/Render, env wiring, README. Personal-use only until Builders Club access; no public link sharing.

---

## Critical files we'll create

- `backend/src/recommend.ts` — endpoint handler
- `backend/src/anthropic.ts` — Anthropic + MCP client wrapper, prompt-cache config
- `backend/src/prompt.ts` — system-prompt builder (static cached block + dynamic block)
- `backend/src/schema.ts` — Zod schemas (request, response, dish-card output)
- `frontend/src/screens/Questions.tsx` — Q1–Q3 + freetext flow
- `frontend/src/screens/Results.tsx` — 5-card output + refinement
- `frontend/src/components/DishCard.tsx` — card anatomy (§6.4)
- `frontend/src/lib/profile.ts` — localStorage user-profile read/write
- `frontend/src/lib/context.ts` — passive-context collector
- `shared/types.ts` — single source of truth for request/response shapes
- `tailwind.config.ts` — Swiggy design tokens (§6.2)

## Reusable utilities (write once, import everywhere)

- `buildIntentSummary(answers)` — used by both freetext pre-fill AND prompt builder
- `Dish` / `Restaurant` / `RecommendRequest` / `RecommendResponse` types in `shared/`

---

## Verification

Each phase has a concrete demo to run before moving on:

- **Phase A**: `npm run dev` → answer Q1 in browser → one real Swiggy dish card renders. `curl POST /api/recommend` with a fixture also returns valid JSON. Check Anthropic console: prompt-cache hit rate ≥80% on the second call.
- **Phase B**: Question flow navigates Q1→Q2→Q3→freetext→submit; freetext box auto-populates correctly across all answer combos; 5 cards render with bottom-sheet animation; profile persists across reload.
- **Phase C**: Same dish elsewhere swaps without flicker; health nudge appears on indulgent dishes; Not quite refines and caps at 2 loops then shows Browse freely.
- **Phase D**: Bottom nav holds across tabs; persona swap in My Orders changes recommendation defaults (veg persona → Veg chip pre-selected; budget persona → fewer high-priced cards).
- **Phase E**: Lighthouse mobile ≥90; viewport 390px clean; full flow under 4 min from open → restaurant page (success metric §9). Manual smoke test of error paths (kill MCP, deny geolocation).

---

## Session continuity

When picking up a future session:
1. Read this plan file first.
2. Check the working directory for what's already built (`ls frontend/ backend/`).
3. Identify the next un-shipped item from the phase list above.
4. Write a focused spec for **just that item** before coding.
5. Update this file's phase list with ✅ as items ship.
