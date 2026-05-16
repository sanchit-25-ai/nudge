import { z } from "zod";
import type {
  RecommendError,
  RecommendErrorCode,
  RecommendRequest,
  RecommendResponse,
} from "@shared/types";

// Shape-only check — per-field validation already runs on the BE in
// RecommendResponseSchema. This catches "BE returned wrong envelope" bugs
// without duplicating DishSchema across the network boundary.
const ResponseShapeSchema = z.object({
  requestId: z.string().uuid(),
  dishes: z.array(z.unknown()).length(5),
});

// FE-owned user copy keyed by error code. The BE error envelope's `message`
// is ignored on render — keeping user-facing strings here means a future
// BE wording change can't surface to users unexpectedly, and a rogue
// upstream (proxy 502, etc.) can't paint arbitrary text on screen.
const USER_MESSAGES: Record<RecommendErrorCode, string> = {
  validation_error: "There was a problem with your request.",
  internal_error: "Something went wrong on our end.",
  model_error: "We couldn't put together a recommendation just now.",
  mcp_error: "The restaurant data service is unavailable. Try again in a moment.",
  parse_error: "We got an unexpected response from the server.",
};

export class RecommendApiError extends Error {
  constructor(
    public code: RecommendErrorCode,
    message: string,
    public requestId: string,
  ) {
    super(message);
    this.name = "RecommendApiError";
  }
}

export async function postRecommend(
  req: RecommendRequest,
): Promise<RecommendResponse> {
  const r = await fetch("/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  const json: unknown = await r.json().catch(() => null);

  if (!r.ok) {
    const env = json as RecommendError | null;
    const code: RecommendErrorCode = env?.error?.code ?? "internal_error";
    const requestId = env?.error?.requestId ?? "";
    throw new RecommendApiError(code, USER_MESSAGES[code], requestId);
  }

  const parsed = ResponseShapeSchema.safeParse(json);
  if (!parsed.success) {
    throw new RecommendApiError(
      "parse_error",
      USER_MESSAGES.parse_error,
      "",
    );
  }
  return json as RecommendResponse;
}
