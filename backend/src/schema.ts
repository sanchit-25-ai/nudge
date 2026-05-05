import { z } from "zod";
import type {
  Dish,
  Location,
  PassiveContext,
  ProfileSignal,
  RecommendAnswers,
  RecommendRequest,
  RecommendResponse,
  Restaurant,
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
  freetext: z.string().max(500).optional(),
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

const RestaurantSchema = z.object({
  name: z.string().min(1),
  rating: z.number().min(0).max(5),
  etaMinutes: z.number().int().nonnegative(),
  swiggyUrl: z.string().url(),
}) satisfies z.ZodType<Restaurant>;

const DishSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  restaurant: RestaurantSchema,
  imageUrl: z.string().url(),
  priceInr: z.number().nonnegative(),
  cuisineTags: z.array(z.string().min(1)),
  healthNudge: z.boolean(),
}) satisfies z.ZodType<Dish>;

export const RecommendResponseSchema = z.object({
  requestId: z.string().uuid(),
  dishes: z.array(DishSchema).length(5),
}) satisfies z.ZodType<RecommendResponse>;
