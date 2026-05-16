/**
 * Tests for frontend/src/lib/passiveContext.ts — Item 09 (Passive-Context Collector)
 *
 * Spec: .claude/specs/09-passive-context-collector.md
 * Build-plan item: Phase A, Item 09.
 *
 * All behaviors derive from the spec. The implementation is read only for import
 * paths and exported symbol names — not for test logic.
 *
 * PassiveContextSchema is module-private in backend/src/schema.ts and pulling it
 * into the frontend would create an unclean cross-workspace coupling. Instead, the
 * wire-schema test (case 22) inlines a minimal Zod mirror that reproduces exactly
 * the three checks the spec locks: `time` is `.datetime()`, `location` is
 * `{ lat: number, lng: number, label: string (1..100) }`, and `historySummary` is
 * a string ≤ 2000 chars. This keeps the FE test self-contained while still
 * asserting the contract.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { z } from "zod";
import type { Location, UserProfile } from "@shared/types";
import {
  buildPassiveContext,
  buildHistorySummary,
  getBrowserLocation,
  GEO_TIMEOUT_MS,
} from "./passiveContext";
import { MUMBAI_NON_VEG_PERSONA } from "./profile";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep-clone so test mutations don't bleed into the shared constant. */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** The seeded Mumbai persona — representative valid profile. */
function persona(): UserProfile {
  return clone(MUMBAI_NON_VEG_PERSONA);
}

/**
 * Build a profile with N orders. Each order gets a distinct dishName
 * ("Dish 1", "Dish 2", …). All other fields come from the seeded persona.
 * cuisineCategory rotates through three distinct values so tie-breaking
 * tests can control dominance precisely.
 */
function profileWithOrders(
  count: number,
  cuisines?: string[],
): UserProfile {
  const base = persona();
  base.orderHistory = Array.from({ length: count }, (_, i) => ({
    dishName: `Dish ${i + 1}`,
    cuisineCategory: cuisines ? cuisines[i % cuisines.length] : "TestCuisine",
    restaurant: `Restaurant ${i + 1}`,
    orderedAt: "2026-04-01",
    isVeg: false,
    priceRange: "mid" as const,
  }));
  return base;
}

/**
 * Build a fake navigator with a controlled `getCurrentPosition`.
 * `impl` receives the same (successCb, errorCb, opts) arguments the real API
 * does. Calling it inline gives each test full control over which callback fires.
 */
function fakeNavigator(
  impl: (
    successCb: PositionCallback,
    errorCb: PositionErrorCallback | null | undefined,
    opts?: PositionOptions,
  ) => void,
): { geolocation: Geolocation } {
  // Minimal stub — only getCurrentPosition is under test; watchPosition /
  // clearWatch are placeholders to satisfy the Geolocation interface shape.
  return {
    geolocation: {
      getCurrentPosition: impl,
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    } as unknown as Geolocation,
  };
}

// ---------------------------------------------------------------------------
// Inline wire-schema mirror (see module docstring for rationale)
// ---------------------------------------------------------------------------
const WirePassiveContextSchema = z.object({
  time: z.string().datetime(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    label: z.string().min(1).max(100),
  }),
  historySummary: z.string().max(2000),
});

// ---------------------------------------------------------------------------
// Known fixed dates used across tests
// ---------------------------------------------------------------------------
// Saturday 2026-05-16, 13:00 local — midday bucket
const SAT_MIDDAY = new Date(2026, 4, 16, 13, 0, 0);
// Monday 2026-05-18, 08:00 local — morning bucket
const MON_MORNING = new Date(2026, 4, 18, 8, 0, 0);
// Sunday 2026-05-17, 22:30 local — night bucket
const SUN_NIGHT = new Date(2026, 4, 17, 22, 30, 0);

