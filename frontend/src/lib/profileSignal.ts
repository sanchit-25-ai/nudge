import type { ProfileSignal, UserProfile } from "@shared/types";

export function buildProfileSignal(p: UserProfile): ProfileSignal {
  return {
    dietaryPattern: p.dietaryPattern,
    topCuisines: p.topCuisines,
    avgOrderValue: p.avgOrderValue,
  };
}
