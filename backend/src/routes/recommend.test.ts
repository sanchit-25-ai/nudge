/**
 * Integration tests for POST /api/recommend — Items 04 + 05.
 *
 * Spec Item 04: .claude/specs/04-recommend-api.md  (validation, envelope, CORS, schema contract)
 * Spec Item 05: .claude/specs/05-anthropic-mcp-wiring.md  (runRecommend integration, error mapping)
 *
 * We construct an in-memory Express app that mounts exactly the same
 * middleware and routers as server.ts, but without calling app.listen().
 * This keeps supertest from fighting over port 3001 during test runs.
 *
 * `runRecommend` is mocked at the module boundary so tests never hit the
 * real Anthropic API. The Item 04 happy-path tests rely on this mock
 * (the fixture was removed in Item 05; the schema contract is preserved
 * because the mock returns a valid 5-dish array, same shape as before).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import type {
  RecommendRequest,
  RecommendResponse,
  RecommendError,
  Dish,
} from "@shared/types";
import {
  RecommendRequestSchema,
  RecommendResponseSchema,
} from "../schema";

// ---------------------------------------------------------------------------
// Mock runRecommend at the module boundary BEFORE importing the router.
//
// We export `mockRunRecommend` so individual tests can configure return values
// and rejection reasons without touching the Anthropic SDK.
// ---------------------------------------------------------------------------

// mockRunRecommend is configured per-test via mockResolvedValue / mockRejectedValue.
// Wrapped in vi.hoisted() so it is initialised at hoist-time, BEFORE the
// hoisted `vi.mock("../anthropic", ...)` factory below runs. Without this
// the factory would see an uninitialised binding (TDZ) and crash suite collection.
const mockRunRecommend = vi.hoisted(() => vi.fn());

vi.mock("../anthropic", () => {
  // AnthropicWrapperError must be a real class so `instanceof` checks in the
  // route handler work correctly.
  class AnthropicWrapperError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "AnthropicWrapperError";
      this.code = code;
    }
  }

  return {
    runRecommend: mockRunRecommend,
    AnthropicWrapperError,
    __esModule: true,
  };
});

// Import AFTER the mock is set up.
import { healthRouter } from "./health";
import { recommendRouter } from "./recommend";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp() {
  const app = express();

  function requestLogger(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const method = req.method;
    const path = req.originalUrl;
    res.on("finish", () => {
      const line: Record<string, unknown> = {
        t: new Date().toISOString(),
        requestId: (res.locals.requestId as string | undefined) ?? null,
        method,
        path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      };
      if (res.statusCode === 400) line.validation = "failed";
      else if (res.statusCode >= 200 && res.statusCode < 300) line.validation = "ok";
    });
    next();
  }

  app.use(cors({ origin: "http://localhost:5173" }));
  app.use(requestLogger);
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", healthRouter);
  app.use("/api", recommendRouter);

  return app;
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** A fully-valid RecommendRequest — satisfies RecommendRequestSchema. */
const VALID_BODY: RecommendRequest = {
  answers: {
    q1: "regular-meal",
  },
  passiveContext: {
    time: "2026-05-04T13:00:00.000Z",
    location: { lat: 19.076, lng: 72.8777, label: "Mumbai" },
    historySummary: "Mostly orders biryani and North Indian on weekday lunches.",
  },
  profileSignal: {
    dietaryPattern: "non-veg",
    topCuisines: ["North Indian", "Biryani"],
    avgOrderValue: 280,
  },
};

/** A minimal valid Dish for building mock return values. */
const VALID_DISH: Dish = {
  id: "test-dish-1",
  name: "Chicken Biryani",
  restaurant: {
    name: "Behrouz Biryani",
    rating: 4.4,
    etaMinutes: 32,
    swiggyUrl: "https://www.swiggy.com/restaurants/behrouz-biryani-mumbai",
  },
  imageUrl: "https://example.com/biryani.jpg",
  priceInr: 280,
  cuisineTags: ["Biryani", "Mughlai"],
  healthNudge: false,
};

