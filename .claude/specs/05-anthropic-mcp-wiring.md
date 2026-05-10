---
# Spec — Item 05: Anthropic + Swiggy MCP Wiring

**Phase**: A (Vertical slice) · **Status**: Draft, awaiting approval

## Goal

Replace the deterministic 5-dish fixture inside `POST /api/recommend` with a real Anthropic call that has the Swiggy MCP server attached, prompt caching enabled on the static system-prompt prefix, and a bounded tool-use loop. After this item ships, hitting `/api/recommend` with a valid request returns dishes synthesised from real Swiggy MCP data via the Anthropic API — completing the backend half of Phase A's vertical slice.

This is the first item that actually calls the model. Items 06 (prompt builder) and 07 (response parser + retry) will refine the prompt *content* and the parse-resilience around this call. The wiring (SDK client construction, MCP attachment, beta header, cache_control mechanics, tool-use loop, error envelope extension) all lands here and shouldn't change shape after this item.

## Depends on

- Item 01 — Project Scaffolding (`@anthropic-ai/sdk` already installed; `ANTHROPIC_API_KEY` already in `.env.example`).
- Item 04 — `/api/recommend` Skeleton (request Zod schema, response Zod schema, error envelope, structured logger, request-ID — all reused unchanged).

## Deliverables

- `backend/src/anthropic.ts` — single module that owns the Anthropic SDK + Swiggy MCP integration. Exports one function (e.g. `runRecommend(input: RecommendRequest): Promise<Dish[]>`) that:
  - Lazily constructs the Anthropic client once per process from `process.env.ANTHROPIC_API_KEY` (throwing a typed error at call time if missing — no module-load crash).
  - Issues `messages.create` with the locked model, the MCP server attached, the `mcp-client-2025-04-04` beta header, and `system` set to a two-block array: `[ { ...static, cache_control: { type: "ephemeral" } }, { ...dynamic } ]`.
  - Runs a **bounded tool-use loop** (max iterations constant; see Tech choices) until the model returns a final assistant message containing the dish JSON, then parses + validates with `RecommendResponseSchema.dishes` (basic happy-path validate; full retry-on-malformed lands in Item 07).
  - Surfaces typed errors for the four failure shapes Phase A needs: missing API key, model error, MCP error, parse error. Uses the new `code` values added in this item (see below).
- `backend/src/routes/recommend.ts` — modified:
  - Deletes the `FIXTURE_DISHES` constant.
  - On successful Zod validation, calls `runRecommend(parsed)` and returns `{ requestId, dishes }`.
  - On failure from `runRecommend`, maps the typed error to the existing error envelope with the new `code` values and an HTTP status from the table below.
- `backend/src/prompt.ts` — **placeholder builder** added in this item, lives here so Item 06 has a clean file to flesh out without churn. Exports two strings (or a `{ static, dynamic }` builder) the wiring uses today; Item 06 replaces the *contents* of the static block (full ranking algorithm §5 + diversity rules + JSON output schema) and the dynamic block (proper user-context formatting). The split + cache_control marker are locked here.
- `shared/types.ts` — extend `RecommendErrorCode` with `"model_error" | "mcp_error" | "parse_error"`. The error envelope shape itself does not change.
- `backend/src/schema.ts` — no changes needed. `RecommendErrorCode` is a TS type, not a Zod schema; it isn't validated on responses (the FE just renders whatever code it gets).

No frontend changes. No new npm dependencies — `@anthropic-ai/sdk` is already pinned in `backend/package.json`.

## File tree after this item ships

```
nudge/
├── shared/
│   └── types.ts                          # modified — extend RecommendErrorCode
├── backend/
│   └── src/
│       ├── anthropic.ts                  # new — Anthropic + MCP client wrapper, prompt-cache config, bounded tool-use loop
│       ├── prompt.ts                     # new — placeholder static/dynamic prompt blocks (Item 06 fills these in)
│       └── routes/
│           └── recommend.ts              # modified — drop fixture, call runRecommend, map typed errors to envelope
```

## Tech choices (locked)

