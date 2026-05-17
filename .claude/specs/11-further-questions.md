---
# Spec — Item 11: Q2 + Q3 Implementation (Further Questions)

**Phase**: B (Full question flow) · **Status**: Draft, awaiting approval

## Goal

Phase A ships a one-question vertical slice: Q1 (hunger) → submit → one real Swiggy dish card. Item 11 opens Phase B by lighting up the **other two questions** the spec calls for: **Q2 — meal type** (4 options, single-select) and **Q3 — constraint chips** (multi-select with adaptive rules from §4.2). Both already exist as optional fields in `RecommendAnswers` / `RecommendRequestSchema` (Item 04 reserved them); this item makes them user-visible and wires them onto the wire for the first time.

This item also implements three of the spec's adaptive behaviours that hang off Q3:
1. **Veg auto-select** — when `profile.dietaryPattern === 'veg'`, the `veg-only` chip is pre-selected on first paint of Q3 (still user-deselectable).
2. **Budget → party-size prompt** — selecting the `budget` chip reveals an inline numeric stepper for party size; deselecting hides it. Party size goes on the wire as a new optional field on `RecommendAnswers`.
3. **Q3 skip-collapse** — three "skip" submits in a row (no Q3 chips selected on submit) hide the Q3 section entirely on subsequent renders, using the `q3SkipCount` field Item 03 already added to `UserProfile`.

What this item **does not** do is just as important: it does not add the multi-screen state machine, three-dot progress indicator, or back navigation — those are Item 12. Q1 / Q2 / Q3 in Item 11 live on a **single vertically-scrolling screen**, each section stacked below the previous, with one shared `Find my meal` CTA at the bottom. Item 12 will split this into per-step screens (and own any "edit Q1 from Q3" affordance). The freetext describe box is Item 13. Loading skeletons are Item 15.

Item 11 is also the first item with **two** screens worth of pill-shaped buttons (Q1 + Q2) and a chip group (Q3) sharing the same visual primitive. Item 08 deferred the `<Pill>` factoring until "the second caller lands" — this is that moment. Q1, Q2, and Q3 all consume one shared `<Pill>` component; the only behavioural difference between Q1/Q2 (single-select) and Q3 (multi-select) is the parent's selection logic.

## Depends on

