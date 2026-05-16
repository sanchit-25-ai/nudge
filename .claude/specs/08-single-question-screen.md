---
# Spec — Item 08: Single-Question Screen

**Phase**: A (Vertical slice) · **Status**: Draft, awaiting approval

## Goal

Light up the FE half of Phase A's vertical slice. Today the only frontend surface is the dev health-check view in `App.tsx`. This item ships the **Q1 question screen** — three pill-button options for hunger level, a "Find my meal" CTA, and a submit handler that posts a valid `RecommendRequest` to `/api/recommend`. The backend (Items 04–07) already returns a real 5-dish response; Item 08 wires the FE to that contract end-to-end. Item 09 will replace the Item-08 stub passive-context with a real one (geolocation + history summary), and Item 10 will replace the Item-08 "received N dishes" placeholder with the actual single-card render. After Item 10 ships, the Phase A exit criteria are met: open app → answer Q1 → see one real Swiggy dish card.

This is the first item that actually paints product UI. The Tailwind tokens from Item 02 and the seeded `UserProfile` from Item 03 are both consumed for real for the first time.

## Depends on

- Item 02 — Minimal Design Tokens (`primary`, `surface.warm`, `text.primary`, `text.secondary`, `border`, `rounded-card`, `h-13` 52px CTA, font stack — all consumed via Tailwind utilities).
- Item 03 — Seed User Profile (`ensureProfile()` is the single source for `dietaryPattern`, `topCuisines`, `avgOrderValue`, `location`, `orderHistory` — Item 08 reads these to build the `profileSignal` and stub `passiveContext` blocks).
- Item 04 — `/api/recommend` Skeleton (`RecommendRequest` shape + Zod schema is the wire contract this item satisfies; the typed error envelope is what the FE renders on failure).
- Item 05 — Anthropic + Swiggy MCP Wiring (success path now returns model-derived dishes; this item exercises that path for the first time end-to-end).
- Item 07 — Response Parser + Validator (parse-retry already insulates the FE from one class of model misbehaviour — Item 08 doesn't need to special-case it).

Items 06 (system prompt) is implicitly depended-on by every recommend call but no FE-visible contract changes from it.

## Deliverables

- `frontend/src/screens/Questions.tsx` — **new**. The Q1 screen component:
  - Three pill buttons for hunger level (`light-snack` / `regular-meal` / `very-hungry`), labelled with human-readable copy from spec §4.2 ("Light snack" / "Regular meal" / "Very hungry" — confirm wording at implementation time).
  - Single-select: tapping a pill selects it; tapping another swaps the selection. Selected pill uses primary-orange fill + white text; unselected uses surface-warm fill + primary-text colour. 44px minimum tap targets.
  - "Find my meal" full-width CTA at the bottom, primary-orange background, 52px tall (`h-13` per Item 02 tokens). Disabled (greyed out, non-clickable) until a hunger level is selected.
  - Submit handler builds a `RecommendRequest`, calls the recommend API, and routes the screen into one of three view states: `loading`, `success`, `error`. Error state renders the typed-envelope `message` (no `code`, no `requestId` to the user) with a single "Try again" button.
  - The success state for Item 08 is a placeholder — `<p>Received N dishes.</p>` plus the dishes serialised in a `<pre>` for visual confirmation. Item 10 replaces this with the real card render.
  - Loading state shows a centred spinner (Tailwind-only, animated via the existing `animate-spin` utility — no new keyframes).
- `frontend/src/lib/recommend.ts` — **new**. Tiny API client:
  - `postRecommend(req: RecommendRequest): Promise<RecommendResponse>` — `fetch` POST to `/api/recommend`, JSON in/out.
  - On non-2xx, parses the error envelope and throws a typed `RecommendApiError` carrying `code`, `message`, and `requestId` (the FE renders `message`; `code` and `requestId` exist for future debug use).
  - On 2xx, validates the response shape with a thin Zod parse so a contract-drift bug surfaces here instead of crashing later renders.
- `frontend/src/lib/passiveContext.ts` — **new, intentionally minimal**. Builds the `PassiveContext` block from the loaded `UserProfile` and the current time:
  - `time = new Date().toISOString()`.
  - `location = profile.location` (Item 09 will replace this with browser geolocation + Mumbai fallback).
  - `historySummary = "Recent orders: <comma list of last 3 dishes>"` or `""` if `orderHistory` is empty (Item 09 will replace this with a richer derivation).
  - Item 09 owns the production version — Item 08 ships only the stub above so the request is well-formed.
- `frontend/src/lib/profileSignal.ts` — **new, intentionally minimal**. Single function `buildProfileSignal(profile)` that returns `{ dietaryPattern, topCuisines, avgOrderValue }` (literal pass-through of the three already-shaped fields). Lives as its own module so Item 11 / Item 18 can import it from a stable path when they start sending refinement requests; do **not** re-derive these inline in `Questions.tsx`.
- `frontend/src/App.tsx` — **modified**. Replace the dev health-check / persona-line / reset-button view with a small mobile-shell layout that mounts `<Questions />` as the default screen. Keep `ensureProfile()` on mount. Move the dev-only "Reset profile" affordance to a small fixed-position dev button in a corner (`import.meta.env.DEV`-gated) so persona swaps remain trivial during testing — once Item 20 ships the My Orders tab, that's where the real reset lives. The `/api/health` ping is removed from `App.tsx`; `/api/health` still exists server-side and stays available for `curl`.
- `frontend/src/lib/recommend.test.ts` setup notes — **none**. No tests in this item. Tests land via `/test-feature 08-single-question-screen`.
- New Zod schema for the response is **not** added to `frontend/src/lib/recommend.ts` from scratch — instead, mirror the existing `RecommendResponseSchema` shape with a tiny FE-side parse via `z.object({ requestId: z.string().uuid(), dishes: z.array(z.unknown()).length(5) }).safeParse(...)`. Goal is to confirm "we got something the right shape" before passing to render code; full per-field validation already happened on the BE. Avoid duplicating `DishSchema` on the FE — Item 10 may import a thin Zod for cards if it needs one, but Item 08 doesn't render cards.

That's the entire scope. No backend changes. No `shared/types.ts` changes (the wire contract was finalised in Item 04 and extended in Item 05; this item consumes it). No new dependencies.

## File tree after this item ships

```
nudge/
├── frontend/
│   └── src/
│       ├── App.tsx                         # modified — mounts <Questions />, dev reset button gated to DEV
│       ├── screens/
│       │   └── Questions.tsx               # new — Q1 pill buttons + Find my meal CTA + submit + view-state machine
│       └── lib/
│           ├── recommend.ts                # new — postRecommend() API client + RecommendApiError class
│           ├── passiveContext.ts           # new — buildPassiveContext(profile) stub (Item 09 replaces internals)
│           └── profileSignal.ts            # new — buildProfileSignal(profile) pass-through helper
```

## Tech choices (locked)

| Decision | Choice | Reason |
|---|---|---|
| **Routing** | None — single mounted screen, no router. App.tsx renders `<Questions />` directly; the Q1 → response transition is local component state. | V1 is a 3-question linear flow; introducing React Router for one screen is pure overhead. Item 12 lands a small state machine for Q1 → Q2 → Q3 → freetext → submit; that work owns any router-or-not call. Item 19 (bottom nav) is the next thing that might need a router and will revisit then. |
| **Component state** | Plain `useState` for selected hunger level + view state (`'idle' \| 'loading' \| 'success' \| 'error'`). One discriminated union covers loading/success/error payloads. | No reducer needed for one screen with two pieces of state. Item 12 will introduce a real state machine when the multi-question flow lands; not earlier. |
| **HTTP client** | `fetch` directly. No `axios`, no `react-query`, no SWR. | Vite proxies `/api` to `:3001` already (Item 01). The single endpoint this item touches doesn't justify a query-cache layer; refinement requests in Item 18 won't either (every refinement is a fresh POST with new context). If a future item needs caching/dedupe across multiple endpoints, revisit. |
| **Error rendering** | Render `error.message` from the envelope verbatim, plus a "Try again" button that resets the view state to `idle`. Do not surface `code` or `requestId` to the user. | The BE's error envelope (Item 04 + 05) already produces user-readable `message` strings. No envelope-message → user-copy mapping needed for V1. |
| **Loading affordance** | Centred 32px spinner using `animate-spin` (Tailwind built-in) on a circular border element. No skeleton — Item 15 owns the shimmer skeleton render that lands with the full 5-card list. | A spinner is enough for one card on slow MCP days. Item 15's skeleton replaces this affordance once full-list render exists. |
| **Pill button styling** | Selected: `bg-primary text-white border-primary`. Unselected: `bg-surface-warm text-text-primary border-border`. Both: `min-h-11 min-w-11 px-4 rounded-full font-medium`. | Uses the §6.2 token set Item 02 already shipped. `rounded-full` is the spec's pill shape; `surface.warm` is the chip-fill token. |
| **CTA styling** | Full width inside the screen container, `h-13` (52px from Item 02 tokens), `rounded-card`, `bg-primary text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed`. | `h-13` is the §6.3 CTA height token Item 02 added precisely for this button. |
| **Screen shell layout** | Mobile-first, `mx-auto max-w-[390px]` to enforce design width on desktop testing, `px-4 py-6 min-h-screen flex flex-col`. CTA pinned to the bottom of the visible area within the screen container (use `mt-auto` on the CTA wrapper). | 390px is the design width per CLAUDE.md. `max-w-[390px]` lets desktop browsers visualise the mobile layout; the existing tailwind config doesn't need a new token. |
| **Where the request body is built** | Inline in `Questions.tsx` submit handler: read profile via `ensureProfile()` (idempotent — already loaded by App.tsx, this is a cheap re-read), call `buildPassiveContext(profile)` and `buildProfileSignal(profile)`, assemble the `RecommendRequest`. | Keeps the helpers single-responsibility. The submit handler is the assembler; the helpers are the field producers. |
| **Submit-while-loading guard** | Disable the CTA while view state is `'loading'` (in addition to the no-selection case). Pressing Enter or double-tap mid-request is a no-op. | Personal-use prototype with no DB; double-submits cost API spend, not data integrity. Disabling the CTA is sufficient — no in-flight request token needed. |
| **`AbortController` for in-flight cancellation** | Out of scope for Item 08. The screen has no path that triggers a second request before the first resolves (no Q2 yet, no refinement). Item 12 / 18 revisit if they introduce one. | Adding it now is dead code. |
| **Recommend response parsing on the FE** | `z.object({ requestId: z.string().uuid(), dishes: z.array(z.unknown()).length(5) }).safeParse(...)` — shape-only, not field-level. | Full per-field validation already happens on the BE in `RecommendResponseSchema`. Re-validating field-by-field on the FE duplicates the schema and forces FE → BE coupling we don't need. The shape check catches "BE returned wrong envelope" bugs cheaply. Item 10 may add a per-card zod when it actually renders fields. |

## Implementation notes

- **Q1 option labels** — re-read `nudge_spec.docx` §4.2 for the exact human-readable text on each pill ("Light snack" / "Regular meal" / "Very hungry" is the working assumption from `shared/types.ts` enum naming, but the spec is authoritative). The enum codes (`light-snack | regular-meal | very-hungry`) in the request body must stay byte-for-byte identical to `RecommendAnswers.q1` in `shared/types.ts` — those are what `RecommendAnswersSchema` validates.
- **Question copy** — Q1's prompt is "How hungry are you?" per spec §4.2. Render it as a heading above the pill row (`text-xl font-semibold text-text-primary` or whatever §6.2 maps to a question heading; if §6.2 doesn't define one, use existing tokens and capture under Open questions).
- **Pill row layout** — three pills in a horizontal row on 390px width. Use `flex flex-wrap gap-2` so the row degrades cleanly if labels are long. `gap-2` (8px) keeps them visually grouped.
- **Active state visual feedback** — use Tailwind `aria-pressed:` or conditional class on the selected pill (no JS-driven inline styles). `aria-pressed={selected === 'light-snack'}` on the button is the accessibility hook.
- **No multi-select on Q1.** Q3 is the multi-select question (Item 11). Q1 is strictly single-select.
- **Submit handler shape**:
  ```ts
  async function onSubmit() {
    if (!hunger || view.state === 'loading') return;
    setView({ state: 'loading' });
    const profile = ensureProfile();
    const req: RecommendRequest = {
      answers: { q1: hunger },
      passiveContext: buildPassiveContext(profile),
      profileSignal: buildProfileSignal(profile),
    };
    try {
      const res = await postRecommend(req);
      setView({ state: 'success', dishes: res.dishes, requestId: res.requestId });
    } catch (err) {
      const message = err instanceof RecommendApiError ? err.message : 'Something went wrong.';
      setView({ state: 'error', message });
    }
  }
  ```
