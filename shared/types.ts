export type HealthResponse = { status: "ok" };

// User profile types — source of truth: nudge_spec.docx §7.4 ("Simulated Order History Schema").
// Stored in localStorage on the frontend; loaded on app open. The recommend
// endpoint (Item 04+) will pull a derived payload off this for the prompt builder.
//
// Two fields below are Nudge schema extensions beyond the §7.4 example:
//   - schemaVersion: lockstep with the storage key suffix (`nudge.profile.v1`)
//   - q3SkipCount:   needed by Item 11 for the Q3-collapse-after-3-skips rule (§4.2)

export type DietaryPattern = "veg" | "non-veg";

export type PriceRange = "low" | "mid" | "high";

export type Location = {
  lat: number;
  lng: number;
  label: string;
};

export type PastOrder = {
  dishName: string;
  cuisineCategory: string;
  restaurant: string;
  orderedAt: string; // YYYY-MM-DD
  isVeg: boolean;
  priceRange: PriceRange;
};

export type UserProfile = {
  schemaVersion: 1;
  userId: string;
  location: Location;
  orderHistory: PastOrder[];
  dietaryPattern: DietaryPattern;
  topCuisines: string[];
  avgOrderValue: number; // validated non-negative by UserProfileSchema
  lastOrderedAt: string; // YYYY-MM-DD
  q3SkipCount: number;   // validated non-negative integer by UserProfileSchema
};

// Recommend types — source of truth for POST /api/recommend (Item 04+).
// Q1/Q2/Q3 option sets come from spec §4.2; card anatomy from §6.4; output
// shape from §7.3. Q2/Q3/freetext are optional today (Item 04 ships Q1 only)
// but defined now so Item 11 can light them up without a schema break.

export type HungerLevel = "light-snack" | "regular-meal" | "very-hungry";

export type MealType =
  | "comfort-favourite"
  | "healthy"
  | "indulgent"
  | "surprise-me";

export type Q3Constraint =
  | "veg-only"
  | "fast-delivery"
  | "budget"
  | "high-rated";

export type RecommendAnswers = {
  q1: HungerLevel;
  q2?: MealType;
  q3?: Q3Constraint[];
  freetext?: string;
};

export type PassiveContext = {
  time: string; // ISO 8601, FE-formatted
  location: Location;
  historySummary: string; // derived blurb, NOT full orderHistory
};

export type ProfileSignal = {
  dietaryPattern: DietaryPattern;
  topCuisines: string[];
  avgOrderValue: number;
};

export type RecommendRequest = {
  answers: RecommendAnswers;
  passiveContext: PassiveContext;
  profileSignal: ProfileSignal;
};

export type Restaurant = {
  name: string;
  rating: number;
  etaMinutes: number;
  swiggyUrl: string;
};

export type Dish = {
  id: string;
  name: string;
  restaurant: Restaurant;
  imageUrl: string;
  priceInr: number;
  cuisineTags: string[];
  healthNudge: boolean; // wired in Item 17, field exists day 1
};

export type RecommendResponse = {
  requestId: string;
  dishes: Dish[]; // length === 5 (validated by RecommendResponseSchema)
};

export type RecommendErrorCode =
  | "validation_error"
  | "internal_error"
  | "model_error"
  | "mcp_error"
  | "parse_error";

export type RecommendError = {
  error: {
    code: RecommendErrorCode;
    message: string;
    requestId: string;
    details?: { path: string; message: string }[];
  };
};
