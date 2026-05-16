import { describe, it, expect, beforeEach } from "vitest";
import type { UserProfile } from "@shared/types";
import { buildPassiveContext } from "./passiveContext";
import { MUMBAI_NON_VEG_PERSONA } from "./profile";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep-clone so test mutations don't bleed into the shared constant. */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** The seeded Mumbai persona — our representative valid profile. */
function persona(): UserProfile {
  return clone(MUMBAI_NON_VEG_PERSONA);
}

/**
 * Build a profile with N orders, each with a distinct dishName.
 * All other fields come from the seeded persona.
 */
function profileWithOrders(count: number): UserProfile {
  const base = persona();
  base.orderHistory = Array.from({ length: count }, (_, i) => ({
    dishName: `Dish ${i + 1}`,
    cuisineCategory: "Test",
    restaurant: `Restaurant ${i + 1}`,
    orderedAt: "2026-04-01",
    isVeg: false,
    priceRange: "mid" as const,
  }));
  return base;
}

// ---------------------------------------------------------------------------
// Reset before every test.
// ---------------------------------------------------------------------------
beforeEach(() => {
  // No shared mutable state in passiveContext.ts, but keep the pattern
  // consistent with the rest of the test suite.
});

// ===========================================================================
// 1. `time` field
// ===========================================================================
describe("buildPassiveContext — time field", () => {
  it("returns a non-empty string for time", () => {
    const ctx = buildPassiveContext(persona());
    expect(typeof ctx.time).toBe("string");
    expect(ctx.time.length).toBeGreaterThan(0);
  });

  it("time parses as a valid ISO 8601 date (Date.parse returns non-NaN)", () => {
    const ctx = buildPassiveContext(persona());
    expect(
      Date.parse(ctx.time),
      `Expected "${ctx.time}" to be a valid ISO 8601 string`,
    ).not.toBeNaN();
  });

  it("time represents a moment close to now (within 5 seconds)", () => {
    const before = Date.now();
    const ctx = buildPassiveContext(persona());
    const after = Date.now();
    const ts = Date.parse(ctx.time);
    expect(ts).toBeGreaterThanOrEqual(before - 100); // generous 100 ms slack
    expect(ts).toBeLessThanOrEqual(after + 100);
  });
});

// ===========================================================================
// 2. `location` field
// ===========================================================================
describe("buildPassiveContext — location field", () => {
  it("passes through profile.location verbatim", () => {
    const p = persona();
    const ctx = buildPassiveContext(p);
    expect(ctx.location).toEqual(p.location);
  });

  it("lat and lng match the profile's location coordinates", () => {
    const p = persona();
    const ctx = buildPassiveContext(p);
    expect(ctx.location.lat).toBe(p.location.lat);
    expect(ctx.location.lng).toBe(p.location.lng);
  });

  it("location.label matches the profile's location label", () => {
    const p = persona();
    const ctx = buildPassiveContext(p);
    expect(ctx.location.label).toBe(p.location.label);
  });

  it("reflects a custom location when the profile has a non-Mumbai location", () => {
    const p = persona();
    p.location = { lat: 12.971, lng: 77.594, label: "Bengaluru" };
    const ctx = buildPassiveContext(p);
    expect(ctx.location).toEqual({ lat: 12.971, lng: 77.594, label: "Bengaluru" });
  });
});

// ===========================================================================
// 3. `historySummary` field — non-empty order history
// ===========================================================================
describe("buildPassiveContext — historySummary with orders", () => {
  it("produces 'Recent orders: <d1>, <d2>, <d3>' when the profile has exactly 3 orders", () => {
    const p = profileWithOrders(3);
    const ctx = buildPassiveContext(p);
    expect(ctx.historySummary).toBe("Recent orders: Dish 1, Dish 2, Dish 3");
  });

  it("uses only the first 3 dish names when the profile has more than 3 orders", () => {
    const p = profileWithOrders(5);
    const ctx = buildPassiveContext(p);
    // Should reference Dish 1, 2, 3 but NOT Dish 4 or Dish 5.
    expect(ctx.historySummary).toBe("Recent orders: Dish 1, Dish 2, Dish 3");
    expect(ctx.historySummary).not.toContain("Dish 4");
    expect(ctx.historySummary).not.toContain("Dish 5");
  });

  it("uses only the first 3 from the seeded Mumbai persona (which has 3 orders)", () => {
    const p = persona(); // has Chicken Biryani, Butter Chicken, Hakka Noodles
    const ctx = buildPassiveContext(p);
    expect(ctx.historySummary).toBe(
      "Recent orders: Chicken Biryani, Butter Chicken, Hakka Noodles",
    );
  });

  it("produces 'Recent orders: <d1>' when the profile has exactly 1 order", () => {
    const p = profileWithOrders(1);
    const ctx = buildPassiveContext(p);
    expect(ctx.historySummary).toBe("Recent orders: Dish 1");
  });

  it("produces 'Recent orders: <d1>, <d2>' when the profile has exactly 2 orders", () => {
    const p = profileWithOrders(2);
    const ctx = buildPassiveContext(p);
    expect(ctx.historySummary).toBe("Recent orders: Dish 1, Dish 2");
  });

  it("starts with the prefix 'Recent orders: ' for any non-empty history", () => {
    const p = profileWithOrders(1);
    const ctx = buildPassiveContext(p);
    expect(ctx.historySummary.startsWith("Recent orders: ")).toBe(true);
  });
});

// ===========================================================================
// 4. `historySummary` field — empty order history
// ===========================================================================
describe("buildPassiveContext — historySummary with empty order history", () => {
  it("returns empty string '' (not undefined, not null, not omitted) when orderHistory is []", () => {
    const p = profileWithOrders(0);
    const ctx = buildPassiveContext(p);
    expect(ctx.historySummary).toBe("");
  });

  it("the historySummary key is present in the returned object even when empty", () => {
    const p = profileWithOrders(0);
    const ctx = buildPassiveContext(p);
    // eslint-disable-next-line no-prototype-builtins
    expect(Object.prototype.hasOwnProperty.call(ctx, "historySummary")).toBe(true);
  });
});

// ===========================================================================
// 5. Return value is a valid PassiveContext shape
// ===========================================================================
describe("buildPassiveContext — returned object shape", () => {
  it("returns an object with exactly the keys: time, location, historySummary", () => {
    const ctx = buildPassiveContext(persona());
    const keys = Object.keys(ctx).sort();
    expect(keys).toEqual(["historySummary", "location", "time"]);
  });
});