- **`postRecommend` shape**:
  ```ts
  export class RecommendApiError extends Error {
    constructor(public code: string, message: string, public requestId: string) {
      super(message);
      this.name = 'RecommendApiError';
    }
  }
  export async function postRecommend(req: RecommendRequest): Promise<RecommendResponse> {
    const r = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const json: unknown = await r.json().catch(() => null);
    if (!r.ok) {
      const env = json as RecommendError | null;
      const code = env?.error?.code ?? 'internal_error';
      const message = env?.error?.message ?? `Request failed (${r.status})`;
      const requestId = env?.error?.requestId ?? '';
      throw new RecommendApiError(code, message, requestId);
    }
    const parsed = ResponseShapeSchema.safeParse(json);
    if (!parsed.success) {
      throw new RecommendApiError('parse_error', 'Unexpected response shape from server.', '');
    }
    return json as RecommendResponse;
  }
  ```
  `ResponseShapeSchema` lives at the top of `recommend.ts` and is the shape-only check from the Tech choices table.
- **`buildPassiveContext` stub** — keep the function signature stable (`(profile: UserProfile) => PassiveContext`) so Item 09 can replace the internals without touching `Questions.tsx`. Today's body:
  ```ts
  export function buildPassiveContext(profile: UserProfile): PassiveContext {
    const recent = profile.orderHistory.slice(0, 3).map(o => o.dishName).join(', ');
    return {
      time: new Date().toISOString(),
      location: profile.location,
      historySummary: recent ? `Recent orders: ${recent}` : '',
    };
  }
  ```
  No browser geolocation in this item — Item 09 owns it. The Mumbai fallback already exists implicitly via the seeded persona's `profile.location`.
