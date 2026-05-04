---
# Spec — Item 03: Seed User Profile

**Phase**: A (Vertical slice) · **Status**: Draft, awaiting approval

## Goal

Land the `localStorage`-backed user profile that every later item reads from and writes to. The profile carries the seeded demo persona (Mumbai, non-veg) plus the slots that Phase B+C will fill (Q3 skip counter, order history, dietary defaults). Doing this in Phase A unblocks Item 04's `/api/recommend` request shape, Item 06's prompt builder (history summary + dietary signal), and Item 09's passive-context collector — all of which expect a profile object to be present from first load.

This item ships **data plumbing only**: a typed schema, read/write helpers, a seeded persona on first load, a "reset profile" dev affordance. No product screens. The existing health-check `App.tsx` is updated only enough to verify the profile loaded and to expose the reset action during development.

## Depends on

- Item 01 — Project Scaffolding (gives us `frontend/src/lib/`, `shared/types.ts`, the dev script).
- Item 02 — Minimal Design Tokens (so the dev-only reset affordance can use Tailwind utility classes from day one).

## Deliverables

- `shared/types.ts` extended with the `UserProfile` shape (and any nested types it needs — `PastOrder`, `DietaryPreference`, etc., per spec §7.4).
- `frontend/src/lib/profile.ts` — pure helpers:
  - `loadProfile()` — reads from `localStorage`, returns the parsed profile or `null` if missing/corrupt.
  - `saveProfile(p)` — writes a validated profile back.
  - `ensureProfile()` — called at app start: returns existing profile or seeds the Mumbai non-veg demo persona and returns it.
  - `resetProfile()` — clears the key and re-seeds.
  - A constant for the `localStorage` key (single source of truth — no string literals scattered across the app).
  - A constant `MUMBAI_NON_VEG_PERSONA: UserProfile` carrying the seeded values per spec §7.4.
- `frontend/src/App.tsx` updated minimally to:
  - Call `ensureProfile()` on mount.
  - Render a small dev-only line showing the loaded profile's display name / city so the dev can confirm seeding worked.
  - Expose a "Reset profile" button (Tailwind utilities only, 44px tap target) that calls `resetProfile()` and reloads.
- Zod schema for `UserProfile` so corrupt or stale-shape `localStorage` payloads are rejected by `loadProfile()` (returns `null` → triggers re-seed). Schema lives in `frontend/src/lib/profile.ts` for now; if a backend route ever needs to validate a profile sent from FE, it can be promoted to `shared/` later.

## File tree after this item ships

```
nudge/
├── shared/
│   └── types.ts                          # modified — add UserProfile + nested types
├── frontend/
│   ├── package.json                      # modified — add `zod` dependency
│   └── src/
│       ├── lib/
│       │   └── profile.ts                # new — schema, helpers, seed persona
│       └── App.tsx                       # modified — ensureProfile() on mount, dev reset button
```

## Tech choices (locked)

| Decision | Choice | Reason |
|---|---|---|
| Storage | `window.localStorage` | Per spec §7.4 — V1 has no auth, no server-side persistence. |
| Storage key | `nudge.profile.v1` | Versioned so a future shape change can bump to `v2` and ignore the old payload cleanly. |
| Validation | Zod (frontend-side) | Matches the project rule "Zod at every network/storage boundary." Catches shape drift between sessions when we extend the profile in later items. |
| Seeded persona | Mumbai, non-veg, no dietary restrictions | Per build-plan Item 03 wording. Concrete values come from spec §7.4. |
| Reset affordance | Visible button in `App.tsx` (dev-only stub UI) **plus** `window.__resetNudgeProfile` for console use | The button is enough for now. The window hook is a one-line convenience for repeated testing — drop it when Item 20 ships a real "Edit profile" UI. |
| Type location | `UserProfile` in `shared/types.ts`; Zod schema in `frontend/src/lib/profile.ts` | Type is cross-boundary (Item 04+ will read it from FE and send a derived payload to BE). The Zod schema only validates the FE-side `localStorage` payload, so it stays FE-local until a network boundary needs it. |

## Implementation notes

