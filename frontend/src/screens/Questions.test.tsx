import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  FREETEXT_MAX_CHARS,
  type RecommendRequest,
  type Dish,
  type RecommendResponse,
} from "@shared/types";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any import of the mocked modules.
// ---------------------------------------------------------------------------

// Mock DishCard to a sentinel test-double — Questions tests are decoupled from
// DishCard's internal markup. The sentinel renders a data-testid and the dish id.
vi.mock("../components/DishCard", () => ({
  default: ({ dish }: { dish: { id: string } }) => (
    <div data-testid="dish-card" data-dish-id={dish.id} />
  ),
}));

// Mock the recommend API client so no real fetch occurs in component tests.
vi.mock("../lib/recommend", () => {
  const RecommendApiError = class extends Error {
    code: string;
    requestId: string;
    constructor(code: string, message: string, requestId: string) {
      super(message);
      this.name = "RecommendApiError";
      this.code = code;
      this.requestId = requestId;
    }
  };
  return {
    postRecommend: vi.fn(),
    RecommendApiError,
  };
});

// Mock ensureProfile / saveProfile so tests control the persona without
// touching real localStorage.
vi.mock("../lib/profile", () => ({
  ensureProfile: vi.fn().mockReturnValue({
    schemaVersion: 1,
    userId: "test_user",
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
    ],
    dietaryPattern: "non-veg",
    topCuisines: ["Biryani", "North Indian"],
    avgOrderValue: 280,
    lastOrderedAt: "2026-04-28",
    q3SkipCount: 0,
  }),
  saveProfile: vi.fn(),
}));

// Import after mocks are registered.
import Questions from "./Questions";
import { postRecommend, RecommendApiError } from "../lib/recommend";
import { ensureProfile, saveProfile } from "../lib/profile";
import type { UserProfile } from "@shared/types";

// ---------------------------------------------------------------------------
// Typed mock handles
// ---------------------------------------------------------------------------

const mockPostRecommend = postRecommend as ReturnType<typeof vi.fn>;
const mockEnsureProfile = ensureProfile as ReturnType<typeof vi.fn>;
const mockSaveProfile = saveProfile as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Persona fixtures
// ---------------------------------------------------------------------------

/** Non-veg seeded persona (default for most tests). */
const NON_VEG_PROFILE: UserProfile = {
  schemaVersion: 1,
  userId: "test_user",
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
  ],
  dietaryPattern: "non-veg",
  topCuisines: ["Biryani", "North Indian"],
  avgOrderValue: 280,
  lastOrderedAt: "2026-04-28",
  q3SkipCount: 0,
};

/** Veg persona — triggers veg auto-select on Q3. */
const VEG_PROFILE: UserProfile = {
  ...NON_VEG_PROFILE,
  dietaryPattern: "veg",
  topCuisines: ["South Indian", "North Indian"],
  q3SkipCount: 0,
};

/** Persona with q3SkipCount already at the collapse threshold (3). */
const SKIP_COLLAPSED_PROFILE: UserProfile = {
  ...NON_VEG_PROFILE,
  q3SkipCount: 3,
};

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

function makeDish(overrides?: Partial<Dish>): Dish {
  return {
    id: "dish-001",
    name: "Chicken Biryani",
    restaurant: {
      name: "Behrouz Biryani",
      rating: 4.5,
      etaMinutes: 30,
      swiggyUrl: "https://swiggy.com/restaurant/behrouz",
    },
    imageUrl: "https://cdn.swiggy.com/images/biryani.jpg",
    priceInr: 280,
    cuisineTags: ["Biryani"],
    healthNudge: false,
    ...overrides,
  };
}

function makeSuccessResponse(): RecommendResponse {
  return {
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    dishes: Array.from({ length: 5 }, (_, i) =>
      makeDish({ id: `dish-00${i + 1}`, name: `Dish ${i + 1}` }),
    ),
  };
}

// ---------------------------------------------------------------------------
// Navigation helpers
//
// These helpers navigate through the step machine so individual tests don't
// duplicate the walk-through boilerplate. Each returns the userEvent instance
// so the caller can continue interacting.
// ---------------------------------------------------------------------------

/**
 * Advance from Q1 to Q2.
 * Picks "Regular meal" hunger and clicks Next unless overridden.
 */
async function advanceToQ2(
  user: ReturnType<typeof userEvent.setup>,
  hungerLabel = /regular meal/i,
) {
  await user.click(screen.getByRole("radio", { name: hungerLabel }));
  await user.click(screen.getByRole("button", { name: /^next$/i }));
}

/** Advance from Q2 to Q3 (default profile, showQ3=true). */
async function advanceToQ3(
  user: ReturnType<typeof userEvent.setup>,
  hungerLabel = /regular meal/i,
) {
  await advanceToQ2(user, hungerLabel);
  await user.click(screen.getByRole("button", { name: /^next$/i }));
}

/**
 * Advance from Q3 to freetext (default profile, showQ3=true).
 * Returns without picking any Q3 chips unless the caller selects them before
 * calling advanceToFreetext.
 */
async function advanceToFreetext(
  user: ReturnType<typeof userEvent.setup>,
  hungerLabel = /regular meal/i,
) {
  await advanceToQ3(user, hungerLabel);
  await user.click(screen.getByRole("button", { name: /^next$/i }));
}

/**
 * Walk all the way through to the freetext step and submit.
 * Resolves after the postRecommend promise settles.
 */
async function walkAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  hungerLabel = /regular meal/i,
) {
  await advanceToFreetext(user, hungerLabel);
  await user.click(screen.getByRole("button", { name: /find my meal/i }));
}

// ---------------------------------------------------------------------------
// Reset mocks before every test.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  // Reapply the default non-veg persona after clearAllMocks wipes return values.
  mockEnsureProfile.mockReturnValue(NON_VEG_PROFILE);
});

