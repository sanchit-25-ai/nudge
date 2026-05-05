import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { ZodIssue } from "zod";
import type { Dish, RecommendError, RecommendResponse } from "@shared/types";
import { RecommendRequestSchema } from "../schema";

// Zod's default messages for these codes embed the user-supplied received
// value (e.g. "...received 'foo'"). Spec requires path + message only — no
// echoed input — so we replace those with a fixed message.
const ISSUE_CODE_MESSAGES: Partial<Record<ZodIssue["code"], string>> = {
  invalid_enum_value: "Invalid value for enum field",
  invalid_literal: "Invalid literal value",
  unrecognized_keys: "Unrecognized key(s) in object",
};

function sanitiseIssueMessage(issue: ZodIssue): string {
  return ISSUE_CODE_MESSAGES[issue.code] ?? issue.message;
}

export const recommendRouter = Router();

// Realistic Mumbai 5-dish fixture. DELETE this block in Item 05 when the
// real Anthropic + MCP call replaces the stub. Image URLs use Unsplash CDN
// with `?w=600&q=80` so the dev card render in Item 10 isn't fed multi-MB
// originals.
const FIXTURE_DISHES: Dish[] = [
  {
    id: "fx-1",
    name: "Chicken Biryani",
    restaurant: {
      name: "Behrouz Biryani",
      rating: 4.4,
      etaMinutes: 32,
      swiggyUrl: "https://www.swiggy.com/restaurants/behrouz-biryani-mumbai",
    },
    imageUrl:
      "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&q=80",
    priceInr: 280,
    cuisineTags: ["Biryani", "Mughlai"],
    healthNudge: false,
  },
  {
    id: "fx-2",
    name: "Butter Chicken",
    restaurant: {
      name: "Punjabi By Nature",
      rating: 4.3,
      etaMinutes: 38,
      swiggyUrl: "https://www.swiggy.com/restaurants/punjabi-by-nature-mumbai",
    },
    imageUrl:
      "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&q=80",
    priceInr: 320,
    cuisineTags: ["North Indian", "Punjabi"],
    healthNudge: true,
  },
  {
    id: "fx-3",
    name: "Hakka Noodles",
    restaurant: {
      name: "Mainland China",
      rating: 4.2,
      etaMinutes: 29,
      swiggyUrl: "https://www.swiggy.com/restaurants/mainland-china-mumbai",
    },
    imageUrl:
      "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=600&q=80",
    priceInr: 240,
    cuisineTags: ["Chinese", "Indo-Chinese"],
    healthNudge: false,
  },
  {
    id: "fx-4",
    name: "Margherita Pizza",
    restaurant: {
      name: "Pizza Express",
      rating: 4.1,
      etaMinutes: 27,
      swiggyUrl: "https://www.swiggy.com/restaurants/pizza-express-mumbai",
    },
    imageUrl:
      "https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?w=600&q=80",
    priceInr: 299,
    cuisineTags: ["Italian", "Pizza"],
    healthNudge: false,
  },
  {
    id: "fx-5",
    name: "Masala Dosa",
    restaurant: {
      name: "Sagar Ratna",
      rating: 4.5,
      etaMinutes: 24,
      swiggyUrl: "https://www.swiggy.com/restaurants/sagar-ratna-mumbai",
    },
    imageUrl:
      "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=600&q=80",
    priceInr: 180,
    cuisineTags: ["South Indian"],
    healthNudge: false,
  },
];

recommendRouter.post("/recommend", (req, res) => {
  const requestId = randomUUID();
  res.locals.requestId = requestId;

  const result = RecommendRequestSchema.safeParse(req.body);

  if (!result.success) {
    const body: RecommendError = {
      error: {
        code: "validation_error",
        message: "Request body failed validation",
        requestId,
        details: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: sanitiseIssueMessage(i),
        })),
      },
    };
    res.status(400).json(body);
    return;
  }

  const body: RecommendResponse = { requestId, dishes: FIXTURE_DISHES };
  res.status(200).json(body);
});
