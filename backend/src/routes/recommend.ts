import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { ZodIssue } from "zod";
import type { RecommendError, RecommendResponse } from "@shared/types";
import { RecommendRequestSchema } from "../schema";
import { AnthropicWrapperError, runRecommend } from "../anthropic";

// Zod's default messages for these codes embed the user-supplied received
// value (e.g. "...received 'foo'"). Spec requires path + message only — no
// echoed input — so we replace those with a fixed message.
const ISSUE_CODE_MESSAGES: Partial<Record<ZodIssue["code"], string>> = {
  invalid_enum_value: "Invalid value for enum field",
  invalid_literal: "Invalid literal value",
  unrecognized_keys: "Unrecognized key(s) in object",
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

  try {
    const dishes = await runRecommend(result.data, requestId);
    const body: RecommendResponse = { requestId, dishes };
    res.status(200).json(body);
  } catch (err) {
    if (err instanceof AnthropicWrapperError) {
      const status = err.code === "internal_error" ? 500 : 502;
      const body: RecommendError = {
        error: {
          code: err.code,
          message: err.message,
          requestId,
        },
      };
      res.status(status).json(body);
      return;
    }
    const body: RecommendError = {
      error: {
        code: "internal_error",
        message: "Unexpected error",
        requestId,
      },
    };
    res.status(500).json(body);
  }
});