- **`historySummary` empty-string handling** — `PassiveContextSchema` (Item 04) validates `historySummary: z.string().max(2000)`; an empty string is valid. Don't omit the field; send `""` when no orders are available.
- **`buildProfileSignal` shape** — pure pass-through:
  ```ts
  export function buildProfileSignal(p: UserProfile): ProfileSignal {
    return { dietaryPattern: p.dietaryPattern, topCuisines: p.topCuisines, avgOrderValue: p.avgOrderValue };
  }
  ```
- **App.tsx mobile shell** — wrap `<Questions />` in the same `mx-auto max-w-[390px] min-h-screen` shell so the layout is consistent. Move the dev reset button to `fixed bottom-2 right-2` (or similar) and gate with `import.meta.env.DEV` so it never ships in a production build. Drop the `/api/health` `useEffect` — it served Item 01's verification only and is no longer needed; the endpoint stays available server-side.
- **Don't introduce a `<Pill>` component yet.** Items 11 and 18 also use pill-shaped buttons; the right time to factor a primitive is when at least two screens want it (Item 11). Inline the three buttons in `Questions.tsx` for now; refactor in Item 11.
- **Don't introduce a `<Button>` component for the CTA.** Same reasoning — Items 18 ("Browse freely") and 21 ("Find my meal" home entry) are the next callers; factor when the second one lands.
- **Accessibility basics** — pills are `<button type="button">` (not divs). The pill row has `role="radiogroup"` with `aria-label="Hunger level"`; each pill carries `aria-pressed`. The CTA is a `<button type="submit">` if wrapped in a `<form>` (recommended — gives free Enter-to-submit), otherwise `type="button"` with an explicit click handler. Form submission must `event.preventDefault()`.
- **No console.log in shipped code.** The submit handler should not log the request body or the response — Item 04's BE log line is the system-of-record. If a temporary `console.log` helped debug, remove before commit.
- **No analytics, no telemetry hooks.** V1 is personal-use; Item 22 / 23 own anything observability-shaped.

