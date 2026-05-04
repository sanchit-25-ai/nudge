import { z } from "zod";
import type { UserProfile } from "@shared/types";

// localStorage key — versioned so a future schema bump becomes `.v2` and
// ignores the old payload cleanly (no migration in V1).
export const STORAGE_KEY = "nudge.profile.v1";

const LocationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  label: z.string().min(1),
});

const PastOrderSchema = z.object({
  dishName: z.string().min(1),
  cuisineCategory: z.string().min(1),
  restaurant: z.string().min(1),
  orderedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isVeg: z.boolean(),
  priceRange: z.enum(["low", "mid", "high"]),
});

export const UserProfileSchema = z.object({
  schemaVersion: z.literal(1),
  userId: z.string().min(1),
  location: LocationSchema,
  orderHistory: z.array(PastOrderSchema),
  dietaryPattern: z.enum(["veg", "non-veg"]),
  topCuisines: z.array(z.string().min(1)),
  avgOrderValue: z.number().nonnegative(),
  lastOrderedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  q3SkipCount: z.number().int().nonnegative(),
}) satisfies z.ZodType<UserProfile>;

// Seeded demo persona per build-plan Item 03 ("Mumbai non-veg") and §7.4 sample.
// Mumbai coordinates and topCuisines/avgOrderValue come straight from the spec example.
export const MUMBAI_NON_VEG_PERSONA: UserProfile = {
  schemaVersion: 1,
  userId: "demo_user_01",
  location: { lat: 19.076, lng: 72.877, label: "Mumbai" },
  orderHistory: [
    {
      dishName: "Chicken Biryani",
      cuisineCategory: "Biryani",
      restaurant: "Behrouz Biryani",
      orderedAt: "2026-04-28",
      isVeg: false,
      priceRange: "mid",
    },
    {
      dishName: "Butter Chicken",
      cuisineCategory: "North Indian",
      restaurant: "Punjabi By Nature",
      orderedAt: "2026-04-15",
      isVeg: false,
      priceRange: "mid",
    },
    {
      dishName: "Hakka Noodles",
      cuisineCategory: "Chinese",
      restaurant: "Mainland China",
      orderedAt: "2026-04-08",
      isVeg: false,
      priceRange: "mid",
    },
  ],
  dietaryPattern: "non-veg",
  topCuisines: ["Biryani", "North Indian", "Chinese"],
  avgOrderValue: 280,
  lastOrderedAt: "2026-04-28",
  q3SkipCount: 0,
};

export function loadProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = UserProfileSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: UserProfile): void {
  if (typeof window === "undefined") return;
  const result = UserProfileSchema.safeParse(p);
  if (!result.success) {
    // Keep field values out of the thrown error in case future profile fields
    // ever carry sensitive data; structured issues stay in the dev console.
    console.error("saveProfile: validation failed", result.error.issues);
    throw new Error("saveProfile: invalid profile shape — see console for details");
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result.data));
}

export function ensureProfile(): UserProfile {
  const existing = loadProfile();
  if (existing) return existing;
  saveProfile(MUMBAI_NON_VEG_PERSONA);
  return MUMBAI_NON_VEG_PERSONA;
}

export function resetProfile(): UserProfile {
  if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
  return ensureProfile();
}

export function resetAndReload(): void {
  resetProfile();
  if (typeof window !== "undefined") window.location.reload();
}

// Dev-only console hook. Gated by Vite's DEV flag so it tree-shakes out of
// production bundles. Replaced by Item 20's real "Edit profile" UI.
if (typeof window !== "undefined" && import.meta.env.DEV) {
  window.__resetNudgeProfile = resetAndReload;
}
