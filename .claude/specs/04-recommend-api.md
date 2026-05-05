---
# Spec — Item 04: `/api/recommend` Skeleton

**Phase**: A (Vertical slice) · **Status**: Draft, awaiting approval

## Goal

Land the HTTP shape and validation contract for `POST /api/recommend` so Items 05 (Anthropic + MCP wiring), 06 (prompt builder), 07 (response parser), 08 (Q1 screen), 09 (passive-context collector), and 10 (single dish card) all have a stable boundary to build against. This item ships the **endpoint plumbing only** — request Zod schema, response Zod schema, typed error envelope, structured request logging, CORS already in place from Item 01, and a stubbed handler that returns a deterministic fixture response so the FE can wire the round-trip before Item 05 brings the model online.

This is the last "no model, no MCP" item in Phase A. After this lands, every subsequent Phase A item plugs into a contract that won't change shape.

## Depends on

- Item 01 — Project Scaffolding (Express server, `/api` mount, CORS for `:5173`, Zod installed).
- Item 03 — Seed User Profile (defines `UserProfile` in `shared/types.ts`; the recommend request carries a profile-derived payload, so the schema can reference these types).

## Deliverables

- `shared/types.ts` extended with the cross-boundary request/response types:
  - `RecommendRequest` — intent answers (Q1 only for now, with Q2/Q3 fields optional so Phase B can extend without a breaking change), passive context (time, location, history summary), and the profile-derived signal block.
  - `RecommendResponse` — the 5-card dish array shape per spec §7.3 (full shape locked here so Item 07's parser and Item 10's renderer share it).
  - `Dish` / `Restaurant` supporting types per spec §6.4 card anatomy.
  - `RecommendError` — typed error envelope (`{ error: { code, message, requestId } }`).
- `backend/src/schema.ts` — Zod schemas that mirror the `shared/` types via `z.infer`. Single source of truth for what the network accepts and emits.
- `backend/src/routes/recommend.ts` — `POST /api/recommend` handler that:
  - Parses the request body through the Zod schema; on failure, returns 400 with the typed error envelope and a trimmed list of issues.
  - On success, returns a deterministic 5-card fixture response that satisfies `RecommendResponseSchema` (so the FE can render real-shaped data before Item 05 brings the model online).
  - Logs one structured JSON line per request (method, path, requestId, status, duration, validation outcome). No request body in logs — keeps prompts/PII out by default.
  - Generates a per-request `requestId` and threads it into the response (and any error envelope) so logs and FE/BE traces line up.
