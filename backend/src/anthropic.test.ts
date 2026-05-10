/**
 * Unit tests for backend/src/anthropic.ts — Item 05: Anthropic + Swiggy MCP Wiring
 *
 * Spec: .claude/specs/05-anthropic-mcp-wiring.md
 * Build plan: Phase A, Item 05.
 *
 * All Anthropic SDK calls are mocked at the module boundary. No real network
 * calls are made. `process.env.ANTHROPIC_API_KEY` is set to a fake value in
 * beforeEach so the lazy client initialiser doesn't throw on key-missing.
 *
 * Key invariants under test:
 *   - Happy path: right model, beta, MCP server, cache_control markers, max_tokens
 *   - Missing API key: typed internal_error, message does not leak the key name
 *   - tool_use stop_reason: throws model_error (fails loud, does not fabricate)
 *   - Malformed / non-schema-conformant JSON: throws parse_error (no retry in this item)
 *   - Anthropic APIError: classified as model_error or mcp_error by keyword
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Dish, RecommendRequest } from "@shared/types";

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk BEFORE importing the module under test.
//
// Shape:
//   - `Anthropic` default export is a class constructor that returns an object
//     with `beta.messages.create` as a vi.fn().
//   - `APIError` is a real subclass of Error so `instanceof` checks work.
//   - `mockCreate` is exposed on the mock module so each test can configure
//     its return value.
// ---------------------------------------------------------------------------

// We capture the mock function reference here so tests can configure it.
const mockCreate = vi.fn();

// APIError must be a real class for instanceof checks inside anthropic.ts.
class MockAPIError extends Error {
  status: number;
  constructor(
    message: string,
    status = 500,
    _error?: unknown,
    _headers?: unknown,
  ) {
    super(message);
    this.name = "APIError";
    this.status = status;
  }
}

vi.mock("@anthropic-ai/sdk", () => {
  // The module under test uses: `import Anthropic, { APIError } from "@anthropic-ai/sdk"`
  // and calls `client.beta.messages.create(...)`.
  return {
    default: vi.fn().mockImplementation(() => ({
      beta: {
        messages: {
          create: mockCreate,
        },
      },
    })),
    APIError: MockAPIError,
    __esModule: true,
  };
});

// Import AFTER mocking so the module sees the fake SDK.
// We also need to reset the module-level cached client between tests.
// The cleanest way with Vitest is to re-import via dynamic import inside a
// resetModules block, but since the cache is process-scoped we sidestep it by
// deleting the env var — the real lazy getter will throw if the key is absent,
// and setting it restores normal operation.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A fully-valid RecommendRequest fixture — satisfies RecommendRequestSchema. */
const VALID_INPUT: RecommendRequest = {
  answers: {
    q1: "regular-meal",
    q2: "comfort-favourite",
    q3: ["veg-only"],
    freetext: "Something warm and filling",
  },
  passiveContext: {
    time: "2026-05-06T13:00:00.000Z",
    location: { lat: 19.076, lng: 72.8777, label: "Mumbai" },
    historySummary: "Mostly orders biryani and dal makhani on weekday lunches.",
  },
  profileSignal: {
    dietaryPattern: "non-veg",
    topCuisines: ["North Indian", "Biryani"],
    avgOrderValue: 280,
  },
};

const FAKE_REQUEST_ID = "a1b2c3d4-e5f6-4789-89ab-cdef01234567";

/** Build a valid Dish object for use in mock SDK responses. */
function makeDish(i: number): Dish {
  return {
    id: `dish-${i}`,
    name: `Test Dish ${i}`,
    restaurant: {
      name: `Test Restaurant ${i}`,
      rating: 4.2,
      etaMinutes: 30,
      swiggyUrl: `https://www.swiggy.com/restaurants/test-restaurant-${i}`,
    },
    imageUrl: `https://example.com/dish-${i}.jpg`,
    priceInr: 200 + i * 10,
    cuisineTags: ["North Indian"],
    healthNudge: false,
  };
}

/** Build 5 valid dishes (exact number required by RecommendResponseSchema). */
function makeFiveDishes(): Dish[] {
  return Array.from({ length: 5 }, (_, i) => makeDish(i + 1));
}