- **Re-read spec §7.4 before coding** — that section is the source of truth for the profile shape (fields, defaults, seeded persona values). Do **not** invent fields the spec doesn't list. If §7.4 is ambiguous on a field's type or default, capture it under Open questions rather than guessing.
- **`ensureProfile()` semantics**: on first run, write the seeded persona and return it. On subsequent runs, parse what's there; if Zod rejects it (corrupt JSON, missing field after a schema bump), fall back to seeding and overwrite. Never throw out of `ensureProfile()` — the app must always boot with a valid profile.
- **`saveProfile()` semantics**: validate with Zod before writing. If validation fails, throw a clear error (this would be a programmer bug, not a user-data bug).
- **Storage key versioning**: hardcode `nudge.profile.v1` in `profile.ts`. Future items that need to change the shape will bump the version; old keys are ignored, not migrated (V1 is personal-use, no migration cost).
- **No SSR concerns**: Vite + CSR only, but still wrap `localStorage` access in a `typeof window !== "undefined"` guard inside the helpers to keep the module importable from anywhere.
- **Don't read the profile during module load.** Helpers are pure functions; `App.tsx` calls `ensureProfile()` inside an effect (or top-level once, before render — implementer's call, but not at module scope).
- **`shared/types.ts` types are TS-only**, no runtime exports — the Zod schema lives FE-side and `z.infer`s the same shape. If the two ever drift, prefer making the Zod schema authoritative and `z.infer`ing the type into `shared/` later (deferred until a backend route actually validates a profile payload).
- **No new backend code, no new routes.** This item is FE-only data plumbing.
- **Dev-only UI is intentionally ugly.** It exists to verify wiring; Item 20 ("My Orders" tab + Edit profile) will own the real persona-swap UX.

## Rules for implementation

- TypeScript strict; no `any` unless justified inline.
- Zod for any shape that crosses a persistence or network boundary — `localStorage` counts.
- Reuse types from `shared/` rather than redefining FE/BE side.
- Tailwind utility classes only; no inline `style={{...}}` for color/spacing. Tokens come from `tailwind.config.ts`.
- Mobile web only, 390px design width, 44px minimum tap targets — applies to the reset button too.
- Backend secrets via `process.env` only (n/a this item, standing rule).
- Keep the seeded persona as a single named constant (`MUMBAI_NON_VEG_PERSONA`) so future items / tests can import it directly rather than re-creating literal objects.
- `localStorage` key lives in one named constant — do not re-string-literal it inside helpers or tests.

## Verification

- `npm run typecheck` passes across all workspaces.
- `npm run dev` boots both servers; `http://localhost:5173` still renders the health-check page without console errors.
- **First-load seed**: open the app in a fresh browser profile (or after `localStorage.clear()`); DevTools → Application → Local Storage shows key `nudge.profile.v1` populated with the Mumbai non-veg persona; the page renders the persona's display name / city.
- **Persistence**: reload the page — the profile is read from storage (not re-seeded), values unchanged.
- **Corrupt payload**: in DevTools, set `nudge.profile.v1` to a bogus string (e.g. `"not-json"`); reload — app boots cleanly, key is overwritten with the seeded persona.
- **Stale shape**: in DevTools, set `nudge.profile.v1` to a valid JSON object missing required fields; reload — Zod rejects, app re-seeds, no console error escapes to the user.
- **Reset button**: click it; `localStorage` key resets to the seeded persona, page reflects the reset.
- **Console reset**: call `window.__resetNudgeProfile()` from DevTools; same effect as the button.
- **No hardcoded hex** in `App.tsx` or `profile.ts` (`grep -r "#" frontend/src --include="*.tsx" --include="*.ts"` shows no raw color values outside `tailwind.config.ts`).

## Out of scope for this item

- A real "Edit profile" UI / persona swap screen — Item 20 (My Orders tab) owns it.
- Multiple seeded personas (veg-only, budget-conscious) — Item 20 introduces them; this item ships **one** persona.
- Server-side persistence, auth, or user accounts — out of scope for V1 entirely (`CLAUDE.md` standing rule).
- Wiring the profile into `/api/recommend` — Item 04 ships the endpoint shape; Item 06 wires profile fields into the prompt builder.
- Order-history mutation flows (recording new orders) — V1 reads seeded history only; live-order recording is not in the build plan.
- Migration logic for the storage key — versioning lets us walk away from old keys instead of migrating.

## Open questions

- Spec §7.4 — confirm the exact seeded persona values (display name, city coordinates, dietary flags, sample past orders, any defaults like preferred meal types). If §7.4 lists a *shape* but no concrete sample, agree on sample values during plan review and capture them inline in `MUMBAI_NON_VEG_PERSONA`.
- Should the Q3 skip counter (referenced in Item 11) live on the profile object now, or be added when Item 11 lands? Lean toward **add now** with `q3SkipCount: 0` so the schema is stable; confirm during plan review.
- Should `loadProfile()` distinguish "missing key" from "corrupt key" in its return value, or collapse both to `null`? Current spec: collapse to `null`. Flagging in case Item 06 wants telemetry on corruption rates later (not needed in V1).
---
