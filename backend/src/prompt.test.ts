/**
 * Unit tests for backend/src/prompt.ts — Item 05: Anthropic + Swiggy MCP Wiring
 *
 * Spec: .claude/specs/05-anthropic-mcp-wiring.md §"Implementation notes"
 *   - STATIC_PROMPT must be deterministic, non-empty, and long enough to clear
 *     Anthropic's ~1024-token ephemeral-cache floor (proxied by a 3000-char minimum).
 *   - buildDynamicContext must include all user-context fields from RecommendRequest
 *     and handle optional fields (q2, q3, freetext absent) without crashing, rendering
 *     them as "—" or a similar placeholder rather than "undefined".
 *   - buildDynamicContext must be deterministic: same input produces same output.
 *
 * No mocking required — prompt.ts is pure string-building with no I/O.
 */

import { describe, it, expect } from "vitest";
import { STATIC_PROMPT, buildDynamicContext } from "./prompt";
import type { RecommendRequest } from "@shared/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Full RecommendRequest with all optional fields present. */
const FULL_INPUT: RecommendRequest = {
  answers: {
    q1: "very-hungry",
    q2: "indulgent",
    q3: ["veg-only", "budget"],
    freetext: "I want a rich biryani experience",
  },
  passiveContext: {
    time: "2026-05-06T13:00:00.000Z",
    location: { lat: 19.076, lng: 72.8777, label: "Bandra, Mumbai" },
    historySummary: "Mostly orders biryani and dal makhani on weekday lunches.",
  },
  profileSignal: {
    dietaryPattern: "non-veg",
    topCuisines: ["North Indian", "Biryani", "Mughlai"],
    avgOrderValue: 320,
  },
};

/** Minimal RecommendRequest: q1 only, no q2/q3/freetext. */
const MINIMAL_INPUT: RecommendRequest = {
  answers: {
    q1: "light-snack",
    // q2, q3, freetext absent
  },
  passiveContext: {
    time: "2026-05-06T08:00:00.000Z",
    location: { lat: 19.076, lng: 72.8777, label: "Mumbai" },
    historySummary: "",
  },
  profileSignal: {
    dietaryPattern: "veg",
    topCuisines: [],
    avgOrderValue: 0,
  },
};

// ===========================================================================
// 1. STATIC_PROMPT — determinism, size, and non-emptiness
// ===========================================================================
describe("STATIC_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof STATIC_PROMPT).toBe("string");
    expect(STATIC_PROMPT.length).toBeGreaterThan(0);
  });

  it("is at least 3000 characters (proxy for ~1024 Anthropic tokens needed for cache eligibility)", () => {
    expect(
      STATIC_PROMPT.length,
      `STATIC_PROMPT is ${STATIC_PROMPT.length} chars; must be at least 3000 to clear Anthropic's ephemeral-cache floor (spec §"Implementation notes")`,
    ).toBeGreaterThanOrEqual(3000);
  });

  it("is deterministic — importing twice gives the same value", async () => {
    // Dynamic re-import to confirm the same module-level constant is returned.
    const { STATIC_PROMPT: imported } = await import("./prompt");
    expect(imported).toBe(STATIC_PROMPT);
  });

  it("does not contain 'undefined' as a literal string (no template-literal bugs)", () => {
    expect(
      STATIC_PROMPT.includes("undefined"),
      "STATIC_PROMPT must not contain the string 'undefined'",
    ).toBe(false);
  });
});

// ===========================================================================
// 2. buildDynamicContext — includes all user-context fields
// ===========================================================================
describe("buildDynamicContext — full input (all optional fields present)", () => {
  it("returns a non-empty string", () => {
    const ctx = buildDynamicContext(FULL_INPUT);
    expect(typeof ctx).toBe("string");
    expect(ctx.length).toBeGreaterThan(0);
  });

  it("includes the q1 (hunger level) value", () => {
    const ctx = buildDynamicContext(FULL_INPUT);
    expect(ctx).toContain(FULL_INPUT.answers.q1);
  });

  it("includes the q2 (meal type) value when present", () => {
    const ctx = buildDynamicContext(FULL_INPUT);
    expect(ctx).toContain(FULL_INPUT.answers.q2 as string);
  });

  it("includes at least one q3 constraint value when present", () => {
    const ctx = buildDynamicContext(FULL_INPUT);
    const q3 = FULL_INPUT.answers.q3 as string[];
    // At least the first constraint should appear.
    expect(ctx).toContain(q3[0]);
  });

  it("includes the freetext value when present", () => {
    const ctx = buildDynamicContext(FULL_INPUT);
    expect(ctx).toContain(FULL_INPUT.answers.freetext as string);
  });

  it("includes the location label", () => {
    const ctx = buildDynamicContext(FULL_INPUT);
    expect(ctx).toContain(FULL_INPUT.passiveContext.location.label);
  });

  it("includes the time value", () => {
    const ctx = buildDynamicContext(FULL_INPUT);
    expect(ctx).toContain(FULL_INPUT.passiveContext.time);
  });

  it("includes the dietary pattern", () => {
    const ctx = buildDynamicContext(FULL_INPUT);
    expect(ctx).toContain(FULL_INPUT.profileSignal.dietaryPattern);
  });

  it("includes at least one top cuisine when topCuisines is non-empty", () => {
    const ctx = buildDynamicContext(FULL_INPUT);
    expect(ctx).toContain(FULL_INPUT.profileSignal.topCuisines[0]);
  });

  it("includes the historySummary when non-empty", () => {
    const ctx = buildDynamicContext(FULL_INPUT);
    expect(ctx).toContain(FULL_INPUT.passiveContext.historySummary);
  });

  it("includes the avgOrderValue", () => {
    const ctx = buildDynamicContext(FULL_INPUT);
    expect(ctx).toContain(String(FULL_INPUT.profileSignal.avgOrderValue));
  });
});

