---
# Spec — Item 10: Single Dish Card Render

**Phase**: A (Vertical slice) · **Status**: Draft, awaiting approval

## Goal

Close the Phase A vertical slice. Today the `Questions.tsx` success state renders `Received N dishes.` plus a raw `<pre>` JSON dump (Item 08's placeholder). After this item, the success state renders **just the first dish** in the response as a real Swiggy-styled card with the full §6.4 anatomy — image, dish name, restaurant name, filled rating dot, ETA, price — and tapping the card opens the restaurant's Swiggy page in a new tab. The card pulls fields directly off `dishes[0]` from `RecommendResponse`; no new API call.

After Item 10 lands, the Phase A exit criteria are met: open the app → answer Q1 → see one real Swiggy dish card returned via Sonnet 4.6 + Swiggy MCP → tap → land on Swiggy. Items 11+ start replacing single-card with the full multi-question flow and 5-card list, but this item ships a complete end-to-end demo with one real card.

This is the first item that consumes the §6.4 card anatomy. The §6.2 design tokens Item 02 shipped (`primary`, `surface.warm`, `text.primary`, `text.secondary`, `border`, `rounded-card`, `rating`, `2xs` font, `22.5` square image spacing) are all consumed for real here.

## Depends on

- Item 02 — Minimal Design Tokens (`rounded-card`, `border`, `rating`, `text-2xs`, `w-22.5`/`h-22.5`, `text.primary`/`text.secondary`, `surface.warm`, font stack — all consumed by the card).
- Item 04 — `/api/recommend` Skeleton (`Dish` / `Restaurant` types in `shared/types.ts`; `RecommendResponseSchema` validated this shape on the BE so the FE renders against trusted fields).
- Item 05 — Anthropic + Swiggy MCP Wiring (success path returns model-derived `dishes[]` with real Swiggy URLs in `restaurant.swiggyUrl` — Item 10 is the first surface that uses that URL).
- Item 07 — Response Parser + Validator (the FE only ever sees responses that have already passed `DishSchema`; Item 10 doesn't need defensive re-validation).
- Item 08 — Single-Question Screen (`Questions.tsx` is the host; the success-state JSX is the only block this item replaces).

Items 06 and 09 are implicit upstreams (prompt builder + passive context) but no FE-visible contract changes from them.

## Deliverables

- `frontend/src/components/DishCard.tsx` — **new**. Leaf component, no state, no effects:
  - Props: `{ dish: Dish }`. Reads `dish.name`, `dish.imageUrl`, `dish.priceInr`, `dish.cuisineTags`, `dish.restaurant.{ name, rating, etaMinutes, swiggyUrl }`. Does **not** read `dish.healthNudge` (Item 17 owns that surface).
  - Renders an `<a>` element (not `<div>` with onClick) wrapping the whole card. `href={dish.restaurant.swiggyUrl}`, `target="_blank"`, `rel="noopener noreferrer"`. The browser handles tap → open natively; no JS click handler needed.
  - Anatomy (§6.4): 90×90 square image on the left, content block on the right with dish name (top, larger), restaurant name (smaller, muted), and a metadata row (filled rating dot · rating · ETA · price). Card shell: `bg-white`, `border-hairline border-border`, `rounded-card`, padding, a hairline border (no shadow in V1 unless §6.4 calls for one — confirm at implementation time).
  - Image: `<img>` with `alt={dish.name}`, `loading="lazy"`, `decoding="async"`. Object-fit cover, fixed 90×90 (`w-22.5 h-22.5` already in tokens), `rounded-card` corners on the image too.
  - Metadata row: dot (`bg-rating w-2 h-2 rounded-full`), then rating to 1 dp, then `·` separator, ETA in minutes (`{etaMinutes} min`), `·`, price (`₹{priceInr}`). All `text-2xs text-text-secondary` (the §6.2 metadata token). Round rating with `dish.restaurant.rating.toFixed(1)`. Price uses the literal `₹` rupee sign.
  - 44px minimum tap target — the whole `<a>` clears 44px tall by construction (90px image height + padding). Inside the card no nested links / clickable elements; one tap target per card per spec.
  - Render is purely from props. No async, no state, no `useEffect`. Stateless function component.
- `frontend/src/screens/Questions.tsx` — **modified**. Three small changes in the success branch:
  1. Replace `<p>Received {view.dishes.length} dishes.</p>` + the `<pre>` block with `<DishCard dish={view.dishes[0]} />`.
  2. Add a small `<p>` above the card with copy along the lines of "Here's what I'd order:" (final wording confirmed during plan review against §4.5 / §6.4 — see Open questions). `text-text-primary`, sensible margin to the card below.
  3. Add `import DishCard from "../components/DishCard";` to the top.

No other files change. No backend changes. No `shared/types.ts` changes. No new npm dependencies. No new lib/ modules.

That's the entire scope. Item 14 will replace the single-card render with the full 5-card list + bottom-sheet animation; Item 17 will add the conditional health-nudge surface inside the card; Item 16 will add the "Same dish elsewhere" panel below the card. All deferred — this item ships card-1 with no expansion affordances.

## File tree after this item ships

```
nudge/
├── frontend/
│   └── src/
│       ├── components/
│       │   └── DishCard.tsx                  # new — §6.4 card anatomy, tap → restaurant.swiggyUrl in new tab
│       └── screens/
│           └── Questions.tsx                 # modified — success state renders <DishCard dish={dishes[0]} /> instead of <pre> JSON
```

## Tech choices (locked)

| Decision | Choice | Reason |
|---|---|---|
| **Card click affordance** | Native `<a href target="_blank" rel="noopener noreferrer">` wrapping the entire card | One tap-target per card per §6.4. `<a>` is the right primitive: it gives free middle-click-to-open-in-new-tab, "Copy link" on long-press, the browser status-bar URL preview, and works without JS. A `<div onClick>` with `window.open` reinvents all of those and breaks for keyboard users. `rel="noopener"` is mandatory — without it the opened tab can `window.opener.location = ...`. `rel="noreferrer"` strips the Referer header so Swiggy can't trivially correlate our origin in their server logs (defence-in-depth; no real secret leaks, but free to add). |
| **Image element** | Plain `<img>` with `loading="lazy"`, `decoding="async"`, fixed `w-22.5 h-22.5 object-cover rounded-card`. No image-component library, no `srcSet`. | One image, ~90px on screen. `srcSet` / `next/image`-style optimisation is premature — V1 ships one card at a time, on a mobile-only target where 90px CSS = ~180–270px physical, well-covered by Swiggy's CDN-native sizing. `loading="lazy"` and `decoding="async"` are free. |
| **Image error handling** | None in this item. If `imageUrl` 404s, the browser shows its native broken-image affordance (with `alt={dish.name}` as fallback text). | The BE has already passed the URL through `z.string().url()`. A model response with a syntactically-valid but unreachable URL is an Item 22 ("error + empty states") concern, not a per-card concern. Adding a placeholder image now means choosing one — defer to Item 22. |
| **`<img>` `alt` text** | `alt={dish.name}` | The image's purpose is to *show the dish* — its meaning equals the dish name. Adding "Photo of " or similar is screen-reader noise. Empty alt would be wrong because the image carries non-decorative meaning. |
| **Rating display format** | `dish.restaurant.rating.toFixed(1)` (always 1 decimal place, e.g. `4.0`, `4.3`). | Spec §6.4 shows Swiggy-style ratings, which always render with one decimal. `4` reading as worse than `4.0` is a real UX bug; `toFixed(1)` fixes it for free. |
| **Rating dot** | Solid `bg-rating` colour from §6.2 tokens, `w-2 h-2 rounded-full`. Sits to the **left** of the numeric rating. | The §6.2 `rating` token (`#48C479` placeholder) was added by Item 02 specifically for this. Filled dot, not outline — matches Swiggy's design. Tweak the hex when the card lands if it diverges from Swiggy live — that's Item 02 territory. |
| **ETA format** | Literal `{etaMinutes} min` (e.g. `28 min`). Singular always — no `min/mins` switching. | Matches Swiggy's app. `etaMinutes` is validated as a nonnegative int (Item 04 schema). |
| **Price format** | Literal `₹{priceInr}` (e.g. `₹260`). Whole-rupee, no decimals. No `Intl.NumberFormat`. | Swiggy displays whole-rupee prices for food. `priceInr` is validated as a nonnegative number; in practice the model returns integers. Locale formatting would inject thousand-separators (`₹1,200`) which is correct but adds zero value at V1 price points — revisit if a card ever exceeds ₹999. |
| **Metadata row separator** | Literal middle-dot character `·` (U+00B7) with surrounding spaces, inline in JSX. | Cheapest possible separator that matches §6.4 spacing. No `<span>` wrappers, no Tailwind divider utilities. Just text. |
| **Card border** | `border-hairline border-border` (the §6.2 0.5px hairline token). No shadow. | §6.2 specifies "0.5px card borders"; no shadow spec at V1. If §6.4 reveals a shadow at implementation time, add it as a single token to `tailwind.config.ts` then. |
| **Card layout** | `flex items-stretch gap-3 p-3` — image on the left fills the card height, content on the right is `flex flex-col justify-between` so the metadata row pins to the bottom of the text column with dish name + restaurant at the top. | Matches §6.4. `gap-3` (12px) keeps image and text visually grouped. `items-stretch` is the trick that lets the text column define the card height while the image stays square 90×90 — the alternative is `min-h-22.5` and floats and reads worse. |
| **Where the success copy lives** | Inline in `Questions.tsx` success branch, above the `<DishCard>`. No new component. | One copy line, one screen. Factoring is premature; Item 14 may revisit when the 5-card list lands and might want a list-level heading. |
| **Cuisine tags** | Not rendered in this item. The `dish.cuisineTags` field is part of the wire contract but §6.4 doesn't show tag chips in the V1 card anatomy. | Spec §6.4 anatomy is image + name + restaurant + rating + ETA + price. Tags are not in that list. If `nudge_spec.docx` §6.4 turns out to include a tag row, add it then. Capture under Open questions. |
| **Health nudge surface** | **Not rendered** in this item. Item 17 owns the conditional `dish.healthNudge` light-green surface + 11px italic copy. The field is read off the wire (Item 04 schema) but ignored here. | The build plan puts the health-nudge UI in Item 17. Item 10 does not branch on `healthNudge`. |
| **"Same dish elsewhere" affordance** | **Not rendered** in this item. Item 16 owns the expand-inline panel and the second MCP call. | Build-plan separation. Item 10 ships a flat card with no expansion. |
| **Component file location** | `frontend/src/components/DishCard.tsx` — new `components/` directory. | First leaf component in the project. The CLAUDE.md "what lives where" section already names this path (`frontend/src/components/DishCard.tsx`). Item 14's 5-card list and Item 17's health-nudge surface will both import from here. |
| **Hover / press states** | None added in this item. The browser's default focus ring (`:focus-visible`) on the `<a>` is sufficient for keyboard accessibility; mobile doesn't render `:hover`. | Adding hover/press visuals would be a §6.5-shaped change (animation tokens). No spec entry for card press feedback at V1. Item 14 / 22 may revisit. |
| **Card width** | `w-full` inside the `max-w-[390px]` parent shell. Card fills its container minus the parent's `px-4`. | Single design width; no responsive breakpoints. The Questions.tsx parent already constrains to 390px. |
| **Re-renders on view-state change** | Stateless component, fully prop-driven. React's default re-render behaviour. No `memo`, no `useMemo`, no `useCallback`. | Single card, single screen, single submit per session. Memoisation would cost more lines than it saves; revisit only when the 5-card list lands and profiler shows a real cost. |

## Implementation notes

- **`DishCard` skeleton**:
  ```tsx
  import type { Dish } from "@shared/types";

  export default function DishCard({ dish }: { dish: Dish }) {
    const { name, imageUrl, priceInr } = dish;
    const { name: restaurantName, rating, etaMinutes, swiggyUrl } = dish.restaurant;
    return (
      <a
        href={swiggyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-stretch gap-3 p-3 w-full bg-white border-hairline border-border rounded-card"
      >
        <img
          src={imageUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          className="w-22.5 h-22.5 object-cover rounded-card flex-shrink-0"
        />
        <div className="flex flex-col justify-between min-w-0">
          <div>
            <p className="text-text-primary font-semibold truncate">{name}</p>
            <p className="text-text-secondary text-sm truncate">{restaurantName}</p>
          </div>
          <div className="flex items-center gap-1 text-2xs text-text-secondary">
            <span className="inline-block w-2 h-2 rounded-full bg-rating" aria-hidden />
            <span>{rating.toFixed(1)}</span>
            <span>·</span>
            <span>{etaMinutes} min</span>
            <span>·</span>
            <span>₹{priceInr}</span>
          </div>
        </div>
      </a>
    );
  }
  ```
  Final wording on the dish-name + restaurant typography may change during plan review against spec §6.4 — sizes above are working defaults that consume existing tokens; do not introduce new typography tokens in this item.

- **`Questions.tsx` success branch — exact change**:
  ```tsx
  {view.state === "success" && (
    <div className="mt-8">
      <p className="text-text-primary">Here's what I'd order:</p>
      <div className="mt-3">
        <DishCard dish={view.dishes[0]} />
      </div>
    </div>
  )}
  ```
  The surrounding `view.state === "loading" | "error"` blocks are untouched.

- **Whole-card link** — `<a target="_blank">` is the affordance. Don't add an `onClick` handler. Don't add `e.stopPropagation` (no nested clickables to compete). The browser handles new-tab opening, middle-click, long-press, keyboard activation via Enter/Space.

- **`rel="noopener noreferrer"` is non-negotiable.** Without `noopener`, `swiggy.com` could set `window.opener.location` and redirect the Nudge app away. `noreferrer` is added for free; strips the Referer header.

- **Image `loading="lazy"`** — single card, above the fold, so `lazy` is a no-op today. Adding it here means the 5-card list in Item 14 inherits the right behaviour by default (cards 2–5 below the fold defer their image fetch).

- **`<img>` `decoding="async"`** — frees the main thread during image decode. Free win, zero risk for a 90×90 image.

- **No `Math.round` on the rating.** `toFixed(1)` does both round-and-format in one call.

- **Truncate long names cleanly.** `truncate` on the dish name and restaurant name puts the ellipsis where overflow happens. The text column has `min-w-0` because flexbox + `truncate` requires the flex child to be allowed to shrink below its content's intrinsic width.

- **No console.log in shipped code.** Nothing to log here. Don't echo the dish payload to the console.

- **No analytics, no telemetry.** Standing rule. Item 22 / 23 own anything observability-shaped.

- **Don't introduce a shared link primitive yet.** No other surface in V1 yet uses `<a target="_blank">`. If Item 16 ("Same dish elsewhere") or Item 21 ("Home entry point") add a second external link, factor then.

- **Don't introduce a `<RatingDot>` or `<Metadata>` primitive yet.** The whole metadata row is 6 spans. Splitting it into primitives now is premature; Item 17 (health nudge) will reshape parts of the card and is the right moment to consider refactors.

- **Don't read or render `dish.healthNudge`.** That branch is Item 17's. Reading it here in this item would make Item 17's diff look like "remove the existing render and replace" instead of "add the render".

- **Don't expose `view.dishes[1..4]`.** The model returns 5 dishes per the schema, but Item 10 renders only the first. Items 14 / 16 / 18 use the rest. Sending fewer dishes from the BE would be a contract change and is out of scope.

- **Visual sanity at 390×844.** The dish name should fit on one line for typical Swiggy dish names (≤30 chars). If it overflows, `truncate` handles it gracefully. The restaurant name should also fit on one line. The metadata row should fit on one line at 390px width with 3-decimal-place worst-case content (`5.0 · 99 min · ₹999`). Anything longer than that is a model output we can address in Items 14 / 22 later.

- **Tap target ≥44px.** The card itself is ≥90px tall (image height) + 24px vertical padding = 114px. Comfortably above the 44px floor. The whole `<a>` is the tap target; no nested clickable elements.

## Rules for implementation

- TypeScript strict; no `any` unless justified inline. `Dish` and `Restaurant` come from `shared/types.ts`; do not redefine.
- Zod for any shape crossing the network — n/a in this item (no network surface). The Item-08 FE shape-check on the response is unchanged.
- Tailwind utility classes only; tokens from `tailwind.config.ts`. No raw hex anywhere. The rating dot uses `bg-rating`, not `bg-[#48C479]`.
- No inline `style={{...}}` for color/spacing.
- Mobile web only, 390px design width, 44px minimum tap targets (the whole card is the tap target; verified ≥44px by construction).
- Reuse types from `shared/`: `Dish`. Don't redefine FE-side.
- Backend secrets via `process.env` only — n/a (FE-only item).
- No new npm dependencies. `<a>` + `<img>` are native.
- External links MUST carry `rel="noopener noreferrer"` and `target="_blank"`. No exceptions.
- No `console.log` of the dish payload, image URL, or restaurant URL. Standing rule.
- No tests in this item. Tests are written via `/test-feature 10-single-dish-card` after implementation, from the spec.
- No new shared types. The wire contract is locked.
- Don't render `dish.healthNudge` (Item 17), `dish.cuisineTags` (TBD — see Open questions), or the "Same dish elsewhere" affordance (Item 16). All deferred.
- Don't introduce a `<RatingDot>` or `<Metadata>` primitive yet — wait for a second caller.
- Don't introduce a shared link primitive — wait for a second external-link surface.
- The card is a leaf component. No fetches, no effects, no state.

## Verification

- `npm run typecheck` passes across all workspaces.
- `npm run dev` boots both servers without errors. `http://localhost:5173` loads with no console errors.

- **Happy-path render (real model + MCP)** — open DevTools mobile view (390×844). With `ANTHROPIC_API_KEY` set, select "Regular meal", tap "Find my meal". After ~5–10s, the spinner is replaced by:
  - A small heading line ("Here's what I'd order:" or similar) in `text-text-primary`.
  - A single card with: a 90×90 dish image on the left, dish name (one line, possibly truncated), restaurant name underneath in muted secondary text, and a metadata row at the bottom with a green dot · rating to one decimal · `<n> min` · `₹<n>`.
  - No raw JSON anywhere on screen.

- **Card tap → Swiggy in a new tab** — tap the card. A new browser tab opens to the restaurant's Swiggy URL (matches `dish.restaurant.swiggyUrl` from the request payload). The Nudge tab is unchanged — still on the success screen with the card visible.

- **Middle-click / Cmd+click → new background tab** — middle-click (or Cmd+click on macOS) the card. The Swiggy URL opens in a background tab. (Browser default behaviour preserved by using `<a>` not `<div onClick>`.)

- **Keyboard activation** — Tab until the card receives focus (browser default focus ring visible). Press Enter. The Swiggy URL opens in a new tab.

- **Rating format** — inspect the rendered rating against the response payload (Network tab → `/api/recommend` response → `dishes[0].restaurant.rating`). The display value always has exactly one decimal place, even when the underlying value is a whole number (e.g. `4` → `4.0`).

- **Price format** — the price renders as `₹<integer>` with no decimals, no thousand separators (V1 prices are below ₹1000 in practice). Currency sign is the Indian Rupee `₹` (U+20B9), not `Rs.` or `INR`.

- **ETA format** — the ETA renders as `<integer> min` (singular always). `0 min` for an `etaMinutes: 0` payload renders without error.

- **Rating dot colour** — inspect the dot in DevTools → Elements → Computed. Background colour matches the `--tw-bg-opacity * #48C479` (or whichever value `tailwind.config.ts → colors.rating` resolves to at implementation time). Not hardcoded inline.

- **Long-name truncation** — temporarily edit `Questions.tsx` to render with a synthetic dish: `dish={{ ...view.dishes[0], name: 'A really long dish name that will definitely overflow on a 390px viewport' }}`. The name truncates with an ellipsis on one line; restaurant name and metadata row are unaffected. Revert before commit.

- **`rel` attribute** — DevTools → Elements, inspect the rendered `<a>` element. `rel="noopener noreferrer"` is present verbatim. `target="_blank"` is present.

- **No new console warnings** — full submit flow on the success path produces no React warnings (missing keys, invalid props), no asset-loading warnings, no a11y warnings from React DevTools' built-in axe rules. (One acceptable exception: a model-emitted image URL that 404s shows a native browser broken-image affordance and a Network-tab 404; that's expected for V1 and owned by Item 22.)

- **No hardcoded hex in DishCard** — `grep -n "#" frontend/src/components/DishCard.tsx` returns no raw color values; all colours come via Tailwind tokens.

- **No JSON `<pre>` block left behind** — `grep -n "JSON.stringify" frontend/src/screens/Questions.tsx` returns no matches inside the success branch. The Item-08 debug dump is gone.

- **`/api/health` still works** — `curl http://localhost:3001/api/health` returns `{"status":"ok"}` (verifying we didn't break BE during FE work).

- **`/api/recommend` request body unchanged** — Network tab → POST body matches the Item-09 shape exactly. No new fields, no removed fields. This item is render-only on the FE.

- **No regressions on Item 08 / 09 paths** — repeat the Item-08 and Item-09 verifications: pill selection still works, submit-while-loading guard still works, error state with "Try again" still works, geolocation grant/deny paths still produce the right `passiveContext.location`.

- **Phase A exit smoke** — kill the FE / BE and restart with `npm run dev`. Open `http://localhost:5173` in a fresh incognito window at 390×844. Allow geolocation. Select "Very hungry". Tap "Find my meal". Within ~10s see one real Swiggy dish card. Tap it. Land on Swiggy's restaurant page. Phase A done.

## Out of scope for this item

- Rendering cards 2–5 from the response — Item 14 (full 5-card render + bottom-sheet entry animation).
- Bottom-sheet slide-up animation (`translateY(100%)` → `translateY(0)`, 280ms ease-out per §6.5) — Item 14.
- Shimmer loading skeleton — Item 15.
- Health-nudge surface (light-green band, 11px italic copy) — Item 17. The `dish.healthNudge` field is on the wire but not rendered here.
- "Same dish elsewhere" inline expand panel + alt-restaurant list + Pick cross-fade — Item 16.
- "Not quite" refinement loop and the per-refinement re-call — Item 18.
- A shared `<Pill>` / `<Button>` primitive — still deferred (Item 11 / 21).
- A shared `<RatingDot>` / `<Metadata>` primitive — deferred until a second caller appears (Item 17 may surface one).
- Image error/placeholder handling, broken-CDN copy, model-emitted broken `imageUrl` UX — Item 22 (error + empty states).
- Cuisine-tag chips — not in §6.4 V1 anatomy; revisit if §6.4 turns out to include them (see Open questions). If yes, the right spot is Item 14 not Item 10.
- Public deployment / shareable Swiggy link from a hosted Nudge — gated on Builders Club, Item 23.
- Tests — written and run via `/test-feature 10-single-dish-card` after implementation.
- Security / quality review — run via `/code-review-feature 10-single-dish-card` after implementation.

## Open questions

- **Success-state heading copy** — working choice is "Here's what I'd order:" above the card. Spec §4.5 / §6.4 may have a more specific Swiggy-style line ("Try this:", "Our pick:", "Nudge says:"). If spec wording exists, use it verbatim; otherwise lock the working choice during plan review. The heading is a one-liner so this is cheap to revisit.
- **Card shadow vs hairline border only** — spec §6.2 mentions "0.5px card borders"; whether §6.4 adds a soft shadow under the card is unclear without the .docx open. Working choice: hairline border only, no shadow. If §6.4 shows a shadow, add it as a one-token change to `tailwind.config.ts` (single `boxShadow` entry) rather than inline.
- **Dish-name typography** — working choice: `font-semibold` at default Tailwind size (`text-base`, 16px). If §6.4 specifies a different size, swap to that. The two restaurant-name and metadata sizes are well-tokenised already (`text-sm` and `text-2xs`).
- **Restaurant-name colour** — working choice: `text-text-secondary` (the muted §6.2 token). §6.4 could plausibly want it in `text-text-primary` with a smaller size. Confirm during plan review.
- **Cuisine tags in V1 card** — working choice: omit. If §6.4 anatomy includes a tag-chip row (cuisine tags as small pills under restaurant name), add it now. The data is already on the wire (`dish.cuisineTags: string[]`). Confirm during plan review against the spec — if yes, scope creeps by ~10 lines but stays in Item 10.
- **`<img>` aspect / fallback** — if the model occasionally returns image URLs that 404 in practice, V1 shows the native broken-image affordance. If that's visibly bad during testing, an inline `onError` swap to a placeholder block (`bg-surface-warm` + a small icon or first letter) is a 5-line addition. Default: don't add until proven needed. Item 22 owns the polished version regardless.
- **Whole-card tap vs separate "Order on Swiggy" button** — §6.4 implies a single tap target (whole card → restaurant). If during plan review §6.4 actually shows a distinct CTA button inside the card (and the card body is non-tappable), swap the `<a>` wrapper for a `<button>` inside the card. The working choice (whole card tappable) is the simpler, more thumb-friendly mobile pattern and matches Swiggy's app.
---