/** Build an array of N dishes (all valid). */
function makeDishes(n: number): Dish[] {
  return Array.from({ length: n }, (_, i) => ({
    ...VALID_DISH,
    id: `test-dish-${i + 1}`,
    name: `Dish ${i + 1}`,
  }));
}

// UUID v4 pattern.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Reset between tests.
// ---------------------------------------------------------------------------
let app: ReturnType<typeof makeApp>;

beforeEach(() => {
  app = makeApp();
  process.env.ANTHROPIC_API_KEY = "test-api-key-fake";
  vi.clearAllMocks();
  // Default: mock resolves with exactly 5 valid dishes (happy path baseline).
  mockRunRecommend.mockResolvedValue(makeDishes(5));
});

// ===========================================================================
// 1. Happy path — Item 04 contract preserved, now sourced from runRecommend mock
// ===========================================================================
describe("POST /api/recommend — happy path", () => {
  it("returns HTTP 200 for a valid request body", async () => {
    const res = await request(app)
      .post("/api/recommend")
      .send(VALID_BODY)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
  });

  it("response body passes RecommendResponseSchema (structural contract)", async () => {
    const res = await request(app)
      .post("/api/recommend")
      .send(VALID_BODY)
      .set("Content-Type", "application/json");

    const parsed = RecommendResponseSchema.safeParse(res.body);
    expect(
      parsed.success,
      parsed.success
        ? ""
        : `Schema validation failed: ${JSON.stringify((parsed as { error: unknown }).error)}`,
    ).toBe(true);
  });

  it("requestId in the response is a UUID v4 string", async () => {
    const res = await request(app)
      .post("/api/recommend")
      .send(VALID_BODY)
      .set("Content-Type", "application/json");

    const body = res.body as RecommendResponse;
    expect(body.requestId).toMatch(UUID_RE);
  });

  it("dishes array has exactly 5 entries", async () => {
    const res = await request(app)
      .post("/api/recommend")
      .send(VALID_BODY)
      .set("Content-Type", "application/json");

    const body = res.body as RecommendResponse;
    expect(body.dishes).toHaveLength(5);
  });

  it("each dish carries all required card anatomy fields per spec §6.4", async () => {
    const res = await request(app)
      .post("/api/recommend")
      .send(VALID_BODY)
      .set("Content-Type", "application/json");

    const body = res.body as RecommendResponse;
    body.dishes.forEach((dish: Dish, i: number) => {
      expect(dish.id, `dish[${i}].id`).toBeTruthy();
      expect(dish.name, `dish[${i}].name`).toBeTruthy();
      expect(dish.restaurant.name, `dish[${i}].restaurant.name`).toBeTruthy();
      expect(typeof dish.restaurant.rating, `dish[${i}].restaurant.rating`).toBe("number");
      expect(typeof dish.restaurant.etaMinutes, `dish[${i}].restaurant.etaMinutes`).toBe("number");
      expect(dish.restaurant.swiggyUrl, `dish[${i}].restaurant.swiggyUrl`).toBeTruthy();
      expect(dish.imageUrl, `dish[${i}].imageUrl`).toBeTruthy();
      expect(typeof dish.priceInr, `dish[${i}].priceInr`).toBe("number");
      expect(Array.isArray(dish.cuisineTags), `dish[${i}].cuisineTags`).toBe(true);
      expect(typeof dish.healthNudge, `dish[${i}].healthNudge`).toBe("boolean");
    });
  });

  it("dishes in the response are exactly what runRecommend returned", async () => {
    const expectedDishes = makeDishes(5);
    mockRunRecommend.mockResolvedValueOnce(expectedDishes);

    const res = await request(app)
      .post("/api/recommend")
      .send(VALID_BODY)
      .set("Content-Type", "application/json");

    const body = res.body as RecommendResponse;
    expect(body.dishes).toEqual(expectedDishes);
  });

  it("route passes the requestId to runRecommend as second argument", async () => {
    const res = await request(app)
      .post("/api/recommend")
      .send(VALID_BODY)
      .set("Content-Type", "application/json");

    const body = res.body as RecommendResponse;
    // The requestId echoed in the response must be the same UUID passed to runRecommend.
    expect(mockRunRecommend).toHaveBeenCalledOnce();
    const calledWithRequestId = mockRunRecommend.mock.calls[0][1];
    expect(calledWithRequestId).toBe(body.requestId);
    expect(calledWithRequestId).toMatch(UUID_RE);
  });
});