// ===========================================================================
// 3. buildDynamicContext — minimal input (optional fields absent)
// ===========================================================================
describe("buildDynamicContext — minimal input (q1 only, no q2/q3/freetext)", () => {
  it("does not throw when q2, q3, and freetext are absent", () => {
    expect(() => buildDynamicContext(MINIMAL_INPUT)).not.toThrow();
  });

  it("returns a non-empty string for minimal input", () => {
    const ctx = buildDynamicContext(MINIMAL_INPUT);
    expect(ctx.length).toBeGreaterThan(0);
  });

  it("includes the q1 value even for minimal input", () => {
    const ctx = buildDynamicContext(MINIMAL_INPUT);
    expect(ctx).toContain(MINIMAL_INPUT.answers.q1);
  });

  it("renders absent q2 as a placeholder (not the literal string 'undefined')", () => {
    const ctx = buildDynamicContext(MINIMAL_INPUT);
    // The spec says absent optional fields render as "—" or similar.
    // What matters is the string 'undefined' must not appear.
    expect(
      ctx.includes("undefined"),
      "Absent optional field must not render as 'undefined'",
    ).toBe(false);
  });

  it("renders absent q3 as a placeholder (not the literal string 'undefined')", () => {
    const ctx = buildDynamicContext(MINIMAL_INPUT);
    expect(ctx.includes("undefined")).toBe(false);
  });

  it("renders absent freetext as a placeholder (not the literal string 'undefined')", () => {
    const ctx = buildDynamicContext(MINIMAL_INPUT);
    expect(ctx.includes("undefined")).toBe(false);
  });

  it("renders empty topCuisines as a placeholder (not the literal string 'undefined')", () => {
    const ctx = buildDynamicContext(MINIMAL_INPUT);
    expect(ctx.includes("undefined")).toBe(false);
  });

  it("includes the location label for minimal input", () => {
    const ctx = buildDynamicContext(MINIMAL_INPUT);
    expect(ctx).toContain(MINIMAL_INPUT.passiveContext.location.label);
  });
});

// ===========================================================================
// 4. buildDynamicContext — determinism
// ===========================================================================
describe("buildDynamicContext — determinism", () => {
  it("returns the same string when called twice with the same full input", () => {
    const first = buildDynamicContext(FULL_INPUT);
    const second = buildDynamicContext(FULL_INPUT);
    expect(first).toBe(second);
  });

  it("returns the same string when called twice with the same minimal input", () => {
    const first = buildDynamicContext(MINIMAL_INPUT);
    const second = buildDynamicContext(MINIMAL_INPUT);
    expect(first).toBe(second);
  });

  it("returns different strings for different inputs (sanity check)", () => {
    const fullCtx = buildDynamicContext(FULL_INPUT);
    const minimalCtx = buildDynamicContext(MINIMAL_INPUT);
    // Different inputs must produce different dynamic blocks.
    expect(fullCtx).not.toBe(minimalCtx);
  });

  it("reflects q1 changes in the output (context is per-request, not constant)", () => {
    const inputA: RecommendRequest = {
      ...MINIMAL_INPUT,
      answers: { q1: "light-snack" },
    };
    const inputB: RecommendRequest = {
      ...MINIMAL_INPUT,
      answers: { q1: "very-hungry" },
    };
    const ctxA = buildDynamicContext(inputA);
    const ctxB = buildDynamicContext(inputB);
    expect(ctxA).not.toBe(ctxB);
  });
});
