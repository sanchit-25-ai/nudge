---
# Spec — Item 09: Passive-Context Collector

**Phase**: A (Vertical slice) · **Status**: Draft, awaiting approval

## Goal

Replace the Item-08 stub `buildPassiveContext` with the real passive-context derivation that the recommend prompt depends on. Today the function returns the seeded persona's `profile.location` verbatim and a literal "Recent orders: <last 3 dish names>" blurb. After this item, `passiveContext` carries:

- A genuinely-current ISO timestamp (unchanged, already correct in Item 08).
- A **browser-geolocated** `Location` when the user grants permission, with a Mumbai fallback when permission is denied, unavailable, or times out.
- A richer `historySummary` blurb that surfaces the day-of-week, time-of-day, top cuisine, and recency signals the prompt (Item 06) already expects, in addition to the recent-dish list.

This is the last Phase A item that improves *what we send to the model*. Item 10 closes the slice on what we *render back*. After Items 09 and 10 land, the Phase A exit criteria are met: open app → answer Q1 → see one real Swiggy dish card returned via a request that carries real time, real location, and real history signals.

The function signature stays callable from `Questions.tsx` with a one-character change (`await`) — see Tech choices.

## Depends on

- Item 03 — Seed User Profile (`UserProfile`, `MUMBAI_NON_VEG_PERSONA`, the seeded `location` and `orderHistory` are still the inputs to history summarisation; the Mumbai-fallback `Location` used when geolocation fails is derived from the same shape).
- Item 04 — `/api/recommend` Skeleton (`PassiveContextSchema` is the wire contract this item satisfies — `time: z.string().datetime()`, `location: LocationSchema`, `historySummary: z.string().max(2000)`. No schema change in this item.).
- Item 08 — Single-Question Screen (introduced `frontend/src/lib/passiveContext.ts` as a stub with a contractual signature; this item replaces the body and slightly evolves the signature to `Promise<PassiveContext>`).

No backend dependency — the wire contract is locked. No `shared/types.ts` change.

## Deliverables

