import type { BetaContentBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Dish } from "@shared/types";
import { AnthropicWrapperError } from "./errors";
import { RecommendResponseSchema } from "./schema";

export type ParseFailureReason =
  | "no_text_block"
  | "invalid_json"
  | "missing_dishes_field"
  | "schema_validation";

export type ParseResult =
  | { ok: true; dishes: Dish[] }
  | { ok: false; error: AnthropicWrapperError; reason: ParseFailureReason };

// Fixed-content corrective turn appended after a first parse failure. References
// the static prompt's `# Output contract` H1 header by name so the model
// re-reads its own cached instructions instead of guessing the schema.
// Determinism is load-bearing: no interpolation, no timestamps, no echoed
// model output.
export const CORRECTION_MESSAGE =
  'Your previous response could not be parsed as the required output. ' +
  'Re-emit a single JSON object exactly as defined in the "# Output contract" section of the system instructions. ' +
  'The "dishes" array must have exactly 5 entries. ' +
  'Do not include markdown fences, code blocks, prose, commentary, or any text outside the JSON object. ' +
  'The first character of your response must be "{" and the last character must be "}".';

function findFinalText(content: BetaContentBlock[]): string | null {
  for (let i = content.length - 1; i >= 0; i--) {
    const block = content[i];
    if (block.type === "text") return block.text;
  }
  return null;
}

function fail(reason: ParseFailureReason, message: string): ParseResult {
  return {
    ok: false,
    reason,
    error: new AnthropicWrapperError("parse_error", message),
  };
}

export function parseDishes(content: BetaContentBlock[]): ParseResult {
  const text = findFinalText(content);
  if (!text) {
    return fail("no_text_block", "Model response contained no text block");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("invalid_json", "Model response was not valid JSON");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Object.prototype.hasOwnProperty.call(parsed, "dishes")
  ) {
    return fail(
      "missing_dishes_field",
      "Model response missing `dishes` field",
    );
  }

  const result = RecommendResponseSchema.shape.dishes.safeParse(
    (parsed as { dishes: unknown }).dishes,
  );
  if (!result.success) {
    return fail(
      "schema_validation",
      "Model response failed schema validation",
    );
  }

  return { ok: true, dishes: result.data };
}