// ===========================================================================
// 1. buildHistorySummary — time-of-day buckets
// ===========================================================================
describe("buildHistorySummary — time-of-day bucket", () => {
  const p = persona();

  it.each([
    // [description, hour, expected bucket]
    ["hour 5 (morning start)", 5, "morning"],
    ["hour 7 (morning mid)", 7, "morning"],
    ["hour 10 (morning end)", 10, "morning"],
    ["hour 11 (midday start)", 11, "midday"],
    ["hour 12 (midday mid)", 12, "midday"],
    ["hour 13 (midday end)", 13, "midday"],
    ["hour 14 (afternoon start)", 14, "afternoon"],
    ["hour 15 (afternoon mid)", 15, "afternoon"],
    ["hour 16 (afternoon end)", 16, "afternoon"],
    ["hour 17 (evening start)", 17, "evening"],
    ["hour 19 (evening mid)", 19, "evening"],
    ["hour 21 (evening end)", 21, "evening"],
    ["hour 22 (night start)", 22, "night"],
    ["hour 23 (night late)", 23, "night"],
    ["hour 0 (midnight)", 0, "night"],
    ["hour 3 (pre-dawn)", 3, "night"],
    ["hour 4 (night end)", 4, "night"],
  ])("%s → bucket %s", (_, hour, expectedBucket) => {
    const d = new Date(2026, 4, 16, hour, 0, 0);
    const summary = buildHistorySummary(p, d);
    // The second word of the opening sentence is the bucket string.
    // Opening sentence: "It is <Weekday> <bucket>."
    const opening = summary.split(".")[0]; // "It is Saturday midday"
    const parts = opening.split(" "); // ["It", "is", "Saturday", "midday"]
    const bucketWord = parts[parts.length - 1];
    expect(bucketWord, `hour=${hour} should map to bucket "${expectedBucket}"`).toBe(
      expectedBucket,
    );
  });
});

// ===========================================================================
// 2. buildHistorySummary — weekday name
// ===========================================================================
describe("buildHistorySummary — weekday name", () => {
  const p = persona();

  it("Saturday 2026-05-16 → opens with 'It is Saturday '", () => {
    const summary = buildHistorySummary(p, SAT_MIDDAY);
    expect(summary.startsWith("It is Saturday ")).toBe(true);
  });

  it("Monday 2026-05-18 → opens with 'It is Monday '", () => {
    const summary = buildHistorySummary(p, MON_MORNING);
    expect(summary.startsWith("It is Monday ")).toBe(true);
  });

  it("Sunday 2026-05-17 → opens with 'It is Sunday '", () => {
    const summary = buildHistorySummary(p, SUN_NIGHT);
    expect(summary.startsWith("It is Sunday ")).toBe(true);
  });
});

// ===========================================================================
// 3. buildHistorySummary — opening sentence shape
// ===========================================================================
describe("buildHistorySummary — opening sentence shape", () => {
  const p = persona();

  it.each([
    SAT_MIDDAY,
    MON_MORNING,
    SUN_NIGHT,
    new Date(2026, 4, 19, 5, 0, 0), // Tuesday morning
    new Date(2026, 4, 20, 23, 59, 59), // Wednesday night
  ])("always starts with 'It is '", (d) => {
    expect(buildHistorySummary(p, d).startsWith("It is ")).toBe(true);
  });

  it("opening sentence ends with a period before the next fragment", () => {
    const summary = buildHistorySummary(p, SAT_MIDDAY);
    // The first period-terminated sentence should be "It is Saturday midday."
    const firstSentence = summary.split(". ")[0] + ".";
    expect(firstSentence).toMatch(/^It is \w+ (morning|midday|afternoon|evening|night)\.$/);
  });
});

