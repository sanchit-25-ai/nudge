---
# Spec — Item 12: Three-Dot Progress + State Machine

**Phase**: B (Full question flow) · **Status**: Draft, awaiting approval

## Goal

Item 11 packed Q1, Q2, and Q3 onto a single vertically-stacked screen as an intentional placeholder — it explicitly deferred per-step navigation to this item. Item 12 splits that single screen into a **per-step state machine**: Q1 → Q2 → Q3 → freetext → submit, with a top-of-screen **three-dot progress indicator** that adapts when Q3 is skip-collapsed, and a **Back** affordance on every step after Q1 that returns the user to the previous step without losing any answers.

This is also the item that first introduces the **freetext step** to the flow — but only as a structural placeholder: a small `<textarea>` that binds to the existing `answers.freetext` field on `RecommendAnswers`. Item 13 owns the deterministic NL pre-fill ("Something comforting and filling, under ₹300"), the override semantics from §4.3, and the final copy on that screen. Item 12's job is to make sure the machine has somewhere to land between Q3 and submit.

What this item is **not**: it does not change the wire contract (no `shared/types.ts` change, no Zod schema change, no backend change), does not add a router, does not animate step transitions, and does not change the success / error render (Item 14 owns the 5-card render and bottom-sheet animation; Item 22 owns polished error states).

## Depends on

