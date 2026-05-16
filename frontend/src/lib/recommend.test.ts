import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RecommendRequest, Dish, RecommendResponse } from "@shared/types";
import { postRecommend, RecommendApiError } from "./recommend";

// User-facing copy locked in recommend.ts. The tests assert these literally
// so a wording change here is a deliberate decision, not an accident.
const FE_MSG = {
  validation_error: "There was a problem with your request.",
  internal_error: "Something went wrong on our end.",
  model_error: "We couldn't put together a recommendation just now.",
  mcp_error:
    "The restaurant data service is unavailable. Try again in a moment.",
  parse_error: "We got an unexpected response from the server.",
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal but fully valid RecommendRequest for use in POST-body tests. */
function makeRequest(): RecommendRequest {
  return {
    answers: { q1: "regular-meal" },
    passiveContext: {
      time: new Date().toISOString(),
      location: { lat: 19.076, lng: 72.877, label: "Mumbai" },
      historySummary: "Recent orders: Chicken Biryani",
    },
    profileSignal: {
      dietaryPattern: "non-veg",
      topCuisines: ["Biryani", "North Indian"],
      avgOrderValue: 280,
    },
  };
}

/** Build a single Dish that satisfies the backend's RecommendResponseSchema. */
function makeDish(overrides?: Partial<Dish>): Dish {
  return {
    id: "dish-001",
    name: "Chicken Biryani",
    restaurant: {
      name: "Behrouz Biryani",
      rating: 4.5,
      etaMinutes: 30,
      swiggyUrl: "https://swiggy.com/restaurant/behrouz",
    },
    imageUrl: "https://cdn.swiggy.com/images/biryani.jpg",
    priceInr: 280,
    cuisineTags: ["Biryani"],
    healthNudge: false,
    ...overrides,
  };
}

/** Build a valid 5-dish RecommendResponse envelope. */
function makeSuccessResponse(
  overrides?: Partial<RecommendResponse>,
): RecommendResponse {
  return {
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    dishes: Array.from({ length: 5 }, (_, i) =>
      makeDish({ id: `dish-00${i + 1}`, name: `Dish ${i + 1}` }),
    ),
    ...overrides,
  };
}

/**
 * Wire up global `fetch` to return a specific status + JSON body.
 * Returns the mock function for call assertions.
 */
function mockFetch(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/**
 * Wire up global `fetch` to return a non-JSON body (json() rejects).
 */
function mockFetchNonJson(status: number): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new SyntaxError("Unexpected token")),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// ---------------------------------------------------------------------------
// Reset mocks before every test — isolation guarantee.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ===========================================================================
// 1. Happy path — valid 200 response
// ===========================================================================
describe("postRecommend — happy path", () => {
  it("resolves to RecommendResponse when the server returns 200 with a valid 5-dish envelope", async () => {
    const expected = makeSuccessResponse();
    mockFetch(200, expected);

    const result = await postRecommend(makeRequest());

    expect(result.requestId).toBe(expected.requestId);
    expect(result.dishes).toHaveLength(5);
    expect(result.dishes[0].name).toBe("Dish 1");
  });

  it("returns the full dishes array unchanged so callers can access all 5 items", async () => {
    const expected = makeSuccessResponse();
    mockFetch(200, expected);

    const result = await postRecommend(makeRequest());

    expect(result.dishes).toEqual(expected.dishes);
  });
});

// ===========================================================================
// 2. 200 with malformed body — parse_error
// ===========================================================================
describe("postRecommend — shape validation on 2xx", () => {
  it("throws RecommendApiError with code='parse_error' when the 200 body has only 3 dishes", async () => {
    const bad = {
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      dishes: Array.from({ length: 3 }, (_, i) => makeDish({ id: `d${i}` })),
    };
    mockFetch(200, bad);

    await expect(postRecommend(makeRequest())).rejects.toMatchObject({
      name: "RecommendApiError",
      code: "parse_error",
      message: FE_MSG.parse_error,
      requestId: "",
    });
  });

  it("throws RecommendApiError with code='parse_error' when the 200 body is missing requestId", async () => {
    const { dishes } = makeSuccessResponse();
    const bad = { dishes }; // no requestId
    mockFetch(200, bad);

    await expect(postRecommend(makeRequest())).rejects.toMatchObject({
      name: "RecommendApiError",
      code: "parse_error",
      message: FE_MSG.parse_error,
    });
  });

  it("throws RecommendApiError with code='parse_error' when requestId is not a UUID", async () => {
    const bad = makeSuccessResponse({ requestId: "not-a-uuid" });
    mockFetch(200, bad);

    await expect(postRecommend(makeRequest())).rejects.toMatchObject({
      name: "RecommendApiError",
      code: "parse_error",
      message: FE_MSG.parse_error,
    });
  });

  it("throws RecommendApiError with code='parse_error' when the 200 body is null", async () => {
    mockFetch(200, null);

    await expect(postRecommend(makeRequest())).rejects.toMatchObject({
      name: "RecommendApiError",
      code: "parse_error",
    });
  });

  it("throws RecommendApiError with code='parse_error' when 200 body has 7 dishes instead of 5", async () => {
    const bad = {
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      dishes: Array.from({ length: 7 }, (_, i) => makeDish({ id: `d${i}` })),
    };
    mockFetch(200, bad);

    await expect(postRecommend(makeRequest())).rejects.toMatchObject({
      name: "RecommendApiError",
      code: "parse_error",
      message: FE_MSG.parse_error,
    });
  });
});

// ===========================================================================
// 3. Non-2xx with a proper RecommendError envelope
// ===========================================================================
describe("postRecommend — non-2xx with typed error envelope", () => {
  it.each([
    {
      label: "validation_error on 400",
      status: 400,
      envelope: {
        error: {
          code: "validation_error" as const,
          message: "q1 is required",
          requestId: "req-abc-123",
        },
      },
    },
    {
      label: "internal_error on 500",
      status: 500,
      envelope: {
        error: {
          code: "internal_error" as const,
          message: "Anthropic API unreachable",
          requestId: "req-def-456",
        },
      },
    },
    {
      label: "mcp_error on 502",
      status: 502,
      envelope: {
        error: {
          code: "mcp_error" as const,
          message: "Swiggy MCP timed out",
          requestId: "req-ghi-789",
        },
      },
    },
    {
      label: "model_error on 500",
      status: 500,
      envelope: {
        error: {
          code: "model_error" as const,
          message: "Model returned invalid JSON after retry",
          requestId: "req-jkl-012",
        },
      },
    },
  ])(
    "throws RecommendApiError with the envelope code/requestId and FE-mapped user copy — $label",
    async ({ status, envelope }) => {
      mockFetch(status, envelope);

      await expect(postRecommend(makeRequest())).rejects.toMatchObject({
        name: "RecommendApiError",
        code: envelope.error.code,
        message: FE_MSG[envelope.error.code],
        requestId: envelope.error.requestId,
      });
    },
  );

  it("ignores the server-supplied envelope.message and renders FE-mapped copy", async () => {
    // The server message could in principle leak internal details; the FE
    // never surfaces it. This test pins that contract.
    mockFetch(500, {
      error: {
        code: "internal_error",
        message: "<script>alert('xss')</script> internal stack trace blob",
        requestId: "req-zzz",
      },
    });

    const err = await postRecommend(makeRequest()).catch((e) => e);
    expect(err).toBeInstanceOf(RecommendApiError);
    expect(err.message).toBe(FE_MSG.internal_error);
    expect(err.message).not.toContain("script");
    expect(err.message).not.toContain("stack");
  });
});

// ===========================================================================
// 4. Non-2xx with malformed / non-JSON body
// ===========================================================================
describe("postRecommend — non-2xx without a parseable error envelope", () => {
  it("falls back to internal_error + FE copy when body is null", async () => {
    mockFetch(500, null);

    await expect(postRecommend(makeRequest())).rejects.toMatchObject({
      name: "RecommendApiError",
      code: "internal_error",
      message: FE_MSG.internal_error,
      requestId: "",
    });
  });

  it("falls back to internal_error + FE copy when body is not JSON", async () => {
    mockFetchNonJson(502);

    await expect(postRecommend(makeRequest())).rejects.toMatchObject({
      name: "RecommendApiError",
      code: "internal_error",
      message: FE_MSG.internal_error,
      requestId: "",
    });
  });

  it("falls back to internal_error + FE copy for a plain string body", async () => {
    mockFetch(503, "Service Unavailable");

    // A plain string is valid JSON but not a RecommendError envelope, so
    // env?.error?.code is undefined → falls back to internal_error.
    await expect(postRecommend(makeRequest())).rejects.toMatchObject({
      name: "RecommendApiError",
      code: "internal_error",
      message: FE_MSG.internal_error,
      requestId: "",
    });
  });

  it("does not embed the HTTP status code in the user-facing message for 404", async () => {
    // FE-mapped copy is intentionally status-agnostic so the user never sees
    // a transport-level number.
    mockFetch(404, null);

    const err = await postRecommend(makeRequest()).catch((e) => e);
    expect(err).toBeInstanceOf(RecommendApiError);
    expect(err.message).toBe(FE_MSG.internal_error);
    expect(err.message).not.toMatch(/404/);
  });
});

// ===========================================================================
// 5. HTTP semantics — POST shape
// ===========================================================================
describe("postRecommend — HTTP request shape", () => {
  it("sends a POST request to /api/recommend", async () => {
    const fetchMock = mockFetch(200, makeSuccessResponse());
    await postRecommend(makeRequest());

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/recommend");
    expect(init.method).toBe("POST");
  });

  it("sets Content-Type: application/json header", async () => {
    const fetchMock = mockFetch(200, makeSuccessResponse());
    await postRecommend(makeRequest());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("serialises the request body as JSON so the server can parse it", async () => {
    const fetchMock = mockFetch(200, makeSuccessResponse());
    const req = makeRequest();
    await postRecommend(req);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(typeof init.body).toBe("string");
    const parsed: unknown = JSON.parse(init.body as string);
    expect(parsed).toEqual(req);
  });

  it("serialises the selected hunger level verbatim in answers.q1", async () => {
    const fetchMock = mockFetch(200, makeSuccessResponse());
    const req = makeRequest();
    req.answers.q1 = "very-hungry";
    await postRecommend(req);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(init.body as string) as RecommendRequest;
    expect(parsed.answers.q1).toBe("very-hungry");
  });
});

// ===========================================================================
// 6. RecommendApiError class shape
// ===========================================================================
describe("RecommendApiError", () => {
  it("is an instance of Error", () => {
    const err = new RecommendApiError("internal_error", "boom", "req-123");
    expect(err).toBeInstanceOf(Error);
  });

  it("has name === 'RecommendApiError'", () => {
    const err = new RecommendApiError("internal_error", "boom", "req-123");
    expect(err.name).toBe("RecommendApiError");
  });

  it("exposes code, message, and requestId as public fields", () => {
    const err = new RecommendApiError("model_error", "bad json", "req-xyz");
    expect(err.code).toBe("model_error");
    expect(err.message).toBe("bad json");
    expect(err.requestId).toBe("req-xyz");
  });
});