- `backend/src/server.ts` updated to:
  - Mount the recommend router under `/api`.
  - Add a request-ID middleware (or wire it inside the route — implementer's call) and a thin structured-logger middleware.
  - Add a JSON body-size cap (e.g. `express.json({ limit: "32kb" })`) so a malformed/huge payload can't OOM the dev server. The recommend payload is small (answers + history summary); 32kb is generous.
- `backend/package.json` updated only if a new dep is genuinely needed (see Tech choices — none expected; we're using `crypto.randomUUID` and stdlib `console.log` for structured JSON, no logger lib).

## File tree after this item ships

```
nudge/
├── shared/
│   └── types.ts                          # modified — RecommendRequest, RecommendResponse, Dish, Restaurant, RecommendError
├── backend/
│   └── src/
│       ├── schema.ts                     # new — Zod schemas (request, response, error envelope)
│       ├── server.ts                     # modified — mount recommend router, JSON body limit, request-id + logger middleware
│       └── routes/
│           └── recommend.ts              # new — POST /api/recommend skeleton (Zod validate → fixture response)
```

## Tech choices (locked)

| Decision | Choice | Reason |
|---|---|---|
| Validation | Zod (already installed) | Project rule: Zod at every network boundary. Matches Item 03's pattern. |
| Type → schema direction | Define types in `shared/types.ts`, mirror with Zod in `backend/src/schema.ts`, `satisfies z.ZodType<T>` to keep them honest | Frontend never imports Zod for these types — it imports the type and trusts the BE to validate. Same pattern as `UserProfileSchema` in `frontend/src/lib/profile.ts`. |
| Request ID | `crypto.randomUUID()` | Built-in, no dep. |
| Structured logging | `console.log(JSON.stringify({...}))` | One stdlib line per request is enough for V1. Pino/winston is overkill for a personal-use proxy. |
| Error envelope | `{ error: { code: string, message: string, requestId: string } }` with discriminated `code` values (`validation_error`, `internal_error` — extend in Item 05 with `model_error`, `mcp_error`, `parse_error`) | Single shape across every failure mode lets the FE render errors uniformly from Item 08 onward. |
| Request body cap | `express.json({ limit: "32kb" })` | Recommend payload is small (history summary is a derived blurb, not full orders). 32kb is generous and bounds blast radius. |
| Stub response | Hardcoded 5-dish fixture inside `routes/recommend.ts` (gated by a simple comment, not a flag) | Lets Items 08–10 demo end-to-end before Item 05 lands. Removed in Item 05 when the real handler ships. |
| HTTP status codes | 200 (success), 400 (validation), 500 (anything else) — no 422/501 fanciness | Keep it boring; matches the typed-envelope approach. |

## Implementation notes

- **Request shape — design for Phase B but only require Q1 today.** `RecommendRequest` should include `answers.q1` (required), `answers.q2` (optional), `answers.q3` (optional), `answers.freetext` (optional). Item 11 fills in Q2/Q3, Item 13 fills in `freetext`. Marking them optional now means no schema break later.
  - `q1` is the hunger level pill from spec §4.2 (Q1: "How hungry are you?"). Re-read §4.2 for the exact option set; encode as a string-literal union enum (`"light" | "moderate" | "very-hungry"` or whatever §4.2 lists). If §4.2 is ambiguous on the option set, capture it under Open questions rather than guessing.
- **Passive context shape.** Include `time` (ISO 8601 string — let the FE format), `location` (`{ lat, lng, label }`, reuse the `Location` type from `shared/types.ts`), and `historySummary` (string — Item 06's prompt builder derives it; for now the FE sends a short string blurb derived from `UserProfile.orderHistory`). Don't ship the full order history over the wire — derived summary only, per spec §5 ranking signals.
- **Profile-derived signal block.** Send only what the prompt actually needs: `dietaryPattern`, `topCuisines`, `avgOrderValue`. Do **not** echo the full `UserProfile` to the BE — userId and lastOrderedAt aren't model inputs.
- **Response shape — full §7.3 schema, not just card 1.** Even though Item 10 only renders card 1, lock the 5-card array shape now so Item 07's parser and Item 14's full-list render don't reshape `shared/types.ts`. The fixture returns 5 cards.
- **Card anatomy fields.** Per spec §6.4: `id`, `name`, `restaurant` (`{ name, rating, etaMinutes, swiggyUrl }`), `imageUrl`, `priceInr`, `cuisineTags`, `healthNudge` (boolean — wired in Item 17 but the field exists from day one).
- **Error envelope is canonical.** Validation errors map to `code: "validation_error"`, message is a short human string, and the response includes a `details` array of Zod issues (path + message, no incoming values — keeps PII out of error responses). Internal errors map to `code: "internal_error"` with no stack trace in the response (logs only).
- **Logger output is one line per request.** Fields: `t` (ISO timestamp), `requestId`, `method`, `path`, `status`, `durationMs`, `validation` (`"ok" | "failed"`). No headers, no body. If we ever need request-body sampling for debugging, add it behind an env flag — not in this item.
- **`requestId` lives in the response.** Successful response is `{ requestId, dishes: Dish[] }`; error response is `{ error: { code, message, requestId, details? } }`. FE can echo `requestId` back to support logs in later items.
- **No new backend deps.** `crypto.randomUUID` is global in Node 20. `console.log(JSON.stringify(...))` is the logger.
- **No frontend changes in this item.** The FE wiring (Q1 form posting to `/api/recommend`) lands in Item 08. Verify with `curl` only.
- **Do not import the Anthropic SDK.** Item 05 owns that. The handler in this item is pure: validate → build fixture → respond.
- **Do not build the prompt.** Item 06 owns `backend/src/prompt.ts`.

## Rules for implementation

- TypeScript strict; no `any` unless justified inline.
- Zod for every request/response shape that crosses the network — both the request body and the (eventual) response.
- `shared/types.ts` is the single source of truth for cross-boundary types; the Zod schemas in `backend/src/schema.ts` `satisfies z.ZodType<T>` against those types so they can't drift.
- Parameterised everything — no string-built URLs or queries (n/a this item, standing rule).
- Backend secrets via `process.env` only; never log `ANTHROPIC_API_KEY` (n/a this item — model isn't called yet — but the logger middleware lands here and must not leak headers).
- No ORMs, no DB layer (V1 standing rule).
- Reuse types from `shared/` rather than redefining FE/BE side. The recommend request reuses `Location` from Item 03.
- The error envelope shape lives in `shared/types.ts` once and is reused by every subsequent route.
- JSON body size cap is mandatory — every handler that calls `express.json()` must have a `limit`.
- Don't log request bodies. Log metadata only. Item 06+ will introduce prompt content; structured request logging must not leak prompts or PII.

## Verification

- `npm run typecheck` passes across all workspaces.
- `npm run dev` boots both servers without errors; the existing `/api/health` route still returns `{"status":"ok"}`.
- **Happy path** — `curl -s -X POST http://localhost:3001/api/recommend -H 'Content-Type: application/json' -d @fixtures/valid-request.json | jq` returns a JSON body matching `RecommendResponseSchema`: `requestId` is a UUID, `dishes` is an array of 5 entries, each with `id`, `name`, `restaurant.{name,rating,etaMinutes,swiggyUrl}`, `imageUrl`, `priceInr`, `cuisineTags`, `healthNudge`. (The fixture file is one-off for verification — keep it under `.claude/fixtures/` or inline in the curl command, no need to commit it.)
- **Validation failure — missing field** — `curl -s -X POST http://localhost:3001/api/recommend -H 'Content-Type: application/json' -d '{}' -i` returns `HTTP/1.1 400`, body matches `{ error: { code: "validation_error", message, requestId, details: [...] } }`, and `details` lists the missing required fields by Zod path.
- **Validation failure — wrong type** — POST a body where `answers.q1` is a number; expect `400` with `code: "validation_error"` and a Zod issue pointing to `answers.q1`.
- **Body too large** — POST a JSON body larger than 32kb (e.g. a giant string); expect `413` (Express's body-parser default for limit overflow) or whatever Express returns by default when over the cap. The dev server should not crash.
- **Logger output** — every request to `/api/recommend` logs exactly one JSON line on stdout with the documented fields; no request bodies appear in the logs.
- **`requestId` round-trip** — both success and error responses include the same `requestId` that appears in the corresponding log line.
- **CORS still scoped to `:5173`** — a `curl` from `http://localhost:5173` (or the response `Access-Control-Allow-Origin` header on a real browser request from the FE app) shows the existing CORS allow-list is unchanged.

## Out of scope for this item

- Calling the Anthropic SDK or Swiggy MCP — Item 05.
- Building the system prompt — Item 06.
- Parsing the model's response, retry-on-malformed — Item 07.
- Wiring the FE Q1 form to call this endpoint — Item 08.
- Collecting passive context (time/geolocation) on the FE — Item 09.
- Rendering a dish card from the response — Item 10.
- Rate limiting / auth / CSRF — explicitly deferred per `CLAUDE.md` ("no auth → not meaningful in V1").
- Real persistence (no DB layer in V1).
- Fancy log shipping — `console.log` with JSON is the V1 logger.

## Open questions

- **Q1 option set** — confirm the exact strings spec §4.2 uses for Q1 ("How hungry are you?") so the Zod enum matches. Capture the canonical values during plan review and bake them into the `RecommendRequest` schema.
- **Fixture realism** — should the 5-dish stub use real Swiggy-shaped data (e.g. "Chicken Biryani at Behrouz, ₹280, 32min ETA") or obvious placeholders ("Stub Dish 1")? Lean toward realistic-looking data so Item 10's card render doesn't look broken in dev — confirm during plan review.
- **Should the `details` array on validation errors include the Zod `expected`/`received` strings?** Useful for FE devtools, but verges on echoing user input. Default: include `path` + `message` only. Revisit if Item 08 needs richer client-side error rendering.
---
