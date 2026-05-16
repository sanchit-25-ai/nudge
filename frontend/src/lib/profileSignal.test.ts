import { describe, it, expect } from "vitest";
import type { UserProfile } from "@shared/types";
import { buildProfileSignal } from "./profileSignal";
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

// ===========================================================================
// 1. Included fields — pass-through of the three ProfileSignal fields
// ===========================================================================
describe("buildProfileSignal — included fields", () => {
  it("returns dietaryPattern equal to the profile's dietaryPattern", () => {
    const p = persona();
    const sig = buildProfileSignal(p);
    expect(sig.dietaryPattern).toBe(p.dietaryPattern);
  });

  it("returns topCuisines equal to the profile's topCuisines", () => {
    const p = persona();
    const sig = buildProfileSignal(p);
    expect(sig.topCuisines).toEqual(p.topCuisines);
  });

  it("returns avgOrderValue equal to the profile's avgOrderValue", () => {
    const p = persona();
    const sig = buildProfileSignal(p);
    expect(sig.avgOrderValue).toBe(p.avgOrderValue);
  });

  it("reflects a 'veg' dietaryPattern when the profile is veg", () => {
    const p = persona();
    p.dietaryPattern = "veg";
    const sig = buildProfileSignal(p);
    expect(sig.dietaryPattern).toBe("veg");
  });

  it("reflects a custom topCuisines array", () => {
    const p = persona();
    p.topCuisines = ["South Indian", "Thai"];
    const sig = buildProfileSignal(p);
    expect(sig.topCuisines).toEqual(["South Indian", "Thai"]);
  });

  it("reflects a custom avgOrderValue of 0", () => {
    const p = persona();
    p.avgOrderValue = 0;
    const sig = buildProfileSignal(p);
    expect(sig.avgOrderValue).toBe(0);
  });
});

// ===========================================================================
// 2. Excluded fields — no leakage of private profile data
// ===========================================================================
describe("buildProfileSignal — excluded fields", () => {
  it("does not include userId in the returned object", () => {
    const sig = buildProfileSignal(persona());
    expect(sig).not.toHaveProperty("userId");
  });

  it("does not include orderHistory in the returned object", () => {
    const sig = buildProfileSignal(persona());
    expect(sig).not.toHaveProperty("orderHistory");
  });

  it("does not include location in the returned object", () => {
    const sig = buildProfileSignal(persona());
    expect(sig).not.toHaveProperty("location");
  });

  it("does not include lastOrderedAt in the returned object", () => {
    const sig = buildProfileSignal(persona());
    expect(sig).not.toHaveProperty("lastOrderedAt");
  });

  it("does not include q3SkipCount in the returned object", () => {
    const sig = buildProfileSignal(persona());
    expect(sig).not.toHaveProperty("q3SkipCount");
  });

  it("does not include schemaVersion in the returned object", () => {
    const sig = buildProfileSignal(persona());
    expect(sig).not.toHaveProperty("schemaVersion");
  });
});

// ===========================================================================
// 3. Returned object shape — exactly three keys
// ===========================================================================
describe("buildProfileSignal — object shape", () => {
  it("returns an object with exactly the keys: avgOrderValue, dietaryPattern, topCuisines", () => {
    const sig = buildProfileSignal(persona());
    const keys = Object.keys(sig).sort();
    expect(keys).toEqual(["avgOrderValue", "dietaryPattern", "topCuisines"]);
  });
});
