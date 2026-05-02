---
# Spec — Item 02: Minimal Design Tokens

**Phase**: A (Vertical slice) · **Status**: Draft, awaiting approval

## Goal

Land the full Swiggy design-token set in `tailwind.config.ts` so every subsequent UI item (Q1 screen, dish card, bottom sheet, etc.) consumes utility classes rather than hardcoded hex values. We do this now, in Phase A, so we never have to retrofit colors/spacing/typography across screens later — and so the rule "Tailwind utilities only, no inline styles for color/spacing" from `CLAUDE.md` becomes enforceable from Item 8 onward.

This item is **tokens only** — no UI is built. The existing `App.tsx` health-check view is updated only to confirm the new font stack and primary color render correctly.

## Depends on

- Item 01 — Project Scaffolding (tailwind already wired into Vite, `tailwind.config.ts` exists with empty `theme.extend`).

## Deliverables

- `tailwind.config.ts` extended with the full §6.2 token set: colors (primary, surfaces, text, semantic states), font family stack, font sizes/weights from spec, spacing scale, border-radius, shadows, and any animation/keyframe tokens needed for §6.5 (e.g. bottom-sheet slide-up).
- `frontend/src/index.css` updated to load the spec's font (Google Fonts `<link>` in `index.html` if needed) and apply base typography (body color, default font family) via Tailwind `@layer base`.
- `App.tsx` adjusted minimally to demonstrate tokens are wired: e.g. primary-colored text or surface, applied via Tailwind utility classes only.
- A short comment block at the top of `tailwind.config.ts` pointing readers to spec §6.2 as the source of truth.

## File tree after this item ships

```
nudge/
├── frontend/
│   ├── index.html                       # modified — Google Fonts link if spec font requires it
│   ├── tailwind.config.ts               # modified — full §6.2 token set
│   └── src/
│       ├── index.css                    # modified — @layer base body defaults
│       └── App.tsx                      # modified — sanity-check tokens render
```

No new files. Tokens live in one place.

## Tech choices (locked)

| Decision | Choice | Reason |
|---|---|---|
| Where tokens live | `tailwind.config.ts` `theme.extend` | One source of truth; matches `CLAUDE.md` rule "tokens live in `tailwind.config.ts`". |
| Font loading | Google Fonts `<link>` in `index.html` | Simplest path; no font-host build step. Self-host can come later if needed. |
| Color naming | Semantic keys (e.g. `primary`, `surface`, `text-primary`, `text-secondary`, `success`, `warning`, `error`) **plus** raw scale only if spec uses one | Semantic names survive design tweaks; raw hex values do not. |
| Animation tokens | `theme.extend.keyframes` + `theme.extend.animation` for §6.5 motions (e.g. `sheet-up` 280ms ease-out) | Keeps animations as Tailwind utilities (`animate-sheet-up`), no third-party animation lib. |

The actual hex values, font name, sizes, and timing curves come from **spec §6.2 (design tokens) and §6.5 (motion)** — re-read those sections before implementing. The build plan locks `#FC8019` as primary; everything else flows from the spec.

## Implementation notes

- **Frontend only.** Backend and `shared/types.ts` are untouched.
- **Read spec §6.2 carefully** — it lists the full Swiggy token set (color ramps, surfaces, text colors, font, sizes, spacing, radii, shadows). Mirror it into `tailwind.config.ts` `theme.extend` using semantic keys.
- **Read spec §6.5** for motion timings and easings. Land the keyframes/animations referenced by Phase B+C items (bottom-sheet slide-up at minimum) so later items don't redefine them.
- **Don't overwrite Tailwind defaults** — use `theme.extend`, not `theme`, so default spacing/typography utilities still work.
- **No inline `style={{...}}` for color/spacing anywhere.** This is the rule from `CLAUDE.md` and starts being enforced now.
- **44px tap targets** — confirm spacing scale includes a value that maps cleanly to `min-h-11` / `min-w-11` (44px) so future buttons can hit it without arbitrary values.
- **Mobile design width is 390px.** No responsive breakpoints needed for this item, but don't introduce desktop-first defaults.
- If the spec font isn't Google-hosted or has special licensing, fall back to the closest system stack and flag it in Open questions.

## Rules for implementation

- TypeScript strict; no `any` unless justified inline.
- Tailwind utility classes only; tokens come from `tailwind.config.ts` (no hardcoded hex from Item 02 onward).
- Mobile web only, 390px design width, 44px minimum tap targets.
- No inline `style={{...}}` for color/spacing.
- Reuse semantic token names everywhere — never reference raw hex in components once this item ships.
- Backend secrets via `process.env` only; never check in `.env` (n/a this item but standing rule).
- No new dependencies unless the spec font genuinely requires one — Google Fonts via `<link>` covers most cases.

## Verification

1. `npm run typecheck` passes across all workspaces.
2. `npm run dev` boots both servers; `http://localhost:5173` still renders the health-check page without console errors.
3. Open the health-check page in DevTools at 390×844 viewport — text uses the spec font, primary-colored element uses `#FC8019`, no Tailwind class warnings.
4. In `tailwind.config.ts`, every token from spec §6.2 has a matching key in `theme.extend` — spot-check by listing the §6.2 tokens against the config.
5. Grep the frontend for inline color hex (`grep -r "#" frontend/src --include="*.tsx" --include="*.ts"`) — no hardcoded hex values outside `tailwind.config.ts`.
6. The animation utility for the bottom-sheet slide-up (or whatever §6.5 names it) is callable via `className="animate-..."` even if no component uses it yet.

## Out of scope for this item

- Any product UI beyond the existing health-check page (Items 8, 10, 14 onward own the screens).
- A component library / shared `<Button>` / `<Pill>` primitives — those land naturally with Items 8 and 11.
- Dark mode (not in spec).
- Self-hosting fonts (defer until perf or licensing forces it).
- Storybook or design-token docs site (overkill for a personal-use prototype).

## Open questions

- Spec font name from §6.2 — confirm whether it's Google-hosted; if not, agree on a fallback stack before implementation.
- Does §6.2 include a shadow scale, or do we derive `shadow-card` from §6.4 card anatomy? If only the latter, name the shadow token after the card use case (`shadow-card`) rather than a generic scale.
---