// ===========================================================================
// 2. Validation — empty body (Item 04 contract unchanged)
// ===========================================================================
describe("POST /api/recommend — validation: empty body", () => {
  it("returns HTTP 400", async () => {
    const res = await request(app)
      .post("/api/recommend")
      .send({})
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
  });

  it("error.code === 'validation_error'", async () => {
    const res = await request(app)
      .post("/api/recommend")
      .send({})
      .set("Content-Type", "application/json");

    const body = res.body as RecommendError;
    expect(body.error.code).toBe("validation_error");
  });

  it("error.requestId is a UUID string", async () => {
    const res = await request(app)
      .post("/api/recommend")
      .send({})
      .set("Content-Type", "application/json");

    const body = res.body as RecommendError;
    expect(body.error.requestId).toMatch(UUID_RE);
  });

  it("error.details is a non-empty array", async () => {
    const res = await request(app)
      .post("/api/recommend")
      .send({})
      .set("Content-Type", "application/json");

    const body = res.body as RecommendError;
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(body.error.details!.length).toBeGreaterThan(0);
  });

  it("error.details contains entries for the three top-level required fields", async () => {
    const res = await request(app)
      .post("/api/recommend")
      .send({})
      .set("Content-Type", "application/json");

    const body = res.body as RecommendError;
    const paths = body.error.details!.map((d) => d.path);

    expect(paths.some((p) => p.startsWith("answers"))).toBe(true);
    expect(paths.some((p) => p.startsWith("passiveContext"))).toBe(true);
    expect(paths.some((p) => p.startsWith("profileSignal"))).toBe(true);
  });

  it("does NOT call runRecommend when body is invalid", async () => {
    await request(app)
      .post("/api/recommend")
      .send({})
      .set("Content-Type", "application/json");

    expect(mockRunRecommend).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 3. Validation — wrong type on answers.q1 (Item 04 contract unchanged)
// ===========================================================================
describe("POST /api/recommend — validation: wrong type on answers.q1", () => {
  it("returns HTTP 400", async () => {
    const body = { ...VALID_BODY, answers: { q1: 42 } };
    const res = await request(app)
      .post("/api/recommend")
      .send(body)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
  });

  it("error.details contains an entry with path 'answers.q1'", async () => {
    const body = { ...VALID_BODY, answers: { q1: 42 } };
    const res = await request(app)
      .post("/api/recommend")
      .send(body)
      .set("Content-Type", "application/json");

    const errBody = res.body as RecommendError;
    const hasQ1Issue = errBody.error.details!.some((d) => d.path === "answers.q1");
    expect(hasQ1Issue, "expected a details entry with path === 'answers.q1'").toBe(true);
  });
});

// ===========================================================================
// 4. Validation — bad q1 enum value (Item 04 contract unchanged)
// ===========================================================================
describe("POST /api/recommend — validation: invalid q1 enum value", () => {
  it("returns HTTP 400 for q1 = 'super-hungry'", async () => {
    const body = { ...VALID_BODY, answers: { q1: "super-hungry" } };
    const res = await request(app)
      .post("/api/recommend")
      .send(body)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
  });

  it("error.details contains an entry with path 'answers.q1' for invalid enum", async () => {
    const body = { ...VALID_BODY, answers: { q1: "super-hungry" } };
    const res = await request(app)
      .post("/api/recommend")
      .send(body)
      .set("Content-Type", "application/json");

    const errBody = res.body as RecommendError;
    const hasQ1Issue = errBody.error.details!.some((d) => d.path === "answers.q1");
    expect(hasQ1Issue, "expected a details entry with path === 'answers.q1'").toBe(true);
  });

  it.each([
    ["light-snack"],
    ["regular-meal"],
    ["very-hungry"],
  ] as const)(
    "accepts the valid q1 value '%s' with HTTP 200",
    async (q1) => {
      const body = { ...VALID_BODY, answers: { q1 } };
      const res = await request(app)
        .post("/api/recommend")
        .send(body)
        .set("Content-Type", "application/json");

      expect(res.status).toBe(200);
    },
  );
});

// ===========================================================================
// 5. Validation — invalid passiveContext.time (Item 04 contract unchanged)
// ===========================================================================
describe("POST /api/recommend — validation: invalid passiveContext.time", () => {
  it("returns HTTP 400 for a non-ISO time string", async () => {
    const body = {
      ...VALID_BODY,
      passiveContext: { ...VALID_BODY.passiveContext, time: "not-a-date" },
    };
    const res = await request(app)
      .post("/api/recommend")
      .send(body)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
  });

  it("error.details contains an entry with path 'passiveContext.time'", async () => {
    const body = {
      ...VALID_BODY,
      passiveContext: { ...VALID_BODY.passiveContext, time: "not-a-date" },
    };
    const res = await request(app)
      .post("/api/recommend")
      .send(body)
      .set("Content-Type", "application/json");

    const errBody = res.body as RecommendError;
    const hasTimeIssue = errBody.error.details!.some(
      (d) => d.path === "passiveContext.time",
    );
    expect(
      hasTimeIssue,
      "expected a details entry with path === 'passiveContext.time'",
    ).toBe(true);
  });
});

// ===========================================================================
// 6. Validation — profileSignal.avgOrderValue negative (Item 04 unchanged)
// ===========================================================================
describe("POST /api/recommend — validation: negative avgOrderValue", () => {
  it("returns HTTP 400 for avgOrderValue = -1", async () => {
    const body = {
      ...VALID_BODY,
      profileSignal: { ...VALID_BODY.profileSignal, avgOrderValue: -1 },
    };
    const res = await request(app)
      .post("/api/recommend")
      .send(body)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
  });

  it("error.details contains an entry with path 'profileSignal.avgOrderValue'", async () => {
    const body = {
      ...VALID_BODY,
      profileSignal: { ...VALID_BODY.profileSignal, avgOrderValue: -1 },
    };
    const res = await request(app)
      .post("/api/recommend")
      .send(body)
      .set("Content-Type", "application/json");

    const errBody = res.body as RecommendError;
    const hasIssue = errBody.error.details!.some(
      (d) => d.path === "profileSignal.avgOrderValue",
    );
    expect(
      hasIssue,
      "expected a details entry with path === 'profileSignal.avgOrderValue'",
    ).toBe(true);
  });

  it("accepts avgOrderValue === 0 (boundary: non-negative)", async () => {
    const body = {
      ...VALID_BODY,
      profileSignal: { ...VALID_BODY.profileSignal, avgOrderValue: 0 },
    };
    const res = await request(app)
      .post("/api/recommend")
      .send(body)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// 7. Validation error carries no echoed input (Item 04 contract unchanged)
// ===========================================================================
describe("POST /api/recommend — validation error: no echoed input", () => {
  it("error response body does not contain the sentinel string from the request", async () => {
    const SENTINEL = "UNIQUE_SENTINEL_STRING_XYZ_7f3a9b2c";

    const body = {
      answers: { q1: "bad-enum-value" },
      passiveContext: {
        time: "2026-05-04T13:00:00.000Z",
        location: { lat: 19.076, lng: 72.8777, label: "Mumbai" },
        historySummary: SENTINEL,
      },
      profileSignal: {
        dietaryPattern: "non-veg",
        topCuisines: ["North Indian"],
        avgOrderValue: 280,
      },
    };

    const res = await request(app)
      .post("/api/recommend")
      .send(body)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    const responseText = JSON.stringify(res.body);
    expect(
      responseText.includes(SENTINEL),
      "error response must not echo back any request input values",
    ).toBe(false);
  });

  it("details entries contain only path and message — no incoming values", async () => {
    const body = {
      ...VALID_BODY,
      answers: { q1: "INJECTED_VALUE_SHOULD_NOT_APPEAR" },
    };

    const res = await request(app)
      .post("/api/recommend")
      .send(body)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);

    const errBody = res.body as RecommendError;
    const detailsStr = JSON.stringify(errBody.error.details);
    expect(
      detailsStr.includes("INJECTED_VALUE_SHOULD_NOT_APPEAR"),
      "Zod issue details must not contain the received enum value",
    ).toBe(false);
  });
});

// ===========================================================================
// 8. Optional Phase-B fields accepted without validation error (Item 04)
// ===========================================================================
describe("POST /api/recommend — optional Phase-B fields (q2, q3, freetext)", () => {
  it("accepts a body that includes all optional Phase-B answer fields and returns 200", async () => {
    const body: RecommendRequest = {
      answers: {
        q1: "very-hungry",
        q2: "comfort-favourite",
        q3: ["veg-only", "budget"],
        freetext: "I want something hearty and under ₹300",
      },
      passiveContext: VALID_BODY.passiveContext,
      profileSignal: VALID_BODY.profileSignal,
    };

    const res = await request(app)
      .post("/api/recommend")
      .send(body)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
  });

  it("accepts all valid q2 enum values", async () => {
    const q2Values = [
      "comfort-favourite",
      "healthy",
      "indulgent",
      "surprise-me",
    ] as const;

    for (const q2 of q2Values) {
      const body: RecommendRequest = {
        ...VALID_BODY,
        answers: { ...VALID_BODY.answers, q2 },
      };
      const res = await request(app)
        .post("/api/recommend")
        .send(body)
        .set("Content-Type", "application/json");

      expect(res.status, `q2='${q2}' should be accepted`).toBe(200);
    }
  });

  it("accepts all valid q3 constraint enum values", async () => {
    const body: RecommendRequest = {
      ...VALID_BODY,
      answers: {
        ...VALID_BODY.answers,
        q3: ["veg-only", "fast-delivery", "budget", "high-rated"],
      },
    };
    const res = await request(app)
      .post("/api/recommend")
      .send(body)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
  });

  it("accepts a body that omits all optional fields (q1-only baseline)", async () => {
    const body: RecommendRequest = {
      answers: { q1: "light-snack" },
      passiveContext: VALID_BODY.passiveContext,
      profileSignal: VALID_BODY.profileSignal,
    };

    const res = await request(app)
      .post("/api/recommend")
      .send(body)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// 9. requestId uniqueness (Item 04 contract unchanged)
// ===========================================================================
describe("POST /api/recommend — requestId uniqueness", () => {
  it("two consecutive valid requests produce different requestIds", async () => {
    const [res1, res2] = await Promise.all([
      request(app).post("/api/recommend").send(VALID_BODY).set("Content-Type", "application/json"),
      request(app).post("/api/recommend").send(VALID_BODY).set("Content-Type", "application/json"),
    ]);

    const body1 = res1.body as RecommendResponse;
    const body2 = res2.body as RecommendResponse;

    expect(body1.requestId).not.toBe(body2.requestId);
  });

  it("both concurrent requestIds are valid UUIDs", async () => {
    const [res1, res2] = await Promise.all([
      request(app).post("/api/recommend").send(VALID_BODY).set("Content-Type", "application/json"),
      request(app).post("/api/recommend").send(VALID_BODY).set("Content-Type", "application/json"),
    ]);

    expect((res1.body as RecommendResponse).requestId).toMatch(UUID_RE);
    expect((res2.body as RecommendResponse).requestId).toMatch(UUID_RE);
  });
});

// ===========================================================================
// 10. requestId round-trips in both success and error responses (Item 04)
// ===========================================================================
describe("POST /api/recommend — requestId present in all response shapes", () => {
  it("success response contains a non-empty UUID requestId", async () => {
    const res = await request(app)
      .post("/api/recommend")
      .send(VALID_BODY)
      .set("Content-Type", "application/json");

    const body = res.body as RecommendResponse;
    expect(body.requestId).toMatch(UUID_RE);
  });

  it("validation-error response contains a non-empty UUID requestId", async () => {
    const res = await request(app)
      .post("/api/recommend")
      .send({})
      .set("Content-Type", "application/json");

    const body = res.body as RecommendError;
    expect(body.error.requestId).toMatch(UUID_RE);
  });
});

// ===========================================================================
// 11. Health route still works (Item 04 contract unchanged)
// ===========================================================================
describe("GET /api/health — not broken by recommend middleware", () => {
  it("returns HTTP 200 with { status: 'ok' }", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

// ===========================================================================
// 12. CORS — scoped to :5173 only (Item 04 contract unchanged)
// ===========================================================================
describe("CORS — scoped to http://localhost:5173", () => {
  it("OPTIONS preflight from the FE origin returns Access-Control-Allow-Origin: http://localhost:5173", async () => {
    const res = await request(app)
      .options("/api/recommend")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "Content-Type");

    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });

  it("a request from a disallowed origin does NOT reflect that origin in ACAO header", async () => {
    const res = await request(app)
      .get("/api/health")
      .set("Origin", "http://evil.example.com");

    const acao = res.headers["access-control-allow-origin"];
    expect(acao).not.toBe("http://evil.example.com");
  });
});

// ===========================================================================
// 13. Error mapping — Item 05: AnthropicWrapperError codes → HTTP statuses
//
// Spec §"Tech choices" — HTTP status mapping:
//   internal_error → 500
//   model_error    → 502
//   mcp_error      → 502
//   parse_error    → 502
//   validation_error → 400 (unchanged from Item 04)
// ===========================================================================
describe("POST /api/recommend — error mapping from AnthropicWrapperError (Item 05)", () => {
  // We need the real AnthropicWrapperError class that the route's `instanceof`
  // check runs against. Since we mocked the module we need to grab it from there.
  // The mock factory defines it identically to the real class.

  it.each([
    ["internal_error", 500],
    ["model_error", 502],
    ["mcp_error", 502],
    ["parse_error", 502],
  ] as const)(
    "runRecommend throwing AnthropicWrapperError(code='%s') → HTTP %i",
    async (code, expectedStatus) => {
      const { AnthropicWrapperError } = await import("../anthropic");
      mockRunRecommend.mockRejectedValueOnce(
        new AnthropicWrapperError(code, `Simulated ${code} failure`),
      );

      const res = await request(app)
        .post("/api/recommend")
        .send(VALID_BODY)
        .set("Content-Type", "application/json");

      expect(res.status).toBe(expectedStatus);
    },
  );

  it.each([
    ["internal_error"],
    ["model_error"],
    ["mcp_error"],
    ["parse_error"],
  ] as const)(
    "error.code in response matches the wrapper's code '%s'",
    async (code) => {
      const { AnthropicWrapperError } = await import("../anthropic");
      mockRunRecommend.mockRejectedValueOnce(
        new AnthropicWrapperError(code, `Simulated ${code} failure`),
      );

      const res = await request(app)
        .post("/api/recommend")
        .send(VALID_BODY)
        .set("Content-Type", "application/json");

      const body = res.body as RecommendError;
      expect(body.error.code).toBe(code);
    },
  );

  it.each([
    ["internal_error"],
    ["model_error"],
    ["mcp_error"],
    ["parse_error"],
  ] as const)(
    "error.message is populated (non-empty) for code '%s'",
    async (code) => {
      const { AnthropicWrapperError } = await import("../anthropic");
      const originalMessage = `Simulated ${code} failure`;
      mockRunRecommend.mockRejectedValueOnce(
        new AnthropicWrapperError(code, originalMessage),
      );

      const res = await request(app)
        .post("/api/recommend")
        .send(VALID_BODY)
        .set("Content-Type", "application/json");

      const body = res.body as RecommendError;
      expect(body.error.message.length).toBeGreaterThan(0);
    },
  );

  it.each([
    ["internal_error"],
    ["model_error"],
    ["mcp_error"],
    ["parse_error"],
  ] as const)(
    "error.requestId is a valid UUID for code '%s'",
    async (code) => {
      const { AnthropicWrapperError } = await import("../anthropic");
      mockRunRecommend.mockRejectedValueOnce(
        new AnthropicWrapperError(code, `Simulated ${code}`),
      );

      const res = await request(app)
        .post("/api/recommend")
        .send(VALID_BODY)
        .set("Content-Type", "application/json");

      const body = res.body as RecommendError;
      expect(
        body.error.requestId,
        `error.requestId must be a UUID for code=${code}`,
      ).toMatch(UUID_RE);
    },
  );
});

// ===========================================================================
// 14. Non-AnthropicWrapperError — plain Error → 500 internal_error (Item 05)
// ===========================================================================
describe("POST /api/recommend — non-AnthropicWrapperError plain Error (Item 05)", () => {
  it("returns HTTP 500 when runRecommend throws a plain Error", async () => {
    mockRunRecommend.mockRejectedValueOnce(new Error("Unexpected database error"));

    const res = await request(app)
      .post("/api/recommend")
      .send(VALID_BODY)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(500);
  });

  it("error.code === 'internal_error' for a plain Error", async () => {
    mockRunRecommend.mockRejectedValueOnce(new Error("Unexpected database error"));

    const res = await request(app)
      .post("/api/recommend")
      .send(VALID_BODY)
      .set("Content-Type", "application/json");

    const body = res.body as RecommendError;
    expect(body.error.code).toBe("internal_error");
  });

  it("error.message does not echo the original error message (generic, non-leaking)", async () => {
    const SECRET_DETAIL = "INTERNAL_IMPL_DETAIL_SHOULD_NOT_LEAK";
    mockRunRecommend.mockRejectedValueOnce(new Error(SECRET_DETAIL));

    const res = await request(app)
      .post("/api/recommend")
      .send(VALID_BODY)
      .set("Content-Type", "application/json");

    const body = res.body as RecommendError;
    expect(
      body.error.message.includes(SECRET_DETAIL),
      "Route must not echo internal error details to the client",
    ).toBe(false);
  });

  it("error.requestId is a valid UUID for a plain Error", async () => {
    mockRunRecommend.mockRejectedValueOnce(new Error("Boom"));

    const res = await request(app)
      .post("/api/recommend")
      .send(VALID_BODY)
      .set("Content-Type", "application/json");

    const body = res.body as RecommendError;
    expect(body.error.requestId).toMatch(UUID_RE);
  });

  it("error.details is absent (no Zod details for non-validation errors)", async () => {
    mockRunRecommend.mockRejectedValueOnce(new Error("Boom"));

    const res = await request(app)
      .post("/api/recommend")
      .send(VALID_BODY)
      .set("Content-Type", "application/json");

    const body = res.body as RecommendError;
    expect(body.error.details).toBeUndefined();
  });
});

// ===========================================================================
// 15. Schema: RecommendRequestSchema (Item 04) — preserved for regression
// ===========================================================================
describe("RecommendRequestSchema — regression (Item 04 schema contract)", () => {
  it("accepts VALID_BODY as a valid request", () => {
    const result = RecommendRequestSchema.safeParse(VALID_BODY);
    expect(result.success).toBe(true);
  });

  it("rejects an empty object", () => {
    const result = RecommendRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