// ===========================================================================
// Item 12 — Case 7: First load shows only the Q1 step
// ===========================================================================
describe("Questions — first load shows only Q1 step (Item 12)", () => {
  it("Q1 heading 'How hungry are you?' is present on initial render", () => {
    render(<Questions />);
    expect(
      screen.getByRole("heading", { name: /how hungry are you\?/i }),
    ).toBeInTheDocument();
  });

  it("Q2 heading 'What kind of meal?' is NOT in the DOM on initial render", () => {
    render(<Questions />);
    expect(
      screen.queryByRole("heading", { name: /what kind of meal\?/i }),
    ).not.toBeInTheDocument();
  });

  it("Q3 heading 'Any constraints?' is NOT in the DOM on initial render", () => {
    render(<Questions />);
    expect(
      screen.queryByRole("heading", { name: /any constraints\?/i }),
    ).not.toBeInTheDocument();
  });

  it("freetext heading 'Anything specific?' is NOT in the DOM on initial render", () => {
    render(<Questions />);
    expect(
      screen.queryByRole("heading", { name: /how does this sound\?/i }),
    ).not.toBeInTheDocument();
  });

  it("footer button reads 'Next' on the Q1 step", () => {
    render(<Questions />);
    expect(
      screen.getByRole("button", { name: /^next$/i }),
    ).toBeInTheDocument();
  });

  it("'Next' footer button is disabled on Q1 step before any pill is selected", () => {
    render(<Questions />);
    expect(screen.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });
});

// ===========================================================================
// Item 12 — Case 8: Progress dots on Q1 (3 dots, first dot active-ringed)
// ===========================================================================
describe("Questions — progress dots on Q1 step (Item 12)", () => {
  it("renders 3 progress dot spans in the header when profile.q3SkipCount=0", () => {
    render(<Questions />);
    // ProgressDots renders span dots inside a container with data-testid.
    const dotsContainer = screen.queryByTestId("progress-dots");
    expect(dotsContainer).not.toBeNull();
    const dots = dotsContainer?.querySelectorAll("span") ?? [];
    expect(dots).toHaveLength(3);
  });

  it("first dot has the active ring class on Q1 step (current=0)", () => {
    render(<Questions />);
    const dotsContainer = screen.queryByTestId("progress-dots");
    const dots = dotsContainer?.querySelectorAll("span") ?? [];
    expect(dots[0]?.className).toContain("ring-2");
    expect(dots[0]?.className).toContain("ring-primary");
  });

  it("second and third dots do not have the active ring on Q1 step", () => {
    render(<Questions />);
    const dotsContainer = screen.queryByTestId("progress-dots");
    const dots = dotsContainer?.querySelectorAll("span") ?? [];
    expect(dots[1]?.className).not.toContain("ring-2");
    expect(dots[2]?.className).not.toContain("ring-2");
  });
});

// ===========================================================================
// Item 12 — Case 9: No Back button on Q1
// ===========================================================================
describe("Questions — no Back button on Q1 step (Item 12)", () => {
  it("Back button is not in the DOM when step is q1", () => {
    render(<Questions />);
    expect(
      screen.queryByRole("button", { name: /← back/i }),
    ).not.toBeInTheDocument();
  });
});

// ===========================================================================
// Item 12 — Case 10: Q1 Next disabled until hunger is picked
// ===========================================================================
describe("Questions — Q1 Next disabled until hunger picked (Item 12)", () => {
  it("Next is disabled before any Q1 pill is selected", () => {
    render(<Questions />);
    expect(screen.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });

  it("Next is enabled after selecting a Q1 pill", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /light snack/i }));

    expect(screen.getByRole("button", { name: /^next$/i })).not.toBeDisabled();
  });

  it("Next remains enabled after swapping Q1 selection", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /light snack/i }));
    await user.click(screen.getByRole("radio", { name: /very hungry/i }));

    expect(screen.getByRole("button", { name: /^next$/i })).not.toBeDisabled();
  });
});

// ===========================================================================
// Item 12 — Case 11: Q1 → Q2 advances and unmounts Q1
// ===========================================================================
describe("Questions — Q1 → Q2 step advance (Item 12)", () => {
  it("Q2 heading is visible after advancing from Q1", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);

    expect(
      screen.getByRole("heading", { name: /what kind of meal\?/i }),
    ).toBeInTheDocument();
  });

  it("Q1 heading is gone after advancing to Q2", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);

    expect(
      screen.queryByRole("heading", { name: /how hungry are you\?/i }),
    ).not.toBeInTheDocument();
  });

  it("Back button is visible after advancing to Q2", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);

    expect(
      screen.getByRole("button", { name: /← back/i }),
    ).toBeInTheDocument();
  });

  it("Next button is still present (type=button) on Q2 step", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);

    const nextBtn = screen.getByRole("button", { name: /^next$/i });
    expect(nextBtn).toBeInTheDocument();
    expect(nextBtn).toHaveAttribute("type", "button");
  });
});

// ===========================================================================
// Item 12 — Case 12: Q2 Next always enabled
// ===========================================================================
describe("Questions — Q2 Next always enabled (Item 12)", () => {
  it("Next is enabled on Q2 step even with no meal type selected", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);

    expect(screen.getByRole("button", { name: /^next$/i })).not.toBeDisabled();
  });
});

// ===========================================================================
// Item 12 — Case 13: Q2 → Q3 advance
// ===========================================================================
describe("Questions — Q2 → Q3 step advance (Item 12)", () => {
  it("Q3 heading 'Any constraints?' is visible after advancing from Q2", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);

    expect(
      screen.getByRole("heading", { name: /any constraints\?/i }),
    ).toBeInTheDocument();
  });

  it("Q2 heading is gone after advancing to Q3", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);

    expect(
      screen.queryByRole("heading", { name: /what kind of meal\?/i }),
    ).not.toBeInTheDocument();
  });

  it("Back button is visible on Q3 step", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);

    expect(
      screen.getByRole("button", { name: /← back/i }),
    ).toBeInTheDocument();
  });

  it("Next button is visible on Q3 step", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);

    expect(screen.getByRole("button", { name: /^next$/i })).toBeInTheDocument();
  });
});

// ===========================================================================
// Item 12 — Case 14: Q3 → freetext advance
// ===========================================================================
describe("Questions — Q3 → freetext step advance (Item 12)", () => {
  it("freetext heading 'Anything specific?' is visible after advancing from Q3", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToFreetext(user);

    expect(
      screen.getByRole("heading", { name: /how does this sound\?/i }),
    ).toBeInTheDocument();
  });

  it("Q3 chips are gone after advancing to freetext step", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToFreetext(user);

    expect(
      screen.queryByRole("checkbox", { name: /fast delivery/i }),
    ).not.toBeInTheDocument();
  });

  it("footer button on freetext step reads 'Find my meal'", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToFreetext(user);

    expect(
      screen.getByRole("button", { name: /find my meal/i }),
    ).toBeInTheDocument();
  });

  it("freetext footer button is type='submit'", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToFreetext(user);

    expect(
      screen.getByRole("button", { name: /find my meal/i }),
    ).toHaveAttribute("type", "submit");
  });

  it("there is exactly one submit button on the freetext step", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToFreetext(user);

    const submitButtons = document.querySelectorAll('button[type="submit"]');
    expect(submitButtons).toHaveLength(1);
  });

  it("clicking Q3 Next does NOT trigger form submission (postRecommend is not called)", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    // Navigate up to Q3 step, then click Next to reach freetext.
    await advanceToQ3(user);
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    // At this point we are on the freetext step. postRecommend must NOT have been
    // called — the click on Q3's Next must not have submitted the form.
    expect(mockPostRecommend).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Item 12 — Case 15: Progress dots adapt per step
// ===========================================================================
describe("Questions — progress dots adapt per step (Item 12)", () => {
  function getProgressDots() {
    const container = screen.queryByTestId("progress-dots");
    return Array.from(container?.querySelectorAll("span") ?? []);
  }

  it("on Q2 step the second dot is active-ringed (current=1)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);

    const dots = getProgressDots();
    expect(dots[1]?.className).toContain("ring-2");
    expect(dots[1]?.className).toContain("ring-primary");
    expect(dots[0]?.className).not.toContain("ring-2");
    expect(dots[2]?.className).not.toContain("ring-2");
  });

  it("on Q3 step the third dot is active-ringed (current=2)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);

    const dots = getProgressDots();
    expect(dots[2]?.className).toContain("ring-2");
    expect(dots[0]?.className).not.toContain("ring-2");
    expect(dots[1]?.className).not.toContain("ring-2");
  });

  it("on Q2 step the first dot is bg-primary (visited)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);

    const dots = getProgressDots();
    expect(dots[0]?.className).toContain("bg-primary");
  });
});

// ===========================================================================
// Item 12 — Case 16: No progress dots on the freetext step
// ===========================================================================
describe("Questions — no progress dots on freetext step (Item 12)", () => {
  it("ProgressDots container is absent on the freetext step", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToFreetext(user);

    // ProgressDots is not rendered on freetext — the data-testid container
    // is therefore absent from the DOM.
    const dotsContainer = screen.queryByTestId("progress-dots");
    expect(dotsContainer).toBeNull();
  });

  it("Back button is still visible on freetext step (header has only Back)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToFreetext(user);

    expect(
      screen.getByRole("button", { name: /← back/i }),
    ).toBeInTheDocument();
  });
});