- `frontend/src/lib/passiveContext.ts` — **modified**. Replace the stub body with:
  - `buildPassiveContext(profile: UserProfile): Promise<PassiveContext>` — signature evolves from sync to async because geolocation is Promise-shaped. The only caller (`Questions.tsx`) gains one `await`.
  - Internally calls a new `getBrowserLocation(profile)` helper that wraps `navigator.geolocation.getCurrentPosition` with a timeout and an explicit fallback to `profile.location` (the seeded Mumbai persona's location). Permission-denied, position-unavailable, timeout, and "geolocation unsupported" all fall back to the same `profile.location` — no try/catch boilerplate at the call site.
  - Internally calls a new `buildHistorySummary(profile, now)` helper that returns the enriched blurb (see Implementation notes for shape).
  - `time = new Date().toISOString()` — unchanged from the stub.
- `frontend/src/lib/passiveContext.ts` exports (in addition to `buildPassiveContext`):
  - `getBrowserLocation(profile: UserProfile): Promise<Location>` — exported so it can be unit-tested in isolation and so a future "request permission early on mount" optimisation (out of scope here) can call it independently.
  - `buildHistorySummary(profile: UserProfile, now: Date): string` — exported so it can be unit-tested deterministically by passing a fixed `now`.
  - `GEO_TIMEOUT_MS` — exported number constant so tests can reference the same value rather than hard-coding it.
- `frontend/src/screens/Questions.tsx` — **modified**. Single line change: `passiveContext: await buildPassiveContext(profile)` in the submit handler. The submit handler is already `async`; the loading spinner already covers the brief geolocation delay; no other changes.
- `frontend/src/lib/passiveContext.test.ts` — **NOT TOUCHED in this item**. Tests are rewritten via `/test-feature 09-passive-context-collector` after implementation. The existing Item-08 tests will fail until that command runs; that's expected and gates the test-feature workflow.

That's the scope. No backend changes. No `shared/types.ts` changes. No new dependencies. No new `lib/` modules — the geolocation and history-summary helpers live next to `buildPassiveContext` in the same file because they share its inputs and are not consumed anywhere else in V1.

## File tree after this item ships

```
nudge/
├── frontend/
│   └── src/
│       ├── lib/
│       │   └── passiveContext.ts          # modified — real geolocation + Mumbai fallback + enriched historySummary; now async
│       └── screens/
│           └── Questions.tsx              # modified — single line: `await buildPassiveContext(profile)`
```

## Tech choices (locked)

| Decision | Choice | Reason |
|---|---|---|
| **Geolocation API** | Native `navigator.geolocation.getCurrentPosition` wrapped in a `Promise` | Built into every modern browser. No dep, no polyfill. The HTML5 Geolocation API is the only browser-side option for lat/lng without a third-party service. |
| **Permission strategy** | Just-in-time on submit (inside `buildPassiveContext`) | App mount happens before the user has expressed intent; asking on mount surfaces a permission prompt the user can't connect to anything. Asking on submit ties the prompt to a clear user action ("Find my meal"). The brief delay is covered by the existing Item-08 loading spinner. Item 21 (home entry point) may revisit this to ask at a friendlier moment, but Item 09 keeps it simple. |
| **Timeout for geolocation** | 4000 ms (`GEO_TIMEOUT_MS = 4000`) | The full `/api/recommend` round-trip is ~5–10s. A geolocation hang beyond ~4s means the user is on a flaky GPS lock or has a slow/stalled OS-level prompt; falling back to Mumbai keeps total submit latency bounded. Browsers honour the `timeout` option natively. |
| **Cached position acceptance** | `maximumAge: 5 * 60 * 1000` (5 min) | Repeated submits in the same session shouldn't re-prompt or re-acquire GPS. 5 min is a reasonable freshness window for "where am I right now" — Swiggy delivery zones don't change at sub-5-minute granularity. |
| **High-accuracy mode** | `enableHighAccuracy: false` | A delivery address-level precision (~city/area level) is enough for the prompt's location signal. High-accuracy mode burns battery and adds latency for no V1 benefit. |
| **Fallback location** | `profile.location` (seeded Mumbai persona for V1) | The build plan says "Mumbai fallback"; the seeded persona's `profile.location` *is* the Mumbai fallback today (`{ lat: 19.076, lng: 72.877, label: "Mumbai" }`). Reading from `profile.location` rather than hard-coding constants keeps the fallback in lockstep with the persona Item 20 will eventually let the user swap. |
| **Reverse geocoding** | None — `label` set to `"Current location"` when geolocation succeeds; the seeded persona's label (`"Mumbai"`) is used on fallback | Reverse geocoding requires a paid API or a third-party service. The model only needs lat/lng for ranking proximity-style signals; the human-readable label is not load-bearing for V1. Item 22 / 23 may revisit if the UI starts surfacing the resolved location to the user. |
| **`buildPassiveContext` signature** | `(profile: UserProfile) => Promise<PassiveContext>` (was `=> PassiveContext`) | Geolocation is asynchronous. Awaiting it on submit is one character (`await`); the alternative is a separate "pre-fetch on mount + cache" path that adds state and a race condition we don't need. Item 08's "signature is contractual" note specifically anticipated this — the call site (Questions.tsx) is already in an `async` submit handler. |
| **Time-of-day buckets** | `"morning" \| "midday" \| "afternoon" \| "evening" \| "night"` derived from `now.getHours()`: 5–10 morning, 11–13 midday, 14–16 afternoon, 17–21 evening, else night | Discrete buckets are easier for the model to use as a ranking signal than a raw hour. Boundaries are conservative and informed by typical Indian meal patterns (lunch peak 12–13, dinner peak 19–21). Locale-naïve — JS's `getHours()` uses the device's local time, which is what we want. |
| **Day-of-week derivation** | `new Date().toLocaleDateString('en-US', { weekday: 'long' })` | One-liner, no library, deterministic on a fixed `now`. Capitalised English weekday name reads cleanly inside the prompt blurb. The recommend prompt is English-only in V1. |
| **Cuisine frequency** | Top 1 cuisine by count from `profile.orderHistory.cuisineCategory`; ties broken by most-recent-order order | One cuisine is enough signal — "User most frequently orders Biryani" gives the model a clear nudge without crowding the blurb. If there are ties, recency wins, which matches user intuition. |
| **Recency phrasing** | Days since `profile.lastOrderedAt` using `Math.floor((now - lastOrdered) / ms_per_day)`. Buckets: 0 → "today", 1 → "yesterday", 2–6 → "<n> days ago", 7+ → "<n> days ago" (no week/month rollup for V1) | Plain English buckets render cleanly in the prompt. No `date-fns` dep needed for three branches. |
| **Empty `orderHistory` handling** | `historySummary` becomes the day/time blurb only, no recent-orders fragment, no top-cuisine fragment. Schema permits empty string but we still send the day/time signal because it's always derivable. | Item 08's stub returned `""` for empty history. After Item 09, the day/time blurb is always present even with no history — that's a strict improvement, not a regression. |
| **`historySummary` length cap** | Soft cap by construction (≤ ~300 chars in practice); the wire schema cap is 2000 chars (`PassiveContextSchema.historySummary.max(2000)`) | The blurb is short by design; no need for explicit truncation logic. If a future profile carries unusually long cuisine names, the schema cap is the safety net. |
| **Geolocation in tests** | `vi.stubGlobal('navigator', { geolocation: { ... } })` + injecting a fake `getCurrentPosition`. Time is injected via the `now: Date` param on `buildHistorySummary` so unit tests don't need `vi.useFakeTimers()` for the deterministic part | Keeps the production code free of test-only branches. The deterministic `now` param is also useful for future "what would the prompt look like at 9pm on a Friday?" debugging. |
| **No new module for geolocation** | Keep `getBrowserLocation` inside `passiveContext.ts`, not a separate `lib/geolocation.ts` | The only caller is `buildPassiveContext`. Splitting it now is premature abstraction. Move out when a second caller appears (likely never in V1). |

## Implementation notes

- **`getBrowserLocation` skeleton**:
  ```ts
  export const GEO_TIMEOUT_MS = 4000;

  export function getBrowserLocation(profile: UserProfile): Promise<Location> {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return Promise.resolve(profile.location);
    }
    return new Promise<Location>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            label: "Current location",
          }),
        () => resolve(profile.location),
        {
          timeout: GEO_TIMEOUT_MS,
          maximumAge: 5 * 60 * 1000,
          enableHighAccuracy: false,
        },
      );
    });
  }
  ```
  The `Promise` resolves either way — `reject` is converted to a fallback `resolve`. The caller (`buildPassiveContext`) never sees an error from this helper, so it doesn't need a try/catch. This keeps the submit handler clean and removes a class of "what if geolocation throws" bugs.

- **`buildHistorySummary` skeleton**:
  ```ts
  export function buildHistorySummary(profile: UserProfile, now: Date): string {
    const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
    const bucket = timeOfDayBucket(now.getHours());
    const parts: string[] = [`It is ${weekday} ${bucket}.`];

    if (profile.orderHistory.length > 0) {
      const top = topCuisine(profile.orderHistory);
      if (top) parts.push(`User most frequently orders ${top}.`);

      const recentNames = profile.orderHistory.slice(0, 3).map((o) => o.dishName).join(", ");
      parts.push(`Recent orders: ${recentNames}.`);

      const recency = daysSince(profile.lastOrderedAt, now);
      if (recency !== null) parts.push(`Last ordered ${recency}.`);
    }

    return parts.join(" ");
  }
  ```
  Helpers `timeOfDayBucket`, `topCuisine`, `daysSince` are file-private (not exported). All pure functions, all unit-testable through `buildHistorySummary`.

- **`buildPassiveContext` final shape**:
  ```ts
  export async function buildPassiveContext(profile: UserProfile): Promise<PassiveContext> {
    const now = new Date();
    const location = await getBrowserLocation(profile);
    return {
      time: now.toISOString(),
      location,
      historySummary: buildHistorySummary(profile, now),
    };
  }
  ```
  One `await`, deterministic time captured once at entry so `time` and `historySummary.weekday` can never disagree across a clock tick.

- **`Questions.tsx` change**:
  ```ts
  const req: RecommendRequest = {
    answers: { q1: hunger },
    passiveContext: await buildPassiveContext(profile),  // ← was: buildPassiveContext(profile)
    profileSignal: buildProfileSignal(profile),
  };
  ```
  No other line in `Questions.tsx` changes.

- **`timeOfDayBucket(hour)` boundaries**: `hour >= 5 && hour <= 10 → "morning"`, `11..13 → "midday"`, `14..16 → "afternoon"`, `17..21 → "evening"`, else `"night"`. Inclusive boundaries, no off-by-one in either direction. The function is a pure switch on a number — keep it that way (no `Intl.DateTimeFormat` magic).

- **`topCuisine(history)` algorithm**: single pass through `history`, increment a `Map<string, { count, lastIndex }>` keyed by `cuisineCategory`. Pick the entry with max `count`; on ties, pick the one whose `lastIndex` is smallest (most recent in the array — assuming history is most-recent-first, which the seeded persona is). Return `null` if `history.length === 0`. Return type is `string | null` so the caller's `if (top)` guard is honest.

- **`daysSince(lastOrderedAt, now)` algorithm**: parse `lastOrderedAt` (`YYYY-MM-DD`) as a local-day `Date` via `new Date(yyyy + "-" + mm + "-" + dd + "T00:00:00")` (avoid `new Date("YYYY-MM-DD")` which is parsed as UTC and can flip dates near midnight). Compute `Math.floor((now.setHours(0,0,0,0) - lastOrdered.getTime()) / 86_400_000)`. Map `0 → "today"`, `1 → "yesterday"`, `n > 1 → "${n} days ago"`. Return `null` for invalid input (no `lastOrderedAt`, or unparseable). The seeded persona always has a valid `lastOrderedAt`, so this is defensive only.

- **No call to `getBrowserLocation` on app mount.** Item 09 is just-in-time on submit. Pre-fetching on mount is a separate decision that affects UX (permission prompt timing) and code structure (where the cached position lives); revisit in Item 21 if needed.

- **No `console.log` of the resolved location.** Don't even add a temporary one — coordinates are PII. The Network tab shows the request body if debugging is needed.

- **No analytics, no telemetry.** Standing rule. V1 is personal-use; Item 22 / 23 own anything observability-shaped.

- **`navigator.geolocation` permission state is sticky per origin.** Once granted (or denied) the browser remembers it. The dev server runs on `http://localhost:5173`, so a first-grant during testing persists for subsequent reloads. To test the fallback path, use the browser's "Site settings" to reset permission for `localhost` between runs, OR set DevTools → Sensors → Location → "Location unavailable" (Chrome).

- **`navigator.geolocation` requires a secure context.** `localhost` counts as secure in all major browsers, so dev is fine. Production deploy (Item 23) lives over HTTPS, so this is fine for prod too.

- **Don't refactor `Questions.tsx` beyond the one-line `await`.** Item 11 / 12 own the multi-question state machine; Item 09 is a passive-context-only change.

- **Don't add a new shared type for `TimeOfDay`.** The bucket strings are private to `passiveContext.ts` and only ever appear inside `historySummary`. Exposing them in `shared/types.ts` invites coupling that V1 doesn't need.

- **`historySummary` is sent verbatim into the prompt** (Item 06's `buildDynamicUserContextBlock` concatenates it). The blurb's prose style is intentional — the model reads it as English, not as structured data. Don't try to encode it as JSON or key-value pairs.

- **Empty-history blurb example**: a profile with `orderHistory: []` on a Friday at 7pm yields `historySummary = "It is Friday evening."` — that's it. Still a valid `PassiveContext` per the schema (empty `historySummary` was already valid; this is strictly more signal).

- **Mumbai-fallback blurb example**: same Friday-evening profile with all defaults, geolocation denied → `time` is current ISO, `location` is the seeded Mumbai coords, `historySummary` is `"It is Friday evening. User most frequently orders Biryani. Recent orders: Chicken Biryani, Butter Chicken, Hakka Noodles. Last ordered N days ago."` — exactly what the model gets.

## Rules for implementation

- TypeScript strict; no `any` unless justified inline. `navigator.geolocation` and `GeolocationPosition` are already in the standard DOM lib types.
- Zod for any shape crossing the network — n/a in this item (the wire contract is unchanged and lives on the BE). The Item-08 FE shape-check on the response is unchanged.
- Tailwind utility classes only; tokens from `tailwind.config.ts` — n/a in this item (no UI changes).
- Mobile web only, 390px design width, 44px minimum tap targets — n/a in this item (no UI changes).
- Reuse types from `shared/`: `UserProfile`, `Location`, `PassiveContext`. Don't redefine FE-side.
- Backend secrets via `process.env` only — n/a (FE-only item).
- No new npm dependencies. `navigator.geolocation` is native; `toLocaleDateString` is native.
- No `console.log` of location coordinates, history details, or any field of the resolved `PassiveContext`. PII discipline.
- Geolocation failures are non-events — fall back silently to `profile.location`. No toast, no banner, no error UI. The recommend submit must succeed regardless of geolocation state.
- The geolocation prompt is the browser's, not ours. Don't render a custom "We'd like your location" banner in this item.
- Don't pre-fetch geolocation on app mount. Just-in-time inside `buildPassiveContext`.
- Don't read `profile.lastOrderedAt` for any purpose other than the recency blurb in this item.
- No tests in this item. Tests are written via `/test-feature 09-passive-context-collector` after implementation, against the spec — not by reading the implementation.

## Verification

- `npm run typecheck` passes across all workspaces. (The signature change to `buildPassiveContext` and the one-line `await` in `Questions.tsx` must both typecheck cleanly; if a third caller has appeared since the spec was written, it will fail to compile here — fix it before commit.)
- `npm run dev` boots both servers without errors. `http://localhost:5173` loads with no console errors.

- **First-load (geolocation granted)** — open DevTools mobile view (390×844), reload, click "Find my meal". The browser prompts for location permission; allow it. Network tab shows one `POST /api/recommend` with a request body where `passiveContext.location` carries real lat/lng (not the seeded Mumbai 19.076/72.877 unless you're literally in Mumbai), `passiveContext.location.label` is the string `"Current location"`, `passiveContext.time` is a fresh ISO string within the last second, and `passiveContext.historySummary` starts with `"It is <Weekday> <bucket>."` followed by `"User most frequently orders "`, `"Recent orders: "`, and `"Last ordered "` fragments.

- **First-load (geolocation denied)** — reset site permissions for `localhost` (Chrome → site settings → Reset), reload, click "Find my meal" and *deny* the prompt. Network tab shows the request body with `passiveContext.location = { lat: 19.076, lng: 72.877, label: "Mumbai" }` (the seeded persona's location). `historySummary` and `time` are unchanged from the granted case.

- **Geolocation timeout fallback** — Chrome DevTools → Sensors → Location → "Location unavailable". Reload, click "Find my meal". After ~4s the request fires with `passiveContext.location` matching the Mumbai fallback. Total submit-to-spinner-to-response time should still feel responsive (≤ ~10s) because the geolocation timeout caps at `GEO_TIMEOUT_MS = 4000`.

- **`historySummary` shape (Mumbai persona, current time)** — inspect the request body's `passiveContext.historySummary`. It must:
  - Start with `"It is "` followed by a capitalised English weekday name (e.g. `"Saturday"`).
  - Contain one of the five bucket strings (`"morning" | "midday" | "afternoon" | "evening" | "night"`) appropriate for the local hour.
  - Contain `"User most frequently orders Biryani."` (the seeded persona's top cuisine).
  - Contain `"Recent orders: Chicken Biryani, Butter Chicken, Hakka Noodles."`.
  - Contain `"Last ordered "` followed by `"today"`, `"yesterday"`, or `"<n> days ago"` depending on the gap to `2026-04-28`.
  - Be a single line, no newlines, total length ≤ 300 chars.

- **`historySummary` empty-history path** — in DevTools console:
  ```js
  const p = JSON.parse(localStorage['nudge.profile.v1']);
  p.orderHistory = [];
  localStorage['nudge.profile.v1'] = JSON.stringify(p);
  ```
  Reload, submit. `historySummary` is just `"It is <Weekday> <bucket>."` — no "Recent orders", no "User most frequently", no "Last ordered". Reset profile via the dev button afterwards.

- **No duplicate geolocation prompts on repeat submits** — with permission already granted, submit twice in quick succession. The second submit must NOT show a new permission prompt and should resolve location in <100 ms (cache hit via `maximumAge: 5min`).

- **Submit-while-loading guard still works** — the Item-08 disabled-CTA-during-loading behaviour is unchanged by this item. Verify with DevTools network throttled to "Slow 3G" that repeated CTA taps don't fire repeated requests.

- **`/api/recommend` still validates the request** — temporarily edit `Questions.tsx` to send a malformed `passiveContext.time` (e.g. `"not-a-date"`) and submit. Backend returns 400 with `code: "validation_error"` pointing to `passiveContext.time`. Revert before commit.

- **No hardcoded coordinates in `passiveContext.ts`** — `grep -n "19\.0\|72\.8" frontend/src/lib/passiveContext.ts` returns no matches. The Mumbai fallback comes from `profile.location`, not from a hardcoded constant in this file.

- **No coordinates in console** — open DevTools → Console; complete a full submit. No log line contains `latitude`, `longitude`, `lat:`, or `lng:`.

- **Existing Item-08 tests are expected to fail** — `npm --workspace frontend test passiveContext` will fail until `/test-feature 09-passive-context-collector` rewrites them. That's the workflow; do not edit the test file in this item.

- **`/api/health` still works** — `curl http://localhost:3001/api/health` returns `{"status":"ok"}`.

- **Anthropic cache-hit rate unaffected** — confirm in the Anthropic console that the second submit's cache-hit rate on the static system-prompt prefix remains ≥80%. (The dynamic context block is the only thing this item changes, and that block is the part that's *not* cached. The static prefix is untouched.)

## Out of scope for this item

- Pre-fetching geolocation on app mount (out of scope; revisit in Item 21 if a friendlier permission moment exists at the home entry point).
- Reverse-geocoding lat/lng into a city/area label — the `"Current location"` placeholder is enough for V1; the model uses lat/lng for proximity-style signals, not the label.
- A custom in-app "We'd like your location" banner / explainer — the browser's native prompt is the V1 UX.
- A toast / banner / error UI when geolocation fails — fallback is silent by design.
- The `time-of-day buckets` becoming user-localised beyond JS's local-time defaults (Item 23 may consider this if we ever ship outside India).
- A `<PassiveContextProvider>` React context or any cross-screen sharing of the resolved location — Item 16 / 18 / 21 may want this when refinement flows land; not earlier.
- Backend-side derivation of any passive signal — V1 keeps derivation on the FE so the BE stays a thin proxy. Item 06's prompt builder consumes `historySummary` as-is.
- Tests — written and run via `/test-feature 09-passive-context-collector` after implementation.
- Security / quality review — run via `/code-review-feature 09-passive-context-collector` after implementation.
- A shared `<Pill>` / `<Button>` primitive — still deferred to Item 11.
- Q2 / Q3 / freetext / multi-question state machine — Items 11 / 12 / 13.
- 5-card render, bottom-sheet animation, loading skeletons — Items 14 / 15.
- Single dish card render (closes the Phase A slice after Item 09) — Item 10.

## Open questions

- **`label` when geolocation succeeds**: working choice is the literal string `"Current location"`. If a later UI surface (Item 16 "Same dish elsewhere"?) ever surfaces the resolved label to the user, we'll want a real reverse-geocoded city/area name. For Item 09, `"Current location"` is enough — confirm during plan review.
- **Time-of-day bucket boundaries**: working choice is `5–10 morning / 11–13 midday / 14–16 afternoon / 17–21 evening / else night`. If you'd prefer simpler 4-way (`morning / afternoon / evening / night`) or longer evening bucket (e.g. `17–22`), call it before implementation — the buckets are downstream of `historySummary` so a change is two-line.
- **Tie-breaking on `topCuisine`**: working choice is "most-recent order wins". Alternative is "alphabetical" for determinism in tests; alphabetical is uglier in product. Calling out so a future test snapshot doesn't get surprised.
- **Should `historySummary` mention `avgOrderValue`?** Currently lives in `profileSignal`, so the model already sees it via that channel. Duplicating it in the prose blurb feels redundant — leaving it out. Confirm during plan review.
---
