// Tests for shared/intentSummary.ts — pure-function unit tests.
// Run via the backend workspace (which includes ../shared/**/* and resolves
// @shared/* paths via vite-tsconfig-paths):
//   npm --workspace backend run test -- ../../shared/intentSummary.test.ts
//
// Item 13 — spec contract: every row of the Full-output-table and every
// resolution delta (rupee budget clause, IntentContext signature) is an
// individual assertion here. No implementation details are read — the grammar
// table in the spec IS the contract.

import { describe, it, expect } from "vitest";
import {
  buildIntentSummary,
  type IntentInputs,
  type IntentContext,
} from "./intentSummary";

// ---------------------------------------------------------------------------
// Canonical context fixture (avgOrderValue used for rupee budget clause).
// ---------------------------------------------------------------------------

const CTX_280: IntentContext = { avgOrderValue: 280 };
const CTX_300: IntentContext = { avgOrderValue: 300 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summary(answers: IntentInputs, ctx: IntentContext = CTX_280): string {
  return buildIntentSummary(answers, ctx);
}

// ===========================================================================
// Q1 alone — 3 base-clause rows
// ===========================================================================

describe("buildIntentSummary — Q1 alone (no Q2, no Q3)", () => {
  it("light-snack → 'Something light to snack on.'", () => {
    expect(summary({ q1: "light-snack" })).toBe("Something light to snack on.");
  });

  it("regular-meal → 'A regular meal.'", () => {
    expect(summary({ q1: "regular-meal" })).toBe("A regular meal.");
  });

  it("very-hungry → 'Something filling — I\\'m very hungry.'", () => {
    expect(summary({ q1: "very-hungry" })).toBe(
      "Something filling — I'm very hungry.",
    );
  });
});

// ===========================================================================
// Q1 × Q2 combinations — spec table sample
// ===========================================================================

describe("buildIntentSummary — Q1 × Q2 base clauses", () => {
  it("regular-meal × comfort-favourite → 'A comforting regular meal.'", () => {
    expect(summary({ q1: "regular-meal", q2: "comfort-favourite" })).toBe(
      "A comforting regular meal.",
    );
  });

  it("regular-meal × healthy → 'A healthy regular meal.'", () => {
    expect(summary({ q1: "regular-meal", q2: "healthy" })).toBe(
      "A healthy regular meal.",
    );
  });

  it("regular-meal × indulgent → 'An indulgent regular meal.'", () => {
    expect(summary({ q1: "regular-meal", q2: "indulgent" })).toBe(
      "An indulgent regular meal.",
    );
  });

  it("regular-meal × surprise-me → 'Surprise me with a regular meal.' (noun-phrase directive)", () => {
    expect(summary({ q1: "regular-meal", q2: "surprise-me" })).toBe(
      "Surprise me with a regular meal.",
    );
  });

  it("light-snack × healthy → 'A light healthy snack.'", () => {
    expect(summary({ q1: "light-snack", q2: "healthy" })).toBe(
      "A light healthy snack.",
    );
  });

  it("light-snack × indulgent → 'A small indulgent treat.'", () => {
    expect(summary({ q1: "light-snack", q2: "indulgent" })).toBe(
      "A small indulgent treat.",
    );
  });

  it("very-hungry × indulgent → 'A big indulgent meal — I\\'m very hungry.'", () => {
    expect(summary({ q1: "very-hungry", q2: "indulgent" })).toBe(
      "A big indulgent meal — I'm very hungry.",
    );
  });

  it("light-snack × comfort-favourite → 'A familiar light snack.'", () => {
    expect(summary({ q1: "light-snack", q2: "comfort-favourite" })).toBe(
      "A familiar light snack.",
    );
  });

  it("light-snack × surprise-me → 'Surprise me with a light snack.'", () => {
    expect(summary({ q1: "light-snack", q2: "surprise-me" })).toBe(
      "Surprise me with a light snack.",
    );
  });

  it("very-hungry × comfort-favourite → 'A big comforting meal — I\\'m very hungry.'", () => {
    expect(summary({ q1: "very-hungry", q2: "comfort-favourite" })).toBe(
      "A big comforting meal — I'm very hungry.",
    );
  });

  it("very-hungry × healthy → 'A big healthy meal — I\\'m very hungry.'", () => {
    expect(summary({ q1: "very-hungry", q2: "healthy" })).toBe(
      "A big healthy meal — I'm very hungry.",
    );
  });

  it("very-hungry × surprise-me → 'Surprise me with a big meal — I\\'m very hungry.'", () => {
    expect(summary({ q1: "very-hungry", q2: "surprise-me" })).toBe(
      "Surprise me with a big meal — I'm very hungry.",
    );
  });
});

// ===========================================================================
// Q3 single-modifier clauses — spec table rows
// ===========================================================================

describe("buildIntentSummary — single Q3 modifier clauses", () => {
  it("veg-only → appends ', veg'", () => {
    expect(summary({ q1: "regular-meal", q3: ["veg-only"] })).toBe(
      "A regular meal, veg.",
    );
  });

  it("fast-delivery → appends ', delivered fast'", () => {
    expect(summary({ q1: "regular-meal", q3: ["fast-delivery"] })).toBe(
      "A regular meal, delivered fast.",
    );
  });

  it("high-rated → appends ', from top-rated places'", () => {
    expect(summary({ q1: "regular-meal", q3: ["high-rated"] })).toBe(
      "A regular meal, from top-rated places.",
    );
  });
});

// ===========================================================================
// Budget clause — rupee figure (resolution delta: emits ₹<round(avgOrderValue)>)
// ===========================================================================

describe("buildIntentSummary — budget clause with rupee figure (resolution)", () => {
  it("budget, no partySize, avgOrderValue=300 → ', under ₹300'", () => {
    expect(
      summary({ q1: "regular-meal", q3: ["budget"] }, CTX_300),
    ).toBe("A regular meal, under ₹300.");
  });

  it("budget, no partySize, avgOrderValue=280 → ', under ₹280'", () => {
    expect(
      summary({ q1: "regular-meal", q3: ["budget"] }, CTX_280),
    ).toBe("A regular meal, under ₹280.");
  });

  it("budget with partySize=4, avgOrderValue=280 → 'for 4, under ₹280 each'", () => {
    expect(
      summary(
        { q1: "regular-meal", q3: ["budget"], partySize: 4 },
        CTX_280,
      ),
    ).toBe("A regular meal, for 4, under ₹280 each.");
  });

  it("budget with partySize=2, avgOrderValue=300 → 'for 2, under ₹300 each'", () => {
    expect(
      summary(
        { q1: "regular-meal", q3: ["budget"], partySize: 2 },
        CTX_300,
      ),
    ).toBe("A regular meal, for 2, under ₹300 each.");
  });

  it("budget with partySize=1, avgOrderValue=280 → 'for 1, under ₹280 each' (single diner)", () => {
    expect(
      summary(
        { q1: "regular-meal", q3: ["budget"], partySize: 1 },
        CTX_280,
      ),
    ).toBe("A regular meal, for 1, under ₹280 each.");
  });
});

// ===========================================================================
// Math.round rounding of avgOrderValue
// ===========================================================================

describe("buildIntentSummary — avgOrderValue rounds via Math.round", () => {
  it("avgOrderValue=280.6 → ₹281", () => {
    expect(
      summary({ q1: "regular-meal", q3: ["budget"] }, { avgOrderValue: 280.6 }),
    ).toBe("A regular meal, under ₹281.");
  });

  it("avgOrderValue=249.4 → ₹249", () => {
    expect(
      summary({ q1: "regular-meal", q3: ["budget"] }, { avgOrderValue: 249.4 }),
    ).toBe("A regular meal, under ₹249.");
  });

  it("avgOrderValue=280.5 → ₹281 (rounds half-up)", () => {
    expect(
      summary({ q1: "regular-meal", q3: ["budget"] }, { avgOrderValue: 280.5 }),
    ).toBe("A regular meal, under ₹281.");
  });
});

// ===========================================================================
// Canonical modifier ordering — fixed veg → fast → high-rated → budget
// regardless of user-tap order in the input array
// ===========================================================================

describe("buildIntentSummary — canonical modifier ordering", () => {
  it("q3 in reverse canonical order → emits in canonical order", () => {
    // Input: budget first, then high-rated, then fast-delivery, then veg-only.
    // Output must follow canonical order: veg → fast → high-rated → budget.
    expect(
      summary(
        {
          q1: "regular-meal",
          q3: ["budget", "high-rated", "fast-delivery", "veg-only"],
          partySize: 1,
        },
        CTX_280,
      ),
    ).toBe("A regular meal, veg, delivered fast, from top-rated places, for 1, under ₹280 each.");
  });

  it("veg-only + fast-delivery in reversed order → emits veg then delivered fast", () => {
    expect(
      summary({ q1: "regular-meal", q3: ["fast-delivery", "veg-only"] }),
    ).toBe("A regular meal, veg, delivered fast.");
  });

  it("high-rated + budget (no partySize) in reversed order → high-rated then under ₹", () => {
    expect(
      summary({ q1: "regular-meal", q3: ["budget", "high-rated"] }, CTX_280),
    ).toBe("A regular meal, from top-rated places, under ₹280.");
  });

  it("all four chips in fully scrambled order → veg, delivered fast, from top-rated places, for 4, under ₹300 each", () => {
    expect(
      summary(
        {
          q1: "very-hungry",
          q2: "indulgent",
          q3: ["high-rated", "budget", "veg-only", "fast-delivery"],
          partySize: 4,
        },
        CTX_300,
      ),
    ).toBe(
      "A big indulgent meal — I'm very hungry, veg, delivered fast, from top-rated places, for 4, under ₹300 each.",
    );
  });
});

// ===========================================================================
// Defensive cases
// ===========================================================================

describe("buildIntentSummary — defensive / edge cases", () => {
  it("partySize without budget is silently ignored", () => {
    expect(
      summary({ q1: "regular-meal", partySize: 4 }, CTX_280),
    ).toBe("A regular meal.");
  });

  it("q3 empty array treated as no modifiers", () => {
    expect(summary({ q1: "regular-meal", q3: [] })).toBe("A regular meal.");
  });

  it("q3 undefined treated as no modifiers", () => {
    // IntentInputs has q3?: Q3Constraint[] — omitting it is valid.
    const inputs: IntentInputs = { q1: "regular-meal" };
    expect(summary(inputs)).toBe("A regular meal.");
  });

  it("partySize + empty q3 → partySize ignored (budget not in q3)", () => {
    expect(
      summary({ q1: "regular-meal", q3: [], partySize: 3 }, CTX_280),
    ).toBe("A regular meal.");
  });
});

// ===========================================================================
// Output format invariants
// ===========================================================================

describe("buildIntentSummary — output format invariants", () => {
  it.each<[IntentInputs, IntentContext]>([
    [{ q1: "light-snack" }, CTX_280],
    [{ q1: "regular-meal", q2: "comfort-favourite" }, CTX_280],
    [{ q1: "very-hungry", q3: ["veg-only", "budget"], partySize: 2 }, CTX_300],
    [{ q1: "regular-meal", q3: [] }, CTX_280],
  ])("output ends in exactly one period and has no leading/trailing whitespace (%#)", (answers, ctx) => {
    const result = summary(answers, ctx);
    expect(result.endsWith("."), `expected '${result}' to end with a period`).toBe(true);
    expect(result.endsWith(".."), `expected '${result}' not to end with double-period`).toBe(false);
    expect(result).toBe(result.trim());
  });

  it("output is always a non-empty string", () => {
    expect(summary({ q1: "regular-meal" }).length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Worked examples from spec table — exact string contract
// ===========================================================================

describe("buildIntentSummary — spec worked examples (exact strings)", () => {
  it("{q1:'light-snack'} → 'Something light to snack on.'", () => {
    expect(summary({ q1: "light-snack" })).toBe("Something light to snack on.");
  });

  it("{q1:'regular-meal'} → 'A regular meal.'", () => {
    expect(summary({ q1: "regular-meal" })).toBe("A regular meal.");
  });

  it("{q1:'very-hungry'} → 'Something filling — I\\'m very hungry.'", () => {
    expect(summary({ q1: "very-hungry" })).toBe(
      "Something filling — I'm very hungry.",
    );
  });

  it("{q1:'regular-meal', q2:'comfort-favourite'} → 'A comforting regular meal.'", () => {
    expect(summary({ q1: "regular-meal", q2: "comfort-favourite" })).toBe(
      "A comforting regular meal.",
    );
  });

  it("{q1:'regular-meal', q3:['veg-only']} → 'A regular meal, veg.'", () => {
    expect(summary({ q1: "regular-meal", q3: ["veg-only"] })).toBe(
      "A regular meal, veg.",
    );
  });

  it("{q1:'regular-meal', q3:['veg-only','fast-delivery']} → 'A regular meal, veg, delivered fast.'", () => {
    expect(
      summary({ q1: "regular-meal", q3: ["veg-only", "fast-delivery"] }),
    ).toBe("A regular meal, veg, delivered fast.");
  });

  it("{q1:'regular-meal', q3:['budget'], partySize:4} → 'A regular meal, for 4, under ₹280 each.'", () => {
    expect(
      summary({ q1: "regular-meal", q3: ["budget"], partySize: 4 }, CTX_280),
    ).toBe("A regular meal, for 4, under ₹280 each.");
  });

  it("{q1:'regular-meal', q3:['budget']} (no partySize) → 'A regular meal, under ₹280.'", () => {
    expect(
      summary({ q1: "regular-meal", q3: ["budget"] }, CTX_280),
    ).toBe("A regular meal, under ₹280.");
  });

  it("{q1:'regular-meal', q3:['high-rated']} → 'A regular meal, from top-rated places.'", () => {
    expect(summary({ q1: "regular-meal", q3: ["high-rated"] })).toBe(
      "A regular meal, from top-rated places.",
    );
  });

  it("{q1:'light-snack', q2:'healthy', q3:['fast-delivery']} → 'A light healthy snack, delivered fast.'", () => {
    expect(
      summary({ q1: "light-snack", q2: "healthy", q3: ["fast-delivery"] }),
    ).toBe("A light healthy snack, delivered fast.");
  });

  it("{q1:'regular-meal', q2:'surprise-me', q3:['veg-only']} → 'Surprise me with a regular meal, veg.'", () => {
    expect(
      summary({ q1: "regular-meal", q2: "surprise-me", q3: ["veg-only"] }),
    ).toBe("Surprise me with a regular meal, veg.");
  });

  it("{q1:'regular-meal', q3:[]} (empty array) → 'A regular meal.'", () => {
    expect(summary({ q1: "regular-meal", q3: [] })).toBe("A regular meal.");
  });

  it("{q1:'regular-meal', partySize:4} (partySize without budget) → 'A regular meal.'", () => {
    expect(summary({ q1: "regular-meal", partySize: 4 }, CTX_280)).toBe(
      "A regular meal.",
    );
  });
});

// ===========================================================================
// Full-stack resolution example
// Resolution: {q1:'very-hungry', q2:'indulgent', q3:['veg-only','budget','high-rated'],
//              partySize:2} + {avgOrderValue:300}
//           → "A big indulgent meal — I'm very hungry, veg, from top-rated places,
//              for 2, under ₹300 each."
// ===========================================================================

describe("buildIntentSummary — full-stack resolution example", () => {
  it("complex input with all fields set matches the resolution contract exactly", () => {
    const result = buildIntentSummary(
      {
        q1: "very-hungry",
        q2: "indulgent",
        q3: ["veg-only", "budget", "high-rated"],
        partySize: 2,
      },
      { avgOrderValue: 300 },
    );
    expect(result).toBe(
      "A big indulgent meal — I'm very hungry, veg, from top-rated places, for 2, under ₹300 each.",
    );
  });
});