// ===========================================================================
// Item 12 — Case 17: Back preserves Q1 selection
// ===========================================================================
describe("Questions — Back preserves Q1 selection (Item 12)", () => {
  it("Q1 pill is still selected after navigating Q1→Q2→Back", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    // Select "Light snack" on Q1 and advance.
    await user.click(screen.getByRole("radio", { name: /light snack/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    // Now on Q2. Click Back.
    await user.click(screen.getByRole("button", { name: /← back/i }));

    // Back on Q1. "Light snack" should still be checked.
    expect(
      screen.getByRole("radio", { name: /light snack/i }),
    ).toHaveAttribute("aria-checked", "true");
  });
});

// ===========================================================================
// Item 12 — Case 18: Back preserves Q2 selection
// ===========================================================================
describe("Questions — Back preserves Q2 selection (Item 12)", () => {
  it("Q2 pill remains selected after navigating Q2→Q3→Back", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);

    // Select "Indulgent" on Q2 and advance to Q3.
    await user.click(screen.getByRole("radio", { name: /indulgent/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    // Now on Q3. Click Back.
    await user.click(screen.getByRole("button", { name: /← back/i }));

    // Back on Q2. "Indulgent" should still be selected.
    expect(
      screen.getByRole("radio", { name: /indulgent/i }),
    ).toHaveAttribute("aria-checked", "true");
  });
});

// ===========================================================================
// Item 12 — Case 19: Back preserves Q3 chips and party size
// ===========================================================================
describe("Questions — Back preserves Q3 chips and party-size (Item 12)", () => {
  it("selected Q3 chip and party size are preserved across Q3→freetext→Back", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);

    // Select "Budget" chip and bump party size to 4.
    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    const increaseBtn = screen.getByRole("button", { name: /increase party size/i });
    await user.click(increaseBtn);
    await user.click(increaseBtn);
    // Default is 2; two increments → 4.
    expect(screen.getByText("4")).toBeInTheDocument();

    // Advance to freetext.
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    // Now on freetext. Click Back.
    await user.click(screen.getByRole("button", { name: /← back/i }));

    // Back on Q3. Budget chip should still be checked, stepper at 4.
    expect(
      screen.getByRole("checkbox", { name: /budget/i }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("Q3 chips and party size survive round-trip: Q3→freetext→Back→Q2→Next→Q3", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);

    // Select "Budget" and set stepper to 4.
    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    const increaseBtn = screen.getByRole("button", { name: /increase party size/i });
    await user.click(increaseBtn);
    await user.click(increaseBtn);

    // Advance to freetext, then go back to Q3.
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /← back/i }));
    // Now back on Q3 — go back one more to Q2.
    await user.click(screen.getByRole("button", { name: /← back/i }));
    // Now on Q2 — advance twice to re-enter Q3.
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    // Back on Q3. Selections must still be intact.
    expect(
      screen.getByRole("checkbox", { name: /budget/i }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});

// ===========================================================================
// Item 12 — Case 20: Back preserves freetext value
// ===========================================================================
describe("Questions — Back preserves freetext value (Item 12)", () => {
  it("freetext textarea value is preserved across freetext→Q3→freetext", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToFreetext(user);

    // Clear the Item 13 prefill, then type into the textarea.
    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "extra spicy please");

    // Go back to Q3.
    await user.click(screen.getByRole("button", { name: /← back/i }));

    // Return to freetext.
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    // Value must be preserved.
    expect(screen.getByRole("textbox")).toHaveValue("extra spicy please");
  });
});

// ===========================================================================
// Item 12 — Case 21: Q3 skip-collapse → 2 dots + Q2 jumps directly to freetext
// ===========================================================================
describe("Questions — Q3 skip-collapse with q3SkipCount=3 (Item 12)", () => {
  it("Q1 step shows 2 progress dots when q3SkipCount=3", () => {
    mockEnsureProfile.mockReturnValue(SKIP_COLLAPSED_PROFILE);
    render(<Questions />);

    const dotsContainer = screen.queryByTestId("progress-dots");
    const dots = dotsContainer?.querySelectorAll("span") ?? [];
    expect(dots).toHaveLength(2);
  });

  it("second dot is active-ringed on Q2 step with 2-dot flow", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue(SKIP_COLLAPSED_PROFILE);
    render(<Questions />);

    await advanceToQ2(user);

    const dotsContainer = screen.queryByTestId("progress-dots");
    const dots = Array.from(dotsContainer?.querySelectorAll("span") ?? []);
    expect(dots).toHaveLength(2);
    expect(dots[1]?.className).toContain("ring-2");
  });

  it("clicking Next from Q2 lands directly on freetext step (skips Q3)", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue(SKIP_COLLAPSED_PROFILE);
    render(<Questions />);

    await advanceToQ2(user);
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    // Should be on freetext — NOT Q3.
    expect(
      screen.getByRole("heading", { name: /how does this sound\?/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /any constraints\?/i }),
    ).not.toBeInTheDocument();
  });

  it("Back from freetext returns to Q2 (not Q3) in skip-collapsed flow", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue(SKIP_COLLAPSED_PROFILE);
    render(<Questions />);

    await advanceToQ2(user);
    // Q2 Next → freetext.
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    // Now on freetext. Click Back.
    await user.click(screen.getByRole("button", { name: /← back/i }));

    // Should land on Q2, not Q3.
    expect(
      screen.getByRole("heading", { name: /what kind of meal\?/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /any constraints\?/i }),
    ).not.toBeInTheDocument();
  });
});

// ===========================================================================
// Item 12 — Case 22: Veg auto-select still preserved
// ===========================================================================
describe("Questions — veg auto-select preserved in per-step flow (Item 12)", () => {
  it("veg-only chip is pre-selected on first arrival at Q3 for veg persona", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue(VEG_PROFILE);
    render(<Questions />);

    await advanceToQ3(user);

    expect(
      screen.getByRole("checkbox", { name: /veg only/i }),
    ).toHaveAttribute("aria-checked", "true");
  });
});

// ===========================================================================
// Item 12 — Case 23: Submit fires only from freetext step
// ===========================================================================
describe("Questions — submit fires only from the freetext step (Item 12)", () => {
  it("postRecommend is called exactly once after walking to freetext and submitting", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await walkAndSubmit(user);

    await waitFor(() => {
      expect(mockPostRecommend).toHaveBeenCalledOnce();
    });
  });

  it("postRecommend is NOT called after clicking Next on Q1", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    expect(mockPostRecommend).not.toHaveBeenCalled();
  });

  it("postRecommend is NOT called after clicking Next on Q2", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToQ2(user);
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    expect(mockPostRecommend).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Item 12 — Case 24: Submit body — q2 omitted when never picked
// ===========================================================================
describe("Questions — submit body omission rules (Item 12)", () => {
  it("q2 is absent from answers when Q2 was skipped", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    // Walk Q1→Q2 (skip)→Q3 (skip)→freetext (no input)→submit.
    await walkAndSubmit(user, /light snack/i);

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect("q2" in req.answers, "q2 must be absent when Q2 was skipped").toBe(false);
    });
  });

  it("q3 is absent from answers when Q3 was skipped (no chips)", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await walkAndSubmit(user);

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect("q3" in req.answers, "q3 must be absent when no chips selected").toBe(false);
    });
  });

  it("partySize is absent from answers when Q3 was skipped", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await walkAndSubmit(user);

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect("partySize" in req.answers, "partySize must be absent").toBe(false);
    });
  });

  it("only answers.q1 is present when Q2, Q3, and freetext are all skipped", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    // Walk to freetext and clear the Item 13 prefill before submit so the
    // payload has no freetext field.
    await advanceToFreetext(user, /light snack/i);
    await user.clear(screen.getByRole("textbox"));
    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      const answerKeys = Object.keys(req.answers);
      expect(answerKeys).toEqual(["q1"]);
    });
  });
});