// ===========================================================================
// 4. buildHistorySummary — top cuisine + tie-breaking
// ===========================================================================
describe("buildHistorySummary — top cuisine", () => {
  it("seeded persona (3 orders, all distinct cuisines) → Biryani wins (index 0, most recent)", () => {
    // MUMBAI_NON_VEG_PERSONA: Biryani (index 0), North Indian (1), Chinese (2)
    // All count=1; tie broken by smallest recentIndex → Biryani wins.
    const summary = buildHistorySummary(persona(), SAT_MIDDAY);
    expect(summary).toContain("User most frequently orders Biryani.");
  });

  it("profile where one cuisine appears twice → that cuisine wins regardless of order", () => {
    // 3 orders: Biryani, Biryani, Chinese — Biryani count=2 > Chinese count=1
    const p = profileWithOrders(3, ["Biryani", "Biryani", "Chinese"]);
    const summary = buildHistorySummary(p, SAT_MIDDAY);
    expect(summary).toContain("User most frequently orders Biryani.");
    expect(summary).not.toContain("User most frequently orders Chinese.");
  });

  it("tie on count=1, two cuisines → most-recent (index 0) wins", () => {
    // 2 orders: CuisineA (index 0, most recent), CuisineB (index 1)
    // Both count=1; recentIndex 0 < 1 → CuisineA wins.
    const p = profileWithOrders(2, ["CuisineA", "CuisineB"]);
    const summary = buildHistorySummary(p, SAT_MIDDAY);
    expect(summary).toContain("User most frequently orders CuisineA.");
    expect(summary).not.toContain("User most frequently orders CuisineB.");
  });

  it("summary contains exactly one 'User most frequently orders' fragment", () => {
    const summary = buildHistorySummary(persona(), SAT_MIDDAY);
    const matches = summary.match(/User most frequently orders/g);
    expect(matches?.length ?? 0).toBe(1);
  });
});

// ===========================================================================
// 5. buildHistorySummary — recent orders fragment
// ===========================================================================
describe("buildHistorySummary — recent orders fragment", () => {
  it("seeded persona → 'Recent orders: Chicken Biryani, Butter Chicken, Hakka Noodles.'", () => {
    const summary = buildHistorySummary(persona(), SAT_MIDDAY);
    expect(summary).toContain(
      "Recent orders: Chicken Biryani, Butter Chicken, Hakka Noodles.",
    );
  });

  it("5 orders → only first 3 dish names appear in the recent-orders fragment", () => {
    const p = profileWithOrders(5);
    const summary = buildHistorySummary(p, SAT_MIDDAY);
    expect(summary).toContain("Recent orders: Dish 1, Dish 2, Dish 3.");
    expect(summary).not.toContain("Dish 4");
    expect(summary).not.toContain("Dish 5");
  });

  it("1 order → 'Recent orders: Dish 1.'", () => {
    const p = profileWithOrders(1);
    const summary = buildHistorySummary(p, SAT_MIDDAY);
    expect(summary).toContain("Recent orders: Dish 1.");
  });

  it("2 orders → 'Recent orders: Dish 1, Dish 2.'", () => {
    const p = profileWithOrders(2);
    const summary = buildHistorySummary(p, SAT_MIDDAY);
    expect(summary).toContain("Recent orders: Dish 1, Dish 2.");
  });

  it("dish names in the fragment are joined by ', ' (comma-space)", () => {
    // Verifies the separator — not just presence of names.
    const p = profileWithOrders(3);
    const summary = buildHistorySummary(p, SAT_MIDDAY);
    // If joined correctly the fragment is "Dish 1, Dish 2, Dish 3" (not "Dish 1,Dish 2")
    expect(summary).toContain("Dish 1, Dish 2, Dish 3");
  });
});