- Item 02 — Minimal Design Tokens (`primary`, `surface.warm`, `text.primary`, `text.secondary`, `border`, `rounded-card`, `h-13`, `fade-in` keyframe — all consumed by the per-step shell, the progress dots, the back button, and the freetext textarea).
- Item 03 — Seed User Profile (`q3SkipCount` and `dietaryPattern` already drive Item 11's skip-collapse + veg auto-select; both behaviours carry across unchanged).
- Item 04 — `/api/recommend` Skeleton (`RecommendAnswersSchema.freetext: z.string().max(2000).optional()` already exists and validates the freetext field; no schema change needed for the freetext step).
- Item 08 — Single-Question Screen (`Questions.tsx` view-state pattern — `idle | loading | success | error` — extends naturally with a new `step` axis).
- Item 10 — Single Dish Card Render (the success-state render — `<DishCard dish={view.dishes[0]} />` — stays exactly as-is; Item 14 will replace it).
- Item 11 — Q2 + Q3 Implementation (the entire Q1/Q2/Q3 selection model, the `<Pill>` primitive, the `useRadioArrowHandler` hook, the Q3 skip-collapse rule, the veg auto-select lazy initialiser, the party-size stepper, the skip-count one-shot guard — all carry across; Item 12 reshapes how they are presented per step but does not change their logic).

Items 05 / 06 / 07 / 09 are implicit upstreams (Anthropic + MCP + prompt builder + response parser + passive context) — Item 12 doesn't change any of them.

## Deliverables

- `frontend/src/components/ProgressDots.tsx` — **new**. Tiny stateless visual primitive:
  - Props: `{ count: number; current: number }` — `count` is the total number of question steps in the active flow (2 or 3 depending on `showQ3`), `current` is the zero-indexed dot to mark as the user's present location.
  - Renders a horizontal row of `count` small circles (~8px) with `gap-2` spacing. Past + current dots are filled with `primary`; future dots are filled with `border`. The current dot carries an additional `ring-2 ring-primary ring-offset-2` (or comparable) so the active position reads at a glance.
  - Fully presentational. No state, no callbacks, no `aria-*` interactivity (the dots are decorative — `aria-hidden="true"` on the row, since the step heading is what screen readers should announce).
  - Tailwind utility classes only — no new tokens needed. The `primary` and `border` colours already exist in `tailwind.config.ts`.

- `frontend/src/screens/Questions.tsx` — **modified**. Substantial restructure: the same component, same file, but the render body is now a per-step switch with a shared shell (header with optional Back + ProgressDots, body with the current step's content, footer with the Next/Submit CTA). Specifically:
  - **New state**: `const [step, setStep] = useState<Step>('q1')`. `Step` is the discriminated union `'q1' | 'q2' | 'q3' | 'freetext'`. Separate from the existing `view` state (`idle | loading | success | error`) — `step` is *which question the user is on*; `view` is *what the request is doing*. Both move independently.
  - **New state**: `const [freetext, setFreetext] = useState<string>('')` — backs the freetext step's textarea. Sent on submit as `answers.freetext` only when `freetext.trim().length > 0`.
  - **New constants**: `const stepOrder: Step[] = showQ3 ? ['q1', 'q2', 'q3', 'freetext'] : ['q1', 'q2', 'freetext']` — computed once from the existing `showQ3` flag. Drives both forward + back navigation and the progress-dot count.
  - **New helpers**: `goNext()` and `goBack()` — both compute the next / previous step from `stepOrder.indexOf(step)`, no-op if at the edge. `goNext()` from `'freetext'` is a no-op (the freetext CTA fires the submit handler instead). `goBack()` from `'q1'` is impossible because Q1 hides its back button.
  - **Per-step render**: when `view.state` is `idle`, render the current step's section. Step Q1 keeps the existing Q1 pill row + radio arrow handler. Step Q2 keeps the existing Q2 pill row + radio arrow handler. Step Q3 keeps the existing Q3 chip row + party-size stepper. Step freetext renders the new `<textarea>` placeholder block (see below). All other steps' sections are **not rendered** when not active — DOM presence is gated on step, so a hidden step's pills can't be tabbed into.
  - **Per-step CTA**:
    - Steps q1 / q2 / q3: footer holds a single `Next` button. Q1's Next is disabled when `!hunger` (per Item 11). Q2 and Q3 Nexts are always enabled (those questions are optional per spec §4.2 — user may advance without selecting).
    - Step freetext: footer holds the `Find my meal` button — same disable + submit semantics as Item 11's existing CTA (`disabled={!hunger || view.state === 'loading'}`). Pressing it runs the existing `onSubmit` handler unchanged.
  - **Back affordance**: steps q2 / q3 / freetext show a small Back button in the per-step header row (left side), 44×44 px hit target, label `← Back` (text + leading chevron-glyph; see Tech choices). Tapping it calls `goBack()` and preserves all state.
  - **Header row**: every question step's header contains the Back button (if not q1) on the left and `<ProgressDots count={...} current={...} />` centered. The existing Q1 / Q2 / Q3 section headings (`text-xl font-semibold`) stay — they sit below the header row, above the pill / chip / textarea body. The freetext step's heading is a placeholder ("Anything specific?" — Item 13 finalises).
  - **Form semantics**: the outer `<form>` stays. Submit only fires from the freetext step (because that's the only step whose footer button is `type="submit"`). Q1 / Q2 / Q3 Next buttons are `type="button"` and call `goNext()` directly. Pressing Enter inside a Q3 chip or a Q2 pill therefore doesn't submit the form — it just activates the pill (native button behaviour). Pressing Enter inside the freetext textarea inserts a newline; the user has to tap the CTA to submit. This matches mobile UX expectations.
  - **Loading / success / error**: these views render **instead of** the step body (not alongside it). When `view.state === 'loading'`, the entire mid-section is the centred spinner from Item 08 — header row and footer button are hidden, because the user is now waiting on the request, not navigating questions. When `view.state === 'success'`, the success block from Item 10 renders (single dish card). When `view.state === 'error'`, the error block from Item 08 renders with a `Try again` button that resets `view` to `idle` — `step` stays at `'freetext'` so the user lands back where they submitted from, with all answers intact.
  - **Veg auto-select unchanged**: the lazy initialiser `useState<Q3Constraint[]>(() => showQ3 && profile.dietaryPattern === 'veg' ? ['veg-only'] : [])` continues to run once at mount. Stepping forward into Q3 does not re-trigger it (the component does not unmount). Stepping back and forward repeatedly preserves the user's selections.
  - **Q3 skip-count guard unchanged**: the `didCountSkipRef` one-shot guard and the `showQ3 && q3.length === 0` check still run at the same operational moment — after the submit promise resolves. Reading the user's q3 array at submit time correctly captures whether they actually picked any chips on the q3 step before advancing through freetext.
  - **Freetext textarea (placeholder)**: a single `<textarea>` with:
    - `value={freetext}` and `onChange={(e) => setFreetext(e.target.value)}`.
    - `maxLength={2000}` to mirror the `RecommendAnswersSchema.freetext` `z.string().max(2000)` validator and prevent server-side rejection.
    - `placeholder="Any specific cravings or constraints?"` (Item 13 will replace placeholder + pre-fill).
    - 44px+ tap target on the textarea itself (default browser height is fine; spec a `min-h-32` or similar so it visually invites typing).
    - No pre-fill in this item. No `buildIntentSummary()` helper. Item 13's job.
  - **Submit-body update**: in the existing `onSubmit`, add one line after the q3 / partySize conditionals: `if (freetext.trim().length > 0) answers.freetext = freetext.trim();`. The trim guards against the user typing whitespace only. The optional-field-omission rule from Item 11 still holds — empty freetext is not sent as `""`, it's omitted entirely.

- `frontend/src/screens/Questions.test.tsx` — **untouched in this item.** Tests are written via `/test-feature 12-state-machine` after implementation.

- `frontend/src/components/Pill.tsx` — **untouched.** The pill primitive's API is fine as-is.
- `frontend/src/lib/recommend.ts`, `passiveContext.ts`, `profileSignal.ts`, `profile.ts` — **untouched.**
- `frontend/src/App.tsx` — **untouched.** Still mounts `<Questions />` and the dev reset button.
- `backend/src/*` — **untouched.** No new fields on the wire, no schema change, no prompt-builder change.
- `shared/types.ts` — **untouched.** `freetext?: string` already exists on `RecommendAnswers` from Item 04.

That is the full scope. No new lib modules, no new dependencies, no DB, no env vars. One new visual primitive (`ProgressDots`). One screen-level refactor (`Questions.tsx`).

## File tree after this item ships

```
nudge/
└── frontend/
    └── src/
        ├── components/
        │   └── ProgressDots.tsx              # new — count + current zero-indexed dot; presentational, aria-hidden
        └── screens/
            └── Questions.tsx                 # modified — step state machine, per-step rendering, back nav, freetext placeholder
```

## Tech choices (locked)

| Decision | Choice | Reason |
|---|---|---|
| **Routing** | Still none. `step` is local component state; no React Router, no URL sync, no `history` integration. | The flow is linear and fits one screen. A router would add a dependency and runtime weight without unlocking anything Item 12 needs. Item 19 (bottom nav) is the next item that might justify a router and will own that call. |
| **State shape — `step` vs view union** | Two orthogonal `useState`s: `step: Step` (which question is shown) and `view: View` (what the request is doing). | Folding step into the view union (`{ state: 'questioning'; step: Step }`) couples the two axes and complicates retry-after-error — the natural thing on `Try again` is "reset request state, leave navigation alone." Two independent states make that one line. |
| **`Step` type** | String literal union: `'q1' \| 'q2' \| 'q3' \| 'freetext'`. Defined locally in `Questions.tsx`. | Not used outside this file; no benefit to lifting to `shared/types.ts`. Step names mirror the build-plan vocabulary and are easy to read in dev tools. |
| **`stepOrder` derivation** | Compute once at top of component: `const stepOrder: Step[] = showQ3 ? ['q1', 'q2', 'q3', 'freetext'] : ['q1', 'q2', 'freetext'];`. Drives both nav (`indexOf + 1 / − 1`) and progress-dot props. | Single source of truth. If a future item adds a step (or re-orders), one array changes and both nav + dots follow. `useMemo` is not necessary at this size — it's a 3- or 4-element literal whose construction cost is trivial. |
| **Q1 → Q2 → Q3 → freetext order** | Matches the build plan verbatim. Freetext is the final step before submit. | Spec-driven. Reordering would invalidate the build-plan summary in Item 12's title. |
| **`Next` button when current selection is empty (Q2 / Q3)** | Always enabled. Q2 and Q3 are optional per §4.2 — advancing without selecting is a first-class user choice. | Disabling Next would silently force the user to pick a meal type when none feels right; spec §4.2 explicitly allows skipping. |
| **`Next` button when Q1's hunger is empty** | Disabled — same as Item 08 / 11. | Q1 is the only required answer in V1; the rest of the flow (and the `RecommendRequest`) requires `answers.q1`. |
| **Submit button location** | Only on the freetext step. Q1 / Q2 / Q3 footers hold `Next`. | Matches the spec flow ("Q1 → Q2 → Q3 → freetext → submit"). Putting submit on every step would let users bypass the freetext refinement entirely, which Item 13 / Item 18 will lean on. |
| **Back button placement** | Header row, left of the progress dots. Text + leading chevron glyph (`← Back`), no icon library. 44×44 px tap. `type="button"`. | Standard iOS / Android multi-step form pattern. Header location avoids stealing footer real estate from the primary CTA. A plain ASCII chevron avoids pulling in `lucide-react` or similar for one icon. |
| **Q1 has no Back button** | Conditional render in the header: `{step !== 'q1' && <BackButton />}`. The slot is reserved (left-aligned `w-24` or similar) so the progress dots stay centred. | First step has nowhere to go back to. A disabled-but-visible Back would mislead users. Reserving the slot prevents the dot row from shifting between Q1 and Q2. |
| **Progress dot count when Q3 is skip-collapsed** | 2 dots (q1, q2). The freetext step does not get a dot — it's a "refine" step, not a question. | Spec wording: "three-dot progress" reads as a count of the question steps, not the total flow length. When Q3 is hidden, there are only 2 questions; the dot count should match what the user actually sees. The freetext step gets its own heading instead, no dots — matches the "review your ask" mental model. |
| **Progress dot count on the freetext step** | Dots are **not rendered** on the freetext step. Only the back button is in the header. | The dots represent question progress. Once the user is past the questions, the dots have nothing to communicate. Continuing to show them (e.g., all filled) would be redundant. Omit instead. |
| **Active vs past vs future dot styling** | Past + current: `bg-primary`. Future: `bg-border` (using the §6.2 border-grey token). Current additionally carries a 2px primary ring + 2px offset so it reads as the active position. Each dot is 8px square (`h-2 w-2`) with `rounded-full`. | Matches standard pagination-dot semantics: filled = visited, ring = where you are. No new tokens. The 8px size is small enough not to dominate the header but large enough to read at 390px. |
| **Step transition animation** | None in Item 12. The new step's section renders instantly; the old step's section unmounts instantly. | The build-plan name is "state machine + progress" — no animation mention. Item 14 owns motion (`animate-sheet-up` for the result reveal). Adding step-to-step fade in this item would be scope creep and is easy to layer in later without restructuring. (Open question: whether spec §6.5 specifies a step-transition motion — confirm during plan review.) |
| **Browser back button integration** | Out of scope. Pressing the browser back button on the Q3 step navigates away from the app (since there's no router and no `history.pushState` per step). | A router-less workaround using `history.pushState` + `popstate` listeners is feasible but adds a class of edge cases (initial entry, deep-link reload, history poisoning) that V1 doesn't need. If a future item wants this, it should own a router introduction at the same time. Flag in Open questions. |
| **Page reload behaviour** | Reload returns to step q1 with all selections cleared (component state is in React `useState`, not persisted). `q3SkipCount` and profile persist via `localStorage`; question answers do not. | V1 has no draft-state persistence requirement. Persisting Q1 / Q2 / Q3 / freetext across reload would require a localStorage schema and a stale-data invalidation policy — neither of which the spec asks for. |
| **Veg auto-select on lazy init still applies** | Yes — same `useState<Q3Constraint[]>(() => ...)` from Item 11, unchanged. | Lazy initialiser runs once at component mount, not per step transition. Stepping forward into Q3 reads existing state; the chip is already pre-selected if the persona warranted it. |
| **Step machine vs custom hook** | Inline `useState` + `goNext` / `goBack` helpers inside `Questions.tsx`. No `useQuestionFlow()` hook, no `xstate` import. | The state machine is 4 states + 2 transitions. A formal state-chart library or extracted hook would be premature abstraction; CLAUDE.md explicitly cautions against this. The whole machine is ~20 lines of code. |
| **Component decomposition (Q1Step / Q2Step / etc. files)** | Kept inline in `Questions.tsx` as render-helpers gated on `step`. Only `ProgressDots` lifts to its own file. | Item 12's task is the navigation spine; decomposing the existing inline sections into 4 new files would be a refactor that doesn't serve this task. Item 13 / 14 may decompose when they introduce further per-step behaviour. |
| **Freetext textarea size / styling** | `<textarea>` with `min-h-32` (~128px), `w-full`, `rounded-card`, `border border-border`, `bg-surface-warm`, `p-3`, `text-text-primary`, `placeholder:text-text-secondary`, `focus:outline-none focus:ring-2 focus:ring-primary`. `maxLength={2000}`. | 128px gives the textarea visual presence ("you can write a sentence here"); 44px tap-target rule applies to interactive controls — a textarea bigger than 44px tall always passes. Borders and surface match the Q3 chip style for visual consistency. The 2000-char cap mirrors the BE schema. |
| **`freetext` field omission rule** | If `freetext.trim().length === 0`, the field is omitted from the submitted JSON entirely (not set to `""`). | Mirrors the existing `q2 / q3 / partySize` omission pattern from Item 11. The Zod `.optional()` on the BE treats missing and `undefined` identically; omitting keeps the JSON payload tidy and the prompt builder branch logic clean. |
| **What "Try again" does on the error view** | Sets `view` back to `{ state: 'idle' }`. Does **not** touch `step`. The user lands on whichever step they submitted from (always `'freetext'` for this item). | Preserves Item 08's semantics. The error envelope often resolves on a second attempt (network blip, transient model error); making the user re-traverse the whole flow would be hostile UX. |
| **Skip-count guard semantics** | Unchanged from Item 11: `if (!didCountSkipRef.current && showQ3 && q3.length === 0) { didCountSkipRef.current = true; saveProfile(...); }`. The check fires after the submit promise resolves, regardless of success or error. | A user who clicks through Q3 without selecting chips and then submits is, definitionally, skipping Q3 — whether the request succeeds is unrelated to their intent. The one-shot ref still protects against retry-after-error double-counting. |
| **Tab order inside the form** | Default DOM order: header (back, dots), body (current step's pills/chips/textarea), footer (Next / Find my meal). Tabbing wraps within the form. The radio-group arrow-key pattern still constrains arrow keys to within a single question's pill row. | DOM-driven tab order is least-surprise. No `tabIndex` overrides beyond what Item 11 already sets. |
| **`aria-live` on the spinner / success / error** | Unchanged from Item 08 / 11. The spinner already has `role="status" aria-label="Loading"`. The success and error blocks render visible text — no extra `aria-live` needed because they replace the entire mid-section synchronously. | Existing accessibility surface is sufficient for a personal-use prototype. Item 22 owns polish around announcement timing. |
| **Where `Step` lives** | Local type alias inside `Questions.tsx`. Not exported. | The only consumer is `Questions.tsx` itself. Exporting would invite per-step subcomponents to import it, which is the kind of decomposition this item is deliberately avoiding. |
| **Back-button copy** | `← Back` literal. No `aria-label` override — the text is the label. | Plain text reads in any locale; the chevron is decorative reinforcement. If a future item internationalises copy, Back becomes the same string-table lookup as every other label. |

## Implementation notes

- **Step machine sketch**:
  ```ts
  type Step = 'q1' | 'q2' | 'q3' | 'freetext';

  const stepOrder: Step[] = showQ3
    ? ['q1', 'q2', 'q3', 'freetext']
    : ['q1', 'q2', 'freetext'];

  const stepIndex = stepOrder.indexOf(step);

  function goNext() {
    const next = stepOrder[stepIndex + 1];
    if (next) setStep(next);
  }
  function goBack() {
    const prev = stepOrder[stepIndex - 1];
    if (prev) setStep(prev);
  }
  ```
  `stepIndex` is computed each render — cheap, no memo needed. The `if (next)` / `if (prev)` guards make off-the-edge calls into no-ops, so the freetext-step Next button and the q1-step Back button (which is hidden anyway) are both safe to wire up uniformly.
- **Render scaffold**:
  ```tsx
  // header row
  <div className="flex items-center justify-between mb-6">
    <div className="w-24">
      {step !== 'q1' && (
        <button type="button" onClick={goBack} className="min-h-11 min-w-11 px-2 text-text-primary">
          ← Back
        </button>
      )}
    </div>
    {step !== 'freetext' && <ProgressDots count={stepOrder.length - 1} current={stepIndex} />}
    <div className="w-24" />  {/* mirror-spacer so dots stay centred */}
  </div>

  // body: gated render
  {step === 'q1' && view.state === 'idle' && <Q1Block .../>}
  {step === 'q2' && view.state === 'idle' && <Q2Block .../>}
  {step === 'q3' && view.state === 'idle' && <Q3Block .../>}
  {step === 'freetext' && view.state === 'idle' && <FreetextBlock .../>}

  // mid-section: replaces step body
  {view.state === 'loading' && <Spinner />}
  {view.state === 'success' && <DishCardBlock .../>}
  {view.state === 'error' && <ErrorBlock .../>}

  // footer
  {view.state === 'idle' && (
    step === 'freetext'
      ? <button type="submit" disabled={!hunger || view.state === 'loading'} className="...">Find my meal</button>
      : <button type="button" onClick={goNext} disabled={step === 'q1' && !hunger} className="...">Next</button>
  )}
  ```
  The `<Q1Block />` etc. are inline JSX render-helpers — the existing Q1, Q2, Q3 sections from Item 11 wrapped in tiny pure-render functions or moved into inline JSX gated on step. Whichever reads cleaner during implementation is fine; both are equivalent.
- **Why two `w-24` siblings flank the dots**: CSS flex centring with `justify-between` needs equal-width siblings on both sides. Putting an empty `<div className="w-24" />` on the right mirrors the back-button slot on the left so the dot row stays optically centred regardless of whether Back is visible. `w-24` is arbitrary — pick whatever width the actual Back button renders at.
- **`ProgressDots` shape**:
  ```tsx
  type ProgressDotsProps = { count: number; current: number };

  export default function ProgressDots({ count, current }: ProgressDotsProps) {
    return (
      <div role="presentation" aria-hidden="true" className="flex items-center gap-2">
        {Array.from({ length: count }).map((_, i) => {
          const past = i < current;
          const active = i === current;
          const base = 'h-2 w-2 rounded-full transition-colors';
          const colour = past || active ? 'bg-primary' : 'bg-border';
          const ring = active ? 'ring-2 ring-primary ring-offset-2' : '';
          return <span key={i} className={`${base} ${colour} ${ring}`} />;
        })}
      </div>
    );
  }
  ```
  Pure — no state, no callbacks. `aria-hidden` because dots are decorative; the step heading inside the body is what carries semantic meaning for assistive tech.
- **Freetext step body shape**:
  ```tsx
  <>
    <h2 className="text-xl font-semibold text-text-primary">Anything specific?</h2>
    <p className="mt-2 text-sm text-text-secondary">
      Add cravings, constraints, or anything else worth knowing. Optional.
    </p>
    <textarea
      value={freetext}
      onChange={(e) => setFreetext(e.target.value)}
      maxLength={2000}
      placeholder="Any specific cravings or constraints?"
      className="mt-4 w-full min-h-32 rounded-card border border-border bg-surface-warm p-3 text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary"
    />
  </>
  ```
  Heading and helper-text copy are working assumptions — Item 13 will finalise. The textarea itself is structural and will not need to change in Item 13 (Item 13 changes the `value` source via a pre-fill effect, not the input element itself).
- **Submit-handler delta** — exactly one new line in `onSubmit`, inserted alongside the existing `if (q3.length > 0)` etc. block:
  ```ts
  if (freetext.trim().length > 0) answers.freetext = freetext.trim();
  ```
  No other changes to `onSubmit`. The skip-count guard, the `passiveContext` build, the `postRecommend` call, the view-state transitions all stay exactly as Item 11 left them.
- **`view.state === 'success'` rendering**: keep the existing Item 10 success block unchanged — `<DishCard dish={view.dishes[0]} />` wrapped in the existing "Here's what I'd order:" wrapper. Item 14 will replace this; Item 12 should not touch it.
- **Error retry returns to freetext step**: explicitly: `onClick={() => setView({ state: 'idle' })}` on the Try-again button. Because submit only fires from `step === 'freetext'`, the step at error time is always freetext; the Try-again handler doesn't need to touch `step`.
- **Header row vertical rhythm**: keep `mb-6` between header and step body. Current Item 11 spacing was `mt-6` on the first `<div role="radiogroup">`; with the new header row, swap to `mb-6` on the header so spacing reads the same.
- **Don't extract `<StepShell>`**: tempting to wrap header + body + footer in a `<StepShell>` component that takes children. Don't — it's one consumer (this file) and the shell varies per step (q1 has no back, freetext has no dots, freetext's footer button is `type="submit"` while others are `type="button"`). Keeping it inline avoids a component whose props grow with every divergence.
- **Don't lift `Step` into `shared/types.ts`**: no cross-boundary consumer. Local type alias inside `Questions.tsx`.
- **Don't memoise `stepOrder` with `useMemo`**: it's a 3- or 4-element literal recomputed each render — sub-microsecond. The memo bookkeeping costs more.
- **Don't add `useEffect` to scroll-to-top on step change**: 390px design width with short per-step bodies; no scrolling expected. If a future step grows long, add then.
- **No new keyboard shortcuts**: no Esc to back, no Enter on Q1 pills to advance. Pressing Enter on a focused pill inside the form would, by default, find the next form submit button — but our q1/q2/q3 step has no `type="submit"` button, so Enter is a no-op there. On the freetext step, Enter inside the textarea inserts a newline (textareas don't submit forms on Enter). This is the intended UX; no extra `onKeyDown` plumbing.
- **No tests in this item** — added via `/test-feature 12-state-machine` after implementation.
- **No security / quality review in this item** — run via `/code-review-feature 12-state-machine` after implementation.

## Rules for implementation

- TypeScript strict; no `any` unless justified inline.
- Zod for any new shape that crosses the network boundary — **none in this item** (`freetext` already validated by the existing `RecommendAnswersSchema`).
- Tailwind utility classes only; tokens come from `tailwind.config.ts` (Item 02). No new tokens needed.
- No inline `style={{...}}` for color/spacing. `w-24`-style arbitrary-value utilities are fine; raw `style={{ color: '#FC8019' }}` is not.
- Mobile web only, 390px design width, 44px minimum tap targets — applies to the Back button, every Next button, the Find-my-meal CTA, and (implicitly) the textarea.
- Reuse types from `shared/` — `RecommendAnswers` already carries `freetext?: string`. Do not redefine FE-side.
- `ensureProfile()` and `saveProfile()` remain the only entry points to the profile from `Questions.tsx`. Don't read or write `localStorage` directly anywhere outside `frontend/src/lib/profile.ts`.
- No new npm dependencies. No router. No state-chart library. No icon library.
- No new shared types. The wire contract is unchanged.
- The `<Pill>` primitive is reused; no API change. `<ProgressDots>` is the only new component.
- Prompt caching is unchanged — this item does not touch `backend/src/prompt.ts` or `backend/src/anthropic.ts`.
- No tests in this item — written and run via `/test-feature 12-state-machine`.
- No security / quality review in this item — run via `/code-review-feature 12-state-machine`.

## Verification

- `npm run typecheck` passes across all workspaces. Specifically: `Step` is the only new local type; `ProgressDots`' props compile; `Questions.tsx` still satisfies its existing imports.
- `npm run dev` boots both servers without errors. `http://localhost:5173` loads with no console errors.
- **First-load UX (390×844 viewport, fresh `localStorage`)** — open DevTools mobile view, clear localStorage, reload. The page renders the Q1 step only: header row shows three dots (first dot filled with a ring, other two greyed), no Back button, the Q1 heading "How hungry are you?" + the three pills, and a disabled `Next` CTA at the bottom. **Q2 and Q3 sections are not visible on screen.**
- **Q1 selection enables Next** — tap "Light snack". The Next button enables. Tap "Very hungry"; selection swaps; Next remains enabled.
- **Q1 → Q2 advance** — with a Q1 selection, tap Next. The header row's first dot stays filled (visited), the second dot now carries the active ring, the third dot is greyed. A Back button appears in the left header slot. The Q2 heading + pill row appears in the body. **Q1 section is not visible.**
- **Q2 → Q3 advance** — leave Q2 unselected (or pick one — either is valid). Tap Next. Header shows all three dots filled, third dot active-ringed. Back button still present. Q3 chips + (if `budget`) party-size stepper appear in the body. **Q1 and Q2 sections are not visible.**
- **Q3 → freetext advance** — leave Q3 unselected (or pick chips). Tap Next. Header now shows **only** the Back button (no progress dots), the freetext heading + helper text + textarea. Footer button now reads "Find my meal", disabled if Q1 was somehow cleared, otherwise enabled.
- **Back navigation preserves answers** — on freetext step, type "extra spicy please" into the textarea. Tap Back. You land on the Q3 step; previously-selected chips (if any) are still selected; party-size stepper (if `budget` was selected) still shows the user's value. Tap Back. You land on the Q2 step; previously-selected meal type (if any) is still selected. Tap Back. You land on the Q1 step; previously-selected hunger is still selected. Tap Next three times to return to freetext; the textarea still contains "extra spicy please".
- **Q3 skip-collapse adapts the machine** — open DevTools → Application → localStorage → `nudge.profile.v1` → set `q3SkipCount` to `3`. Reload. Q1 step now shows **two** dots (not three). Advance through Q1 → Q2; tap Next from Q2; you land **directly on freetext** (not Q3). Tap Back from freetext; you land on Q2. The Q3 step is not reachable in this flow.
- **Veg auto-select still applies** — set `dietaryPattern` to `"veg"` in localStorage and reload. Advance Q1 → Q2 → Q3. The `veg-only` chip is already selected on first arrival at Q3.
- **Submit from freetext** — with `ANTHROPIC_API_KEY` set (or `USE_STUB_RECOMMEND=true`), select Q1=`regular-meal`, advance through Q2 and Q3 making any selections, type "comfort food after a long day" in freetext, tap Find my meal. The mid-section becomes the centred spinner; the header row + footer button disappear. Within ~1s (stub) or ~5–10s (real), the success block renders the single dish card from Item 10.
- **Submit body shape** — open Network tab on submit. Request payload contains `answers.q1`, optionally `answers.q2` / `answers.q3` / `answers.partySize` per Item 11 rules, and `answers.freetext === "comfort food after a long day"`. No `freetext: ""` if the textarea was left blank — verify in raw JSON.
- **Freetext omitted when empty** — clear the textarea, submit. Network payload's `answers` object has **no** `freetext` field.
- **Freetext whitespace-only is omitted** — type "   " (only spaces). Submit. Network payload's `answers` object has **no** `freetext` field.
- **Freetext maxLength enforced** — paste a 2500-character string into the textarea. The textarea accepts only 2000 characters. Submit; BE accepts the request (no validation error).
- **Submit + error → Try again returns to freetext** — kill the backend, submit. The error block renders with the envelope message and a `Try again` button. Tap Try again. You land on the freetext step (textarea still populated). Header shows the Back button (no dots, since freetext step suppresses dots). Submit button reads "Find my meal" again.
- **Skip-count increments on submit with empty Q3** — fresh profile (`q3SkipCount: 0`). Advance Q1 → Q2 → Q3 without selecting any Q3 chip → freetext → submit. After response renders, check `q3SkipCount` in localStorage — now `1`.
- **Skip-count does NOT increment when Q3 was selected** — fresh profile. Advance through Q3 with a chip selected → freetext → submit. Confirm `q3SkipCount` did not change.
- **Skip-count guard one-shot still holds** — fresh profile, kill BE, advance through (empty Q3) → freetext → submit. `q3SkipCount` becomes `1`. Tap Try again, submit again with no changes. `q3SkipCount` is still `1`.
- **Skip-count threshold hides Q3 next session** — once `q3SkipCount === 3`, reload. The flow now shows two dots and skips the Q3 step entirely.
- **Q1 disabled-Next can't be bypassed via Enter** — on Q1 step with no hunger selected, focus a Q1 pill, press Enter. Nothing happens (no submit, no advance). Press arrow keys; selection moves within Q1. Press Enter after selecting; still nothing happens (Q1's Next is `type="button"`). Tap Next manually to advance.
- **Pressing Enter inside the freetext textarea inserts a newline** — does not submit the form. Submit requires tapping the CTA.
- **Tab order is sensible** — from Q2 step: Tab from the header lands on Back, next Tab on a Q2 pill, then through pills (radio-group constrains arrow-key movement, but Tab still passes through), then onto Next. No focus jumps to hidden Q1 / Q3 / freetext elements.
- **No hardcoded hex** — `grep -rE "#[0-9A-Fa-f]{3,6}" frontend/src --include="*.tsx" --include="*.ts" | grep -v tailwind.config.ts | grep -v profile.ts` returns nothing new.
- **44px tap-target spot-check** — Back button, every Next button, the Find-my-meal CTA, every pill, every chip, both stepper `+/-` buttons — all measure ≥44×44 px in DevTools.
- **No regressions in Item 11 verification** — the Item 11 spec's tests for veg auto-select, party-size stepper bounds, party-size reset on `budget` deselect, party-size omission when `budget` is unset, and the Q3 skip-collapse all still pass when exercised through the new per-step flow.
- **`curl` direct hit unchanged** — the wire contract didn't change; the Item 11 `curl` example still returns 200 with `requestId` + `dishes[5]`.
- **Anthropic cache check** — cache_read hit rate on the static system prefix remains ≥80% (no change to prompt builder).

## Out of scope for this item

- Deterministic NL pre-fill of the freetext textarea ("Something comforting and filling, under ₹300") and the §4.3 override semantics — Item 13.
- The `buildIntentSummary(answers)` helper — Item 13 (used by both freetext pre-fill and the prompt builder per build-plan "Reusable utilities").
- 5-card render + bottom-sheet entry animation (`animate-sheet-up`) — Item 14. (Success state in Item 12 still renders one card via Item 10's component.)
- Loading skeletons (shimmer) — Item 15. (Loading state in Item 12 still uses Item 08's centred spinner.)
- "Same dish elsewhere" inline expand — Item 16.
- Health nudge surface inside the card — Item 17.
- "Not quite" refinement loop and the 2-iteration cap — Item 18.
- Bottom navigation, My Orders tab, home entry point — Items 19–21.
- Polished error / empty states (MCP failure copy, Anthropic timeout, geolocation denied copy) — Item 22.
- React Router or any URL-routing layer.
- Browser back-button integration (hardware/keyboard back navigating between steps).
- Persistence of in-progress answers across page reload.
- Step-to-step transition animations (fade / slide).
- Per-step subcomponent files (Q1Step.tsx, Q2Step.tsx, etc.) — kept inline in `Questions.tsx`.
- A `useQuestionFlow()` custom hook or any state-chart library (`xstate`).
- A `<StepShell>` wrapper component.
- A `<Button>` primitive for the Back / Next / Submit footer buttons (defer to a real second-caller item).
- Inline validation messages per step (Q1 only requires hunger; the disabled CTA conveys the requirement sufficiently).
- Scroll-to-top on step change.
- Analytics / telemetry on step advancement.
- Tests — `/test-feature 12-state-machine`.
- Security / quality review — `/code-review-feature 12-state-machine`.

## Open questions

- **Progress-dot visual design** — the spec at `nudge_spec.docx` §6.4 / §4.4 may name a "step progress" component with specific dot size, colour, or animation. The proposed `h-2 w-2 bg-primary / bg-border + ring-2 ring-primary ring-offset-2 on active` is a working default; confirm during plan review.
- **Dot count when Q3 is skip-collapsed** — proposal is 2 dots. Alternative would be 3 dots with the middle one greyed-and-skipped or 3 dots that auto-advance past the middle. Confirm against §4.4 / §6.4.
- **Freetext step heading + helper copy** — working assumptions are "Anything specific?" + "Add cravings, constraints, or anything else worth knowing. Optional." Item 13 will finalise these as part of the pre-fill behaviour; locking copy here in Item 12 risks duplicate work.
- **Back button visual style** — text-only `← Back` is the minimum-viable choice. Spec §6.2 may name an icon-button token; confirm during plan review. A plain text button avoids pulling in an icon library for one glyph.
- **Step transition animation** — confirm whether spec §6.5 calls for a fade or slide between steps. Working default is no animation. If §6.5 names a step-transition motion, lift the existing `fade-in` keyframe (already in `tailwind.config.ts`) onto each step body with `animate-fade-in` — one-line change, deferred until confirmed.
- **Browser back / hardware back** — out of scope per Tech choices, but the question deserves a one-line decision: does the spec expect Android hardware back to step backwards through the flow? If yes, we'll need either a router or a manual `history.pushState` / `popstate` plumbing in a future item.
- **Submit from Q1 / Q2 / Q3 by pressing Enter on a pill** — currently disabled because those steps' footer button is `type="button"`. Confirm this matches the desired UX (a user who fills Q1 and impatiently hits Enter doesn't accidentally submit).
- **Header layout balance** — the proposal flanks the centred progress dots with two `w-24` siblings (Back slot + mirror spacer) to keep the dots optically centred regardless of Back visibility. If §6.4 names a header-bar component with different proportions, adjust there.
---