// ===========================================================================
// Item 12 — Case 25: Submit body — freetext omitted when textarea empty
// ===========================================================================
describe("Questions — freetext omitted when textarea is empty (Item 12)", () => {
  it("freetext key is absent when textarea is left empty", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToFreetext(user);
    // Item 13 pre-fills the textarea on arrival — clear it so the submit body
    // legitimately reflects an empty freetext.
    await user.clear(screen.getByRole("textbox"));
    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(
        "freetext" in req.answers,
        "freetext must be absent when textarea is empty",
      ).toBe(false);
    });
  });
});

// ===========================================================================
// Item 12 — Case 26: Submit body — freetext omitted when whitespace-only
// ===========================================================================
describe("Questions — freetext omitted when whitespace-only (Item 12)", () => {
  it("freetext key is absent when textarea contains only spaces and newlines", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToFreetext(user);
    const textarea = screen.getByRole("textbox");
    // Clear the Item 13 prefill, then type whitespace-only content.
    await user.clear(textarea);
    await user.type(textarea, "   ");

    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(
        "freetext" in req.answers,
        "freetext must be absent when textarea is whitespace-only",
      ).toBe(false);
    });
  });
});

// ===========================================================================
// Item 12 — Case 27: Submit body — freetext trimmed when included
// ===========================================================================
describe("Questions — freetext trimmed before sending (Item 12)", () => {
  it("freetext value is trimmed of leading/trailing whitespace", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToFreetext(user);
    const textarea = screen.getByRole("textbox");
    // Type with leading spaces. userEvent.type doesn't add surrounding spaces
    // automatically; we clear and set the value via a direct approach.
    await user.clear(textarea);
    await user.type(textarea, "  extra spicy  ");

    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.freetext).toBe("extra spicy");
    });
  });
});

// ===========================================================================
// Item 12 — Case 28: Submit body — partySize only when budget chip present
// ===========================================================================
describe("Questions — partySize in submit body (Item 12)", () => {
  it("partySize is absent when Q3 has fast-delivery but not budget", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToQ3(user);
    await user.click(screen.getByRole("checkbox", { name: /fast delivery/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(
        "partySize" in req.answers,
        "partySize must be absent when budget chip is not selected",
      ).toBe(false);
    });
  });

  it("partySize === 3 when budget chip is selected and stepper is bumped to 3", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToQ3(user);
    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    await user.click(screen.getByRole("button", { name: /increase party size/i }));
    // Default 2 → 3.
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.partySize).toBe(3);
    });
  });
});

// ===========================================================================
// Item 12 — Case 29: maxLength enforced on freetext textarea
// ===========================================================================
describe("Questions — freetext textarea maxLength (Item 12)", () => {
  it("freetext textarea maxLength tracks the shared FREETEXT_MAX_CHARS constant", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToFreetext(user);

    const textarea = screen.getByRole("textbox");
    // FE textarea cap is bound to the same shared constant the BE Zod schema
    // uses, so the user can never type past what the server will accept.
    expect(textarea).toHaveAttribute(
      "maxlength",
      String(FREETEXT_MAX_CHARS),
    );
  });
});

// ===========================================================================
// Item 12 — Case 30: Loading view replaces step body and footer
// ===========================================================================
describe("Questions — loading view replaces step body (Item 12)", () => {
  it("spinner is in the DOM while the request is in-flight", async () => {
    const user = userEvent.setup();
    // Never resolves — keeps the component in loading state.
    mockPostRecommend.mockReturnValue(new Promise(() => {}));
    render(<Questions />);

    await walkAndSubmit(user);

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  it("spinner has aria-label='Loading'", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockReturnValue(new Promise(() => {}));
    render(<Questions />);

    await walkAndSubmit(user);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");
    });
  });

  it("freetext heading is NOT visible while loading", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockReturnValue(new Promise(() => {}));
    render(<Questions />);

    await walkAndSubmit(user);

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("heading", { name: /how does this sound\?/i }),
    ).not.toBeInTheDocument();
  });

  it("'Find my meal' button is NOT visible while loading", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockReturnValue(new Promise(() => {}));
    render(<Questions />);

    await walkAndSubmit(user);

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /find my meal/i }),
    ).not.toBeInTheDocument();
  });

  it("Back button is NOT visible while loading (header row is hidden)", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockReturnValue(new Promise(() => {}));
    render(<Questions />);

    await walkAndSubmit(user);

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /← back/i }),
    ).not.toBeInTheDocument();
  });

  it("progress dots are NOT visible while loading", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockReturnValue(new Promise(() => {}));
    render(<Questions />);

    // Go only to Q2 so dots WOULD be visible if loading showed them.
    await advanceToQ2(user);
    // Manually reach freetext and submit.
    await user.click(screen.getByRole("button", { name: /^next$/i })); // Q2→Q3
    await user.click(screen.getByRole("button", { name: /^next$/i })); // Q3→freetext
    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("progress-dots")).toBeNull();
  });
});

// ===========================================================================
// Item 12 — Case 31: Success view replaces step body and footer
// ===========================================================================
describe("Questions — success view (Item 12)", () => {
  it("DishCard for dishes[0] is rendered on success", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await walkAndSubmit(user);

    const card = await screen.findByTestId("dish-card");
    expect(card).toBeInTheDocument();
  });

  it("freetext heading and submit button are gone on success", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await walkAndSubmit(user);

    await screen.findByTestId("dish-card");
    expect(
      screen.queryByRole("heading", { name: /how does this sound\?/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /find my meal/i }),
    ).not.toBeInTheDocument();
  });

  it("passes dishes[0] to DishCard (not dishes[1..4])", async () => {
    const user = userEvent.setup();
    const response = makeSuccessResponse();
    mockPostRecommend.mockResolvedValue(response);
    render(<Questions />);

    await walkAndSubmit(user);

    const card = await screen.findByTestId("dish-card");
    expect(card).toHaveAttribute("data-dish-id", response.dishes[0].id);
  });
});

// ===========================================================================
// Item 12 — Case 32: Error → Try again returns to freetext step with state
// ===========================================================================
describe("Questions — error → Try again returns to freetext (Item 12)", () => {
  it("Try again renders the freetext step (heading + textarea)", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("internal_error", "Request failed", ""),
    );
    render(<Questions />);

    await advanceToFreetext(user);
    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "spicy food");
    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await screen.findByRole("button", { name: /try again/i });
    await user.click(screen.getByRole("button", { name: /try again/i }));

    // The freetext step body is back.
    expect(
      screen.getByRole("heading", { name: /how does this sound\?/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("freetext textarea value is preserved after Try again", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("internal_error", "Request failed", ""),
    );
    render(<Questions />);

    await advanceToFreetext(user);
    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "spicy food");
    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await screen.findByRole("button", { name: /try again/i });
    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByRole("textbox")).toHaveValue("spicy food");
  });

  it("footer reads 'Find my meal' after Try again (back on freetext step)", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("internal_error", "Request failed", ""),
    );
    render(<Questions />);

    await walkAndSubmit(user);

    await screen.findByRole("button", { name: /try again/i });
    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(
      screen.getByRole("button", { name: /find my meal/i }),
    ).toBeInTheDocument();
  });
});

