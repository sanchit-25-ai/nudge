/**
 * Type-level and value-level tests for shared/types.ts — Item 05.
 *
 * Spec: .claude/specs/05-anthropic-mcp-wiring.md §"Deliverables"
 *   - `RecommendErrorCode` is widened with `"model_error" | "mcp_error" | "parse_error"`.
 *   - The full union must accept all five literals:
 *       "validation_error" | "internal_error" | "model_error" | "mcp_error" | "parse_error"
 *
 * Run from the backend workspace (which resolves @shared/types via tsconfig paths).
 *
 * We use both an `expectTypeOf` compile-time assertion (caught by tsc/vitest)
 * and a value-level assignment test so failures are visible at runtime too.
 */

import { describe, it, expect, expectTypeOf } from "vitest";
import type { RecommendErrorCode, RecommendError } from "@shared/types";

// ===========================================================================
// 1. RecommendErrorCode — all five literals are accepted by the type
// ===========================================================================
describe("RecommendErrorCode — union includes all Item 04 + Item 05 literals", () => {
  // Value-level: assign each literal to a typed variable without a cast.
  // If the union is too narrow, tsc will error here (tests fail at compile time).

  it("accepts 'validation_error' (Item 04)", () => {
    const code: RecommendErrorCode = "validation_error";
    expect(code).toBe("validation_error");
  });

  it("accepts 'internal_error' (Item 04)", () => {
    const code: RecommendErrorCode = "internal_error";
    expect(code).toBe("internal_error");
  });

  it("accepts 'model_error' (Item 05 addition)", () => {
    const code: RecommendErrorCode = "model_error";
    expect(code).toBe("model_error");
  });

  it("accepts 'mcp_error' (Item 05 addition)", () => {
    const code: RecommendErrorCode = "mcp_error";
    expect(code).toBe("mcp_error");
  });

  it("accepts 'parse_error' (Item 05 addition)", () => {
    const code: RecommendErrorCode = "parse_error";
    expect(code).toBe("parse_error");
  });

  // Compile-time assertion: the type must be assignable from each literal.
  it("type-level: all five literals are assignable to RecommendErrorCode", () => {
    expectTypeOf<"validation_error">().toMatchTypeOf<RecommendErrorCode>();
    expectTypeOf<"internal_error">().toMatchTypeOf<RecommendErrorCode>();
    expectTypeOf<"model_error">().toMatchTypeOf<RecommendErrorCode>();
    expectTypeOf<"mcp_error">().toMatchTypeOf<RecommendErrorCode>();
    expectTypeOf<"parse_error">().toMatchTypeOf<RecommendErrorCode>();
  });
});

// ===========================================================================
// 2. RecommendError — error envelope shape is unchanged by Item 05
// ===========================================================================
describe("RecommendError — envelope shape unchanged by Item 05", () => {
  it("type-level: RecommendError.error.code is RecommendErrorCode", () => {
    expectTypeOf<RecommendError["error"]["code"]>().toEqualTypeOf<RecommendErrorCode>();
  });

  it("type-level: RecommendError.error.message is string", () => {
    expectTypeOf<RecommendError["error"]["message"]>().toEqualTypeOf<string>();
  });

  it("type-level: RecommendError.error.requestId is string", () => {
    expectTypeOf<RecommendError["error"]["requestId"]>().toEqualTypeOf<string>();
  });

  it("type-level: RecommendError.error.details is optional", () => {
    // details must be assignable from undefined (i.e. optional).
    type Details = RecommendError["error"]["details"];
    expectTypeOf<undefined>().toMatchTypeOf<Details>();
  });

  it("value-level: all five error codes can be placed in a RecommendError object", () => {
    const codes: RecommendErrorCode[] = [
      "validation_error",
      "internal_error",
      "model_error",
      "mcp_error",
      "parse_error",
    ];

    for (const code of codes) {
      const envelope: RecommendError = {
        error: {
          code,
          message: `Test message for ${code}`,
          requestId: "a1b2c3d4-e5f6-4789-89ab-cdef01234567",
        },
      };
      expect(envelope.error.code).toBe(code);
      expect(envelope.error.message).toContain(code);
      expect(envelope.error.requestId).toBeTruthy();
    }
  });
});
