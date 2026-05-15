import type { RecommendErrorCode } from "@shared/types";

// validation_error is the route's responsibility; everything else originates
// inside the wrapper.
export type AnthropicErrorCode = Exclude<RecommendErrorCode, "validation_error">;

export class AnthropicWrapperError extends Error {
  readonly code: AnthropicErrorCode;
  constructor(code: AnthropicErrorCode, message: string) {
    super(message);
    this.name = "AnthropicWrapperError";
    this.code = code;
  }
}