## Rules for implementation

- TypeScript strict; no `any` unless justified inline.
- Zod for any shape that crosses the network boundary — `recommend.ts` runs a shape-only Zod parse on the FE side. Don't re-implement field-by-field validation that already exists on the BE.
- Tailwind utility classes only; tokens come from `tailwind.config.ts` (no hardcoded hex anywhere — pill colours, CTA colours, border colours all come from §6.2 tokens added in Item 02).
- No inline `style={{...}}` for color/spacing. Layout primitives (`mx-auto`, `max-w-[390px]`) using Tailwind arbitrary-value utilities are fine; raw `style={{ color: '#FC8019' }}` is not.
- Mobile web only, 390px design width, 44px minimum tap targets — pill buttons and the CTA both must clear 44px tall.
- Reuse types from `shared/` (`RecommendRequest`, `RecommendResponse`, `RecommendError`, `HungerLevel`, `PassiveContext`, `ProfileSignal`, `UserProfile`); don't redefine FE-side.
- Backend secrets via `process.env` only (n/a — this item is FE only — standing rule).
- `ensureProfile()` is the only legitimate entry point to the profile from `Questions.tsx`. Don't read `localStorage` directly anywhere outside `frontend/src/lib/profile.ts`.
- The Q1 enum codes sent over the wire (`light-snack | regular-meal | very-hungry`) must match `shared/types.ts` `HungerLevel` byte-for-byte. The human labels rendered in the UI are spec §4.2 copy — different surface, different source, do not collapse.
- No new npm dependencies.
- No tests in this item. Tests are written via `/test-feature 08-single-question-screen` after implementation.
- No new shared types. The wire contract is locked.
- Don't introduce shared `<Pill>` / `<Button>` primitives in this item — Item 11 is the right time (see Implementation notes).

