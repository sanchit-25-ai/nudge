---
# Spec — Item 07: Response Parser + Validator

**Phase**: A (Vertical slice) · **Status**: Draft, awaiting approval

## Goal

Make the model's JSON output resilient. Today the wrapper calls the model once, parses the final text block, validates against `RecommendResponseSchema.shape.dishes`, and on any failure throws `parse_error` (Item 05). This item adds the **retry-once-on-malformed-JSON** path the build plan calls for: extract the parser into its own module, return a typed result instead of throwing, and on the first parse failure inside `runRecommend` append a corrective user turn and re-call the model. A second consecutive failure surfaces as the existing `parse_error` 502 to the FE. After this item ships, the backend half of Phase A is done — Items 08–10 light up the FE.

The Anthropic wiring, MCP attachment, beta header, cache_control marker, MAX_TOOL_ITERATIONS budget, and error envelope all stay locked from Item 05. This item changes one local concern (response interpretation) without touching transport.

## Depends on

- Item 05 — Anthropic + Swiggy MCP Wiring (`runRecommend` exists in `backend/src/anthropic.ts` with an inline `parseDishes`/`findFinalText` pair, an `AnthropicWrapperError` class typed by `RecommendErrorCode`, and the bounded tool-use loop this item extends).
- Item 04 — `/api/recommend` Skeleton (`RecommendResponseSchema` in `backend/src/schema.ts`; `Dish` / `RecommendErrorCode` in `shared/types.ts`).
- Item 06 — System-Prompt Builder (`STATIC_PROMPT` already names the `# Output contract` section by H1 header — the corrective message references that header verbatim so the model knows which block to re-honour).

## Deliverables

- `backend/src/parser.ts` — **new**. Owns response interpretation end-to-end:
  - `parseDishes(content: BetaContentBlock[]): ParseResult` — non-throwing. `ParseResult = { ok: true; dishes: Dish[] } | { ok: false; error: AnthropicWrapperError; reason: ParseFailureReason }`.
  - `ParseFailureReason` discriminates the four failure modes (`"no_text_block"`, `"invalid_json"`, `"missing_dishes_field"`, `"schema_validation"`) so logs and tests can target them precisely. The `error.message` strings stay fixed-content (no echoed user/model input).
  - `CORRECTION_MESSAGE` — exported `const` string. The user-turn appended after the first parse failure. Deterministic and short (see Implementation notes for content).
  - Internal `findFinalText` helper. Module-private; no need to export.
- `backend/src/anthropic.ts` — **modified**:
  - Delete the inline `parseDishes` and `findFinalText` functions.
  - Import `parseDishes`, `CORRECTION_MESSAGE`, and the result/reason types from `./parser`.
  - In the existing tool-use loop, on `stop_reason === "end_turn"`:
    1. Call `parseDishes(resp.content)`.
    2. If `result.ok` → return `result.dishes`.
    3. Else, if a retry hasn't been spent yet → append the assistant's full content blocks as the assistant turn, append `{ role: "user", content: CORRECTION_MESSAGE }`, increment the local `parseAttempts` counter, and continue the loop.
    4. Else → throw `result.error`.
  - Track `parseAttempts` for the structured `recommend_call` log line (existing line gains one new field — see Tech choices).
  - `MAX_PARSE_ATTEMPTS = 2` constant (original + one retry).

No other files change. No new npm dependencies. No shared-type changes (`parse_error` already lives in `RecommendErrorCode`). No frontend changes. No `routes/recommend.ts` changes — the existing typed-error → envelope mapping handles the second-failure case unchanged.

## File tree after this item ships

```
nudge/
├── backend/
│   └── src/
│       ├── parser.ts                       # new — parseDishes (non-throwing) + CORRECTION_MESSAGE + ParseFailureReason
│       └── anthropic.ts                    # modified — drop inline parser, import from parser.ts, retry once on parse failure inside the loop
```

## Tech choices (locked)

