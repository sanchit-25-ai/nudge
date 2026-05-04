import { describe, it, expect, beforeEach, vi } from "vitest";
import type { UserProfile } from "@shared/types";

// All exports under test are imported at the top of the file.
// The module registers window.__resetNudgeProfile as a side-effect at import
// time, so we assert on it from the same import rather than re-importing.
import {
  STORAGE_KEY,
  MUMBAI_NON_VEG_PERSONA,
  UserProfileSchema,
  loadProfile,
  saveProfile,
  ensureProfile,
  resetProfile,
} from "./profile";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep-clone a value via JSON so mutations in tests don't bleed into the constant. */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Write a raw string directly to localStorage without going through saveProfile. */
function rawSet(value: string): void {
  localStorage.setItem(STORAGE_KEY, value);
}

/** Write a valid profile directly to localStorage. */
function storeValid(profile: UserProfile = MUMBAI_NON_VEG_PERSONA): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

// ---------------------------------------------------------------------------
// Reset localStorage before every test — isolation guarantee.
// ---------------------------------------------------------------------------
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// ===========================================================================
// 1. STORAGE_KEY
// ===========================================================================
describe("STORAGE_KEY", () => {
  it("equals exactly 'nudge.profile.v1' (locked versioned decision)", () => {
    expect(STORAGE_KEY).toBe("nudge.profile.v1");
  });
});

// ===========================================================================
// 2. MUMBAI_NON_VEG_PERSONA
// ===========================================================================
describe("MUMBAI_NON_VEG_PERSONA", () => {
  it("passes UserProfileSchema (round-trip safety)", () => {
    const result = UserProfileSchema.safeParse(MUMBAI_NON_VEG_PERSONA);
    expect(result.success, "MUMBAI_NON_VEG_PERSONA must satisfy its own schema").toBe(true);
  });

  it("has dietaryPattern === 'non-veg' per spec §7.4 seeded persona", () => {
    expect(MUMBAI_NON_VEG_PERSONA.dietaryPattern).toBe("non-veg");
  });

  it("has location.label === 'Mumbai' per spec §7.4", () => {
    expect(MUMBAI_NON_VEG_PERSONA.location.label).toBe("Mumbai");
  });

  it("has a non-empty orderHistory array per spec §7.4 simulated order history", () => {
    expect(MUMBAI_NON_VEG_PERSONA.orderHistory.length).toBeGreaterThan(0);
  });

  it("has q3SkipCount === 0 (spec open question: add now so schema is stable)", () => {
    expect(MUMBAI_NON_VEG_PERSONA.q3SkipCount).toBe(0);
  });

  it("has schemaVersion === 1 matching the storage key suffix", () => {
    expect(MUMBAI_NON_VEG_PERSONA.schemaVersion).toBe(1);
  });
});