| Decision | Choice | Reason |
|---|---|---|
| **Model (API call inside Nudge)** | `claude-sonnet-4-6` | The build plan originally locked `claude-opus-4-7`. Sanchit asked us to revisit. Sonnet 4.6 is the right call for this task: ranking 5 dishes with diversity rules + bounded tool-use over MCP needs strong tool-use and JSON adherence (Sonnet 4.6 is excellent at both) but doesn't need Opus-level reasoning. Cost is materially lower, latency is noticeably better, and quality is more than sufficient for this prototype. **Update `CLAUDE.md` "Anthropic + Swiggy MCP (locked decisions)" and `.claude/plans/nudge-build-plan.md` "Decisions locked in" in this item to reflect the change** so the override doesn't drift back to Opus in later items. Haiku 4.5 considered and rejected — too small for the multi-signal ranking nuance the spec §5 algorithm asks for. |
| **MCP server URL** | `https://mcp.swiggy.com/food` | Spec + CLAUDE.md. |
| **Anthropic MCP beta header** | `mcp-client-2025-04-04` | Spec + CLAUDE.md. Passed via the SDK's `betas` array. |
| **Prompt caching** | `cache_control: { type: "ephemeral" }` on the static `system` block, no marker on the dynamic block | Mandatory per CLAUDE.md. Static block contains role + ranking algorithm + diversity rules + output schema (content lands fully in Item 06 — Item 05 ships a placeholder that's still long enough to be cache-eligible, ~1k+ tokens, so the cache-hit verification in Item 05 is meaningful). |
| **Tool-use loop bound** | `MAX_TOOL_ITERATIONS = 5` constant | Hard upper bound on `messages.create` round-trips per request so a runaway model can't drain the API budget. If exceeded, throw `model_error` with a clear message. |
| **`max_tokens`** | `4096` | Plenty for 5 dishes of structured JSON. Bumping later is a one-line change. |
| **SDK client construction** | Single module-scoped `Anthropic` client, lazily initialised on first call. Throws a typed `internal_error` (with non-leaking message) if `ANTHROPIC_API_KEY` is missing. | Avoids a module-load crash that would take the whole server down at boot. Personal-use prototype — process-lifetime singleton is fine. |
| **HTTP status mapping for new error codes** | `model_error` → 502, `mcp_error` → 502, `parse_error` → 502, `internal_error` (incl. missing API key) → 500. Validation stays 400. | 502 ("Bad Gateway") is the honest signal: an upstream we depend on misbehaved. Keeps 500 for genuinely-our-fault failures. |
| **Logging at the wrapper boundary** | One additional structured log line per recommend call: `{ t, requestId, event: "recommend_call", durationMs, toolIterations, status: "ok"|"<error_code>" }`. No prompts, no MCP payloads, no API key. | Lets us spot tool-loop blowups and slow MCP responses without leaking model inputs/outputs into logs. Reuses the existing `console.log(JSON.stringify(...))` pattern from Item 04. |

## Implementation notes

- **One module owns the SDK.** Routes never construct an `Anthropic` client — they import from `backend/src/anthropic.ts`. This is also where the beta header, MCP server config, model ID, and cache_control markers live. If a later item needs to call the model from somewhere else, it imports from this same module.
- **Lazy client init, not module-load init.** Read `process.env.ANTHROPIC_API_KEY` inside `runRecommend` (or a memoised getter), not at the top of the file. If the key is missing, throw a typed error — do **not** crash the process at boot. The dev server should still come up so the FE can develop against `/api/health` and visible 500s on `/api/recommend`.
- **Two-block `system` array, not a single string.** `system` must be the discriminated array form so the static prefix can carry `cache_control`. The dynamic block does not get a marker — that's how the cache boundary is expressed.
  ```ts
  system: [
    { type: "text", text: STATIC_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: dynamicContext },
  ]
  ```
- **Static prompt content in Item 05 is a placeholder, structurally correct.** The placeholder must be (a) deterministic (same string every call so cache hits land), (b) long enough to be cache-eligible (Anthropic ephemeral caching has a minimum-tokens threshold — make the static block at least ~1024 tokens of role + algorithm-shaped instructions so the verification step actually exercises the cache), and (c) accurate enough that the model returns plausibly-shaped 5-dish JSON. Item 06 will replace the *contents* with the full §5 ranking algorithm + diversity rules + §7.3 JSON schema instructions.
- **Dynamic block carries the per-request user context.** Render the validated `RecommendRequest` (answers, passive context, profile signal) into a short structured string. Keep it deterministic in formatting — but it varies per request so it stays uncached. Item 06 owns the final formatting; for now a plain key/value rendering is fine.
- **MCP attachment shape.** Pass the Swiggy server through the `mcp_servers` request parameter (with the `mcp-client-2025-04-04` beta enabled). Confirm the exact field shape against the SDK at implementation time — the SDK's typings are authoritative. Do **not** invent fields; if the SDK requires a `name` or `type`, use the SDK's required values. Don't pass authentication tokens — the Swiggy MCP is open for personal-use V1.
- **Bounded tool-use loop.** The MCP connector beta lets Anthropic invoke MCP tools without us round-tripping each call ourselves, but the response can still come back as `tool_use` content blocks that require the client to pass `tool_result`s and re-call. Implement the loop as: send → if `stop_reason === "tool_use"` and tools are non-MCP / require client handling, append the tool result and re-call → cap at `MAX_TOOL_ITERATIONS`. If `stop_reason === "end_turn"`, extract the final assistant text and parse. Throw `model_error` on iteration overflow with a message like "Tool-use loop exceeded N iterations".
- **Parse + validate the final JSON, but only the happy path.** Find the final assistant text block, parse JSON, validate with `RecommendResponseSchema.shape.dishes` (or a re-export) against the parsed `dishes` array. On parse/validate failure throw `parse_error`. Do **not** implement retry-on-malformed in this item — that's Item 07. A first-pass failure in Item 05 surfaces as a 502 with `code: "parse_error"`, which is the contract Item 07 will improve.
- **Error mapping in the route.** `routes/recommend.ts` catches the typed error from `runRecommend` and emits the existing envelope shape with the appropriate `code`. The route owns the HTTP status; the wrapper owns the error code/message. This keeps `anthropic.ts` HTTP-agnostic.
- **`requestId` flows through.** Pass the route's `requestId` into `runRecommend` so the wrapper's structured log line can include it. The response envelope continues to echo `requestId` (no change to the existing contract).
- **Do not log prompts, MCP payloads, or model output.** Future items that want to debug prompt content can add an env-flagged dev-only sink — not in this item, and never on by default.
- **Do not log or return `ANTHROPIC_API_KEY`.** Never thread it into FE responses, error messages, or `shared/` types. Standing rule from CLAUDE.md.
- **No frontend changes.** Verify everything in this item with `curl`. Items 08–10 will exercise the round-trip from the browser.
- **Update `CLAUDE.md` and `.claude/plans/nudge-build-plan.md`** to reflect the model change (Opus 4.7 → Sonnet 4.6). Both files have a "locked decisions" line that names Opus by ID — flip both in the same commit so future items don't drift back.

## Rules for implementation

- TypeScript strict; no `any` unless justified inline.
- Zod for every request/response shape that crosses the network — the request body is already validated (Item 04); the model's `dishes` output is validated against `RecommendResponseSchema.shape.dishes` before being returned.
- Parameterised everything — no string-built URLs or queries (n/a this item directly; standing rule).
- Backend secrets via `process.env` only; never log `ANTHROPIC_API_KEY` and never thread it into FE responses or `shared/` types.
- **Prompt caching is mandatory** — the static `system` block must carry `cache_control: { type: "ephemeral" }`. The dynamic block must not.
- All Anthropic SDK calls live in **one** module (`backend/src/anthropic.ts`). Routes don't construct SDK clients themselves.
- Tool-use loop must be **bounded** by `MAX_TOOL_ITERATIONS`.
- No new backend deps. `@anthropic-ai/sdk` is already installed.
- No ORMs, no DB layer (V1 standing rule).
- Reuse types from `shared/` — `RecommendRequest`, `Dish`, `RecommendErrorCode`. Don't redefine.
- Don't log prompts, MCP payloads, or model output. Metadata-only structured logs.

## Verification

- `npm run typecheck` passes across all workspaces.
- `npm run dev` boots both servers without errors; `/api/health` still returns `{"status":"ok"}`.
- **Happy path (real model + MCP)** — with `ANTHROPIC_API_KEY` set in `.env`, run:
  ```
  curl -s -X POST http://localhost:3001/api/recommend \
    -H 'Content-Type: application/json' \
    -d @.claude/fixtures/valid-request.json | jq
  ```
  Expect a `200` response whose `dishes` array has length 5 and validates against `RecommendResponseSchema` (each entry has `id`, `name`, `restaurant.{name,rating,etaMinutes,swiggyUrl}`, `imageUrl`, `priceInr`, `cuisineTags`, `healthNudge`). The dishes should reflect real Swiggy data fetched via MCP — restaurants and prices should look plausible for the request's `passiveContext.location.label`.
- **Prompt-cache hit verification** — call the endpoint twice in succession with the same request body. Check the [Anthropic Console](https://console.anthropic.com) usage view (or the SDK response's `usage.cache_read_input_tokens` / `usage.cache_creation_input_tokens` fields surfaced in the wrapper's debug log if added) and confirm the second call shows non-zero cache reads on the static block. Phase A exit criteria expects ≥80% cache-hit rate on the second call.
- **Bounded tool-use loop** — temporarily set `MAX_TOOL_ITERATIONS = 1` (or stub the SDK to always return `stop_reason: "tool_use"`) and confirm the wrapper throws `model_error` and the route returns `502` with `code: "model_error"`. Revert before commit.
- **Missing API key** — unset `ANTHROPIC_API_KEY` (or temporarily blank it in `.env`), restart the backend, hit the endpoint with a valid body, and confirm `500` with `code: "internal_error"` and a message that does **not** echo the env var name or any secret. The dev server must not have crashed at boot.
- **Validation still works** — POST `{}` and confirm Item 04's validation path is unchanged (`400` with `code: "validation_error"`).
- **Logging** — every successful `/api/recommend` call emits two stdout JSON lines (the existing request-finished line from Item 04 + the new `recommend_call` line from `anthropic.ts`). Neither line contains the API key, the prompt, the MCP payload, or the model's response. `requestId` is the same on both lines.
- **CLAUDE.md + build plan updated** — `git diff main -- CLAUDE.md .claude/plans/nudge-build-plan.md` shows the Opus-4.7 → Sonnet-4.6 swap on the locked-decisions lines.

## Out of scope for this item

- The **content** of the system prompt — Item 06 fills in the full ranking algorithm (§5), diversity rules, and JSON output schema instructions. Item 05 ships a structurally-correct placeholder.
- **Retry-on-malformed-JSON** — Item 07. Item 05's parse failure surfaces as a `parse_error` 502 with no retry.
- **Frontend wiring** — Item 08 (Q1 form posting), Item 09 (passive context collector), Item 10 (single dish card render).
- **Streaming** — non-streaming `messages.create` is fine for V1. Add streaming later if `/api/recommend` latency becomes a UX problem.
- **Caching across requests / response cache** — only Anthropic prompt caching is in scope. We don't cache responses ourselves.
- **Rate limiting / auth / CSRF** — V1 standing deferral.
- **Tests** — written and run via `/test-feature 05-anthropic-mcp-wiring` after implementation.
- **Security / quality review** — run via `/code-review-feature 05-anthropic-mcp-wiring` after implementation.

## Open questions

- **MCP `mcp_servers` field shape** — confirm the exact required fields (e.g. `type`, `url`, `name`, optional `authorization_token`) against the installed `@anthropic-ai/sdk` typings at implementation time. The SDK is authoritative; don't fabricate. The Swiggy MCP is unauthenticated for personal-use V1.
- **MCP tool-result handling** — does the connector beta surface `mcp_tool_use` blocks that the client must round-trip, or are they handled server-side and only `text` blocks reach us? Implementer should verify against a real call early; the loop must handle both possibilities (no-op when the model already returned `end_turn`, iterate when it didn't).
- **Cache-eligibility floor for the placeholder static prompt** — Anthropic's ephemeral cache has a minimum-token threshold. If the placeholder is too short, the cache-hit verification step will fail through no fault of the wiring. Pad the placeholder with structurally-real content (role, output-shape contract, diversity stub) so it clears the floor; Item 06 will replace with the real §5 algorithm anyway.
- **Should `runRecommend` return the model's raw `usage` block** so a future debug endpoint can surface cache-hit stats? Default: no — keep the wrapper's return type narrow (`Dish[]`). Revisit if Item 07 or a debug screen wants it.
---