| Decision | Choice | Reason |
|---|---|---|
| **Parser API shape** | Non-throwing tagged-union return: `{ ok: true; dishes } \| { ok: false; error; reason }` | The retry path needs to branch on "did parse succeed?" once per iteration. A `try { parse } catch { check error.code === "parse_error" }` round-trip costs nothing functionally but makes the loop noisier and forces the caller to re-narrow an error type the parser just constructed. Tagged union keeps the retry decision first-class. |
| **Retry budget** | `MAX_PARSE_ATTEMPTS = 2` (original call + one retry) | Spec language is "retry-once on malformed JSON". Two attempts total. Higher attempts buy little — if Sonnet 4.6 can't honour the contract after one corrective turn with the `# Output contract` section cached in front of it, more retries won't help and they burn cache misses (every retry adds messages, which forces a cache write on the next dynamic-block-prefixed call). |
| **How retry feeds the model the previous failure** | Append (a) the model's full assistant content from the bad turn as a real assistant message, then (b) a fixed `CORRECTION_MESSAGE` as the next user turn. Do **not** include the parse-error details (no JSON parser error text, no Zod issue paths). | Including the assistant turn lets the model see what it actually said and self-correct against the cached schema. Keeping the corrective message fixed-content makes the retry path testable byte-for-byte and avoids leaking model output back into the user turn in a way that could be re-interpreted as instructions. |
| **`CORRECTION_MESSAGE` content** | Fixed string, ~3 sentences. Names the `# Output contract` section by its H1 header, instructs no markdown fences and no prose, and reminds the model that the dishes array must have exactly 5 entries. See Implementation notes for the exact wording. | Deterministic and short. References the static-block section by header so the model can re-read its own cached instructions instead of trying to reconstruct the contract from scratch. |
| **Tool-loop budget composition** | Reuse `MAX_TOOL_ITERATIONS = 5` from Item 05. A parse retry consumes one iteration of that budget. Do not introduce a separate `MAX_TOOL_ITERATIONS + retries` budget. | Both MCP tool-use rounds and parse retries are SDK round-trips. One bound keeps reasoning simple: at most 5 SDK calls per request, period. Today's wrapper rejects `tool_use` outright, so in practice 1 round + 1 parse retry = 2 iterations, well under the cap. |
| **Where parse-failure classification belongs** | Inside `parser.ts`. The wrapper never inspects `reason` for control flow — it only inspects `result.ok`. `reason` exists for the structured log line and for tests. | Keep `anthropic.ts` HTTP/SDK-shaped, not response-shape-aware. The parser is the one place that knows the four failure modes. |
| **No pre-parse normalisation** | Do not strip markdown fences, leading/trailing prose, or `json` language hints before `JSON.parse`. First attempt is strict. Retry tells the model to fix its output. | The static block already forbids fences. Silently cleaning them up masks a drift in the cached contract. "Retry-once on malformed JSON" is the spec's intent — let the model fix itself. |
| **Logging** | Extend the existing `recommend_call` structured log line with one new field: `parseAttempts` (1 if the first parse succeeded, 2 if the retry succeeded; on failure the line emits whatever attempt count the throw landed on). No new log line. No `reason` field — leak surface for parse-failure data we don't currently inspect downstream. | Same logger pattern as Item 05. One line per call, metadata-only, no prompts or model output. |

## Implementation notes

### `parser.ts` shape

```ts
import type { BetaContentBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Dish } from "@shared/types";
import { AnthropicWrapperError } from "./anthropic";
import { RecommendResponseSchema } from "./schema";

export type ParseFailureReason =
  | "no_text_block"
  | "invalid_json"
  | "missing_dishes_field"
  | "schema_validation";

export type ParseResult =
  | { ok: true; dishes: Dish[] }
  | { ok: false; error: AnthropicWrapperError; reason: ParseFailureReason };

export const CORRECTION_MESSAGE = `Your previous response could not be parsed as the required output. Re-emit a single JSON object exactly as defined in the "# Output contract" section of the system instructions. The "dishes" array must have exactly 5 entries. Do not include markdown fences, code blocks, prose, commentary, or any text outside the JSON object. The first character of your response must be "{" and the last character must be "}".`;

export function parseDishes(content: BetaContentBlock[]): ParseResult { ... }
```