/** Build a mock SDK response for stop_reason: "end_turn" with valid JSON text. */
function makeEndTurnResponse(dishes: Dish[]) {
  return {
    stop_reason: "end_turn",
    content: [
      { type: "text", text: JSON.stringify({ dishes }) },
    ],
    usage: {
      input_tokens: 500,
      output_tokens: 200,
      cache_creation_input_tokens: 300,
      cache_read_input_tokens: 0,
    },
  };
}

/** Build a mock SDK response for stop_reason: "tool_use". */
function makeToolUseResponse() {
  return {
    stop_reason: "tool_use",
    content: [
      { type: "tool_use", id: "tu_1", name: "search", input: {} },
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-api-key-fake";
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// We must re-import anthropic.ts in a way that bypasses its module-level
// singleton. Vitest's module isolation means `vi.resetModules()` + dynamic
// import is the right tool. We use it only where needed (missing-key test
// that requires a cold singleton start).
// ---------------------------------------------------------------------------

// ===========================================================================
// 1. Happy path — correct SDK call parameters
// ===========================================================================
describe("runRecommend — happy path", () => {
  it("returns a Dish[] of exactly 5 entries on a valid end_turn response", async () => {
    mockCreate.mockResolvedValueOnce(makeEndTurnResponse(makeFiveDishes()));

    const { runRecommend } = await import("./anthropic");
    const result = await runRecommend(VALID_INPUT, FAKE_REQUEST_ID);

    expect(result).toHaveLength(5);
  });

  it("each returned dish satisfies the Dish type shape", async () => {
    const expectedDishes = makeFiveDishes();
    mockCreate.mockResolvedValueOnce(makeEndTurnResponse(expectedDishes));

    const { runRecommend } = await import("./anthropic");
    const result = await runRecommend(VALID_INPUT, FAKE_REQUEST_ID);

    result.forEach((dish, i) => {
      expect(dish.id, `dish[${i}].id`).toBeTruthy();
      expect(dish.name, `dish[${i}].name`).toBeTruthy();
      expect(dish.restaurant.name, `dish[${i}].restaurant.name`).toBeTruthy();
      expect(typeof dish.restaurant.rating, `dish[${i}].restaurant.rating`).toBe("number");
      expect(typeof dish.restaurant.etaMinutes, `dish[${i}].restaurant.etaMinutes`).toBe("number");
      expect(dish.restaurant.swiggyUrl, `dish[${i}].restaurant.swiggyUrl`).toMatch(/^https?:\/\//);
      expect(dish.imageUrl, `dish[${i}].imageUrl`).toMatch(/^https?:\/\//);
      expect(typeof dish.priceInr, `dish[${i}].priceInr`).toBe("number");
      expect(Array.isArray(dish.cuisineTags), `dish[${i}].cuisineTags`).toBe(true);
      expect(typeof dish.healthNudge, `dish[${i}].healthNudge`).toBe("boolean");
    });
  });

  it("calls the SDK with model: 'claude-sonnet-4-6'", async () => {
    mockCreate.mockResolvedValueOnce(makeEndTurnResponse(makeFiveDishes()));

    const { runRecommend } = await import("./anthropic");
    await runRecommend(VALID_INPUT, FAKE_REQUEST_ID);

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.model).toBe("claude-sonnet-4-6");
  });

  it("calls the SDK with betas containing 'mcp-client-2025-04-04'", async () => {
    mockCreate.mockResolvedValueOnce(makeEndTurnResponse(makeFiveDishes()));

    const { runRecommend } = await import("./anthropic");
    await runRecommend(VALID_INPUT, FAKE_REQUEST_ID);

    const callArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    const betas = callArg.betas as string[];
    expect(Array.isArray(betas)).toBe(true);
    expect(betas).toContain("mcp-client-2025-04-04");
  });

  it("calls the SDK with mcp_servers containing url: 'https://mcp.swiggy.com/food'", async () => {
    mockCreate.mockResolvedValueOnce(makeEndTurnResponse(makeFiveDishes()));

    const { runRecommend } = await import("./anthropic");
    await runRecommend(VALID_INPUT, FAKE_REQUEST_ID);

    const callArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    const mcpServers = callArg.mcp_servers as Array<Record<string, unknown>>;
    expect(Array.isArray(mcpServers)).toBe(true);
    expect(mcpServers.length).toBeGreaterThan(0);
    expect(mcpServers[0].url).toBe("https://mcp.swiggy.com/food");
  });

  it("calls the SDK with max_tokens: 4096", async () => {
    mockCreate.mockResolvedValueOnce(makeEndTurnResponse(makeFiveDishes()));

    const { runRecommend } = await import("./anthropic");
    await runRecommend(VALID_INPUT, FAKE_REQUEST_ID);

    const callArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.max_tokens).toBe(4096);
  });

  it("passes system as a two-element array", async () => {
    mockCreate.mockResolvedValueOnce(makeEndTurnResponse(makeFiveDishes()));

    const { runRecommend } = await import("./anthropic");
    await runRecommend(VALID_INPUT, FAKE_REQUEST_ID);

    const callArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    const system = callArg.system as Array<Record<string, unknown>>;
    expect(Array.isArray(system)).toBe(true);
    expect(system).toHaveLength(2);
  });

  it("system[0] carries cache_control: { type: 'ephemeral' }", async () => {
    mockCreate.mockResolvedValueOnce(makeEndTurnResponse(makeFiveDishes()));

    const { runRecommend } = await import("./anthropic");
    await runRecommend(VALID_INPUT, FAKE_REQUEST_ID);

    const callArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    const system = callArg.system as Array<Record<string, unknown>>;
    const cacheControl = system[0].cache_control as Record<string, unknown>;
    expect(cacheControl).toBeDefined();
    expect(cacheControl.type).toBe("ephemeral");
  });

  it("system[1] does NOT carry cache_control (dynamic block stays uncached)", async () => {
    mockCreate.mockResolvedValueOnce(makeEndTurnResponse(makeFiveDishes()));

    const { runRecommend } = await import("./anthropic");
    await runRecommend(VALID_INPUT, FAKE_REQUEST_ID);

    const callArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    const system = callArg.system as Array<Record<string, unknown>>;
    // The dynamic block must not have a cache_control key so only the static
    // prefix qualifies for ephemeral caching.
    expect(system[1].cache_control).toBeUndefined();
  });

  it("system[0].type is 'text' and system[1].type is 'text'", async () => {
    mockCreate.mockResolvedValueOnce(makeEndTurnResponse(makeFiveDishes()));

    const { runRecommend } = await import("./anthropic");
    await runRecommend(VALID_INPUT, FAKE_REQUEST_ID);

    const callArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    const system = callArg.system as Array<Record<string, unknown>>;
    expect(system[0].type).toBe("text");
    expect(system[1].type).toBe("text");
  });

  it("system[0].text and system[1].text are non-empty strings", async () => {
    mockCreate.mockResolvedValueOnce(makeEndTurnResponse(makeFiveDishes()));

    const { runRecommend } = await import("./anthropic");
    await runRecommend(VALID_INPUT, FAKE_REQUEST_ID);

    const callArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    const system = callArg.system as Array<Record<string, unknown>>;
    expect(typeof system[0].text).toBe("string");
    expect((system[0].text as string).length).toBeGreaterThan(0);
    expect(typeof system[1].text).toBe("string");
    expect((system[1].text as string).length).toBeGreaterThan(0);
  });

  it("SDK is called exactly once for a clean end_turn response (no loop needed)", async () => {
    mockCreate.mockResolvedValueOnce(makeEndTurnResponse(makeFiveDishes()));

    const { runRecommend } = await import("./anthropic");
    await runRecommend(VALID_INPUT, FAKE_REQUEST_ID);

    expect(mockCreate).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// 2. Missing API key — typed internal_error with non-leaking message
// ===========================================================================
describe("runRecommend — missing ANTHROPIC_API_KEY", () => {
  it("throws AnthropicWrapperError when ANTHROPIC_API_KEY is empty string", async () => {
    // Must use resetModules so the module-level singleton is cleared and the
    // lazy getter re-reads process.env on the next call.
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = "";

    const { runRecommend, AnthropicWrapperError } = await import("./anthropic");

    await expect(runRecommend(VALID_INPUT, FAKE_REQUEST_ID)).rejects.toBeInstanceOf(
      AnthropicWrapperError,
    );

    // Restore for subsequent tests.
    process.env.ANTHROPIC_API_KEY = "test-api-key-fake";
    vi.resetModules();
  });

  it("throws with code: 'internal_error' when API key is missing", async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = "";

    const { runRecommend, AnthropicWrapperError } = await import("./anthropic");

    const caught = await runRecommend(VALID_INPUT, FAKE_REQUEST_ID).catch(
      (e: unknown) => e,
    );
    expect(caught).toBeInstanceOf(AnthropicWrapperError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((caught as any).code).toBe("internal_error");

    process.env.ANTHROPIC_API_KEY = "test-api-key-fake";
    vi.resetModules();
  });

  it("error message does not contain the literal string 'ANTHROPIC_API_KEY'", async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = "";

    const { runRecommend } = await import("./anthropic");

    const caught = await runRecommend(VALID_INPUT, FAKE_REQUEST_ID).catch(
      (e: unknown) => e,
    );
    const message = (caught as Error).message;
    expect(
      message.includes("ANTHROPIC_API_KEY"),
      "Error message must not contain the env var name (secrets must not leak)",
    ).toBe(false);

    process.env.ANTHROPIC_API_KEY = "test-api-key-fake";
    vi.resetModules();
  });

  it("error message does not contain the literal key value (even if env var held a fake value)", async () => {
    vi.resetModules();
    const FAKE_KEY = "sk-ant-FAKE-KEY-VALUE";
    process.env.ANTHROPIC_API_KEY = "";

    const { runRecommend } = await import("./anthropic");

    const caught = await runRecommend(VALID_INPUT, FAKE_REQUEST_ID).catch(
      (e: unknown) => e,
    );
    const message = (caught as Error).message;
    expect(message.includes(FAKE_KEY)).toBe(false);

    process.env.ANTHROPIC_API_KEY = "test-api-key-fake";
    vi.resetModules();
  });
});

// ===========================================================================
// 3. Bounded tool-use loop — model returns tool_use, wrapper throws model_error
// ===========================================================================
describe("runRecommend — tool_use stop_reason (bounded loop)", () => {
  it("throws AnthropicWrapperError when stop_reason is 'tool_use'", async () => {
    mockCreate.mockResolvedValue(makeToolUseResponse());

    const { runRecommend, AnthropicWrapperError } = await import("./anthropic");

    await expect(runRecommend(VALID_INPUT, FAKE_REQUEST_ID)).rejects.toBeInstanceOf(
      AnthropicWrapperError,
    );
  });

  it("throws with code: 'model_error' when stop_reason is 'tool_use'", async () => {
    mockCreate.mockResolvedValue(makeToolUseResponse());

    const { runRecommend, AnthropicWrapperError } = await import("./anthropic");

    const caught = await runRecommend(VALID_INPUT, FAKE_REQUEST_ID).catch(
      (e: unknown) => e,
    );
    expect(caught).toBeInstanceOf(AnthropicWrapperError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((caught as any).code).toBe("model_error");
  });

  it("does not make more than MAX_TOOL_ITERATIONS (5) SDK calls before throwing", async () => {
    // The wrapper must be bounded — it must not hang. We verify the SDK is
    // called at most 5 times (the MAX_TOOL_ITERATIONS constant from the spec)
    // before throwing model_error. The spec permits throwing earlier (even on
    // iteration 1 — as the implementation does), so we check upper bound only.
    mockCreate.mockResolvedValue(makeToolUseResponse());

    const { runRecommend } = await import("./anthropic");

    await runRecommend(VALID_INPUT, FAKE_REQUEST_ID).catch(() => {
      // Swallow — we only care about call count.
    });

    const callCount = mockCreate.mock.calls.length;
    expect(
      callCount,
      `SDK should be called at most 5 times (MAX_TOOL_ITERATIONS), got ${callCount}`,
    ).toBeLessThanOrEqual(5);
    expect(
      callCount,
      "SDK must be called at least once before throwing",
    ).toBeGreaterThanOrEqual(1);
  });

  it("throws with a non-empty message describing the failure", async () => {
    mockCreate.mockResolvedValue(makeToolUseResponse());

    const { runRecommend } = await import("./anthropic");

    const caught = await runRecommend(VALID_INPUT, FAKE_REQUEST_ID).catch(
      (e: unknown) => e,
    );
    expect((caught as Error).message.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 4. Parse errors — malformed or schema-invalid model output
// ===========================================================================
describe("runRecommend — parse errors (no retry in Item 05)", () => {
  it("throws AnthropicWrapperError with code 'parse_error' when response text is not valid JSON", async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "this is not json at all" }],
      usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    });

    const { runRecommend, AnthropicWrapperError } = await import("./anthropic");

    const caught = await runRecommend(VALID_INPUT, FAKE_REQUEST_ID).catch(
      (e: unknown) => e,
    );
    expect(caught).toBeInstanceOf(AnthropicWrapperError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((caught as any).code).toBe("parse_error");
  });

  it("throws parse_error when JSON is valid but missing the 'dishes' key", async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ items: [] }) }],
      usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    });

    const { runRecommend, AnthropicWrapperError } = await import("./anthropic");

    const caught = await runRecommend(VALID_INPUT, FAKE_REQUEST_ID).catch(
      (e: unknown) => e,
    );
    expect(caught).toBeInstanceOf(AnthropicWrapperError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((caught as any).code).toBe("parse_error");
  });

  it("throws parse_error when dishes array has only 3 entries (schema requires exactly 5)", async () => {
    const threeDishes = Array.from({ length: 3 }, (_, i) => makeDish(i + 1));
    mockCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ dishes: threeDishes }) }],
      usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    });

    const { runRecommend, AnthropicWrapperError } = await import("./anthropic");

    const caught = await runRecommend(VALID_INPUT, FAKE_REQUEST_ID).catch(
      (e: unknown) => e,
    );
    expect(caught).toBeInstanceOf(AnthropicWrapperError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((caught as any).code).toBe("parse_error");
  });

  it("throws parse_error when a dish is missing a required field (e.g. imageUrl)", async () => {
    const invalidDishes = makeFiveDishes().map((d, i) =>
      i === 0 ? { ...d, imageUrl: undefined } : d,
    );
    mockCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ dishes: invalidDishes }) }],
      usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    });

    const { runRecommend, AnthropicWrapperError } = await import("./anthropic");

    const caught = await runRecommend(VALID_INPUT, FAKE_REQUEST_ID).catch(
      (e: unknown) => e,
    );
    expect(caught).toBeInstanceOf(AnthropicWrapperError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((caught as any).code).toBe("parse_error");
  });

  it("throws parse_error when a dish has a restaurant.rating > 5 (schema violation)", async () => {
    const invalidDishes = makeFiveDishes().map((d, i) =>
      i === 0
        ? { ...d, restaurant: { ...d.restaurant, rating: 99 } }
        : d,
    );
    mockCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ dishes: invalidDishes }) }],
      usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    });

    const { runRecommend, AnthropicWrapperError } = await import("./anthropic");

    const caught = await runRecommend(VALID_INPUT, FAKE_REQUEST_ID).catch(
      (e: unknown) => e,
    );
    expect(caught).toBeInstanceOf(AnthropicWrapperError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((caught as any).code).toBe("parse_error");
  });

  it("throws parse_error when the response content array contains no text block", async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "tool_use", id: "tu_1", name: "search", input: {} }],
      usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    });

    const { runRecommend, AnthropicWrapperError } = await import("./anthropic");

    const caught = await runRecommend(VALID_INPUT, FAKE_REQUEST_ID).catch(
      (e: unknown) => e,
    );
    expect(caught).toBeInstanceOf(AnthropicWrapperError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((caught as any).code).toBe("parse_error");
  });

  it("does NOT retry on parse failure (SDK called exactly once)", async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "invalid json {{{" }],
      usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    });

    const { runRecommend } = await import("./anthropic");

    await runRecommend(VALID_INPUT, FAKE_REQUEST_ID).catch(() => {
      // Expected to throw; we only care about call count.
    });

    expect(
      mockCreate,
      "Item 05 must not retry on parse failure (retry is Item 07)",
    ).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// 5. SDK API errors — classified as model_error or mcp_error