// ===========================================================================
// Item 12 — Case 33: Skip-count — one increment per mount, even across retry
// ===========================================================================
describe("Questions — skip-count one-shot guard across retry (Item 12)", () => {
  it("q3SkipCount is incremented exactly once across two submit attempts (error then error)", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue({ ...NON_VEG_PROFILE, q3SkipCount: 0 });
    // Both calls fail.
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("internal_error", "Failed", ""),
    );
    render(<Questions />);

    // Walk Q1→Q2→Q3 (no chips)→freetext→submit.
    await walkAndSubmit(user);
    await screen.findByRole("button", { name: /try again/i });

    // saveProfile called once with q3SkipCount=1.
    const callsAfterFirst = mockSaveProfile.mock.calls.length;
    const firstArg = mockSaveProfile.mock.calls[0]?.[0] as UserProfile;
    expect(firstArg.q3SkipCount).toBe(1);

    // Retry.
    await user.click(screen.getByRole("button", { name: /try again/i }));
    await user.click(screen.getByRole("button", { name: /find my meal/i }));
    await screen.findByRole("button", { name: /try again/i });

    // saveProfile must NOT have been called again with a skip-count bump.
    expect(mockSaveProfile.mock.calls.length).toBe(callsAfterFirst);
    const allSkipCounts = mockSaveProfile.mock.calls.map(
      ([p]) => (p as UserProfile).q3SkipCount,
    );
    expect(allSkipCounts.every((n) => n <= 1)).toBe(true);
  });
});

// ===========================================================================
// Item 12 — Case 34: Skip-count NOT incremented when Q3 had a chip selected
// ===========================================================================
describe("Questions — skip-count NOT incremented when Q3 chip was picked (Item 12)", () => {
  it("saveProfile is not called with incremented q3SkipCount when a Q3 chip was selected", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue({ ...NON_VEG_PROFILE, q3SkipCount: 0 });
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToQ3(user);
    await user.click(screen.getByRole("checkbox", { name: /fast delivery/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await screen.findByTestId("dish-card");

    const skipBumpCalls = mockSaveProfile.mock.calls.filter(
      ([p]) => (p as UserProfile).q3SkipCount > 0,
    );
    expect(
      skipBumpCalls,
      "q3SkipCount must not be bumped when Q3 had a chip selected",
    ).toHaveLength(0);
  });
});

// ===========================================================================
// Item 12 — Case 35: Skip-count NOT incremented when Q3 was skip-collapsed
// ===========================================================================
describe("Questions — skip-count NOT incremented when Q3 was skip-collapsed (Item 12)", () => {
  it("q3SkipCount stays at 3 after submit when Q3 was hidden by collapse", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue(SKIP_COLLAPSED_PROFILE);
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    // With q3SkipCount=3, the flow is Q1→Q2→freetext (no Q3 step).
    await advanceToQ2(user);
    await user.click(screen.getByRole("button", { name: /^next$/i })); // Q2→freetext
    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await screen.findByTestId("dish-card");

    // saveProfile should NOT be called with q3SkipCount > 3.
    const skipBumpCalls = mockSaveProfile.mock.calls.filter(
      ([p]) => (p as UserProfile).q3SkipCount > 3,
    );
    expect(
      skipBumpCalls,
      "q3SkipCount must not increment when Q3 was already collapsed",
    ).toHaveLength(0);
  });
});

// ===========================================================================
// Item 12 — Case 36: Button types are correct per step
// ===========================================================================
describe("Questions — button type='button' on Q1/Q2/Q3, type='submit' on freetext (Item 12)", () => {
  it("Q1 footer Next is type='button'", () => {
    render(<Questions />);
    expect(screen.getByRole("button", { name: /^next$/i })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("Q2 footer Next is type='button'", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);

    expect(screen.getByRole("button", { name: /^next$/i })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("Q3 footer Next is type='button'", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);

    expect(screen.getByRole("button", { name: /^next$/i })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("freetext footer button is type='submit'", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToFreetext(user);

    expect(
      screen.getByRole("button", { name: /find my meal/i }),
    ).toHaveAttribute("type", "submit");
  });

  it("Back button is type='button' (not submit) on every step that shows it", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);

    expect(
      screen.getByRole("button", { name: /← back/i }),
    ).toHaveAttribute("type", "button");
  });
});

// ===========================================================================
// Item 11 regression — Q1 baseline still works through the new per-step flow
// ===========================================================================
describe("Questions — Q1 regression (Item 11 must not break)", () => {
  it("renders the heading 'How hungry are you?' on initial render", () => {
    render(<Questions />);
    expect(
      screen.getByRole("heading", { name: /how hungry are you\?/i }),
    ).toBeInTheDocument();
  });

  it("renders a radiogroup with aria-label 'Hunger level' on Q1 step", () => {
    render(<Questions />);
    expect(
      screen.getByRole("radiogroup", { name: /hunger level/i }),
    ).toBeInTheDocument();
  });

  it("renders exactly three pills inside the Q1 radiogroup", () => {
    render(<Questions />);
    const group = screen.getByRole("radiogroup", { name: /hunger level/i });
    const pills = within(group).getAllByRole("radio");
    expect(pills).toHaveLength(3);
  });

  it.each([["Light snack"], ["Regular meal"], ["Very hungry"]])(
    "renders Q1 pill labelled '%s'",
    (label) => {
      render(<Questions />);
      expect(
        screen.getByRole("radio", { name: new RegExp(label, "i") }),
      ).toBeInTheDocument();
    },
  );

  it("tapping a Q1 pill sets aria-checked='true'", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /light snack/i }));

    expect(
      screen.getByRole("radio", { name: /light snack/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("tapping a second Q1 pill deselects the first", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /light snack/i }));
    await user.click(screen.getByRole("radio", { name: /very hungry/i }));

    expect(
      screen.getByRole("radio", { name: /light snack/i }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("radio", { name: /very hungry/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("submit from freetext with Q1=light-snack sends answers.q1='light-snack'", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await walkAndSubmit(user, /light snack/i);

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.q1).toBe("light-snack");
    });
  });

  it("submit from freetext still renders a DishCard on success", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await walkAndSubmit(user);

    await screen.findByTestId("dish-card");
  });
});

// ===========================================================================
// Item 11 regression — Q1 keyboard navigation still works
// ===========================================================================
describe("Questions — Q1 keyboard navigation regression (Item 11)", () => {
  function focusFirstQ1Pill() {
    const first = screen.getByRole("radio", { name: /light snack/i });
    first.focus();
    return first;
  }

  it("ArrowRight from the first Q1 pill selects the second", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    focusFirstQ1Pill();
    await user.keyboard("{ArrowRight}");

    expect(
      screen.getByRole("radio", { name: /regular meal/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("ArrowLeft from the first Q1 pill wraps to the last", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    focusFirstQ1Pill();
    await user.keyboard("{ArrowLeft}");

    expect(
      screen.getByRole("radio", { name: /very hungry/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("ArrowRight from the last Q1 pill wraps to the first", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /very hungry/i }));
    await user.keyboard("{ArrowRight}");

    expect(
      screen.getByRole("radio", { name: /light snack/i }),
    ).toHaveAttribute("aria-checked", "true");
  });
});

// ===========================================================================
// Item 11 regression — Q2 section render and selection (adapted for per-step)
// ===========================================================================
describe("Questions — Q2 section render and single-select regression (Item 11)", () => {
  it("renders Q2 heading 'What kind of meal?' after advancing from Q1", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);

    expect(
      screen.getByRole("heading", { name: /what kind of meal\?/i }),
    ).toBeInTheDocument();
  });

  it("renders a radiogroup with aria-label 'Meal type' on Q2 step", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);

    expect(
      screen.getByRole("radiogroup", { name: /meal type/i }),
    ).toBeInTheDocument();
  });

  it("renders exactly four pills inside the Q2 radiogroup", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);

    const group = screen.getByRole("radiogroup", { name: /meal type/i });
    const pills = within(group).getAllByRole("radio");
    expect(pills).toHaveLength(4);
  });

  it.each([
    ["Comfort favourite"],
    ["Healthy"],
    ["Indulgent"],
    ["Surprise me"],
  ])("renders Q2 pill labelled '%s'", async (label) => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);

    expect(
      screen.getByRole("radio", { name: new RegExp(label, "i") }),
    ).toBeInTheDocument();
  });

  it("tapping a Q2 pill sets aria-checked='true' on that pill", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);
    await user.click(screen.getByRole("radio", { name: /healthy/i }));

    expect(
      screen.getByRole("radio", { name: /healthy/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("swapping Q2 pill deselects the previous one", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);
    await user.click(screen.getByRole("radio", { name: /healthy/i }));
    await user.click(screen.getByRole("radio", { name: /indulgent/i }));

    expect(
      screen.getByRole("radio", { name: /healthy/i }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("radio", { name: /indulgent/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("no Q2 pills are selected on first arrival at Q2 step", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);

    const group = screen.getByRole("radiogroup", { name: /meal type/i });
    const pills = within(group).getAllByRole("radio");
    for (const pill of pills) {
      expect(pill).toHaveAttribute("aria-checked", "false");
    }
  });

  it("submit sends answers.q2='comfort-favourite' when that pill is picked", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToQ2(user);
    await user.click(screen.getByRole("radio", { name: /comfort favourite/i }));
    // Advance Q2→Q3→freetext→submit.
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.q2).toBe("comfort-favourite");
    });
  });

  it("submit body has no 'q2' key when no Q2 pill is selected", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    // Skip Q2 entirely, go straight through.
    await walkAndSubmit(user);

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect("q2" in req.answers).toBe(false);
    });
  });
});

