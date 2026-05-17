import { z } from "zod";
import {
  FREETEXT_MAX_CHARS,
  type Dish,
  type Location,
  type PassiveContext,
  type ProfileSignal,
  type RecommendAnswers,
  type RecommendRequest,
  type RecommendResponse,
  type Restaurant,
} from "@shared/types";

const LocationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  label: z.string().min(1).max(100),
}) satisfies z.ZodType<Location>;

const RecommendAnswersSchema = z.object({
  q1: z.enum(["light-snack", "regular-meal", "very-hungry"]),
  q2: z
    .enum(["comfort-favourite", "healthy", "indulgent", "surprise-me"])
    .optional(),
  q3: z
    .array(z.enum(["veg-only", "fast-delivery", "budget", "high-rated"]))
    .optional(),
  partySize: z.number().int().min(1).max(10).optional(),
  freetext: z.string().max(FREETEXT_MAX_CHARS).optional(),
}) satisfies z.ZodType<RecommendAnswers>;

const PassiveContextSchema = z.object({
  time: z.string().datetime(),
  location: LocationSchema,
  historySummary: z.string().max(2000),
}) satisfies z.ZodType<PassiveContext>;

const ProfileSignalSchema = z.object({
  dietaryPattern: z.enum(["veg", "non-veg"]),
  topCuisines: z.array(z.string().min(1).max(50)).max(20),
  avgOrderValue: z.number().nonnegative(),
}) satisfies z.ZodType<ProfileSignal>;

export const RecommendRequestSchema = z.object({
  answers: RecommendAnswersSchema,
  passiveContext: PassiveContextSchema,
  profileSignal: ProfileSignalSchema,
}) satisfies z.ZodType<RecommendRequest>;

// z.string().url() accepts any scheme the WHATWG URL constructor recognises,
// including javascript:, data:, and vbscript:. Both URL fields below land in
// <a href> / <img src> on the FE, so reject anything other than https here.
// The try/catch covers the case where upstream .url() fails and zod still
// runs the refine — new URL(non-url) would otherwise throw uncaught.
const HttpsUrl = z
  .string()
  .url()
  .refine(
    (u) => {
      try {
        return new URL(u).protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "URL must use HTTPS" },
  );

const RestaurantSchema = z.object({
  name: z.string().min(1),
  rating: z.number().min(0).max(5),
  etaMinutes: z.number().int().nonnegative(),
  swiggyUrl: HttpsUrl,
}) satisfies z.ZodType<Restaurant>;

const DishSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  restaurant: RestaurantSchema,
  imageUrl: HttpsUrl,
  priceInr: z.number().nonnegative(),
  cuisineTags: z.array(z.string().min(1)),
  healthNudge: z.boolean(),
}) satisfies z.ZodType<Dish>;

export const RecommendResponseSchema = z.object({
  requestId: z.string().uuid(),
  dishes: z.array(DishSchema).length(5),
}) satisfies z.ZodType<RecommendResponse>;
