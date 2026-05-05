/**
 * Unit tests for Zod schemas in backend/src/schema.ts — Item 04.
 *
 * Spec: .claude/specs/04-recommend-api.md § "Schema unit-level" coverage.
 *
 * These tests validate the schema definitions themselves (not the HTTP layer),
 * covering parse/safeParse on both valid and deliberately invalid inputs.
 * They complement the HTTP-layer tests in routes/recommend.test.ts.
 */

import { describe, it, expect } from "vitest";
import { RecommendRequestSchema, RecommendResponseSchema } from "./schema";
import type { RecommendRequest, RecommendResponse, Dish, Restaurant } from "@shared/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal valid restaurant shape. */
const VALID_RESTAURANT: Restaurant = {
  name: "Behrouz Biryani",
  rating: 4.4,
  etaMinutes: 32,
  swiggyUrl: "https://www.swiggy.com/restaurants/behrouz-biryani-mumbai",
};

/** A minimal valid dish shape. */
const VALID_DISH: Dish = {
  id: "test-dish-1",
  name: "Chicken Biryani",
  restaurant: VALID_RESTAURANT,
  imageUrl: "https://example.com/biryani.jpg",
  priceInr: 280,
  cuisineTags: ["Biryani", "Mughlai"],
  healthNudge: false,
};

/** Build an array of N dishes (all valid) for testing array-length constraints. */
function makeDishes(n: number): Dish[] {
  return Array.from({ length: n }, (_, i) => ({
    ...VALID_DISH,
    id: `test-dish-${i + 1}`,
  }));
}

/** A fully-valid RecommendRequest. */
const VALID_REQUEST: RecommendRequest = {
  answers: {
    q1: "regular-meal",
  },
  passiveContext: {
    time: "2026-05-04T13:00:00.000Z",
    location: { lat: 19.076, lng: 72.8777, label: "Mumbai" },
    historySummary: "Mostly orders biryani on weekday lunches.",
  },
  profileSignal: {
    dietaryPattern: "non-veg",
    topCuisines: ["North Indian", "Biryani"],
    avgOrderValue: 280,
  },
};

/** A fully-valid RecommendResponse (5 dishes, UUID requestId). */
const VALID_RESPONSE: RecommendResponse = {
  requestId: "a1b2c3d4-e5f6-4789-89ab-cdef01234567",
  dishes: makeDishes(5),
};

// ===========================================================================
// 1. RecommendRequestSchema — basic safeParse behaviour
// ===========================================================================
describe("RecommendRequestSchema", () => {
  it("accepts a fully valid request (q1-only baseline)", () => {
    const result = RecommendRequestSchema.safeParse(VALID_REQUEST);
    expect(result.success).toBe(true);
  });

  it("rejects an empty object — success: false", () => {
    const result = RecommendRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects when answers is missing", () => {
    const { answers: _answers, ...noAnswers } = VALID_REQUEST;
    const result = RecommendRequestSchema.safeParse(noAnswers);
    expect(result.success).toBe(false);
  });

  it("rejects when passiveContext is missing", () => {
    const { passiveContext: _pc, ...noPc } = VALID_REQUEST;
    const result = RecommendRequestSchema.safeParse(noPc);
    expect(result.success).toBe(false);
  });

  it("rejects when profileSignal is missing", () => {
    const { profileSignal: _ps, ...noPs } = VALID_REQUEST;
    const result = RecommendRequestSchema.safeParse(noPs);
    expect(result.success).toBe(false);
  });

  // --- q1 enum ---
  it.each([
    ["light-snack"],
    ["regular-meal"],
    ["very-hungry"],
  ] as const)(
    "accepts valid q1 enum value '%s'",
    (q1) => {
      const result = RecommendRequestSchema.safeParse({
        ...VALID_REQUEST,
        answers: { q1 },
      });
      expect(result.success).toBe(true);
    }
  );

  it("rejects q1 = 'super-hungry' (not in enum)", () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      answers: { q1: "super-hungry" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects q1 as a number (wrong type)", () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      answers: { q1: 42 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects q1 as null", () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      answers: { q1: null },
    });
    expect(result.success).toBe(false);
  });

  // --- q2 (optional) ---
  it("accepts a request with optional q2 present", () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      answers: { ...VALID_REQUEST.answers, q2: "healthy" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid q2 enum value", () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      answers: { ...VALID_REQUEST.answers, q2: "junk-food" },
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["comfort-favourite"],
    ["healthy"],
    ["indulgent"],
    ["surprise-me"],
  ] as const)(
    "accepts valid q2 enum value '%s'",
    (q2) => {
      const result = RecommendRequestSchema.safeParse({
        ...VALID_REQUEST,
        answers: { ...VALID_REQUEST.answers, q2 },
      });
      expect(result.success).toBe(true);
    }
  );

  // --- q3 (optional array) ---
  it("accepts a request with valid q3 constraints array", () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      answers: {
        ...VALID_REQUEST.answers,
        q3: ["veg-only", "budget"],
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty q3 array", () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      answers: { ...VALID_REQUEST.answers, q3: [] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects q3 containing an invalid constraint string", () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      answers: { ...VALID_REQUEST.answers, q3: ["veg-only", "invalid-constraint"] },
    });
    expect(result.success).toBe(false);
  });

  // --- freetext (optional) ---
  it("accepts a request with freetext present", () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      answers: {
        ...VALID_REQUEST.answers,
        freetext: "Something comforting, under ₹300",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects freetext that exceeds 500 characters", () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      answers: {
        ...VALID_REQUEST.answers,
        freetext: "x".repeat(501),
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts freetext of exactly 500 characters (boundary)", () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      answers: {
        ...VALID_REQUEST.answers,
        freetext: "x".repeat(500),
      },
    });
    expect(result.success).toBe(true);
  });

  // --- passiveContext.time ---
  it("rejects a non-ISO time string", () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      passiveContext: { ...VALID_REQUEST.passiveContext, time: "not-a-date" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a partial date string (YYYY-MM-DD only, not ISO 8601 datetime)", () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      passiveContext: { ...VALID_REQUEST.passiveContext, time: "2026-05-04" },
    });
    expect(result.success).toBe(false);
  });

  // --- profileSignal.avgOrderValue ---
  it("rejects negative avgOrderValue", () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      profileSignal: { ...VALID_REQUEST.profileSignal, avgOrderValue: -0.01 },
    });
    expect(result.success).toBe(false);
  });

  it("accepts avgOrderValue of 0 (boundary: non-negative)", () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      profileSignal: { ...VALID_REQUEST.profileSignal, avgOrderValue: 0 },
    });
    expect(result.success).toBe(true);
  });

  // --- dietaryPattern ---
  it("rejects an invalid dietaryPattern value", () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      profileSignal: { ...VALID_REQUEST.profileSignal, dietaryPattern: "vegan" },
    });
    expect(result.success).toBe(false);
  });

  it.each([["veg"], ["non-veg"]] as const)(
    "accepts valid dietaryPattern '%s'",
    (dietaryPattern) => {
      const result = RecommendRequestSchema.safeParse({
        ...VALID_REQUEST,
        profileSignal: { ...VALID_REQUEST.profileSignal, dietaryPattern },
      });
      expect(result.success).toBe(true);
    }
  );
});