// ===========================================================================
// Item 11 regression — Q3 render, multi-select, wire payload (per-step)
// ===========================================================================
describe("Questions — Q3 section render and multi-select regression (Item 11)", () => {
  it("renders Q3 heading 'Any constraints?' after advancing to Q3 step", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);

    expect(
      screen.getByRole("heading", { name: /any constraints\?/i }),
    ).toBeInTheDocument();
  });

  it.each([["Veg only"], ["Fast delivery"], ["Budget"], ["High-rated"]])(
    "renders Q3 chip labelled '%s'",
    async (label) => {
      const user = userEvent.setup();
      render(<Questions />);

      await advanceToQ3(user);

      expect(
        screen.getByRole("checkbox", { name: new RegExp(label, "i") }),
      ).toBeInTheDocument();
    },
  );

  it("Q3 chips have role='checkbox', not role='radio'", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);

    const budgetChip = screen.getByRole("checkbox", { name: /budget/i });
    expect(budgetChip).toHaveAttribute("role", "checkbox");
  });

  it("tapping two Q3 chips selects both (multi-select)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);
    await user.click(screen.getByRole("checkbox", { name: /fast delivery/i }));
    await user.click(screen.getByRole("checkbox", { name: /high-rated/i }));

    expect(
      screen.getByRole("checkbox", { name: /fast delivery/i }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("checkbox", { name: /high-rated/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("tapping a selected Q3 chip deselects it (toggle)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);
    await user.click(screen.getByRole("checkbox", { name: /fast delivery/i }));
    await user.click(screen.getByRole("checkbox", { name: /fast delivery/i }));

    expect(
      screen.getByRole("checkbox", { name: /fast delivery/i }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("submit sends answers.q3 as array with selected chip codes", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToQ3(user);
    await user.click(screen.getByRole("checkbox", { name: /high-rated/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.q3).toEqual(["high-rated"]);
    });
  });

  it("submit body has no 'q3' key when no Q3 chips are selected", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await walkAndSubmit(user);

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect("q3" in req.answers).toBe(false);
    });
  });
});

// ===========================================================================
// Item 11 regression — veg auto-select (per-step)
// ===========================================================================
describe("Questions — veg auto-select regression (Item 11)", () => {
  it("veg-only chip is pre-selected on first render of Q3 when dietaryPattern='veg'", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue(VEG_PROFILE);
    render(<Questions />);

    await advanceToQ3(user);

    expect(
      screen.getByRole("checkbox", { name: /veg only/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("no Q3 chips are pre-selected for the non-veg persona", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue(NON_VEG_PROFILE);
    render(<Questions />);

    await advanceToQ3(user);

    const checkboxes = screen.getAllByRole("checkbox");
    for (const cb of checkboxes) {
      expect(cb).toHaveAttribute("aria-checked", "false");
    }
  });

  it("user can deselect the veg auto-selected chip on Q3 step", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue(VEG_PROFILE);
    render(<Questions />);

    await advanceToQ3(user);
    await user.click(screen.getByRole("checkbox", { name: /veg only/i }));

    expect(
      screen.getByRole("checkbox", { name: /veg only/i }),
    ).toHaveAttribute("aria-checked", "false");
  });
});

// ===========================================================================
// Item 11 regression — budget chip → party-size stepper (per-step: on Q3)
// ===========================================================================
describe("Questions — budget chip party-size stepper regression (Item 11)", () => {
  it("party-size stepper is NOT visible on Q3 step when budget is not selected", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);

    expect(
      screen.queryByRole("button", { name: /increase party size/i }),
    ).not.toBeInTheDocument();
  });

  it("party-size stepper becomes visible when budget chip is selected on Q3", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);
    await user.click(screen.getByRole("checkbox", { name: /budget/i }));

    expect(
      screen.getByRole("button", { name: /increase party size/i }),
    ).toBeInTheDocument();
  });

  it("stepper defaults to 2 when budget is first selected", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);
    await user.click(screen.getByRole("checkbox", { name: /budget/i }));

    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("stepper '+' increments the displayed value", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);
    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    await user.click(screen.getByRole("button", { name: /increase party size/i }));

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("stepper '+' is disabled at max value (10)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);
    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    const increaseBtn = screen.getByRole("button", { name: /increase party size/i });
    for (let i = 0; i < 8; i++) {
      await user.click(increaseBtn);
    }

    expect(increaseBtn).toBeDisabled();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("stepper '−' is disabled at min value (1)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);
    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    const decreaseBtn = screen.getByRole("button", { name: /decrease party size/i });
    await user.click(decreaseBtn);

    expect(decreaseBtn).toBeDisabled();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("stepper hides when budget chip is deselected", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);
    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    await user.click(screen.getByRole("checkbox", { name: /budget/i }));

    expect(
      screen.queryByRole("button", { name: /increase party size/i }),
    ).not.toBeInTheDocument();
  });

  it("stepper resets to 2 when budget is deselected and re-selected", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);
    const budgetChip = screen.getByRole("checkbox", { name: /budget/i });
    await user.click(budgetChip);
    const increaseBtn = screen.getByRole("button", { name: /increase party size/i });
    for (let i = 0; i < 5; i++) {
      await user.click(increaseBtn);
    }
    await user.click(budgetChip); // deselect
    await user.click(budgetChip); // re-select

    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("submit includes partySize when budget chip is selected and stepper is at 4", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToQ3(user);
    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    const increaseBtn = screen.getByRole("button", { name: /increase party size/i });
    await user.click(increaseBtn);
    await user.click(increaseBtn);
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.partySize).toBe(4);
    });
  });

  it("submit body has no 'partySize' key when budget is not selected", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToQ3(user);
    await user.click(screen.getByRole("checkbox", { name: /high-rated/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect("partySize" in req.answers).toBe(false);
    });
  });
});