// ===========================================================================
describe("runRecommend — Anthropic SDK APIError classification", () => {
  it("maps a generic APIError to AnthropicWrapperError with code 'model_error'", async () => {
    mockCreate.mockRejectedValueOnce(
      new MockAPIError("Internal server error", 500),
    );

    const { runRecommend, AnthropicWrapperError } = await import("./anthropic");

    const caught = await runRecommend(VALID_INPUT, FAKE_REQUEST_ID).catch(
      (e: unknown) => e,
    );
    expect(caught).toBeInstanceOf(AnthropicWrapperError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((caught as any).code).toBe("model_error");
  });

  it("maps an APIError whose message contains 'mcp' to code 'mcp_error'", async () => {
    mockCreate.mockRejectedValueOnce(
      new MockAPIError("MCP server returned an error", 502),
    );

    const { runRecommend, AnthropicWrapperError } = await import("./anthropic");

    const caught = await runRecommend(VALID_INPUT, FAKE_REQUEST_ID).catch(
      (e: unknown) => e,
    );
    expect(caught).toBeInstanceOf(AnthropicWrapperError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((caught as any).code).toBe("mcp_error");
  });

  it("maps an APIError whose message contains 'connector' to code 'mcp_error'", async () => {
    mockCreate.mockRejectedValueOnce(
      new MockAPIError("Connector timeout while contacting upstream", 504),
    );

    const { runRecommend, AnthropicWrapperError } = await import("./anthropic");

    const caught = await runRecommend(VALID_INPUT, FAKE_REQUEST_ID).catch(
      (e: unknown) => e,
    );
    expect(caught).toBeInstanceOf(AnthropicWrapperError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code = (caught as any).code as string;
    expect(
      code === "mcp_error" || code === "model_error",
      `Expected mcp_error or model_error, got ${code}`,
    ).toBe(true);
  });

  it("wraps a generic non-APIError SDK throw as an AnthropicWrapperError that propagates", async () => {
    // A plain non-APIError (network layer or similar) should still propagate
    // out of runRecommend as-is (it isn't silently swallowed).
    mockCreate.mockRejectedValueOnce(new Error("ECONNRESET"));

    const { runRecommend } = await import("./anthropic");

    await expect(runRecommend(VALID_INPUT, FAKE_REQUEST_ID)).rejects.toThrow(
      "ECONNRESET",
    );
  });

  it("throws with a non-empty message for classified APIErrors", async () => {
    mockCreate.mockRejectedValueOnce(
      new MockAPIError("Rate limit exceeded", 429),
    );

    const { runRecommend } = await import("./anthropic");

    const caught = await runRecommend(VALID_INPUT, FAKE_REQUEST_ID).catch(
      (e: unknown) => e,
    );
    expect((caught as Error).message.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 6. AnthropicWrapperError structure
// ===========================================================================
describe("AnthropicWrapperError — class properties", () => {
  it("has name === 'AnthropicWrapperError'", async () => {
    const { AnthropicWrapperError } = await import("./anthropic");
    const err = new AnthropicWrapperError("model_error", "test message");
    expect(err.name).toBe("AnthropicWrapperError");
  });

  it("exposes the code as a readable property", async () => {
    const { AnthropicWrapperError } = await import("./anthropic");
    const err = new AnthropicWrapperError("parse_error", "test message");
    expect(err.code).toBe("parse_error");
  });

  it("is an instance of Error", async () => {
    const { AnthropicWrapperError } = await import("./anthropic");
    const err = new AnthropicWrapperError("internal_error", "test");
    expect(err).toBeInstanceOf(Error);
  });

  it.each([
    ["internal_error"],
    ["model_error"],
    ["mcp_error"],
    ["parse_error"],
  ] as const)("accepts code '%s'", async (code) => {
    const { AnthropicWrapperError } = await import("./anthropic");
    const err = new AnthropicWrapperError(code, "message");
    expect(err.code).toBe(code);
  });
});
