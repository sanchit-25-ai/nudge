/**
 * Unit tests for backend/src/parser.ts — Item 07: Response Parser + Validator
 *
 * Spec: .claude/specs/07-response-parser.md
 * Build plan: Phase A, Item 07.
 *
 * `parseDishes` is a pure function (no SDK calls, no network). All tests here
 * are synchronous and need no mocks.
 *
 * Invariants under test:
 *   - Happy path: valid {"dishes":[...5]} → { ok: true, dishes }
 *   - Empty content array → no_text_block reason
 *   - Non-JSON text → invalid_json reason
 *   - JSON missing dishes key → missing_dishes_field reason
 *   - JSON with empty dishes array → schema_validation reason
 *   - Multiple text blocks → last block wins (findFinalText semantics)
 *   - CORRECTION_MESSAGE contains "# Output contract" and is non-empty
 */

import { describe, it, expect } from "vitest";
import type { Dish } from "@shared/types";
import type { BetaContentBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { parseDishes, CORRECTION_MESSAGE } from "./parser";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a valid Dish conforming to shared/types.ts. All required fields
 * present; rating is within [0,5] per RestaurantSchema; etaMinutes is a
 * non-negative integer.
 */
function validDish(overrides: Partial<Dish> = {}): Dish {
  const i = overrides.id ?? "1";
  return {
    id: String(i),
    name: `Test Dish ${i}`,
    restaurant: {
      name: `Test Restaurant ${i}`,
      rating: 4.2,
      etaMinutes: 30,
      swiggyUrl: `https://www.swiggy.com/restaurants/test-${i}`,
    },
    imageUrl: `https://example.com/dish-${i}.jpg`,
    priceInr: 250,
    cuisineTags: ["North Indian"],
    healthNudge: false,
    ...overrides,
  };
}

/**
 * Build exactly 5 valid dishes with distinct ids, satisfying
 * RecommendResponseSchema.shape.dishes (z.array(DishSchema).length(5)).
 */
function validDishesFixture(): Dish[] {
  return Array.from({ length: 5 }, (_, i) => validDish({ id: `dish-${i + 1}` }));
}

/**
 * Wrap text in a BetaContentBlock of type "text". The cast satisfies the
 * opaque SDK type without importing internals.
 */
function textBlock(text: string): BetaContentBlock {
  return { type: "text", text } as BetaContentBlock;
}

/**
 * A non-text content block — used to seed content arrays without text.
 */
function toolUseBlock(): BetaContentBlock {
  return {
    type: "tool_use",
    id: "tu_stub",
    name: "search",
    input: {},
  } as unknown as BetaContentBlock;
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("parseDishes — happy path", () => {
  it("returns { ok: true, dishes } with length 5 for a valid dishes JSON", () => {
    const dishes = validDishesFixture();
    const content: BetaContentBlock[] = [
      textBlock(JSON.stringify({ dishes })),
    ];

    const result = parseDishes(content);

    expect(result.ok, "Expected ok: true for valid input").toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.dishes).toHaveLength(5);
  });

  it("returned dishes carry all required Dish fields", () => {
    const dishes = validDishesFixture();
    const content: BetaContentBlock[] = [
      textBlock(JSON.stringify({ dishes })),
    ];

    const result = parseDishes(content);
    if (!result.ok) throw new Error("Expected parse success");

    result.dishes.forEach((dish, i) => {
      expect(dish.id, `dish[${i}].id`).toBeTruthy();
      expect(dish.name, `dish[${i}].name`).toBeTruthy();
      expect(dish.restaurant.name, `dish[${i}].restaurant.name`).toBeTruthy();
      expect(typeof dish.restaurant.rating).toBe("number");
      expect(typeof dish.restaurant.etaMinutes).toBe("number");
      expect(dish.restaurant.swiggyUrl).toMatch(/^https?:\/\//);
      expect(dish.imageUrl).toMatch(/^https?:\/\//);
      expect(typeof dish.priceInr).toBe("number");
      expect(Array.isArray(dish.cuisineTags)).toBe(true);
      expect(typeof dish.healthNudge).toBe("boolean");
    });
  });
});

// ---------------------------------------------------------------------------
// Failure: no_text_block
// ---------------------------------------------------------------------------

describe("parseDishes — no_text_block failure", () => {
  it("returns ok: false with reason 'no_text_block' for empty content array", () => {
    const result = parseDishes([]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("no_text_block");
  });

  it("error.code is 'parse_error' for no_text_block", () => {
    const result = parseDishes([]);

    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("parse_error");
  });

  it("error.message is 'Model response contained no text block'", () => {
    const result = parseDishes([]);

    if (result.ok) throw new Error("unreachable");
    expect(result.error.message).toBe("Model response contained no text block");
  });

  it("returns no_text_block when content contains only non-text blocks", () => {
    const content: BetaContentBlock[] = [toolUseBlock(), toolUseBlock()];
    const result = parseDishes(content);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("no_text_block");
  });
});

// ---------------------------------------------------------------------------
// Failure: invalid_json
// ---------------------------------------------------------------------------

describe("parseDishes — invalid_json failure", () => {
  it("returns ok: false with reason 'invalid_json' for non-JSON text", () => {
    const content: BetaContentBlock[] = [textBlock("this is not json at all")];
    const result = parseDishes(content);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("invalid_json");
  });

  it("error.code is 'parse_error' for invalid_json", () => {
    const content: BetaContentBlock[] = [textBlock("{broken json {{")];
    const result = parseDishes(content);

    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("parse_error");
  });

  it("error.message is 'Model response was not valid JSON'", () => {
    const content: BetaContentBlock[] = [textBlock("not json")];
    const result = parseDishes(content);

    if (result.ok) throw new Error("unreachable");
    expect(result.error.message).toBe("Model response was not valid JSON");
  });

  it("treats markdown-fenced JSON as invalid (no pre-parse normalisation)", () => {
    const dishes = validDishesFixture();
    const fenced = "```json\n" + JSON.stringify({ dishes }) + "\n```";
    const content: BetaContentBlock[] = [textBlock(fenced)];
    const result = parseDishes(content);

    // Spec §Tech choices "No pre-parse normalisation": strict parse, no fence stripping.
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("invalid_json");
  });
});

// ---------------------------------------------------------------------------
// Failure: missing_dishes_field
// ---------------------------------------------------------------------------

describe("parseDishes — missing_dishes_field failure", () => {
  it("returns ok: false with reason 'missing_dishes_field' for {foo:1}", () => {
    const content: BetaContentBlock[] = [textBlock(JSON.stringify({ foo: 1 }))];
    const result = parseDishes(content);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("missing_dishes_field");
  });

  it("error.code is 'parse_error' for missing_dishes_field", () => {
    const content: BetaContentBlock[] = [textBlock(JSON.stringify({ items: [] }))];
    const result = parseDishes(content);

    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("parse_error");
  });

  it("error.message contains backtick-wrapped 'dishes' field name", () => {
    // Spec: message === "Model response missing `dishes` field"
    const content: BetaContentBlock[] = [textBlock(JSON.stringify({ items: [] }))];
    const result = parseDishes(content);

    if (result.ok) throw new Error("unreachable");
    expect(result.error.message).toBe("Model response missing `dishes` field");
  });

  it("returns missing_dishes_field for valid JSON array (not an object with dishes)", () => {
    const content: BetaContentBlock[] = [textBlock(JSON.stringify([1, 2, 3]))];
    const result = parseDishes(content);

    if (result.ok) throw new Error("unreachable");
    // An array does not have a `dishes` key; spec §Implementation notes: check
    // typeof parsed === "object" && parsed !== null && "dishes" in parsed.
    expect(result.reason).toBe("missing_dishes_field");
  });
});

// ---------------------------------------------------------------------------
// Failure: schema_validation
// ---------------------------------------------------------------------------

describe("parseDishes — schema_validation failure", () => {
  it("returns ok: false with reason 'schema_validation' for empty dishes array", () => {
    // RecommendResponseSchema.shape.dishes = z.array(DishSchema).length(5)
    // An empty array fails the length(5) constraint.
    const content: BetaContentBlock[] = [textBlock(JSON.stringify({ dishes: [] }))];
    const result = parseDishes(content);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("schema_validation");
  });

  it("error.code is 'parse_error' for schema_validation", () => {
    const content: BetaContentBlock[] = [textBlock(JSON.stringify({ dishes: [] }))];
    const result = parseDishes(content);

    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("parse_error");
  });

  it("error.message is 'Model response failed schema validation'", () => {
    const content: BetaContentBlock[] = [textBlock(JSON.stringify({ dishes: [] }))];
    const result = parseDishes(content);

    if (result.ok) throw new Error("unreachable");
    expect(result.error.message).toBe("Model response failed schema validation");
  });

  it("fails schema_validation when dishes has 3 entries (requires exactly 5)", () => {
    const threeDishes = Array.from({ length: 3 }, (_, i) =>
      validDish({ id: `d-${i}` }),
    );
    const content: BetaContentBlock[] = [
      textBlock(JSON.stringify({ dishes: threeDishes })),
    ];
    const result = parseDishes(content);

    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("schema_validation");
  });

  it("fails schema_validation when a dish has rating > 5 (RestaurantSchema violation)", () => {
    const badDishes = validDishesFixture().map((d, i) =>
      i === 0 ? { ...d, restaurant: { ...d.restaurant, rating: 99 } } : d,
    );
    const content: BetaContentBlock[] = [
      textBlock(JSON.stringify({ dishes: badDishes })),
    ];
    const result = parseDishes(content);

    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("schema_validation");
  });

  it("fails schema_validation when a dish is missing imageUrl", () => {
    const badDishes = validDishesFixture().map((d, i) => {
      if (i !== 0) return d;
      const { imageUrl: _omit, ...rest } = d;
      return rest as Dish;
    });
    const content: BetaContentBlock[] = [
      textBlock(JSON.stringify({ dishes: badDishes })),
    ];
    const result = parseDishes(content);

    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("schema_validation");
  });
});

// ---------------------------------------------------------------------------
// Multiple text blocks — last block wins
// ---------------------------------------------------------------------------

describe("parseDishes — multiple text blocks (findFinalText semantics)", () => {
  it("succeeds when only the LAST text block contains valid JSON", () => {
    // First block is a stub/preamble (not JSON); last block is valid.
    const dishes = validDishesFixture();
    const content: BetaContentBlock[] = [
      textBlock("Some preamble text that is not JSON"),
      textBlock(JSON.stringify({ dishes })),
    ];

    const result = parseDishes(content);

    expect(result.ok, "Expected ok: true when last block has valid JSON").toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.dishes).toHaveLength(5);
  });

  it("fails invalid_json when only the LAST text block is malformed (valid earlier block ignored)", () => {
    // Spec: findFinalText scans from the end; first block is valid JSON but
    // second (last) block is garbage — the last block must win.
    const dishes = validDishesFixture();
    const content: BetaContentBlock[] = [
      textBlock(JSON.stringify({ dishes })),   // earlier block — valid
      textBlock("not json at all"),             // last block — invalid
    ];

    const result = parseDishes(content);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("invalid_json");
  });

  it("handles non-text blocks interspersed — still finds the last text block", () => {
    const dishes = validDishesFixture();
    const content: BetaContentBlock[] = [
      toolUseBlock(),
      textBlock("intermediate text"),
      toolUseBlock(),
      textBlock(JSON.stringify({ dishes })),
      toolUseBlock(),
    ];

    const result = parseDishes(content);

    // The last TEXT block is the valid JSON; the trailing tool_use block is
    // not a text block and should not interfere with findFinalText.
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.dishes).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// CORRECTION_MESSAGE contract
// ---------------------------------------------------------------------------

describe("CORRECTION_MESSAGE", () => {
  it("is a non-empty string", () => {
    expect(typeof CORRECTION_MESSAGE).toBe("string");
    expect(CORRECTION_MESSAGE.length).toBeGreaterThan(0);
  });

  it("contains the literal substring '# Output contract' (references static prompt H1)", () => {
    // Spec §Implementation notes: message references the static block's
    // `# Output contract` H1 header so the model re-reads its cached instructions.
    expect(CORRECTION_MESSAGE).toContain("# Output contract");
  });

  it("is deterministic — calling it twice returns the same value", () => {
    // Fixed-content const — no interpolation, no timestamps, no request-ids.
    const first = CORRECTION_MESSAGE;
    const second = CORRECTION_MESSAGE;
    expect(first).toBe(second);
  });

  it("does not contain any template-style placeholders (fixed content only)", () => {
    // Spec §Tech choices: deterministic fixed string with no dynamic data.
    expect(CORRECTION_MESSAGE).not.toMatch(/\$\{/);
    expect(CORRECTION_MESSAGE).not.toMatch(/%s/);
    expect(CORRECTION_MESSAGE).not.toMatch(/\{\{/);
  });
});