// ===========================================================================
// Item 11 regression — Q3 skip-count logic (per-step)
// ===========================================================================
describe("Questions — Q3 skip-count regression (Item 11)", () => {
  it("saveProfile is called with q3SkipCount+1 when Q3 is empty on submit (success)", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue({ ...NON_VEG_PROFILE, q3SkipCount: 0 });
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await walkAndSubmit(user);

    await screen.findByTestId("dish-card");

    expect(mockSaveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ q3SkipCount: 1 }),
    );
  });

  it("skip-count is incremented even on submit failure", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue({ ...NON_VEG_PROFILE, q3SkipCount: 0 });
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("internal_error", "Failed", ""),
    );
    render(<Questions />);

    await walkAndSubmit(user);
    await screen.findByRole("button", { name: /try again/i });

    expect(mockSaveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ q3SkipCount: 1 }),
    );
  });

  it("saveProfile is called exactly once per mount across retry (one-shot guard)", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue({ ...NON_VEG_PROFILE, q3SkipCount: 0 });
    mockPostRecommend
      .mockRejectedValueOnce(new RecommendApiError("internal_error", "Failed", ""))
      .mockResolvedValueOnce(makeSuccessResponse());
    render(<Questions />);

    await walkAndSubmit(user);
    await screen.findByRole("button", { name: /try again/i });

    const tryAgain = screen.getByRole("button", { name: /try again/i });
    await user.click(tryAgain);
    await user.click(screen.getByRole("button", { name: /find my meal/i }));
    await screen.findByTestId("dish-card");

    const skipBumpCalls = mockSaveProfile.mock.calls.filter(
      ([p]) => (p as UserProfile).q3SkipCount > 0,
    );
    expect(skipBumpCalls).toHaveLength(1);
  });
});

// ===========================================================================
// Item 11 regression — Q3 skip-collapse (per-step)
// ===========================================================================
describe("Questions — Q3 skip-collapse regression (Item 11)", () => {
  it("Q3 heading is not rendered (ever) when q3SkipCount=3", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue(SKIP_COLLAPSED_PROFILE);
    render(<Questions />);

    // Walk to Q2 and advance — should go straight to freetext.
    await advanceToQ2(user);
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    expect(
      screen.queryByRole("heading", { name: /any constraints\?/i }),
    ).not.toBeInTheDocument();
  });

  it("Q3 chips are never rendered when q3SkipCount=3", () => {
    mockEnsureProfile.mockReturnValue(SKIP_COLLAPSED_PROFILE);
    render(<Questions />);

    expect(screen.queryByRole("checkbox", { name: /veg only/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /fast delivery/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /budget/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /high-rated/i })).not.toBeInTheDocument();
  });

  it("skip-count is NOT incremented when Q3 is collapsed (showQ3=false)", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue(SKIP_COLLAPSED_PROFILE);
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToQ2(user);
    await user.click(screen.getByRole("button", { name: /^next$/i })); // Q2→freetext
    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await screen.findByTestId("dish-card");

    const skipBumpCalls = mockSaveProfile.mock.calls.filter(
      ([p]) => (p as UserProfile).q3SkipCount > 3,
    );
    expect(skipBumpCalls).toHaveLength(0);
  });

  it("veg auto-select does NOT apply when Q3 is collapsed", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue({ ...VEG_PROFILE, q3SkipCount: 3 });
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToQ2(user);
    await user.click(screen.getByRole("button", { name: /^next$/i })); // →freetext
    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect("q3" in req.answers).toBe(false);
    });
  });
});

// ===========================================================================
// Item 10 regression — success state renders DishCard for dishes[0]
// ===========================================================================
describe("Questions — success state regression (Item 10)", () => {
  it("renders the success heading 'Here's what I'd order:' after a successful submit", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await walkAndSubmit(user);

    await screen.findByText(/here'?s what i'?d order/i);
  });

  it("renders exactly one DishCard sentinel (not all 5 dishes)", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await walkAndSubmit(user);

    await screen.findByTestId("dish-card");
    expect(screen.getAllByTestId("dish-card")).toHaveLength(1);
  });
});

// ===========================================================================
// Item 8 regression — error state from RecommendApiError
// ===========================================================================
describe("Questions — error state regression (Item 8)", () => {
  it("renders the error message when postRecommend throws a RecommendApiError", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("mcp_error", "Swiggy MCP timed out", "req-001"),
    );
    render(<Questions />);

    await walkAndSubmit(user);

    await screen.findByText("Swiggy MCP timed out");
  });

  it("renders a 'Try again' button after a RecommendApiError", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("internal_error", "Request failed", ""),
    );
    render(<Questions />);

    await walkAndSubmit(user);

    await screen.findByRole("button", { name: /try again/i });
  });

  it("hides the spinner after a RecommendApiError", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("internal_error", "Request failed", ""),
    );
    render(<Questions />);

    await walkAndSubmit(user);

    await screen.findByRole("button", { name: /try again/i });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders 'Something went wrong.' for a non-RecommendApiError throw", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(new TypeError("Network request failed"));
    render(<Questions />);

    await walkAndSubmit(user);

    await screen.findByText("Something went wrong.");
  });

  it("'Try again' removes the error message from the screen", async () => {
    const user = userEvent.setup();
    const errorMessage = "Swiggy MCP timed out";
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("mcp_error", errorMessage, "req-001"),
    );
    render(<Questions />);

    await walkAndSubmit(user);
    await screen.findByText(errorMessage);

    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.queryByText(errorMessage)).not.toBeInTheDocument();
  });

  it("after 'Try again', a second submit succeeds and renders DishCard", async () => {
    const user = userEvent.setup();
    mockPostRecommend
      .mockRejectedValueOnce(
        new RecommendApiError("internal_error", "Request failed", ""),
      )
      .mockResolvedValueOnce(makeSuccessResponse());
    render(<Questions />);

    await walkAndSubmit(user);
    await screen.findByRole("button", { name: /try again/i });

    await user.click(screen.getByRole("button", { name: /try again/i }));
    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await screen.findByTestId("dish-card");
    expect(mockPostRecommend).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// Item 5 regression — passiveContext and profileSignal in the request body
// ===========================================================================
describe("Questions — passiveContext and profileSignal regression", () => {
  it("includes a passiveContext block in the submitted request", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await walkAndSubmit(user);

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.passiveContext).toBeDefined();
      expect(typeof req.passiveContext.time).toBe("string");
      expect(req.passiveContext.location).toBeDefined();
    });
  });

  it("includes a profileSignal with dietaryPattern, topCuisines, avgOrderValue", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await walkAndSubmit(user);

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.profileSignal.dietaryPattern).toBe("non-veg");
      expect(req.profileSignal.topCuisines).toEqual(["Biryani", "North Indian"]);
      expect(req.profileSignal.avgOrderValue).toBe(280);
    });
  });

  it("does not include userId in the profileSignal block", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await walkAndSubmit(user);

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.profileSignal).not.toHaveProperty("userId");
    });
  });
});

// ===========================================================================
// Item 13 — Freetext step copy: heading + helper text
// ===========================================================================
describe("Questions — freetext step copy (Item 13)", () => {
  it("freetext step heading reads 'How does this sound?'", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToFreetext(user);

    expect(
      screen.getByRole("heading", { name: /how does this sound\?/i }),
    ).toBeInTheDocument();
  });

  it("freetext step helper text reads 'Edit to refine. We'll use this as your primary intent.'", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToFreetext(user);

    expect(
      screen.getByText(/edit to refine/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/we.ll use this as your primary intent/i),
    ).toBeInTheDocument();
  });
});