// ===========================================================================
// 6. buildHistorySummary — recency fragment
// ===========================================================================
describe("buildHistorySummary — recency fragment", () => {
  /** Build a profile with lastOrderedAt set to the given YYYY-MM-DD string. */
  function withLastOrder(date: string): UserProfile {
    const p = persona();
    p.lastOrderedAt = date;
    return p;
  }

  it("same-day → 'Last ordered today.'", () => {
    // now = 2026-05-16, lastOrderedAt = 2026-05-16
    const p = withLastOrder("2026-05-16");
    const summary = buildHistorySummary(p, new Date(2026, 4, 16, 14, 0, 0));
    expect(summary).toContain("Last ordered today.");
  });

  it("1 day prior → 'Last ordered yesterday.'", () => {
    // now = 2026-05-16, lastOrderedAt = 2026-05-15
    const p = withLastOrder("2026-05-15");
    const summary = buildHistorySummary(p, new Date(2026, 4, 16, 14, 0, 0));
    expect(summary).toContain("Last ordered yesterday.");
  });

  it("2 days prior → 'Last ordered 2 days ago.'", () => {
    const p = withLastOrder("2026-05-14");
    const summary = buildHistorySummary(p, new Date(2026, 4, 16, 14, 0, 0));
    expect(summary).toContain("Last ordered 2 days ago.");
  });

  it("18 days prior (seeded persona: lastOrderedAt=2026-04-28, now=2026-05-16) → 'Last ordered 18 days ago.'", () => {
    // MUMBAI_NON_VEG_PERSONA.lastOrderedAt = "2026-04-28"
    const p = persona(); // lastOrderedAt is 2026-04-28
    const now = new Date(2026, 4, 16, 12, 0, 0); // 2026-05-16, gap = 18 days
    const summary = buildHistorySummary(p, now);
    expect(summary).toContain("Last ordered 18 days ago.");
  });

  it("unparseable lastOrderedAt (empty string) → 'Last ordered' fragment is OMITTED", () => {
    const p = persona();
    // Bypass the Zod schema validation by directly setting the field
    (p as unknown as { lastOrderedAt: string }).lastOrderedAt = "";
    const summary = buildHistorySummary(p, SAT_MIDDAY);
    expect(summary).not.toContain("Last ordered");
  });

  it("future lastOrderedAt (now < lastOrderedAt) → 'Last ordered' fragment is OMITTED", () => {
    // now = 2026-05-01, lastOrderedAt = 2026-06-01 → days = -31 → null
    const p = withLastOrder("2026-06-01");
    const now = new Date(2026, 4, 1, 12, 0, 0); // 2026-05-01
    const summary = buildHistorySummary(p, now);
    expect(summary).not.toContain("Last ordered");
  });
});

// ===========================================================================
// 7. buildHistorySummary — empty orderHistory path
// ===========================================================================
describe("buildHistorySummary — empty orderHistory", () => {
  it("empty orderHistory → summary equals 'It is <Weekday> <bucket>.' with no other fragments", () => {
    const p = persona();
    p.orderHistory = [];
    const summary = buildHistorySummary(p, SAT_MIDDAY);
    // Exact expected value: "It is Saturday midday."
    expect(summary).toBe("It is Saturday midday.");
  });

  it("empty orderHistory → summary does not contain 'User most frequently'", () => {
    const p = persona();
    p.orderHistory = [];
    expect(buildHistorySummary(p, SAT_MIDDAY)).not.toContain("User most frequently");
  });

  it("empty orderHistory → summary does not contain 'Recent orders'", () => {
    const p = persona();
    p.orderHistory = [];
    expect(buildHistorySummary(p, SAT_MIDDAY)).not.toContain("Recent orders");
  });

  it("empty orderHistory → summary does not contain 'Last ordered'", () => {
    const p = persona();
    p.orderHistory = [];
    expect(buildHistorySummary(p, SAT_MIDDAY)).not.toContain("Last ordered");
  });

  it("empty orderHistory → summary has no trailing space", () => {
    const p = persona();
    p.orderHistory = [];
    const summary = buildHistorySummary(p, SAT_MIDDAY);
    expect(summary).toBe(summary.trimEnd());
  });

  it.each([
    new Date(2026, 4, 16, 22, 0, 0), // night
    new Date(2026, 4, 18, 8, 0, 0),  // morning
    new Date(2026, 4, 17, 12, 0, 0), // midday
  ])(
    "empty history for different times still returns single-sentence blurb",
    (d) => {
      const p = persona();
      p.orderHistory = [];
      const summary = buildHistorySummary(p, d);
      expect(summary).toMatch(
        /^It is \w+ (morning|midday|afternoon|evening|night)\.$/,
      );
    },
  );
});

