import type { PassiveContext, UserProfile } from "@shared/types";

// Item 08 stub. Item 09 replaces the body with browser geolocation +
// a richer history-summary derivation. The signature is contractual —
// callers (Questions.tsx today, refinement screens later) should not
// have to change when Item 09 lands.
export function buildPassiveContext(profile: UserProfile): PassiveContext {
  const recent = profile.orderHistory
    .slice(0, 3)
    .map((o) => o.dishName)
    .join(", ");
  return {
    time: new Date().toISOString(),
    location: profile.location,
    historySummary: recent ? `Recent orders: ${recent}` : "",
  };
}
