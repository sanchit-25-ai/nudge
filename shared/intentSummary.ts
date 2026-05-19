import type {
  HungerLevel,
  MealType,
  Q3Constraint,
  RecommendAnswers,
} from "./types";

// Item 13: deterministic NL summariser used by the freetext-step pre-fill on
// the frontend. Pure function — no I/O, no time, no randomness. Shared-side so
// a future BE consumer (Item 18 refinement loop) can reuse the same grammar.

export type IntentInputs = Pick<
  RecommendAnswers,
  "q1" | "q2" | "q3" | "partySize"
>;

export type IntentContext = { avgOrderValue: number };

const BASE: Record<HungerLevel, string> = {
  "light-snack": "Something light to snack on",
  "regular-meal": "A regular meal",
  "very-hungry": "Something filling — I'm very hungry",
};

const BASE_WITH_Q2: Record<HungerLevel, Record<MealType, string>> = {
  "light-snack": {
    "comfort-favourite": "A familiar light snack",
    healthy: "A light healthy snack",
    indulgent: "A small indulgent treat",
    "surprise-me": "Surprise me with a light snack",
  },
  "regular-meal": {
    "comfort-favourite": "A comforting regular meal",
    healthy: "A healthy regular meal",
    indulgent: "An indulgent regular meal",
    "surprise-me": "Surprise me with a regular meal",
  },
  "very-hungry": {
    "comfort-favourite": "A big comforting meal — I'm very hungry",
    healthy: "A big healthy meal — I'm very hungry",
    indulgent: "A big indulgent meal — I'm very hungry",
    "surprise-me": "Surprise me with a big meal — I'm very hungry",
  },
};

// Canonical clause order, independent of user-tap order on the Q3 chip row.
const MODIFIER_ORDER: Q3Constraint[] = [
  "veg-only",
  "fast-delivery",
  "high-rated",
  "budget",
];

function formatRupees(n: number): string {
  return `₹${Math.round(n)}`;
}

function modifierFor(
  chip: Q3Constraint,
  partySize: number | undefined,
  avgOrderValue: number,
): string {
  switch (chip) {
    case "veg-only":
      return "veg";
    case "fast-delivery":
      return "delivered fast";
    case "high-rated":
      return "from top-rated places";
    case "budget":
      return partySize !== undefined
        ? `for ${partySize}, under ${formatRupees(avgOrderValue)} each`
        : `under ${formatRupees(avgOrderValue)}`;
    default: {
      const _exhaustive: never = chip;
      return _exhaustive;
    }
  }
}

export function buildIntentSummary(
  answers: IntentInputs,
  context: IntentContext,
): string {
  const base = answers.q2
    ? BASE_WITH_Q2[answers.q1][answers.q2]
    : BASE[answers.q1];
  const q3 = answers.q3 ?? [];
  // partySize is only meaningful with the budget chip — defence-in-depth ignore
  // when budget isn't selected, mirroring the submit-handler omission rule.
  const partySize = q3.includes("budget") ? answers.partySize : undefined;
  const modifiers = MODIFIER_ORDER.filter((m) => q3.includes(m)).map((m) =>
    modifierFor(m, partySize, context.avgOrderValue),
  );
  return [base, ...modifiers].join(", ") + ".";
}
