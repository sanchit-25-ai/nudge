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
