import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { ZodIssue } from "zod";
import type { RecommendError, RecommendResponse } from "@shared/types";
import { RecommendRequestSchema } from "../schema";
import { AnthropicWrapperError, runRecommend } from "../anthropic";
import type { AnthropicErrorCode } from "../errors";
import { STUB_DISHES } from "../stubDishes";

// Zod's default messages for these codes embed the user-supplied received
// value (e.g. "...received 'foo'"). Spec requires path + message only — no
// echoed input — so we replace those with a fixed message.
const ISSUE_CODE_MESSAGES: Partial<Record<ZodIssue["code"], string>> = {
  invalid_enum_value: "Invalid value for enum field",
  invalid_literal: "Invalid literal value",
  unrecognized_keys: "Unrecognized key(s) in object",
};

// Outward-facing messages keyed by error code. The wrapper's err.message is
// kept for server-side logs only — never forwarded into the HTTP body — so
// any future interpolated content (model output, SDK strings, Zod paths)
// cannot leak through the response.
const CODE_MESSAGES: Record<AnthropicErrorCode, string> = {
  parse_error: "The model returned a response that could not be processed.",
  model_error: "The model returned an unexpected response.",
  mcp_error: "The upstream data source is unavailable.",
  internal_error: "An internal error occurred.",
};

function sanitiseIssueMessage(issue: ZodIssue): string {
  return ISSUE_CODE_MESSAGES[issue.code] ?? issue.message;
}

export const recommendRouter = Router();

recommendRouter.post("/recommend", async (req, res) => {
  const requestId = randomUUID();
  res.locals.requestId = requestId;

  const result = RecommendRequestSchema.safeParse(req.body);

  if (!result.success) {
    const body: RecommendError = {
      error: {
        code: "validation_error",
        message: "Request body failed validation",
        requestId,
        details: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: sanitiseIssueMessage(i),
        })),
      },
    };
    res.status(400).json(body);
    return;
  }

  if (process.env.USE_STUB_RECOMMEND === "true") {
    const body: RecommendResponse = { requestId, dishes: STUB_DISHES };
    res.status(200).json(body);
    return;
  }

  try {
    const dishes = await runRecommend(result.data, requestId);
    const body: RecommendResponse = { requestId, dishes };
    res.status(200).json(body);
  } catch (err) {
    if (err instanceof AnthropicWrapperError) {
      const status = err.code === "internal_error" ? 500 : 502;
      if (process.env.NODE_ENV !== "test") {
        console.log(
          JSON.stringify({
            t: new Date().toISOString(),
            requestId,
            event: "recommend_error",
            code: err.code,
            message: err.message,
          }),
        );
      }
      const body: RecommendError = {
        error: {
          code: err.code,
          message: CODE_MESSAGES[err.code],
          requestId,
        },
      };
      res.status(status).json(body);
      return;
    }
    const body: RecommendError = {
      error: {
        code: "internal_error",
        message: CODE_MESSAGES.internal_error,
        requestId,
      },
    };
    res.status(500).json(body);
  }
});