// ===========================================================================
// Item 13 — Prefill on first arrival at freetext step
// ===========================================================================
describe("Questions — freetext prefill on first arrival (Item 13)", () => {
  it("prefills textarea with 'A regular meal.' when Q1=Regular meal, Q2 and Q3 skipped", async () => {
    const user = userEvent.setup();
    // NON_VEG_PROFILE has avgOrderValue=280; no Q3 chips → base clause only.
    render(<Questions />);

    await advanceToFreetext(user);

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("A regular meal.");
    });
  });

  it("prefills textarea with 'Something light to snack on.' when Q1=Light snack, no Q2, no Q3", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToFreetext(user, /light snack/i);

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("Something light to snack on.");
    });
  });

  it("prefills textarea with 'A comforting regular meal.' when Q1=Regular meal, Q2=Comfort favourite", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ2(user);
    await user.click(screen.getByRole("radio", { name: /comfort favourite/i }));
    // Q2→Q3→freetext.
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("A comforting regular meal.");
    });
  });

  it("prefill includes rupee budget figure when budget chip is selected (no partySize bump)", async () => {
    // Default partySize is 2; budget selected → 'for 2, under ₹280 each.'
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);
    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i })); // Q3→freetext

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue(
        "A regular meal, for 2, under ₹280 each.",
      );
    });
  });

  it("prefill includes rupee budget figure with bumped partySize=4", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToQ3(user);
    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    const increaseBtn = screen.getByRole("button", { name: /increase party size/i });
    await user.click(increaseBtn);
    await user.click(increaseBtn);
    // Default 2 → 4.
    await user.click(screen.getByRole("button", { name: /^next$/i })); // Q3→freetext

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue(
        "A regular meal, for 4, under ₹280 each.",
      );
    });
  });

  it("prefill on Q3 skip-collapse path: Q1=Light snack, Q2 skipped → 'Something light to snack on.'", async () => {
    const user = userEvent.setup();
    // q3SkipCount=3 → step order is q1→q2→freetext (no Q3).
    mockEnsureProfile.mockReturnValue(SKIP_COLLAPSED_PROFILE);
    render(<Questions />);

    await advanceToQ2(user, /light snack/i);
    // Q2 Next → freetext directly (Q3 is collapsed).
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("Something light to snack on.");
    });
  });

  it("prefill on Q3 skip-collapse path with Q2=Healthy → 'A light healthy snack.'", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue(SKIP_COLLAPSED_PROFILE);
    render(<Questions />);

    await advanceToQ2(user, /light snack/i);
    await user.click(screen.getByRole("radio", { name: /healthy/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i })); // →freetext

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("A light healthy snack.");
    });
  });

  it("prefill reflects veg auto-select when dietaryPattern='veg' and veg-only chip stays selected", async () => {
    const user = userEvent.setup();
    // VEG_PROFILE auto-selects veg-only chip; q3SkipCount=0 so Q3 is shown.
    mockEnsureProfile.mockReturnValue(VEG_PROFILE);
    render(<Questions />);

    // Q1=Regular meal, Q2 skipped, Q3 shows veg-only pre-checked — advance without touching chips.
    await advanceToQ3(user);
    await user.click(screen.getByRole("button", { name: /^next$/i })); // Q3→freetext

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("A regular meal, veg.");
    });
  });
});

// ===========================================================================
// Item 13 — One-shot prefill: edits persist, no re-prefill on back-forward
// ===========================================================================
describe("Questions — one-shot prefill ref guard (Item 13)", () => {
  it("edited freetext persists after Back→(Q3 state change)→Next — no re-prefill", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    // Reach freetext.
    await advanceToFreetext(user);

    // Wait for prefill then overwrite it entirely.
    const textarea = await screen.findByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "extra spicy please");
    expect(textarea).toHaveValue("extra spicy please");

    // Navigate back to Q3.
    await user.click(screen.getByRole("button", { name: /← back/i }));

    // Toggle a Q3 chip to change state (triggers effect deps if ref guard is broken).
    await user.click(screen.getByRole("checkbox", { name: /fast delivery/i }));

    // Navigate forward to freetext again.
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    // Edited value must still be in place — NOT re-prefilled.
    expect(screen.getByRole("textbox")).toHaveValue("extra spicy please");
  });

  it("cleared textarea stays empty after Back→Next (one-shot ref already fired)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToFreetext(user);

    // Wait for prefill, then clear it completely.
    const textarea = await screen.findByRole("textbox");
    await user.clear(textarea);
    expect(textarea).toHaveValue("");

    // Navigate back and return to freetext.
    await user.click(screen.getByRole("button", { name: /← back/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    // Textarea must remain empty — the one-shot ref guards re-prefill.
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("placeholder is visible on the textarea when it is cleared", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await advanceToFreetext(user);

    const textarea = await screen.findByRole("textbox");
    await user.clear(textarea);

    expect(textarea).toHaveAttribute(
      "placeholder",
      "Any specific cravings or constraints?",
    );
    expect(textarea).toHaveValue("");
  });
});

// ===========================================================================
// Item 13 — Submit with edited / cleared / whitespace-only prefill
// ===========================================================================
describe("Questions — submit body with Item 13 prefill (Item 13)", () => {
  it("submit sends edited freetext as answers.freetext (trimmed)", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToFreetext(user);

    // Overwrite the prefill with a custom value.
    const textarea = await screen.findByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "extra spicy please");

    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.freetext).toBe("extra spicy please");
    });
  });

  it("submit sends the prefill value unchanged when user does not edit it", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToFreetext(user);

    // Wait for prefill to settle, then submit without editing.
    await screen.findByRole("textbox");
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("A regular meal.");
    });

    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.freetext).toBe("A regular meal.");
    });
  });

  it("submit omits answers.freetext when the textarea is cleared before submitting", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToFreetext(user);

    // Wait for prefill then clear completely.
    const textarea = await screen.findByRole("textbox");
    await user.clear(textarea);

    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(
        "freetext" in req.answers,
        "freetext must be absent when textarea is cleared",
      ).toBe(false);
    });
  });

  it("submit omits answers.freetext when cleared to whitespace-only", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToFreetext(user);

    const textarea = await screen.findByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "   ");

    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(
        "freetext" in req.answers,
        "freetext must be absent when textarea is whitespace-only",
      ).toBe(false);
    });
  });

  it("submit sends trimmed freetext when user types with surrounding whitespace", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await advanceToFreetext(user);

    const textarea = await screen.findByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "  kebabs please  ");

    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.freetext).toBe("kebabs please");
    });
  });
});

// ===========================================================================
// Item 13 — Error→Try again preserves prefill-or-edit state
// ===========================================================================
describe("Questions — error → Try again preserves freetext from Item 13 prefill", () => {
  it("prefilled value is still in the textarea after a failed submit and Try again", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("internal_error", "Request failed", ""),
    );
    render(<Questions />);

    await advanceToFreetext(user);

    // Verify prefill landed, then submit (which will fail).
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("A regular meal.");
    });
    await user.click(screen.getByRole("button", { name: /find my meal/i }));

    await screen.findByRole("button", { name: /try again/i });
    await user.click(screen.getByRole("button", { name: /try again/i }));

    // Back on freetext — prefill value should still be present (state is preserved).
    expect(screen.getByRole("textbox")).toHaveValue("A regular meal.");
  });

  it("edited value is still in the textarea after a failed submit and Try again", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("internal_error", "Request failed", ""),
    );
    render(<Questions />);

    await advanceToFreetext(user);

    const textarea = await screen.findByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "I want kebabs");

    await user.click(screen.getByRole("button", { name: /find my meal/i }));
    await screen.findByRole("button", { name: /try again/i });
    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByRole("textbox")).toHaveValue("I want kebabs");
  });
});