## Verification

- `npm run typecheck` passes across all workspaces.
- `npm run dev` boots both servers without errors. `http://localhost:5173` loads with no console errors.
- **First-load UX (390×844 viewport)** — open DevTools mobile view, set viewport to 390×844. The page renders the Q1 question heading, three pills, and a disabled "Find my meal" CTA. No layout shift, no horizontal scroll, no console warnings. The dev-only "Reset profile" button appears in a corner (DEV build only — confirm by inspecting the rendered DOM).
- **Pill selection** — tap "Light snack". The pill fills primary-orange, the others remain surface-warm. Tap "Very hungry"; the selection swaps. The CTA enables (no longer greyed) the moment a selection exists. Each pill's hit area measures ≥44×44 px (DevTools → Inspect → check the rendered box).
- **Submit + success** — with `ANTHROPIC_API_KEY` set on the backend, select any hunger level and tap "Find my meal". The CTA disables; a centred spinner appears. Within ~5–10s, the spinner is replaced by `Received 5 dishes.` plus the JSON-serialised dishes in a `<pre>` block. Network tab shows one `POST /api/recommend` returning `200` with the validated 5-dish envelope.
- **Submit + error (BE down)** — kill the backend (`Ctrl+C` the dev server's BE process; FE keeps running). Tap "Find my meal". The error view renders a non-empty message string (likely `Request failed (502)` or a network-error message) and a "Try again" button. Tap "Try again"; the screen returns to `idle` with the previous selection still highlighted.
- **Submit + error (validation fail)** — temporarily edit `Questions.tsx` to send `q1: 'broken' as any` (or omit `q1` entirely). Reload, submit. Backend returns `400` with `code: 'validation_error'`; FE renders the envelope `message`. **Revert before commit.**
- **Submit + error (real model error path)** — temporarily unset `ANTHROPIC_API_KEY` on the backend, restart, reload, submit. Backend returns `500` with `code: 'internal_error'`; FE renders the envelope `message`. Restore the env var before commit.
- **Submit-while-loading guard** — open DevTools, throttle the network to "Slow 3G". Submit. While the spinner is visible, attempt to click the now-disabled CTA repeatedly; only one network request appears in the Network tab.
- **Request body shape check** — in Network tab → request payload. Inspect: `answers.q1` is one of the three enum codes; `passiveContext.time` is a valid ISO string; `passiveContext.location` matches the seeded persona's location (Mumbai); `passiveContext.historySummary` is a non-empty string starting with `"Recent orders: "`; `profileSignal.{dietaryPattern, topCuisines, avgOrderValue}` matches the seeded persona. No extra fields, no `userId`, no `orderHistory` array sent over the wire.
- **`/api/health` still works** — `curl http://localhost:3001/api/health` returns `{"status":"ok"}` (verifying we didn't break BE during FE work).
- **No hardcoded hex** — `grep -r "#" frontend/src --include="*.tsx" --include="*.ts" | grep -v tailwind.config.ts | grep -v profile.ts` shows no raw color values introduced by this item.
- **Reset profile (dev affordance)** — clicking the dev-only reset button still re-seeds the Mumbai persona and reloads the page (Item 03's behaviour preserved through the App.tsx refactor).

## Out of scope for this item

- Q2 (meal type) and Q3 (constraint chips) — Item 11.
- Three-dot progress indicator and the multi-question state machine — Item 12.
- Freetext describe box (NL summary pre-fill + edit) — Item 13.
- 5-card render and bottom-sheet entry animation — Item 14.
- Loading skeletons (shimmer) — Item 15. (Item 08 ships a centred spinner; Item 15 replaces it.)
- Real passive context (browser geolocation w/ Mumbai fallback, real history-summary derivation) — Item 09. (Item 08 ships a stub `buildPassiveContext` that uses profile data only.)
- Single dish card render — Item 10. (Item 08 ships `Received N dishes.` + a `<pre>` JSON dump as the success state; Item 10 replaces it with §6.4 anatomy.)
- Refinement loop ("Not quite", "Same dish elsewhere", "Health nudge") — Items 16–18.
- Bottom navigation, My Orders tab, home entry point — Items 19–21.
- Empty / error states beyond a generic `error.message` render — Item 22 owns the polished MCP-failure / Anthropic-timeout / geolocation-denied copy.
- Tests — written and run via `/test-feature 08-single-question-screen` after implementation.
- Security / quality review — run via `/code-review-feature 08-single-question-screen` after implementation.
- A shared `<Pill>` or `<Button>` primitive — defer to Item 11 when the second pill caller lands.
- An `AbortController` on in-flight requests — defer until a screen actually needs to cancel a request mid-flight (Item 12 / 18).

## Open questions

- **Q1 prompt copy** — confirm at implementation time that spec §4.2 phrases the question as "How hungry are you?" and the pill labels as "Light snack" / "Regular meal" / "Very hungry". If §4.2 uses different wording, use the spec's wording verbatim in the UI; the enum codes do not change either way.
- **Question heading typography** — Item 02's design tokens don't define a dedicated "question heading" size. Working default: `text-xl font-semibold text-text-primary`. If §6.2 names a heading size that should be added to `tailwind.config.ts`, do that as a one-liner during plan review rather than spreading arbitrary sizes through screens.
- **Disabled-CTA visual** — `disabled:opacity-50 disabled:cursor-not-allowed` is the working choice. If §6.2 / §6.3 specifies a distinct disabled colour token, use that instead. Confirm during plan review.
- **App.tsx dev reset button placement** — `fixed bottom-2 right-2` is the working choice. If it visually competes with future floating elements (Item 21's home-entry FAB), Item 21 will move it. For now keep it small and out of the layout flow.
- **Passive context for empty `orderHistory`** — the seeded Mumbai persona has 3 orders, so this path isn't exercised in the default flow. Sending `historySummary: ""` is valid per the schema (`z.string().max(2000)`). Capture so Item 09 doesn't accidentally drop the field when it adds the richer derivation.
---
