import type { Dish } from "@shared/types";

// Hardcoded response for local UI testing when ANTHROPIC_API_KEY is unavailable.
// Activated by USE_STUB_RECOMMEND=true. Delete this file (and the branch in
// routes/recommend.ts) once the real Anthropic + MCP path is exercisable.
export const STUB_DISHES: Dish[] = [
  {
    id: "stub-1",
    name: "Margherita Pizza",
    restaurant: {
      name: "Napoli Wood-Fired",
      rating: 4.4,
      etaMinutes: 28,
      swiggyUrl: "https://www.swiggy.com/",
    },
    imageUrl:
      "https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?w=300&h=300&fit=crop&auto=format",
    priceInr: 320,
    cuisineTags: ["italian", "pizza"],
    healthNudge: false,
  },
  {
    id: "stub-2",
    name: "Paneer Butter Masala",
    restaurant: {
      name: "Curry House",
      rating: 4.2,
      etaMinutes: 32,
      swiggyUrl: "https://www.swiggy.com/",
    },
    imageUrl:
      "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=300&h=300&fit=crop&auto=format",
    priceInr: 280,
    cuisineTags: ["north-indian", "vegetarian"],
    healthNudge: false,
  },
  {
    id: "stub-3",
    name: "Chicken Biryani",
    restaurant: {
      name: "Hyderabad Biryani Co.",
      rating: 4.5,
      etaMinutes: 35,
      swiggyUrl: "https://www.swiggy.com/",
    },
    imageUrl:
      "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=300&h=300&fit=crop&auto=format",
    priceInr: 350,
    cuisineTags: ["hyderabadi", "biryani"],
    healthNudge: false,
  },
  {
    id: "stub-4",
    name: "Buddha Bowl",
    restaurant: {
      name: "Green Plate",
      rating: 4.3,
      etaMinutes: 22,
      swiggyUrl: "https://www.swiggy.com/",
    },
    imageUrl:
      "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=300&h=300&fit=crop&auto=format",
    priceInr: 240,
    cuisineTags: ["healthy", "salad"],
    healthNudge: true,
  },
  {
    id: "stub-5",
    name: "Classic Cheeseburger",
    restaurant: {
      name: "Burger Bros",
      rating: 4.1,
      etaMinutes: 25,
      swiggyUrl: "https://www.swiggy.com/",
    },
    imageUrl:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&h=300&fit=crop&auto=format",
    priceInr: 260,
    cuisineTags: ["american", "burger"],
    healthNudge: false,
  },
];