// ===========================================================================
// 8. buildHistorySummary — output is single-line and ≤ 300 characters
// ===========================================================================
describe("buildHistorySummary — output format", () => {
  it("seeded persona → no newline characters in the output", () => {
    const summary = buildHistorySummary(persona(), SAT_MIDDAY);
    expect(summary).not.toContain("\n");
  });

  it("seeded persona → output length is ≤ 300 characters", () => {
    const summary = buildHistorySummary(persona(), SAT_MIDDAY);
    expect(summary.length, `summary has ${summary.length} chars`).toBeLessThanOrEqual(300);
  });
});

// ===========================================================================
// 9. buildHistorySummary — determinism
// ===========================================================================
describe("buildHistorySummary — determinism", () => {
  it("two calls with the same profile and fixed now return identical strings", () => {
    const p = persona();
    const fixedDate = new Date(2026, 4, 16, 13, 0, 0);
    const first = buildHistorySummary(p, fixedDate);
    const second = buildHistorySummary(p, fixedDate);
    expect(first).toBe(second);
  });
});

// ===========================================================================
// 10–14. getBrowserLocation — async, navigator mock
// ===========================================================================
describe("getBrowserLocation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // 10. Success path
  // -------------------------------------------------------------------------
  it("resolves with { lat, lng, label: 'Current location' } when getCurrentPosition succeeds", async () => {
    vi.stubGlobal(
      "navigator",
      fakeNavigator((successCb) => {
        successCb({
          coords: { latitude: 12.971, longitude: 77.594 },
        } as GeolocationPosition);
      }),
    );

    const loc: Location = await getBrowserLocation(persona());
    expect(loc).toEqual({ lat: 12.971, lng: 77.594, label: "Current location" });
  });

  it("does NOT use profile.location when getCurrentPosition succeeds", async () => {
    vi.stubGlobal(
      "navigator",
      fakeNavigator((successCb) => {
        successCb({ coords: { latitude: 1.0, longitude: 2.0 } } as GeolocationPosition);
      }),
    );
    const p = persona(); // Mumbai: lat 19.076, lng 72.877
    const loc: Location = await getBrowserLocation(p);
    expect(loc.lat).not.toBe(p.location.lat);
    expect(loc.lng).not.toBe(p.location.lng);
    expect(loc.label).toBe("Current location");
  });

  // -------------------------------------------------------------------------
  // 11. Error-callback fallback — two variants
  // -------------------------------------------------------------------------
  it("falls back to profile.location when error callback fires with no error object", async () => {
    vi.stubGlobal(
      "navigator",
      fakeNavigator((_, errorCb) => {
        errorCb?.(null as unknown as GeolocationPositionError);
      }),
    );
    const p = persona();
    const loc: Location = await getBrowserLocation(p);
    expect(loc).toEqual(p.location);
  });

  it("falls back to profile.location when error callback fires with PERMISSION_DENIED", async () => {
    vi.stubGlobal(
      "navigator",
      fakeNavigator((_, errorCb) => {
        errorCb?.({
          code: 1,
          message: "PERMISSION_DENIED",
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError);
      }),
    );
    const p = persona();
    const loc: Location = await getBrowserLocation(p);
    expect(loc).toEqual(p.location);
  });

  // -------------------------------------------------------------------------
  // 12. navigator.geolocation undefined → resolves to profile.location
  // -------------------------------------------------------------------------
  it("resolves to profile.location when navigator.geolocation is undefined", async () => {
    vi.stubGlobal("navigator", { geolocation: undefined });
    const p = persona();
    const loc: Location = await getBrowserLocation(p);
    expect(loc).toEqual(p.location);
  });

  // -------------------------------------------------------------------------
  // 13. getCurrentPosition options
  // -------------------------------------------------------------------------
  it("passes the correct PositionOptions to getCurrentPosition", async () => {
    let capturedOpts: PositionOptions | undefined;
    vi.stubGlobal(
      "navigator",
      fakeNavigator((successCb, _errorCb, opts) => {
        capturedOpts = opts;
        successCb({ coords: { latitude: 0, longitude: 0 } } as GeolocationPosition);
      }),
    );
    await getBrowserLocation(persona());
    expect(GEO_TIMEOUT_MS).toBe(4000);
    expect(capturedOpts?.timeout).toBe(GEO_TIMEOUT_MS);
    expect(capturedOpts?.maximumAge).toBe(5 * 60 * 1000);
    expect(capturedOpts?.enableHighAccuracy).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 14. Always resolves, never rejects
  // -------------------------------------------------------------------------
  it("resolves (does not reject) even when error callback fires", async () => {
    vi.stubGlobal(
      "navigator",
      fakeNavigator((_, errorCb) => {
        errorCb?.({ code: 2, message: "POSITION_UNAVAILABLE" } as GeolocationPositionError);
      }),
    );
    await expect(getBrowserLocation(persona())).resolves.toBeDefined();
  });

  it("resolves (does not reject) when geolocation is unavailable", async () => {
    vi.stubGlobal("navigator", { geolocation: undefined });
    await expect(getBrowserLocation(persona())).resolves.toBeDefined();
  });
});

// ===========================================================================
// 15–22. buildPassiveContext — composition
// ===========================================================================
describe("buildPassiveContext", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Stub navigator so getCurrentPosition immediately invokes the success callback. */
  function stubGeoSuccess(lat: number, lng: number): void {
    vi.stubGlobal(
      "navigator",
      fakeNavigator((successCb) => {
        successCb({ coords: { latitude: lat, longitude: lng } } as GeolocationPosition);
      }),
    );
  }

  /** Stub navigator so getCurrentPosition immediately invokes the error callback. */
  function stubGeoError(): void {
    vi.stubGlobal(
      "navigator",
      fakeNavigator((_, errorCb) => {
        errorCb?.({ code: 1, message: "PERMISSION_DENIED" } as GeolocationPositionError);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // 15. Return shape has exactly the keys: time, location, historySummary
  // -------------------------------------------------------------------------
  it("returned object has exactly the keys: time, location, historySummary", async () => {
    stubGeoSuccess(12.971, 77.594);
    const ctx = await buildPassiveContext(persona());
    expect(Object.keys(ctx).sort()).toEqual(["historySummary", "location", "time"]);
  });

  // -------------------------------------------------------------------------
  // 16. time is a valid ISO 8601 string that round-trips through toISOString
  // -------------------------------------------------------------------------
  it("time is a valid ISO 8601 string (new Date(ctx.time).toISOString() === ctx.time)", async () => {
    stubGeoSuccess(0, 0);
    const ctx = await buildPassiveContext(persona());
    expect(new Date(ctx.time).toISOString()).toBe(ctx.time);
  });

  it("time is parseable by Date.parse (not NaN)", async () => {
    stubGeoSuccess(0, 0);
    const ctx = await buildPassiveContext(persona());
    expect(Date.parse(ctx.time)).not.toBeNaN();
  });

  // -------------------------------------------------------------------------
  // 17. time is "now" — bracketed by Date.now() calls
  // -------------------------------------------------------------------------
  it("time falls within a 100 ms bracket around the call (captured-once invariant)", async () => {
    stubGeoSuccess(0, 0);
    const before = Date.now();
    const ctx = await buildPassiveContext(persona());
    const after = Date.now();
    const t = new Date(ctx.time).getTime();
    expect(t, "ctx.time should be >= before the call").toBeGreaterThanOrEqual(before - 100);
    expect(t, "ctx.time should be <= after the call").toBeLessThanOrEqual(after + 100);
  });

  // -------------------------------------------------------------------------
  // 18. location reflects geolocation success
  // -------------------------------------------------------------------------
  it("location is { lat: 1, lng: 2, label: 'Current location' } when geolocation succeeds at (1, 2)", async () => {
    stubGeoSuccess(1, 2);
    const ctx = await buildPassiveContext(persona());
    expect(ctx.location).toEqual({ lat: 1, lng: 2, label: "Current location" });
  });

  // -------------------------------------------------------------------------
  // 19. location falls back to profile.location when geolocation fails
  // -------------------------------------------------------------------------
  it("location deep-equals profile.location when geolocation error callback fires", async () => {
    stubGeoError();
    const p = persona();
    const ctx = await buildPassiveContext(p);
    expect(ctx.location).toEqual(p.location);
  });

  // -------------------------------------------------------------------------
  // 20. historySummary matches buildHistorySummary's contract (seeded persona)
  // -------------------------------------------------------------------------
  it("historySummary starts with 'It is ' for the seeded persona", async () => {
    stubGeoSuccess(0, 0);
    const ctx = await buildPassiveContext(persona());
    expect(ctx.historySummary.startsWith("It is ")).toBe(true);
  });

  it("historySummary contains 'User most frequently orders Biryani.' for the seeded persona", async () => {
    stubGeoSuccess(0, 0);
    const ctx = await buildPassiveContext(persona());
    expect(ctx.historySummary).toContain("User most frequently orders Biryani.");
  });

  it("historySummary contains 'Recent orders: Chicken Biryani, Butter Chicken, Hakka Noodles.' for the seeded persona", async () => {
    stubGeoSuccess(0, 0);
    const ctx = await buildPassiveContext(persona());
    expect(ctx.historySummary).toContain(
      "Recent orders: Chicken Biryani, Butter Chicken, Hakka Noodles.",
    );
  });

  it("historySummary contains 'Last ordered ' for the seeded persona (who has a valid lastOrderedAt)", async () => {
    stubGeoSuccess(0, 0);
    const ctx = await buildPassiveContext(persona());
    expect(ctx.historySummary).toContain("Last ordered ");
  });

  // -------------------------------------------------------------------------
  // 21. time and weekday inside historySummary agree (captured-once invariant)
  //     The spec states: `now` is captured once at function entry so `time` and
  //     `historySummary`'s weekday can never disagree across a clock tick.
  // -------------------------------------------------------------------------
  it("weekday embedded in historySummary matches the weekday derived from ctx.time", async () => {
    stubGeoSuccess(0, 0);
    const ctx = await buildPassiveContext(persona());

    // Derive the expected weekday from the returned `time` string.
    const expectedWeekday = new Date(ctx.time).toLocaleDateString("en-US", {
      weekday: "long",
    });

    // The historySummary opens with "It is <Weekday> <bucket>."
    expect(ctx.historySummary).toContain(`It is ${expectedWeekday} `);
  });

  // -------------------------------------------------------------------------
  // 22. Result satisfies the wire schema constraints
  //     PassiveContextSchema is module-private in backend/src/schema.ts; the
  //     inline WirePassiveContextSchema above mirrors its three checks exactly:
  //       - time: z.string().datetime()
  //       - location: { lat: number, lng: number, label: string.min(1).max(100) }
  //       - historySummary: z.string().max(2000)
  // -------------------------------------------------------------------------
  it("result satisfies the PassiveContext wire schema (time is datetime, location has lat/lng/label, historySummary ≤ 2000 chars)", async () => {
    stubGeoSuccess(12.971, 77.594);
    const ctx = await buildPassiveContext(persona());
    const result = WirePassiveContextSchema.safeParse(ctx);
    expect(
      result.success,
      result.success
        ? ""
        : `Schema validation failed: ${JSON.stringify((result as { error: { issues: unknown } }).error.issues)}`,
    ).toBe(true);
  });

  it("result satisfies wire schema even when geolocation falls back to Mumbai", async () => {
    stubGeoError();
    const ctx = await buildPassiveContext(persona());
    const result = WirePassiveContextSchema.safeParse(ctx);
    expect(
      result.success,
      result.success
        ? ""
        : `Schema validation failed: ${JSON.stringify((result as { error: { issues: unknown } }).error.issues)}`,
    ).toBe(true);
  });

  it("historySummary is a string (type check)", async () => {
    stubGeoSuccess(0, 0);
    const ctx = await buildPassiveContext(persona());
    expect(typeof ctx.historySummary).toBe("string");
  });

  it("location has exactly the keys lat, lng, label", async () => {
    stubGeoSuccess(1, 2);
    const ctx = await buildPassiveContext(persona());
    expect(Object.keys(ctx.location).sort()).toEqual(["label", "lat", "lng"]);
  });
});