// ===========================================================================
// 3. UserProfileSchema — validation
// ===========================================================================
describe("UserProfileSchema", () => {
  it("accepts a fully valid profile (MUMBAI_NON_VEG_PERSONA as representative input)", () => {
    const result = UserProfileSchema.safeParse(clone(MUMBAI_NON_VEG_PERSONA));
    expect(result.success).toBe(true);
  });

  it("rejects a profile with missing userId", () => {
    const bad = clone<Partial<UserProfile>>(MUMBAI_NON_VEG_PERSONA);
    delete bad.userId;
    const result = UserProfileSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a profile with wrong schemaVersion (e.g. 99)", () => {
    const bad = { ...clone(MUMBAI_NON_VEG_PERSONA), schemaVersion: 99 };
    const result = UserProfileSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a profile with invalid dietaryPattern (e.g. 'vegan')", () => {
    const bad = { ...clone(MUMBAI_NON_VEG_PERSONA), dietaryPattern: "vegan" };
    const result = UserProfileSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a profile with invalid priceRange in an order (e.g. 'ultra')", () => {
    const bad = clone(MUMBAI_NON_VEG_PERSONA);
    bad.orderHistory[0] = { ...bad.orderHistory[0], priceRange: "ultra" as "low" };
    const result = UserProfileSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a profile with a malformed orderedAt date (e.g. '28-04-2026')", () => {
    const bad = clone(MUMBAI_NON_VEG_PERSONA);
    bad.orderHistory[0] = { ...bad.orderHistory[0], orderedAt: "28-04-2026" };
    const result = UserProfileSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a profile with a malformed lastOrderedAt date (e.g. '2026/04/28')", () => {
    const bad = { ...clone(MUMBAI_NON_VEG_PERSONA), lastOrderedAt: "2026/04/28" };
    const result = UserProfileSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a profile with a negative avgOrderValue", () => {
    const bad = { ...clone(MUMBAI_NON_VEG_PERSONA), avgOrderValue: -1 };
    const result = UserProfileSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a profile with a negative q3SkipCount", () => {
    const bad = { ...clone(MUMBAI_NON_VEG_PERSONA), q3SkipCount: -1 };
    const result = UserProfileSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// 4. loadProfile
// ===========================================================================
describe("loadProfile", () => {
  it("returns null when the key is missing from localStorage", () => {
    // localStorage is cleared in beforeEach — key is absent.
    expect(loadProfile()).toBeNull();
  });

  it("returns null when the stored value is the literal string 'not-json'", () => {
    rawSet("not-json");
    expect(loadProfile()).toBeNull();
  });

  it("returns null when stored value is valid JSON but fails the schema (e.g. {foo:1})", () => {
    rawSet(JSON.stringify({ foo: 1 }));
    expect(loadProfile()).toBeNull();
  });

  it("returns the stored profile when the key holds a valid serialized profile", () => {
    storeValid();
    const result = loadProfile();
    expect(result).not.toBeNull();
    expect(result).toEqual(MUMBAI_NON_VEG_PERSONA);
  });

  it("never throws for any input — missing key", () => {
    expect(() => loadProfile()).not.toThrow();
  });

  it("never throws for any input — corrupt string", () => {
    rawSet("not-json");
    expect(() => loadProfile()).not.toThrow();
  });

  it("never throws for any input — schema-failing JSON", () => {
    rawSet(JSON.stringify({ schemaVersion: 99 }));
    expect(() => loadProfile()).not.toThrow();
  });
});

// ===========================================================================
// 5. saveProfile
// ===========================================================================
describe("saveProfile", () => {
  it("writes JSON to STORAGE_KEY so a subsequent loadProfile returns deep-equal data", () => {
    saveProfile(MUMBAI_NON_VEG_PERSONA);
    const roundTripped = loadProfile();
    expect(roundTripped).toEqual(MUMBAI_NON_VEG_PERSONA);
  });

  it("the raw localStorage value is valid JSON at STORAGE_KEY after saveProfile", () => {
    saveProfile(MUMBAI_NON_VEG_PERSONA);
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(() => JSON.parse(raw!)).not.toThrow();
  });

  it("throws when given an invalid profile (missing required fields)", () => {
    // Cast intentionally invalid object — programmer-bug path per Implementation notes.
    const malformed = { foo: "bar" } as unknown as UserProfile;
    expect(() => saveProfile(malformed)).toThrow();
  });

  it("throws when given a profile with wrong schemaVersion", () => {
    const malformed = { ...clone(MUMBAI_NON_VEG_PERSONA), schemaVersion: 99 } as unknown as UserProfile;
    expect(() => saveProfile(malformed)).toThrow();
  });
});

// ===========================================================================
// 6. ensureProfile
// ===========================================================================
describe("ensureProfile", () => {
  it("writes the seeded persona and returns it when the key is missing", () => {
    // Key is absent (cleared in beforeEach).
    const result = ensureProfile();
    expect(result).toEqual(MUMBAI_NON_VEG_PERSONA);
    // Also verify storage was written.
    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
  });

  it("overwrites corrupt JSON with the seeded persona when the key is corrupt", () => {
    rawSet("not-json");
    const result = ensureProfile();
    expect(result).toEqual(MUMBAI_NON_VEG_PERSONA);
    // Stored value should now be valid.
    expect(loadProfile()).toEqual(MUMBAI_NON_VEG_PERSONA);
  });

  it("returns the existing valid profile and does NOT overwrite when key holds valid data", () => {
    // Seed a profile with a distinct userId to detect if it gets overwritten.
    const existing: UserProfile = { ...clone(MUMBAI_NON_VEG_PERSONA), userId: "distinct_user_99" };
    storeValid(existing);

    const result = ensureProfile();

    expect(result.userId).toBe("distinct_user_99");
    // Storage must still carry the existing profile, not the default persona.
    const stored = loadProfile();
    expect(stored?.userId).toBe("distinct_user_99");
  });

  it("is idempotent — calling twice returns the same value and leaves storage unchanged after the first call", () => {
    // First call seeds the persona.
    const first = ensureProfile();

    // Capture raw storage after first call.
    const rawAfterFirst = localStorage.getItem(STORAGE_KEY);

    // Second call (StrictMode-style double-invoke).
    const second = ensureProfile();

    const rawAfterSecond = localStorage.getItem(STORAGE_KEY);

    expect(first).toEqual(second);
    expect(rawAfterFirst).toBe(rawAfterSecond);
  });
});

// ===========================================================================
// 7. resetProfile
// ===========================================================================
describe("resetProfile", () => {
  it("removes any existing key and re-seeds with the persona", () => {
    // Start with a different profile stored.
    const different: UserProfile = { ...clone(MUMBAI_NON_VEG_PERSONA), userId: "to_be_wiped" };
    storeValid(different);

    resetProfile();

    const stored = loadProfile();
    expect(stored?.userId).not.toBe("to_be_wiped");
    expect(stored).toEqual(MUMBAI_NON_VEG_PERSONA);
  });

  it("post-reset value equals MUMBAI_NON_VEG_PERSONA exactly", () => {
    resetProfile();
    expect(loadProfile()).toEqual(MUMBAI_NON_VEG_PERSONA);
  });

  it("is safe to call on a clean slate (no existing key)", () => {
    // Key is absent — should not throw.
    expect(() => resetProfile()).not.toThrow();
    expect(loadProfile()).toEqual(MUMBAI_NON_VEG_PERSONA);
  });
});

// ===========================================================================
// 8. window.__resetNudgeProfile
// ===========================================================================
describe("window.__resetNudgeProfile", () => {
  it("is registered as a function on the global window after the module loads", () => {
    // The module registers the hook at import time (top-level side-effect).
    expect(typeof window.__resetNudgeProfile).toBe("function");
  });

  it("calling it triggers a profile reset and calls window.location.reload()", () => {
    // Replace window.location with a writable version that has a spy on reload.
    // jsdom does not allow vi.spyOn on location.reload directly because the
    // property descriptor is non-configurable on the real location object.
    const reloadSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload: reloadSpy });

    // Seed a non-default profile so we can verify the reset actually happened.
    const different: UserProfile = { ...clone(MUMBAI_NON_VEG_PERSONA), userId: "pre_reset_user" };
    storeValid(different);

    window.__resetNudgeProfile!();

    // Profile should have been reset to the seeded persona.
    expect(loadProfile()).toEqual(MUMBAI_NON_VEG_PERSONA);

    // reload() must have been called exactly once.
    expect(reloadSpy).toHaveBeenCalledOnce();
  });
});