- Item 02 — Minimal Design Tokens (`primary`, `surface.warm`, `text.primary`, `text.secondary`, `border`, `rounded-card`, `h-13` — all consumed by the pills, chips, and CTA).
- Item 03 — Seed User Profile (`q3SkipCount` field on `UserProfile` is the skip-counter; `dietaryPattern` drives the veg auto-select; `saveProfile()` is how the skip counter persists). The Mumbai non-veg persona has `q3SkipCount: 0` at seed time, so the skip-collapse path is exercisable from a fresh `localStorage`.
- Item 04 — `/api/recommend` Skeleton (`RecommendAnswersSchema` already validates `q2`, `q3`, and we'll extend it for `partySize`; the typed error envelope handles validation failures end-to-end).
- Item 05 — Anthropic + Swiggy MCP Wiring (the request now carries Q2 + Q3 + party size, all of which flow into the dynamic context block in Item 06's prompt builder via Item 05's call path).
- Item 06 — System-Prompt Builder (Q2 / Q3 / partySize were already projected into the dynamic block at Item 06 time — verify at implementation that they're actually being formatted into the prompt; if not, the fix lives in `backend/src/prompt.ts` as part of this item).
- Item 08 — Single-Question Screen (`Questions.tsx`, `recommend.ts`, `passiveContext.ts`, `profileSignal.ts` are the existing surfaces this item extends — no new screens, no new lib modules unless absolutely required).
- Item 10 — Single Dish Card Render (the success state still renders `<DishCard dish={view.dishes[0]} />` — no change to result rendering in this item).

Items 07 and 09 are implicit upstreams (response parser + passive context) — Item 11 doesn't change either.

## Deliverables

- `frontend/src/components/Pill.tsx` — **new**. Tiny shared primitive used by Q1, Q2, and Q3:
  - Props: `{ selected: boolean; onClick: () => void; children: ReactNode; role?: 'radio' | 'checkbox'; ariaChecked?: boolean; tabIndex?: number; refCallback?: (el: HTMLButtonElement | null) => void }`.
  - Renders a `<button type="button">` with the existing pill class logic from `Questions.tsx` (`min-h-11 min-w-11 px-4 rounded-full font-medium border transition-colors` + selected/unselected colour swap).
  - No internal state — fully prop-driven. The parent owns selection and key-handling.
  - Default `role` is `radio`; Q3's caller passes `'checkbox'`.

- `frontend/src/screens/Questions.tsx` — **modified**. The whole screen is re-shaped from "Q1 + maybe-results" into "Q1 + Q2 + Q3 + maybe-results", but it stays a single component, single file, single screen:
  - **Q1 section** — unchanged structure; switched to using `<Pill>` instead of the inline `pillClass` helper. Arrow-key + selection logic stays inside `Questions.tsx`.
  - **Q2 section** — new heading "What kind of meal?" (confirm wording at implementation against §4.2), `<Pill>` row of 4 options: `comfort-favourite`, `healthy`, `indulgent`, `surprise-me`. Single-select via `useState<MealType | null>`. Same arrow-key radio pattern as Q1.
  - **Q3 section** — new heading "Any constraints?" (confirm against §4.2), `<Pill role="checkbox">` row of 4 options: `veg-only`, `fast-delivery`, `budget`, `high-rated`. **Multi-select** via `useState<Set<Q3Constraint>>` (or sorted array — see Tech choices). Each pill is independently toggleable. **Conditionally hidden** when `profile.q3SkipCount >= 3`.
  - **Adaptive Q3 pre-selection** — on first mount, if `profile.dietaryPattern === 'veg'` AND Q3 is being rendered (skip count < 3), the initial Q3 state contains `veg-only`. Subsequent user toggles are honoured — no re-application on every render.
  - **Inline party-size stepper** — when Q3 selections include `budget`, render a compact `+/-` stepper labelled "How many people?" between the chip row and the CTA. Uses two `<button>`s (each ≥44×44 px) wrapping a numeric display, plus a hidden numeric value in state. Default to `2`. Min `1`, max `10`. When `budget` is deselected, hide the stepper and reset state to `2` (so re-selecting `budget` is a clean restart, not a sticky old value).
  - **Submit handler** — builds `RecommendRequest` with `q1`, `q2` (only if set), `q3` (only if non-empty array), `partySize` (only if q3 contains `budget`). Same `loading | success | error` view-state machine as Item 08. **Skip-count update** runs after the request resolves (success or error) on the same code path: if the submitted body had no `q3` field (i.e., chip set was empty AND Q3 was actually rendered), increment `profile.q3SkipCount` via `saveProfile`. The increment is independent of HTTP success — if the user attempted to submit, that's an intent.
  - **Reset on "Try again"** — current behaviour resets view state to `idle`; selections are preserved (Q1, Q2, Q3, party size all kept) so the user can adjust without re-entering everything. Already implicit because state lives in `Questions.tsx` and `setView({ state: 'idle' })` doesn't touch it.

- `shared/types.ts` — **modified**. Extend `RecommendAnswers`:
  ```ts
  export type RecommendAnswers = {
    q1: HungerLevel;
    q2?: MealType;
    q3?: Q3Constraint[];
    partySize?: number;   // new — meaningful only when q3 contains 'budget'
    freetext?: string;
  };
  ```
  No other shared types change. The `MealType` and `Q3Constraint` enums Item 04 already defined are correct.

- `backend/src/schema.ts` — **modified**. Extend `RecommendAnswersSchema`:
  ```ts
  partySize: z.number().int().min(1).max(10).optional(),
  ```
  Insert in the same object literal as `q1` / `q2` / `q3` / `freetext`. No other schema change. `RecommendRequestSchema` automatically composes.

- `backend/src/prompt.ts` — **possibly modified, only if needed**. Open the file at implementation; if Item 06's dynamic-context block already formats `q2` / `q3` (Item 06's spec called for it), additionally surface `partySize` when present. If `q2` / `q3` are not yet projected (Item 06 may have only laid the scaffolding for q1), add a small subsection of the dynamic block that renders any of the four optional fields when present. Either way the change is **read fields off `RecommendRequest.answers`, format into the prompt** — no new SDK calls, no new caching. Strictly additive.

- `frontend/src/screens/Questions.tsx` — `pillClass` helper deleted (moved into `Pill.tsx`). The `ARROW_KEYS` set and arrow-key handler stay (the radio pattern still lives in the parent because it co-ordinates which pill is focused next).

That's the full scope. No new `lib/` modules. No new dependencies. No DB. No new env vars. No new error codes. No changes to `recommend.ts`, `profile.ts`, `passiveContext.ts`, `profileSignal.ts`, `App.tsx`, or `DishCard.tsx`.

## File tree after this item ships

```
nudge/
├── shared/
│   └── types.ts                              # modified — RecommendAnswers gets optional partySize
├── backend/
│   └── src/
│       ├── schema.ts                         # modified — RecommendAnswersSchema gets partySize: z.number().int().min(1).max(10).optional()
│       └── prompt.ts                         # modified IF needed — surface q2/q3/partySize in the dynamic context block
└── frontend/
    └── src/
        ├── components/
        │   └── Pill.tsx                      # new — shared selected/unselected pill primitive used by Q1, Q2, Q3
        └── screens/
            └── Questions.tsx                 # modified — Q2 + Q3 sections, adaptive rules, skip-collapse, party-size stepper, uses <Pill>
```

## Tech choices (locked)

| Decision | Choice | Reason |
|---|---|---|
| **Layout — single screen vs steps** | Single vertically-stacked screen. Q1, Q2, Q3 all visible at once; one `Find my meal` CTA at the bottom. | Item 12 owns the state machine and three-dot progress. Building per-step screens twice (once now, once in Item 12) is wasted work; the linear-scroll layout is easy to demo and easy to throw away when Item 12 lands. The 390px height isn't a problem because the page scrolls — Swiggy's app already does this on the food-search screen. |
| **`<Pill>` factoring** | One shared primitive in `frontend/src/components/Pill.tsx`. Q1, Q2 use `role="radio"`; Q3 uses `role="checkbox"`. Visuals identical. | Item 08 deferred this until the second caller landed; Item 11 has three callers. Single primitive keeps the visual spec in one place when Item 02's tokens evolve. |
| **Where pill selection logic lives** | In `Questions.tsx`, not inside `<Pill>`. The pill is dumb. | Q1 + Q2 are single-select; Q3 is multi-select; the keyboard radio pattern needs `pillRefs` arrays per question. Putting selection inside the primitive would force three flavours of `<Pill>` (single, multi, no-keyboard) — the parent owns it cleanly. |
| **Q3 state shape** | `useState<Q3Constraint[]>([])` — sorted-on-insert array, not `Set`. Comparison uses the same array reference each render. | The wire contract is `Q3Constraint[]`; converting to/from `Set` every render is more code than it saves. Toggle is `prev.includes(x) ? prev.filter(...) : [...prev, x]`. React renders well with arrays. |
| **Q3 default selection (veg auto)** | On first paint, if `profile.dietaryPattern === 'veg'` AND skip count < 3, initial Q3 state is `['veg-only']`. Initialised via `useState(() => …)` lazy initialiser, not a `useEffect`. | A `useEffect` would re-fire on profile changes (none in V1, but principle still holds) and could overwrite a user deselect. Lazy initialiser runs once at component mount, never re-runs. |
| **Q3 skip-collapse evaluation** | `const showQ3 = profile.q3SkipCount < 3` — computed once at the top of the component, captured in render. Re-renders within the same screen lifetime don't change `showQ3` (the increment only takes effect next page open). | Hiding Q3 mid-submit would make the form jump. The user's expectation is "this question went away because I keep skipping" — observed next open, not mid-flight. Matches the wording in the build plan ("3 sessions of skips"). |
| **Skip-count increment trigger** | After submit resolves (success OR error), inspect what was sent: if `showQ3 && q3.length === 0`, increment and save profile. | "Submit with empty Q3 while Q3 was actually shown" is the operational definition of a skip. Doing it after resolve (not before) makes the increment one-shot regardless of whether the user retries via "Try again" — the Try-again path doesn't re-increment because the second attempt sends the same empty Q3. (Mitigation in Implementation notes — the simplest version is "guard with a `didCountSkip` ref so we increment at most once per submit-then-retry cycle.") |
| **Party-size storage** | New optional `partySize?: number` on `RecommendAnswers` (shared) and `RecommendAnswersSchema` (backend). Sent only when q3 contains `budget`. | `partySize` is conceptually a Q3 sub-question. Could nest under q3 as a tagged object, but the model prompt is easier to construct from a flat field. Schema bound to int 1–10 to prevent the model being asked to plan dinner for 47 people. |
| **Party-size UI** | `+ / N / -` horizontal stepper. Two `<button type="button" aria-label="Increase party size">` ≥44×44 px around a centred numeric display. Renders only when q3 includes `budget`. Default 2. Bounds 1–10 enforced in the click handlers. | Numeric `<input type="number">` on mobile opens a non-ideal keypad and accepts non-numeric input on some browsers; a stepper gives one-finger control on the 390px design width. 44px tap targets are mandatory per CLAUDE.md. |
| **Q1 keyboard radio pattern** | Preserved exactly as-is in Item 08. Q2 gets its own clone of the same pattern (its own `pillRefs` array). | Q1 and Q2 are independent radio groups; arrow keys must move focus within a group, not across groups. Two parallel `useRef<HTMLButtonElement[]>` arrays — one per group. |
| **Q3 keyboard model** | No arrow-key radio pattern on Q3 — each chip is `role="checkbox"`, focusable independently in DOM order via Tab. Space toggles selection (native `<button>` behaviour). | The radio-group pattern is wrong for multi-select. Standard checkbox keyboard model (Tab + Space) is correct here. No new ref arrays needed for Q3. |
| **Submit button disable conditions** | `disabled={!q1Hunger || view.state === 'loading'}`. Q2 and Q3 are optional, so they don't gate the CTA. | Matches the spec — Q1 is the only required answer in V1. Refinement rules in Item 18 may eventually require q2; not today. |
| **Where `partySize` is included in the request** | Submit handler conditional: `if (q3.includes('budget')) body.answers.partySize = partySize`. Otherwise the field is omitted (not set to `undefined`, not set to 2) so the BE Zod parse treats it as truly absent. | Optional fields in Zod treat `undefined` and "missing" identically, but the prompt builder may branch on `partySize !== undefined`. Cleaner to omit. |
| **Veg auto-select interaction with non-veg persona** | If `profile.dietaryPattern === 'non-veg'`, Q3 starts empty. No pre-selection of any chip. | Spec §4.2 only specifies the veg auto-rule. Non-veg users get full agency — no opinionated defaults. |
| **What happens if user selects `veg-only` then switches profile to non-veg mid-session** | Out of scope. Profile changes require a page reload (Item 03 ships `resetAndReload`); the lazy initialiser captures the profile at mount. | V1 has no in-session persona swap; Item 20 is the first item that ships a persona switcher, and it does a full reload. |
| **Form vs three forms** | One `<form>` wrapping all three questions plus the CTA. Submit handler runs once with all three values. | Single submit event, single network call, single view state. Three forms would mean three CTAs. |
| **Section heading typography** | Same as Q1's existing heading: `text-xl font-semibold text-text-primary`. Section spacing: `mt-8` between sections. | Visual consistency with Q1. Open Question covers whether §6.2 names a heading token that should land in `tailwind.config.ts`. |
| **Where the q3 skip-count increment lives** | Inline `saveProfile({ ...profile, q3SkipCount: profile.q3SkipCount + 1 })` in `Questions.tsx`, **not** a new helper in `lib/profile.ts`. | One call site, two lines. A `bumpQ3SkipCount()` helper would be premature factoring; revisit if Item 18 (refinement) or Item 22 (error states) end up needing skip-count writes. |
| **`<Pill>` testing surface** | Tests written via `/test-feature 11-further-questions` after implementation. Component is stateless and trivially testable as a leaf. | Tests are not part of this spec per CLAUDE.md. |
| **Touching `prompt.ts`** | Strictly additive: format `q2` / `q3` / `partySize` into the existing dynamic context block only if Item 06 didn't already wire q2/q3. Verify at implementation time. The static cached prefix is **not** touched (touching it would invalidate every cached prefix). | Prompt-cache invariant per CLAUDE.md: "Prompt caching is mandatory — the static system-prompt prefix carries `cache_control: { type: 'ephemeral' }`. Only the per-request user-context block stays uncached." Q2/Q3/partySize are per-request data, so they belong in the dynamic block by construction. |

## Implementation notes

- **Section order on screen** — Q1 (existing) → Q2 → Q3 (if shown) → party-size stepper (if `budget` selected) → CTA. No headings collapse, no accordions. Tailwind: `mt-8` between sections, `gap-2` between pills inside a section (matches Item 08).
- **Q2 option labels** — re-read `nudge_spec.docx` §4.2 for the exact human-readable copy. Working assumption from `MealType` enum: "Comfort favourite" / "Healthy" / "Indulgent" / "Surprise me". Enum codes (`comfort-favourite`, etc.) must stay byte-for-byte identical to `shared/types.ts` — those are what `RecommendAnswersSchema` validates.
- **Q3 chip labels** — working assumption: "Veg only" / "Fast delivery" / "Budget" / "High-rated". Same enum-codes-vs-display-copy split as Q1/Q2 — codes are wire contract, labels are §4.2 copy.
- **Q2 heading copy** — working assumption "What kind of meal?" / §4.2 authoritative.
- **Q3 heading copy** — working assumption "Any constraints?" / §4.2 authoritative.
- **Party-size label** — working assumption "How many people?" — under the stepper a small helper "Affects budget pacing" is **not** added in V1 (deferred to Item 22 if needed).
- **`Pill.tsx` shape** — purely visual primitive:
  ```tsx
  type PillProps = {
    selected: boolean;
    onClick: () => void;
    children: ReactNode;
    role?: 'radio' | 'checkbox';
    ariaChecked?: boolean;
    tabIndex?: number;
    refCallback?: (el: HTMLButtonElement | null) => void;
  };

  export default function Pill({
    selected, onClick, children,
    role = 'radio', ariaChecked, tabIndex, refCallback,
  }: PillProps) {
    const base =
      'min-h-11 min-w-11 px-4 rounded-full font-medium border transition-colors';
    const colour = selected
      ? 'bg-primary text-white border-primary'
      : 'bg-surface-warm text-text-primary border-border';
    return (
      <button
        type="button"
        role={role}
        aria-checked={ariaChecked ?? selected}
        tabIndex={tabIndex}
        ref={refCallback}
        onClick={onClick}
        className={`${base} ${colour}`}
      >
        {children}
      </button>
    );
  }
  ```
  Used by all three questions. `tabIndex` is required for Q1/Q2's radio-group focus management; Q3 omits it (default tabbing applies).
- **Q3 toggle handler**:
  ```ts
  function toggleQ3(code: Q3Constraint) {
    setQ3(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
    if (code === 'budget' && q3.includes('budget')) {
      // budget being deselected — reset stepper
      setPartySize(2);
    }
  }
  ```
  Note: read the **prior** state for the budget-deselect check because `setQ3` is async.
- **Skip-count guard** — to avoid double-incrementing on retry-after-error:
  ```ts
  const didCountSkipRef = useRef(false);
  // inside onSubmit, AFTER setView resolves:
  if (!didCountSkipRef.current && showQ3 && q3.length === 0) {
    didCountSkipRef.current = true;
    saveProfile({ ...profile, q3SkipCount: profile.q3SkipCount + 1 });
  }
  ```
  `didCountSkipRef` is reset on full screen unmount only (i.e., never resets within one mount). One submit per session counts as one skip even if retried.
- **Submit body assembly** — make `partySize` truly optional in the JSON, not `undefined`:
  ```ts
  const answers: RecommendAnswers = { q1: hunger };
  if (q2) answers.q2 = q2;
  if (q3.length > 0) answers.q3 = q3;
  if (q3.includes('budget')) answers.partySize = partySize;
  const req: RecommendRequest = {
    answers,
    passiveContext: await buildPassiveContext(profile),
    profileSignal: buildProfileSignal(profile),
  };
  ```
  `JSON.stringify` strips `undefined` values, so building the object cleanly with conditional assignment avoids sending `"q2": undefined`-style anomalies.
- **`shared/types.ts` change is additive** — adding an optional field cannot break existing callers. Item 04's BE Zod schema mirrors the same change in `backend/src/schema.ts` (the `satisfies z.ZodType<RecommendAnswers>` constraint is what enforces parity — TS will fail typecheck if the two drift).
- **Backend `prompt.ts` audit** — before touching: read Item 06's spec and the current `backend/src/prompt.ts`. If Item 06 already projects `q2` / `q3` into the dynamic block, only add `partySize` rendering. If it doesn't, add a small "Selected meal type:" / "Selected constraints:" / "Party size:" subsection in the same dynamic block. Do **not** add this content to the static cached prefix — the cache-control marker is on the system prompt's static prefix only. Verify by re-reading `backend/src/anthropic.ts` (where the cache markers live).
- **No request validation duplication** — the FE shape check (`ResponseShapeSchema` in `recommend.ts`) is unchanged. Adding `partySize` to the request schema is a BE-side addition; the FE just sends the field. If the FE shape check ever grows into per-field validation, that's a different item.
- **Veg auto-select edge: skip count ≥ 3** — Q3 is hidden entirely; veg auto-select doesn't apply. The lazy initialiser checks `showQ3` first:
  ```ts
  const [q3, setQ3] = useState<Q3Constraint[]>(() =>
    showQ3 && profile.dietaryPattern === 'veg' ? ['veg-only'] : []
  );
  ```
- **Party-size stepper bounds visual** — disable the `-` button when value is 1; disable the `+` button when value is 10. Use the same `disabled:opacity-50 disabled:cursor-not-allowed` pattern as the main CTA.
- **No analytics, no console.log** — same standing rule as Item 08. The submit handler does not log the request body. BE logs are the source of record.
- **No tests, no security review in this item** — both run as separate slash commands after implementation per CLAUDE.md.

## Rules for implementation

- TypeScript strict; no `any` unless justified inline.
- Zod for every shape that crosses the network boundary — the new `partySize` field gets a Zod validator on the BE; the FE `ResponseShapeSchema` is unchanged.
- Tailwind utility classes only; tokens come from `tailwind.config.ts` (Item 02). No new tokens needed.
- No inline `style={{...}}` for color/spacing. Arbitrary-value utilities like `max-w-[390px]` are fine.
- Mobile web only, 390px design width, **44px minimum tap targets** — applies to Q2 pills, Q3 chips, stepper `+/-` buttons, and the CTA.
- Reuse types from `shared/` — `RecommendRequest`, `RecommendAnswers`, `HungerLevel`, `MealType`, `Q3Constraint`. Don't redefine FE-side.
- `ensureProfile()` / `saveProfile()` are the only entry points to the profile from `Questions.tsx`. Don't read or write `localStorage` directly anywhere outside `frontend/src/lib/profile.ts`.
- Enum codes sent over the wire must match `shared/types.ts` byte-for-byte. UI labels come from `nudge_spec.docx` §4.2 — different source, do not collapse.
- No new npm dependencies.
- No new shared types beyond the optional `partySize` field.
- The `<Pill>` primitive lives in `frontend/src/components/`. Do not duplicate the pill class strings inside `Questions.tsx`.
- Prompt caching is preserved — any `prompt.ts` change touches the **dynamic** block only, never the static cached prefix.
- No tests in this item — written and run via `/test-feature 11-further-questions`.
- No security / quality review in this item — run via `/code-review-feature 11-further-questions`.

## Verification

- `npm run typecheck` passes across all workspaces. Specifically: `shared/`'s `partySize` addition compiles, `backend/`'s `RecommendAnswersSchema` `satisfies z.ZodType<RecommendAnswers>` still holds, `frontend/`'s `Questions.tsx` compiles against the extended `RecommendAnswers`.
- `npm run dev` boots both servers without errors. `http://localhost:5173` loads with no console errors.
- **First-load UX (390×844 viewport, fresh `localStorage`)** — open DevTools mobile view, clear localStorage, reload. The page renders **three** stacked question sections (Q1 + Q2 + Q3), each with the right heading and pill set. The Q1 pill row, Q2 pill row, and Q3 chip row each fit on 390px without horizontal scroll. The CTA is at the bottom, disabled (no Q1 selection yet). No party-size stepper visible.
- **Q1 still works** — tap "Light snack". CTA enables. The Q1 row visually matches Item 08's selected-pill behaviour. Arrow keys move selection within Q1 only (do not jump to Q2).
- **Q2 selection** — tap "Healthy" in Q2. The Q2 pill fills primary-orange. Tap "Indulgent"; selection swaps. Arrow keys within Q2 move Q2's selection; they do not affect Q1. Submitting now sends `answers.q2: 'indulgent'` (verified in Network tab).
- **Q3 multi-select** — tap "Fast delivery" and "High-rated". Both pills appear selected (primary-orange fill). Tap "Fast delivery" again; it deselects (returns to surface-warm). Tab key reaches each Q3 chip independently; Space toggles. Submitting now sends `answers.q3: ['high-rated']` (verified in Network tab).
- **Veg auto-select** — open DevTools → Application → localStorage → `nudge.profile.v1` → set `dietaryPattern` to `"veg"` (and update `topCuisines`/`orderHistory` if desired). Reload. The `veg-only` chip in Q3 is already selected on first paint. Submitting sends `answers.q3: ['veg-only', ...]`. User can deselect; the deselected state persists through that session.
- **Veg auto-select does NOT apply for non-veg persona** — reset to seeded Mumbai non-veg persona (dev "Reset profile" button). Reload. Q3 starts entirely empty. None of the chips are pre-selected.
- **Budget → party-size stepper** — with no `budget` selected, no stepper is visible. Tap the `budget` chip. The stepper appears below the Q3 row showing `2` between `-` and `+` buttons. Tap `+` four times; the display reads `6`. Tap `+` five more times; the display reads `10` and the `+` button is visually disabled. Tap `-`; reads `9`. Tap `-` down to `1`; the `-` button is visually disabled.
- **Party-size goes on the wire** — with `budget` selected and party size at `4`, submit. Network tab → request payload → `answers.partySize === 4`. `answers.q3` includes `'budget'`.
- **Party-size resets when budget is deselected** — set stepper to `7`. Deselect `budget`. The stepper disappears. Re-select `budget`. The stepper reappears showing `2` (not `7`).
- **Party-size NOT sent when budget is not selected** — with `budget` deselected, submit. Network tab → request payload has **no** `partySize` field (verify in raw JSON, not just in the DevTools display).
- **Q3 skip-count increment** — with seed profile (`q3SkipCount: 0`), select only Q1, leave Q3 empty, submit. After the response renders, open DevTools → Application → localStorage → `nudge.profile.v1` → confirm `q3SkipCount` is now `1`. Repeat the cycle two more times (each = one full submit with empty Q3). After the third skip submit, confirm `q3SkipCount === 3`.
- **Q3 skip-count NOT incremented when Q3 was selected** — with `q3SkipCount` at any value, select a Q3 chip, submit. Confirm `q3SkipCount` did **not** change on this submit.
- **Q3 skip-collapse takes effect on next page open** — once `q3SkipCount` reaches `3`, reload the page. The Q3 section is no longer rendered (no heading, no chips, no stepper). The page still shows Q1 + Q2 + CTA. Submit; the request body has no `q3` and no `partySize` fields.
- **Skip-count increment is one-shot per submit (retry guard)** — with `q3SkipCount: 0`, kill the backend, attempt a submit with empty Q3. After the error envelope renders, confirm `q3SkipCount` is now `1`. Tap "Try again", submit again (still empty Q3). Confirm `q3SkipCount` is still `1`, not `2`. (One user-intent = one skip count.)
- **Submit + success path** — with `ANTHROPIC_API_KEY` set and `USE_STUB_RECOMMEND=true` for fast iteration: select Q1=`regular-meal`, Q2=`comfort-favourite`, Q3=`['fast-delivery']`. Tap "Find my meal". Within ~1s (stub) or ~5–10s (real), the success state replaces the form area with the existing `DishCard` render from Item 10.
- **Submit + validation error path** — temporarily edit `Questions.tsx` to send `partySize: 99` (over the 10 cap). Reload, submit. BE returns 400 with `code: 'validation_error'`; FE renders the envelope message. **Revert before commit.**
- **`curl` direct hit** — issue:
  ```bash
  curl -s -X POST http://localhost:3001/api/recommend \
    -H 'Content-Type: application/json' \
    -d '{
      "answers": { "q1": "regular-meal", "q2": "healthy", "q3": ["budget", "veg-only"], "partySize": 4 },
      "passiveContext": { "time": "2026-05-16T19:30:00.000Z", "location": { "lat": 19.076, "lng": 72.877, "label": "Mumbai" }, "historySummary": "" },
      "profileSignal": { "dietaryPattern": "veg", "topCuisines": ["South Indian"], "avgOrderValue": 220 }
    }' | jq .
  ```
  Expected: 200 with `requestId` + `dishes[5]`.
- **`curl` partySize out of range** — send `"partySize": 50`. Expected: 400 with `error.code: 'validation_error'` and `details[].path: 'answers.partySize'`.
- **Anthropic cache check** — open Anthropic Console → Logs. Submit twice with different Q2/Q3 combinations. Both requests should show **cache_read** input tokens on the static prefix (>80% of the static block). The dynamic block — which now includes Q2/Q3/partySize content — is cache_misses for the dynamic portion only. Confirms the static/dynamic boundary in `prompt.ts` wasn't accidentally crossed.
- **No hardcoded hex** — `grep -rE "#[0-9A-Fa-f]{3,6}" frontend/src --include="*.tsx" --include="*.ts" | grep -v tailwind.config.ts | grep -v profile.ts` returns nothing new.
- **44px tap-target spot-check** — in DevTools, select each Q2 pill, each Q3 chip, each stepper button. Computed-style or inspector box should show ≥44×44 px hit area on all.
- **No regressions in Phase A** — reset profile, complete the flow as Item 08 demoed (Q1 only, ignore Q2 and Q3). The single dish card from Item 10 still renders. Submit-while-loading guard still holds (double-tap CTA, only one network request).

## Out of scope for this item

- Three-dot progress indicator and the Q1 → Q2 → Q3 state machine — Item 12.
- Back navigation between question steps — Item 12.
- Freetext describe box with the deterministic NL summary pre-fill — Item 13.
- 5-card render + bottom-sheet entry animation — Item 14.
- Loading skeletons (shimmer) — Item 15. (This item continues to use the centred spinner from Item 08.)
- "Same dish elsewhere" inline expand — Item 16.
- Health-nudge surface inside the card — Item 17.
- "Not quite" refinement loop — Item 18.
- Persona swap UI / My Orders tab — Items 19–21.
- Polished error / empty states (MCP failure copy, Anthropic timeout, geolocation denied) — Item 22.
- Resetting the skip counter from the UI — there is no surface for this in V1; resetting localStorage via the dev button is the affordance. A user-facing "show Q3 again" affordance could land in Item 20 alongside persona editing.
- A `<Chip>` primitive distinct from `<Pill>` — visuals are identical, so one primitive serves both. If Item 18's refinement chips diverge visually, factor at that time.
- Animations on Q2 / Q3 entry or pill press — no §6.5 entry rule applies to question sections; Item 14 owns the bottom-sheet animation when the result list lands.
- Tests — `/test-feature 11-further-questions`.
- Security / quality review — `/code-review-feature 11-further-questions`.

## Open questions

- **Q2 / Q3 / party-size copy** — at implementation time, confirm against `nudge_spec.docx` §4.2:
  - Q2 heading ("What kind of meal?") and option labels ("Comfort favourite" / "Healthy" / "Indulgent" / "Surprise me").
  - Q3 heading ("Any constraints?") and chip labels ("Veg only" / "Fast delivery" / "Budget" / "High-rated").
  - Party-size prompt copy ("How many people?").
  - The hyphenation and capitalisation are working assumptions; spec wording wins.
- **Section heading typography** — Item 08 used `text-xl font-semibold text-text-primary` and flagged this as an open question. Same choice extended to Q2 / Q3 headings. If §6.2 defines a "question heading" size, lift it into `tailwind.config.ts` as a one-liner during plan review rather than spreading sizes through screens.
- **Item 06 prompt-builder state** — does the existing `backend/src/prompt.ts` already format `q2` / `q3` into the dynamic context block? Plan-mode should re-read it and either confirm "additive partySize only" or scope a small expansion. Either way the change must stay in the dynamic block.
- **`Pill` `aria-pressed` vs `aria-checked`** — the existing Q1 markup uses `role="radio"` + `aria-checked`. The shared `<Pill>` should preserve that. Q3's checkbox variant also uses `aria-checked` (correct for `role="checkbox"`). Confirm screen-reader behaviour at implementation by toggling pills with VoiceOver on the 390px Safari view.
- **Q3 skip-count reset path** — the build plan doesn't specify whether the counter ever resets on its own. Current spec: it does **not** reset; the only way to see Q3 again after skip-collapse is the dev reset button. If §4.2 implies "after a successful Q3 submit, counter resets to 0", surface that during plan review and add a single line to the submit handler. Today's spec keeps the counter monotonic for simplicity.
- **Party-size default** — current spec uses `2`. If §4.2 / spec text suggests a different default (e.g. `1` for self), confirm at implementation.
---