- `parseDishes` is the only export the wrapper uses for the happy path. It runs: find final text block → `JSON.parse` → narrow type and check `dishes` field exists → `RecommendResponseSchema.shape.dishes.safeParse(...)`. Each step has a discrete failure reason; the order matches today's inline implementation byte-for-byte to avoid behaviour drift.
- Error messages on the `AnthropicWrapperError` instances stay identical to today's wording so log spelunking across the Item 05 → Item 07 transition stays trivial:
  - `"Model response contained no text block"`
  - `"Model response was not valid JSON"`
  - `"Model response missing \`dishes\` field"`
  - `"Model response failed schema validation"`
- The corrective message references the static prompt's `# Output contract` H1 header explicitly. Item 06 ships that header; do not rename it without updating both files in the same commit.

### `AnthropicWrapperError` ownership

`AnthropicWrapperError` and `AnthropicErrorCode` stay exported from `anthropic.ts` (they're imported elsewhere by `routes/recommend.ts`). `parser.ts` imports the class from `./anthropic`. That creates a one-way dependency `parser.ts → anthropic.ts` for the error type. If a future item wants to break that edge, move `AnthropicWrapperError` into a separate `backend/src/errors.ts` — but not in this item; out of scope and not needed.

### Wrapper loop — exact change

Today's loop (lines 166–209 of `anthropic.ts`) becomes:

```ts
let parseAttempts = 0;
const MAX_PARSE_ATTEMPTS = 2;

for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
  toolIterations = i + 1;
  const params = buildParams(dynamicContext, messages);
  let resp;
  try {
    resp = await client.beta.messages.create(
      params as MessageCreateParamsNonStreaming,
    );
  } catch (err) {
    if (err instanceof APIError) throw classifyApiError(err);
    throw err;
  }
  lastUsage = resp.usage;

  if (resp.stop_reason === "end_turn") {
    parseAttempts++;
    const result = parseDishes(resp.content);
    if (result.ok) return result.dishes;
    if (parseAttempts >= MAX_PARSE_ATTEMPTS) throw result.error;
    messages.push({ role: "assistant", content: resp.content });
    messages.push({ role: "user", content: CORRECTION_MESSAGE });
    continue;
  }

  if (resp.stop_reason === "tool_use") {
    throw new AnthropicWrapperError(
      "model_error",
      "Received tool_use blocks but no client tools are defined",
    );
  }

  throw new AnthropicWrapperError(
    "model_error",
    "Unexpected stop reason from model",
  );
}

throw new AnthropicWrapperError(
  "model_error",
  `Tool-use loop exceeded ${MAX_TOOL_ITERATIONS} iterations`,
);
```

- Appending the assistant turn before the corrective user turn is the standard tool-use-loop pattern; the SDK accepts the assistant content blocks as-is (typed as `BetaContentBlock[]`, assignable to `BetaMessageParam.content`).
- The `continue` is critical — without it, the next `if` block fires on the already-handled `end_turn` and throws the "Unexpected stop reason" path.
- `parseAttempts` is local to the function call; passes through to the `finally` block's structured log line.

### Structured log line

`recommend_call` gains one field. Resulting shape:

```json
{
  "t": "...",
  "requestId": "...",
  "event": "recommend_call",
  "durationMs": 1234,
  "toolIterations": 2,
  "parseAttempts": 2,
  "status": "ok",
  "cacheReadTokens": 1024,
  "cacheCreationTokens": 0
}
```

- `parseAttempts` is incremented before the parse runs, so on a successful first parse it's `1`; after one retry it's `2`. On a tool-loop overflow it's whatever attempt count was reached before the overflow (likely `0` if the model never hit `end_turn`).
- Add the field at the same level as `toolIterations`, after it, in the existing `line` object — single-line edit.

### What stays the same

- The wrapper's exported signature: `runRecommend(input, requestId): Promise<Dish[]>`.
- The route handler in `routes/recommend.ts`. A second-attempt parse failure still throws `AnthropicWrapperError` with `code: "parse_error"`; the route already maps that to `502` with the envelope.
- The error envelope shape and the `RecommendErrorCode` union — `parse_error` is already a member.
- The cache_control marker, MCP attachment, beta header, model ID, MAX_TOKENS, MAX_TOOL_ITERATIONS budget.
- `STATIC_PROMPT` and `buildDynamicContext` — untouched. The corrective message references the static block by header but doesn't modify it.

## Rules for implementation

- TypeScript strict; no `any` unless justified inline.
- Zod for every request/response shape that crosses the network — the model's `dishes` output continues to be validated against `RecommendResponseSchema.shape.dishes` inside `parser.ts`. No new Zod schemas needed; reuse the existing one.
- Parameterised everything — n/a this item directly; standing rule.
- Backend secrets via `process.env` only; never log `ANTHROPIC_API_KEY`; never thread it into FE responses or `shared/` types.
- **Prompt caching stays mandatory** — Item 07 does not touch the static/dynamic split or the `cache_control` marker. The corrective-message path adds messages to the `messages` array on the retry call; the system block is unchanged so the cache still hits on the retry call.
- All Anthropic SDK calls stay in `backend/src/anthropic.ts`. `parser.ts` is SDK-typed (it imports `BetaContentBlock` from the SDK) but does not call the SDK.
- Tool-use loop stays bounded by `MAX_TOOL_ITERATIONS`. Parse-retry consumes one iteration.
- No new backend deps.
- No ORMs, no DB layer (V1 standing rule).
- Reuse types from `shared/` — `Dish`, `RecommendErrorCode`. Don't redefine.
- Don't log prompts, MCP payloads, or model output. The new `parseAttempts` field is the only logging change.
- Error `.message` strings on `AnthropicWrapperError` instances stay fixed-content. Never interpolate the model's output, the JSON parser's error string, Zod's `issue.message`, or anything else upstream into a message that the route forwards to the HTTP response body.
- The corrective message is a fixed string. No interpolation. No timestamps. No request-IDs. No model output.

## Verification

- `npm run typecheck` passes across all workspaces.
- `npm run dev` boots both servers without errors; `/api/health` still returns `{"status":"ok"}`.
- **Happy path (real model + MCP), first-attempt parse** — with `ANTHROPIC_API_KEY` set, run:
  ```
  curl -s -X POST http://localhost:3001/api/recommend \
    -H 'Content-Type: application/json' \
    -d @.claude/fixtures/valid-request.json | jq
  ```
  Expect `200` with a `dishes` array of length 5. The `recommend_call` log line shows `"parseAttempts": 1` and `"status": "ok"`.
- **Forced parse retry (manual)** — temporarily edit `STATIC_PROMPT` (or the dynamic context) to instruct the model to respond with `Here you go:\n\`\`\`json\n{...}\n\`\`\``. Run the same `curl`. Expect one of:
  - The retry recovers: `200`, `"parseAttempts": 2`, `"status": "ok"`. The first call's malformed assistant turn is visible in `messages` if you add a temporary debug print.
  - The retry also fails: `502`, body `{ "error": { "code": "parse_error", "message": "...", "requestId": "..." } }`, log line `"parseAttempts": 2`, `"status": "parse_error"`.
  Revert the prompt change before commit. Either outcome is acceptable for this verification step — the goal is to exercise the retry branch end-to-end.
- **Direct parser unit check (manual REPL)** — in a Node REPL:
  ```js
  const { parseDishes } = require("./backend/dist/parser"); // or via ts-node/tsx
  parseDishes([{ type: "text", text: "not json" }]);
  // → { ok: false, reason: "invalid_json", error: AnthropicWrapperError }
  parseDishes([{ type: "text", text: '{"foo":1}' }]);
  // → { ok: false, reason: "missing_dishes_field", error: AnthropicWrapperError }
  parseDishes([{ type: "text", text: '{"dishes": []}' }]);
  // → { ok: false, reason: "schema_validation", error: AnthropicWrapperError }
  parseDishes([]);
  // → { ok: false, reason: "no_text_block", error: AnthropicWrapperError }
  ```
  Each error instance has `code === "parse_error"` and the documented `.message`. (Tests written by `/test-feature 07-response-parser` will cover this same surface — this REPL check is just a hand-smoke before tests land.)
- **Prompt-cache hit on retry** — when a retry fires, the second SDK call has the same static block (still cached) but a different `messages` array. Expect `cache_read_input_tokens > 0` on both the first and the retry call's logged `cacheReadTokens` field. (If the static block somehow got reordered or the cache_control marker dropped, this would surface here as a regression.)
- **No regressions on Item 05's error paths** — repeat the Item 05 verifications:
  - Missing `ANTHROPIC_API_KEY` → `500` `internal_error`.
  - Tool-loop overflow (temporarily set `MAX_TOOL_ITERATIONS = 0`) → `502` `model_error`. Revert before commit.
  - Validation failure on `{}` → `400` `validation_error`.
  - All still hold.
- **Logging hygiene** — every successful `/api/recommend` call still emits exactly two stdout JSON lines (request-finished from `server.ts` + `recommend_call` from `anthropic.ts`). The new `parseAttempts` field is the only addition; no prompts, no MCP payloads, no model output, no `ANTHROPIC_API_KEY`. `requestId` consistent across both lines.
- **`messages` boundary** — when a retry fires, the appended assistant turn carries the model's raw content blocks (not a serialised string) and the corrective user turn carries the exact `CORRECTION_MESSAGE` constant. Inspect via a temporary debug print of `messages` before the retry SDK call.

## Out of scope for this item

- More than one retry — V1 caps at two attempts total. If two isn't enough, the right fix is to tighten `STATIC_PROMPT` (Item 06 territory), not raise the retry count.
- Pre-parse normalisation (strip fences, trim prose, extract JSON substring) — explicitly deferred. Strict-then-retry is the contract.
- Differentiated corrective messages per failure reason (e.g. tailored prompt for "missing field X") — not in this item. Single fixed message.
- Streaming responses — not in V1.
- Frontend wiring — Items 08–10. The FE today gets `200` with valid `RecommendResponse` or a typed error envelope; both code paths already work, this item only changes the *internal* path that produces them.
- Surfacing `parseAttempts` or `reason` to the FE — internal log field only. Not part of any user-facing surface.
- Moving `AnthropicWrapperError` into a separate `errors.ts` module — possible cleanup, not needed for this item's scope.
- Tests — written and run via `/test-feature 07-response-parser` after implementation.
- Security / quality review — run via `/code-review-feature 07-response-parser` after implementation.

## Open questions

- **Corrective message wording — fine to lock now?** The Tech choices and Implementation notes spell out a 3-sentence content. If during plan review a tighter or longer wording reads better, swap it then. After implementation lands, changes to `CORRECTION_MESSAGE` are cheap (it's a single `const`), but locking now keeps any future tests stable.
- **`parseAttempts` field name in the log line — `parseAttempts` vs. `parse_attempts`?** Item 05 uses camelCase (`toolIterations`, `cacheReadTokens`, `cacheCreationTokens`). Stay consistent → `parseAttempts`. Calling this out only because log field naming conventions tend to ossify, and it's worth being deliberate. Locked: camelCase.
- **Does the retry need to be visible in the response envelope on success?** Today's `RecommendResponse` is `{ requestId, dishes }`. Adding a `meta.parseAttempts` field would let the FE show a soft "we double-checked the output" indicator. Default: **no** — `parseAttempts` is an internal log field, not a user-facing surface. Revisit if a debug screen wants it later.
---