// ===========================================================================
// 2. RecommendResponseSchema — structural contract and length constraint
// ===========================================================================
describe("RecommendResponseSchema", () => {
  it("parses a fully valid response without throwing", () => {
    // Using .parse() (throws) to assert the contract doesn't reject a
    // hand-built valid shape — the canonical "fixture contract" test.
    const parsed = RecommendResponseSchema.parse(VALID_RESPONSE);
    expect(parsed.requestId).toBe(VALID_RESPONSE.requestId);
    expect(parsed.dishes).toHaveLength(5);
  });

  it("accepts a response where requestId is a valid UUID", () => {
    const result = RecommendResponseSchema.safeParse(VALID_RESPONSE);
    expect(result.success).toBe(true);
  });

  it("rejects a response where requestId is not a UUID string", () => {
    const result = RecommendResponseSchema.safeParse({
      ...VALID_RESPONSE,
      requestId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a dishes array of length 4 (one short of required 5)", () => {
    const result = RecommendResponseSchema.safeParse({
      ...VALID_RESPONSE,
      dishes: makeDishes(4),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a dishes array of length 6 (one over required 5)", () => {
    const result = RecommendResponseSchema.safeParse({
      ...VALID_RESPONSE,
      dishes: makeDishes(6),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty dishes array", () => {
    const result = RecommendResponseSchema.safeParse({
      ...VALID_RESPONSE,
      dishes: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 5 dishes (boundary)", () => {
    const result = RecommendResponseSchema.safeParse({
      ...VALID_RESPONSE,
      dishes: makeDishes(5),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a dish whose restaurant.swiggyUrl is not a URL", () => {
    const badDish: Dish = {
      ...VALID_DISH,
      restaurant: { ...VALID_RESTAURANT, swiggyUrl: "not-a-url" },
    };
    const result = RecommendResponseSchema.safeParse({
      ...VALID_RESPONSE,
      dishes: [badDish, ...makeDishes(4)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a dish whose imageUrl is not a URL", () => {
    const badDish: Dish = { ...VALID_DISH, imageUrl: "not-a-url" };
    const result = RecommendResponseSchema.safeParse({
      ...VALID_RESPONSE,
      dishes: [badDish, ...makeDishes(4)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a dish with a negative priceInr", () => {
    const badDish: Dish = { ...VALID_DISH, priceInr: -1 };
    const result = RecommendResponseSchema.safeParse({
      ...VALID_RESPONSE,
      dishes: [badDish, ...makeDishes(4)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a dish with restaurant.rating > 5", () => {
    const badDish: Dish = {
      ...VALID_DISH,
      restaurant: { ...VALID_RESTAURANT, rating: 5.1 },
    };
    const result = RecommendResponseSchema.safeParse({
      ...VALID_RESPONSE,
      dishes: [badDish, ...makeDishes(4)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a dish with restaurant.rating < 0", () => {
    const badDish: Dish = {
      ...VALID_DISH,
      restaurant: { ...VALID_RESTAURANT, rating: -0.1 },
    };
    const result = RecommendResponseSchema.safeParse({
      ...VALID_RESPONSE,
      dishes: [badDish, ...makeDishes(4)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a dish with a non-integer etaMinutes", () => {
    const badDish: Dish = {
      ...VALID_DISH,
      restaurant: { ...VALID_RESTAURANT, etaMinutes: 1.5 },
    };
    const result = RecommendResponseSchema.safeParse({
      ...VALID_RESPONSE,
      dishes: [badDish, ...makeDishes(4)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a dish with a non-boolean healthNudge", () => {
    const result = RecommendResponseSchema.safeParse({
      ...VALID_RESPONSE,
      dishes: [
        { ...VALID_DISH, healthNudge: "yes" },
        ...makeDishes(4),
      ],
    });
    expect(result.success).toBe(false);
  });

  it("round-trips the valid fixture shape unchanged after parse", () => {
    const parsed = RecommendResponseSchema.parse(VALID_RESPONSE);
    // Deep-equal check — schema must not strip or transform the shape.
    expect(parsed).toEqual(VALID_RESPONSE);
  });
});
