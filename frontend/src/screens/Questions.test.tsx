import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RecommendRequest, Dish, RecommendResponse } from "@shared/types";

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any import of the mocked modules.
// ---------------------------------------------------------------------------

// Mock DishCard to a sentinel test-double so Questions tests are decoupled from
// DishCard's internal markup. The sentinel renders a data-testid and the dish id
// so the screen test can assert on (a) presence and (b) which dish was passed.
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
// Helpers
// ---------------------------------------------------------------------------

/** Cast the mocked postRecommend to a typed vi.Mock for cleaner assertions. */
const mockPostRecommend = postRecommend as ReturnType<typeof vi.fn>;

/** Cast the mocked ensureProfile for per-test persona overrides. */
const mockEnsureProfile = ensureProfile as ReturnType<typeof vi.fn>;

/** Cast the mocked saveProfile for skip-count assertions. */
const mockSaveProfile = saveProfile as ReturnType<typeof vi.fn>;

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

/** Build a Dish that satisfies the backend's shape. */
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

/** Build a valid 5-dish RecommendResponse. */
function makeSuccessResponse(): RecommendResponse {
  return {
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    dishes: Array.from({ length: 5 }, (_, i) =>
      makeDish({ id: `dish-00${i + 1}`, name: `Dish ${i + 1}` }),
    ),
  };
}

/**
 * Convenience: find "Find my meal" button. Using getByRole ensures we're
 * asserting on the accessible element, not a class or data-attr.
 */
function getCta(): HTMLElement {
  return screen.getByRole("button", { name: /find my meal/i });
}

// ---------------------------------------------------------------------------
// Reset mocks before every test.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  // Re-apply the default non-veg persona after clearAllMocks wipes the
  // return value set in the module mock factory. Per-test overrides call
  // mockEnsureProfile.mockReturnValue(...) to swap persona.
  mockEnsureProfile.mockReturnValue(NON_VEG_PROFILE);
});

// ===========================================================================
// 1. Initial render — static structure
// ===========================================================================
describe("Questions — initial render", () => {
  it("renders the heading 'How hungry are you?'", () => {
    render(<Questions />);
    expect(
      screen.getByRole("heading", { name: /how hungry are you\?/i }),
    ).toBeInTheDocument();
  });

  it("renders a radiogroup with aria-label 'Hunger level'", () => {
    render(<Questions />);
    expect(
      screen.getByRole("radiogroup", { name: /hunger level/i }),
    ).toBeInTheDocument();
  });

  it("renders exactly three pills inside the radiogroup", () => {
    render(<Questions />);
    const group = screen.getByRole("radiogroup", { name: /hunger level/i });
    const pills = within(group).getAllByRole("radio");
    expect(pills).toHaveLength(3);
  });

  it("renders a pill labelled 'Light snack'", () => {
    render(<Questions />);
    expect(
      screen.getByRole("radio", { name: /light snack/i }),
    ).toBeInTheDocument();
  });

  it("renders a pill labelled 'Regular meal'", () => {
    render(<Questions />);
    expect(
      screen.getByRole("radio", { name: /regular meal/i }),
    ).toBeInTheDocument();
  });

  it("renders a pill labelled 'Very hungry'", () => {
    render(<Questions />);
    expect(
      screen.getByRole("radio", { name: /very hungry/i }),
    ).toBeInTheDocument();
  });

  it("renders the 'Find my meal' CTA button", () => {
    render(<Questions />);
    expect(getCta()).toBeInTheDocument();
  });
});

// ===========================================================================
// 2. CTA disabled state before selection
// ===========================================================================
describe("Questions — CTA disabled before selection", () => {
  it("'Find my meal' CTA is disabled when no pill is selected", () => {
    render(<Questions />);
    expect(getCta()).toBeDisabled();
  });

  it("no pill has aria-checked='true' on initial render", () => {
    render(<Questions />);
    const pills = screen.getAllByRole("radio");
    for (const pill of pills) {
      expect(pill).toHaveAttribute("aria-checked", "false");
    }
  });
});

// ===========================================================================
// 3. Pill selection — single-select behaviour
// ===========================================================================
describe("Questions — pill selection", () => {
  it("tapping 'Light snack' sets aria-checked='true' on that pill", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /light snack/i }));

    expect(screen.getByRole("radio", { name: /light snack/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("tapping 'Regular meal' sets aria-checked='true' on that pill", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));

    expect(
      screen.getByRole("radio", { name: /regular meal/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("tapping 'Very hungry' sets aria-checked='true' on that pill", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /very hungry/i }));

    expect(screen.getByRole("radio", { name: /very hungry/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("tapping a second pill deselects the first (only one pill is aria-checked at a time)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /light snack/i }));
    await user.click(screen.getByRole("radio", { name: /very hungry/i }));

    expect(screen.getByRole("radio", { name: /light snack/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: /very hungry/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("tapping a second pill leaves the remaining third pill with aria-checked='false'", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /light snack/i }));
    await user.click(screen.getByRole("radio", { name: /regular meal/i }));

    expect(screen.getByRole("radio", { name: /very hungry/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("tapping a pill enables the 'Find my meal' CTA", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));

    expect(getCta()).not.toBeDisabled();
  });
});

// ===========================================================================
// 3b. Keyboard navigation — arrow keys cycle selection
// ===========================================================================
describe("Questions — keyboard navigation on the radiogroup", () => {
  function focusFirstPill() {
    const first = screen.getByRole("radio", { name: /light snack/i });
    first.focus();
    return first;
  }

  it("ArrowRight from the first pill selects the second", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    focusFirstPill();
    await user.keyboard("{ArrowRight}");

    expect(
      screen.getByRole("radio", { name: /regular meal/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("ArrowDown from the first pill selects the second (vertical equivalence)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    focusFirstPill();
    await user.keyboard("{ArrowDown}");

    expect(
      screen.getByRole("radio", { name: /regular meal/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("ArrowLeft from the first pill wraps to the last", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    focusFirstPill();
    await user.keyboard("{ArrowLeft}");

    expect(
      screen.getByRole("radio", { name: /very hungry/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("ArrowRight wraps from the last pill back to the first", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /very hungry/i }));
    await user.keyboard("{ArrowRight}");

    expect(
      screen.getByRole("radio", { name: /light snack/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("moves focus to the newly selected pill so the user can keep cycling", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    focusFirstPill();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("radio", { name: /regular meal/i })).toHaveFocus();
  });

  it("ignores non-arrow keys (e.g. Tab does not change selection)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.keyboard("{Tab}");

    expect(
      screen.getByRole("radio", { name: /regular meal/i }),
    ).toHaveAttribute("aria-checked", "true");
  });
});

// ===========================================================================
// 4. Submit — happy path
// ===========================================================================
describe("Questions — form submission success", () => {
  it("calls postRecommend exactly once when the form is submitted", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      expect(mockPostRecommend).toHaveBeenCalledOnce();
    });
  });

  it("sends answers.q1 = 'light-snack' when 'Light snack' is selected", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /light snack/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.q1).toBe("light-snack");
    });
  });

  it("sends answers.q1 = 'regular-meal' when 'Regular meal' is selected", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.q1).toBe("regular-meal");
    });
  });

  it("sends answers.q1 = 'very-hungry' when 'Very hungry' is selected", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /very hungry/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.q1).toBe("very-hungry");
    });
  });

  it("includes a passiveContext block in the submitted request", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.passiveContext).toBeDefined();
      expect(typeof req.passiveContext.time).toBe("string");
      expect(req.passiveContext.location).toBeDefined();
    });
  });

  it("includes a profileSignal block with dietaryPattern, topCuisines, avgOrderValue", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.profileSignal.dietaryPattern).toBe("non-veg");
      expect(req.profileSignal.topCuisines).toEqual(["Biryani", "North Indian"]);
      expect(req.profileSignal.avgOrderValue).toBe(280);
    });
  });

  it("does not include userId in the profileSignal block sent over the wire", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.profileSignal).not.toHaveProperty("userId");
    });
  });
});

// ===========================================================================
// 5. Loading state
// ===========================================================================
describe("Questions — loading state", () => {
  it("shows a spinner (role='status') while the request is in-flight", async () => {
    const user = userEvent.setup();
    // Never resolves during this test — keeps the component in loading state.
    mockPostRecommend.mockReturnValue(new Promise(() => {}));
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  it("disables the 'Find my meal' CTA while the request is in-flight", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockReturnValue(new Promise(() => {}));
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      expect(getCta()).toBeDisabled();
    });
  });

  it("does not call postRecommend a second time when CTA is clicked while loading", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockReturnValue(new Promise(() => {}));
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    // Wait for loading state to be applied.
    await waitFor(() => {
      expect(getCta()).toBeDisabled();
    });

    // Try clicking again — CTA is disabled so user-event won't fire.
    await user.click(getCta());

    // postRecommend should still have been called only once.
    expect(mockPostRecommend).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// 6. Success state (Item 10: heading line + DishCard sentinel for dishes[0])
// ===========================================================================
describe("Questions — success state", () => {
  it("renders the success heading line after a successful response", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    // The spec locks the heading copy as "Here's what I'd order:" (§Deliverables).
    await screen.findByText(/here'?s what i'?d order/i);
  });

  it("renders the DishCard sentinel after a successful response", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    const card = await screen.findByTestId("dish-card");
    expect(card).toBeInTheDocument();
  });

  it("passes dishes[0] (not dishes[1..4]) to DishCard", async () => {
    const user = userEvent.setup();
    const response = makeSuccessResponse();
    mockPostRecommend.mockResolvedValue(response);
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    const card = await screen.findByTestId("dish-card");
    expect(card).toHaveAttribute("data-dish-id", response.dishes[0].id);
  });

  it("renders exactly one DishCard sentinel (not all 5 dishes)", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByTestId("dish-card");
    expect(screen.getAllByTestId("dish-card")).toHaveLength(1);
  });

  it("does not render the old 'Received N dishes.' placeholder text", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByTestId("dish-card");
    expect(screen.queryByText(/received \d+ dishes/i)).not.toBeInTheDocument();
  });

  it("does not render a <pre> JSON dump in the success state", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    const { container } = render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByTestId("dish-card");
    expect(container.querySelector("pre")).toBeNull();
  });

  it("hides the spinner after a successful response", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByTestId("dish-card");

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 7. Error state — RecommendApiError
// ===========================================================================
describe("Questions — error state from RecommendApiError", () => {
  it("renders the envelope message when postRecommend throws a RecommendApiError", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError(
        "mcp_error",
        "Swiggy MCP timed out",
        "req-001",
      ),
    );
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByText("Swiggy MCP timed out");
  });

  it("renders a 'Try again' button after a RecommendApiError", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("internal_error", "Request failed (500)", ""),
    );
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByRole("button", { name: /try again/i });
  });

  it("renders the error message text, not the code or requestId", async () => {
    const user = userEvent.setup();
    const message = "Something the backend said";
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("model_error", message, "req-xyz"),
    );
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByText(message);
    expect(screen.queryByText("model_error")).not.toBeInTheDocument();
    expect(screen.queryByText("req-xyz")).not.toBeInTheDocument();
  });

  it("hides the spinner after a RecommendApiError", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("internal_error", "Request failed (500)", ""),
    );
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByRole("button", { name: /try again/i });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 8. "Try again" — returns to idle
// ===========================================================================
describe("Questions — 'Try again' button behaviour", () => {
  it("tapping 'Try again' enables the 'Find my meal' CTA again", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("internal_error", "Request failed (500)", ""),
    );
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    const tryAgain = await screen.findByRole("button", { name: /try again/i });
    await user.click(tryAgain);

    // The hunger level is still selected, so the CTA should be enabled.
    expect(getCta()).not.toBeDisabled();
  });

  it("the previously selected pill remains aria-checked='true' after 'Try again'", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("internal_error", "Request failed (500)", ""),
    );
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /very hungry/i }));
    await user.click(getCta());

    const tryAgain = await screen.findByRole("button", { name: /try again/i });
    await user.click(tryAgain);

    expect(screen.getByRole("radio", { name: /very hungry/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("'Try again' removes the error message from the screen", async () => {
    const user = userEvent.setup();
    const errorMessage = "Swiggy MCP timed out";
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("mcp_error", errorMessage, "req-001"),
    );
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByText(errorMessage);

    const tryAgain = screen.getByRole("button", { name: /try again/i });
    await user.click(tryAgain);

    expect(screen.queryByText(errorMessage)).not.toBeInTheDocument();
  });

  it("'Try again' removes the 'Try again' button itself from the screen (returns to idle)", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("internal_error", "Request failed (500)", ""),
    );
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    const tryAgain = await screen.findByRole("button", { name: /try again/i });
    await user.click(tryAgain);

    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("after 'Try again', a second submit works and calls postRecommend again", async () => {
    const user = userEvent.setup();
    // First call fails, second call succeeds.
    mockPostRecommend
      .mockRejectedValueOnce(
        new RecommendApiError("internal_error", "Request failed (500)", ""),
      )
      .mockResolvedValueOnce(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    const tryAgain = await screen.findByRole("button", { name: /try again/i });
    await user.click(tryAgain);

    await user.click(getCta());

    await screen.findByTestId("dish-card");
    expect(mockPostRecommend).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// 9. Error state — unexpected (non-RecommendApiError) throw
// ===========================================================================
describe("Questions — error state from unexpected throw", () => {
  it("renders 'Something went wrong.' when postRecommend throws a TypeError", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(new TypeError("Network request failed"));
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByText("Something went wrong.");
  });

  it("renders 'Something went wrong.' and a 'Try again' button for any non-RecommendApiError", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(new Error("Unexpected internal error"));
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByText("Something went wrong.");
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it("does not render the network error's original message (only the fallback)", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockRejectedValue(new TypeError("Network request failed"));
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByText("Something went wrong.");
    expect(
      screen.queryByText("Network request failed"),
    ).not.toBeInTheDocument();
  });
});

// ===========================================================================
// Item 11 — New tests below
// ===========================================================================

// ===========================================================================
// 10. Q1 regression — Item 11 must not break Phase A baseline
// ===========================================================================
describe("Questions — Q1 regression (Item 11 must not break Phase A)", () => {
  it("selecting a Q1 pill still enables the CTA (regression)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));

    expect(getCta()).not.toBeDisabled();
  });

  it("submit with Q1-only still calls postRecommend once and sends answers.q1 (regression)", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /light snack/i }));
    await user.click(getCta());

    await waitFor(() => {
      expect(mockPostRecommend).toHaveBeenCalledOnce();
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.q1).toBe("light-snack");
    });
  });

  it("Q1-only submit still renders a DishCard on success (regression)", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByTestId("dish-card");
  });
});

// ===========================================================================
// 11. Q2 section — render, single-select, wire payload
// ===========================================================================
describe("Questions — Q2 section render and single-select (Item 11)", () => {
  it("renders the Q2 heading 'What kind of meal?'", () => {
    render(<Questions />);
    expect(
      screen.getByRole("heading", { name: /what kind of meal\?/i }),
    ).toBeInTheDocument();
  });

  it("renders a radiogroup with aria-label 'Meal type'", () => {
    render(<Questions />);
    expect(
      screen.getByRole("radiogroup", { name: /meal type/i }),
    ).toBeInTheDocument();
  });

  it("renders exactly four pills inside the Q2 radiogroup", () => {
    render(<Questions />);
    const group = screen.getByRole("radiogroup", { name: /meal type/i });
    const pills = within(group).getAllByRole("radio");
    expect(pills).toHaveLength(4);
  });

  it.each([
    ["Comfort favourite"],
    ["Healthy"],
    ["Indulgent"],
    ["Surprise me"],
  ])("renders Q2 pill labelled '%s'", (label) => {
    render(<Questions />);
    expect(screen.getByRole("radio", { name: new RegExp(label, "i") })).toBeInTheDocument();
  });

  it("tapping a Q2 pill sets aria-checked='true' on that pill", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /healthy/i }));

    expect(screen.getByRole("radio", { name: /healthy/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("tapping another Q2 pill swaps selection — only one Q2 pill is checked at a time", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /healthy/i }));
    await user.click(screen.getByRole("radio", { name: /indulgent/i }));

    expect(screen.getByRole("radio", { name: /healthy/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: /indulgent/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("no Q2 pills are selected on initial render", () => {
    render(<Questions />);
    const group = screen.getByRole("radiogroup", { name: /meal type/i });
    const pills = within(group).getAllByRole("radio");
    for (const pill of pills) {
      expect(pill).toHaveAttribute("aria-checked", "false");
    }
  });

  it("submit sends answers.q2 with the correct enum code when a Q2 pill is selected", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /comfort favourite/i }));
    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.q2).toBe("comfort-favourite");
    });
  });

  it("submit sends answers.q2 = 'indulgent' when 'Indulgent' is selected", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /indulgent/i }));
    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.q2).toBe("indulgent");
    });
  });

  it("submit body has no 'q2' key when no Q2 pill is selected", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    // Only select Q1, leave Q2 untouched.
    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect("q2" in req.answers, "q2 must be absent when no Q2 pill was selected").toBe(false);
    });
  });

  it("Q1 arrow keys do not move Q2 selection (groups are independent)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    // Select 'Healthy' in Q2 first, then operate arrow keys inside Q1.
    await user.click(screen.getByRole("radio", { name: /healthy/i }));
    screen.getByRole("radio", { name: /light snack/i }).focus();
    await user.keyboard("{ArrowRight}");

    // Q2 selection should still be 'Healthy' — unchanged by Q1 arrow key.
    expect(screen.getByRole("radio", { name: /healthy/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

// ===========================================================================
// 12. Q3 section — render, multi-select, role="checkbox", wire payload
// ===========================================================================
describe("Questions — Q3 section render and multi-select (Item 11)", () => {
  it("renders the Q3 heading 'Any constraints?'", () => {
    render(<Questions />);
    expect(
      screen.getByRole("heading", { name: /any constraints\?/i }),
    ).toBeInTheDocument();
  });

  it.each([
    ["Veg only"],
    ["Fast delivery"],
    ["Budget"],
    ["High-rated"],
  ])("renders Q3 chip labelled '%s'", (label) => {
    render(<Questions />);
    expect(screen.getByRole("checkbox", { name: new RegExp(label, "i") })).toBeInTheDocument();
  });

  it("Q3 chips have role='checkbox', not role='radio'", () => {
    render(<Questions />);
    const budgetChip = screen.getByRole("checkbox", { name: /budget/i });
    expect(budgetChip).toHaveAttribute("role", "checkbox");
  });

  it("tapping two Q3 chips selects both (multi-select)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /fast delivery/i }));
    await user.click(screen.getByRole("checkbox", { name: /high-rated/i }));

    expect(screen.getByRole("checkbox", { name: /fast delivery/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("checkbox", { name: /high-rated/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("tapping a selected Q3 chip deselects it (toggle behaviour)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /fast delivery/i }));
    await user.click(screen.getByRole("checkbox", { name: /fast delivery/i }));

    expect(screen.getByRole("checkbox", { name: /fast delivery/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("submit sends answers.q3 as array with selected chip codes", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /high-rated/i }));
    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.q3).toEqual(["high-rated"]);
    });
  });

  it("submit sends answers.q3 containing both selected chips in insertion order", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /veg only/i }));
    await user.click(screen.getByRole("checkbox", { name: /fast delivery/i }));
    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.q3).toEqual(["veg-only", "fast-delivery"]);
    });
  });

  it("submit body has no 'q3' key when no Q3 chips are selected (field omitted, not empty array)", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    // Use non-veg profile (default) — no veg auto-select.
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect("q3" in req.answers, "q3 must be absent when no chips selected").toBe(false);
    });
  });
});

// ===========================================================================
// 13. Veg auto-select and non-veg baseline (Item 11)
// ===========================================================================
describe("Questions — veg auto-select (Item 11)", () => {
  it("veg-only chip is pre-selected on first render when profile.dietaryPattern is 'veg'", () => {
    mockEnsureProfile.mockReturnValue(VEG_PROFILE);
    render(<Questions />);

    expect(
      screen.getByRole("checkbox", { name: /veg only/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("no Q3 chips are pre-selected for a non-veg persona", () => {
    mockEnsureProfile.mockReturnValue(NON_VEG_PROFILE);
    render(<Questions />);

    const checkboxes = screen.getAllByRole("checkbox");
    for (const cb of checkboxes) {
      expect(cb).toHaveAttribute("aria-checked", "false");
    }
  });

  it("user can deselect the veg auto-selected chip", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue(VEG_PROFILE);
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /veg only/i }));

    expect(
      screen.getByRole("checkbox", { name: /veg only/i }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("after deselecting veg auto-select, submit body has no 'q3' key (field omitted)", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue(VEG_PROFILE);
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    // Deselect the auto-selected veg-only chip.
    await user.click(screen.getByRole("checkbox", { name: /veg only/i }));
    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect("q3" in req.answers).toBe(false);
    });
  });

  it("veg auto-selected chip is included in q3 array on submit when not deselected", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue(VEG_PROFILE);
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.q3).toContain("veg-only");
    });
  });
});

// ===========================================================================
// 14. Budget chip → party-size stepper (Item 11)
// ===========================================================================
describe("Questions — budget chip reveals party-size stepper (Item 11)", () => {
  it("party-size stepper is NOT visible when budget is not selected", () => {
    render(<Questions />);

    expect(screen.queryByLabelText(/decrease party size/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/increase party size/i)).not.toBeInTheDocument();
  });

  it("party-size stepper becomes visible when the budget chip is selected", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /budget/i }));

    expect(
      screen.getByRole("button", { name: /increase party size/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /decrease party size/i }),
    ).toBeInTheDocument();
  });

  it("party-size stepper is labelled 'How many people?'", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /budget/i }));

    expect(screen.getByText(/how many people\?/i)).toBeInTheDocument();
  });

  it("stepper defaults to 2 when budget is first selected", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /budget/i }));

    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("stepper '+' button increments the displayed value", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    await user.click(screen.getByRole("button", { name: /increase party size/i }));

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("stepper '−' button decrements the displayed value", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    // Increment first so we have room to decrement.
    await user.click(screen.getByRole("button", { name: /increase party size/i }));
    await user.click(screen.getByRole("button", { name: /decrease party size/i }));

    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("stepper '+' button is disabled at max value (10)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    const increaseBtn = screen.getByRole("button", { name: /increase party size/i });
    // Click 8 times: 2 → 10.
    for (let i = 0; i < 8; i++) {
      await user.click(increaseBtn);
    }

    expect(increaseBtn).toBeDisabled();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("stepper '+' does not exceed 10 even when clicked repeatedly", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    const increaseBtn = screen.getByRole("button", { name: /increase party size/i });
    // Click more than 8 times.
    for (let i = 0; i < 12; i++) {
      await user.click(increaseBtn);
    }

    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("stepper '−' button is disabled at min value (1)", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    const decreaseBtn = screen.getByRole("button", { name: /decrease party size/i });
    // Click once: 2 → 1.
    await user.click(decreaseBtn);

    expect(decreaseBtn).toBeDisabled();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("stepper '−' does not go below 1 even when clicked repeatedly", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    const decreaseBtn = screen.getByRole("button", { name: /decrease party size/i });
    for (let i = 0; i < 5; i++) {
      await user.click(decreaseBtn);
    }

    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("stepper hides when budget chip is deselected", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    await user.click(screen.getByRole("checkbox", { name: /budget/i }));

    expect(screen.queryByLabelText(/decrease party size/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/increase party size/i)).not.toBeInTheDocument();
  });

  it("stepper resets to 2 when budget is deselected then re-selected", async () => {
    const user = userEvent.setup();
    render(<Questions />);

    const budgetChip = screen.getByRole("checkbox", { name: /budget/i });

    // Select budget, increment to 7.
    await user.click(budgetChip);
    const increaseBtn = screen.getByRole("button", { name: /increase party size/i });
    for (let i = 0; i < 5; i++) {
      await user.click(increaseBtn);
    }
    expect(screen.getByText("7")).toBeInTheDocument();

    // Deselect budget — stepper hidden.
    await user.click(budgetChip);
    expect(screen.queryByRole("button", { name: /increase party size/i })).not.toBeInTheDocument();

    // Re-select budget — stepper reappears at default 2, not 7.
    await user.click(budgetChip);
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

// ===========================================================================
// 15. partySize on the wire (Item 11)
// ===========================================================================
describe("Questions — partySize in the request body (Item 11)", () => {
  it("submit body includes partySize when budget is selected and stepper is at 4", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    // Increment from default 2 to 4.
    const increaseBtn = screen.getByRole("button", { name: /increase party size/i });
    await user.click(increaseBtn);
    await user.click(increaseBtn);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.partySize).toBe(4);
    });
  });

  it("submit body has no 'partySize' key at all when budget is not selected", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /high-rated/i }));
    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(
        "partySize" in req.answers,
        "partySize must be absent from the wire body when budget is not selected",
      ).toBe(false);
    });
  });

  it("submit body has no 'partySize' key when no Q3 chips are selected", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect("partySize" in req.answers).toBe(false);
    });
  });

  it("partySize value reflects stepper state at the time of submit", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /budget/i }));
    const decreaseBtn = screen.getByRole("button", { name: /decrease party size/i });
    // 2 → 1
    await user.click(decreaseBtn);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect(req.answers.partySize).toBe(1);
    });
  });
});

// ===========================================================================
// 16. Q3 skip-count logic (Item 11)
// ===========================================================================
describe("Questions — Q3 skip-count increment (Item 11)", () => {
  it("saveProfile is called with q3SkipCount incremented by 1 when Q3 is empty on submit (success path)", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue({ ...NON_VEG_PROFILE, q3SkipCount: 0 });
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByTestId("dish-card");

    expect(mockSaveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ q3SkipCount: 1 }),
    );
  });

  it("saveProfile is NOT called with a bumped q3SkipCount when a Q3 chip is selected on submit", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue({ ...NON_VEG_PROFILE, q3SkipCount: 0 });
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("checkbox", { name: /fast delivery/i }));
    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByTestId("dish-card");

    // saveProfile should not be called with an incremented q3SkipCount.
    const calls = mockSaveProfile.mock.calls as Array<[UserProfile]>;
    const wasIncremented = calls.some(
      ([profile]) => (profile as UserProfile).q3SkipCount > 0,
    );
    expect(wasIncremented, "q3SkipCount must not be incremented when Q3 has selections").toBe(
      false,
    );
  });

  it("skip-count retry guard: first submit increments q3SkipCount, retry-after-error does NOT increment again", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue({ ...NON_VEG_PROFILE, q3SkipCount: 0 });
    // First call fails, second resolves.
    mockPostRecommend
      .mockRejectedValueOnce(new RecommendApiError("internal_error", "Request failed (500)", ""))
      .mockResolvedValueOnce(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    // Wait for the error state.
    await screen.findByRole("button", { name: /try again/i });

    // saveProfile should have been called once with q3SkipCount: 1.
    const callsAfterFirstSubmit = mockSaveProfile.mock.calls.length;
    const firstCallArg = mockSaveProfile.mock.calls[0]?.[0] as UserProfile;
    expect(firstCallArg.q3SkipCount).toBe(1);

    // Now retry (still empty Q3).
    const tryAgain = screen.getByRole("button", { name: /try again/i });
    await user.click(tryAgain);
    await user.click(getCta());

    await screen.findByTestId("dish-card");

    // saveProfile should NOT have been called an additional time with q3SkipCount: 2.
    const callsAfterRetry = mockSaveProfile.mock.calls.length;
    // The guard ensures at most one increment per mount lifecycle.
    const allArgs = mockSaveProfile.mock.calls.map(([p]) => (p as UserProfile).q3SkipCount);
    expect(allArgs.every((count) => count <= 1), "q3SkipCount must not exceed 1 across retry").toBe(true);
    // Total calls after retry must equal calls after first submit (no second increment call).
    expect(callsAfterRetry).toBe(callsAfterFirstSubmit);
  });

  it("skip-count is incremented even on first submit failure (error path)", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue({ ...NON_VEG_PROFILE, q3SkipCount: 0 });
    mockPostRecommend.mockRejectedValue(
      new RecommendApiError("internal_error", "Request failed (500)", ""),
    );
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByRole("button", { name: /try again/i });

    expect(mockSaveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ q3SkipCount: 1 }),
    );
  });

  it("saveProfile is called exactly once per mount regardless of retry (one-shot guard)", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue({ ...NON_VEG_PROFILE, q3SkipCount: 0 });
    mockPostRecommend
      .mockRejectedValueOnce(new RecommendApiError("internal_error", "Failed", ""))
      .mockResolvedValueOnce(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());
    await screen.findByRole("button", { name: /try again/i });

    const tryAgain = screen.getByRole("button", { name: /try again/i });
    await user.click(tryAgain);
    await user.click(getCta());
    await screen.findByTestId("dish-card");

    // saveProfile must have been called exactly once with a skip-count bump.
    const skipCountBumpCalls = mockSaveProfile.mock.calls.filter(
      ([p]) => (p as UserProfile).q3SkipCount > 0,
    );
    expect(skipCountBumpCalls).toHaveLength(1);
  });
});

// ===========================================================================
// 17. Q3 skip-collapse at threshold (Item 11)
// ===========================================================================
describe("Questions — Q3 skip-collapse when q3SkipCount >= 3 (Item 11)", () => {
  it("Q3 heading is not rendered when q3SkipCount is 3", () => {
    mockEnsureProfile.mockReturnValue(SKIP_COLLAPSED_PROFILE);
    render(<Questions />);

    expect(
      screen.queryByRole("heading", { name: /any constraints\?/i }),
    ).not.toBeInTheDocument();
  });

  it("Q3 chips are not rendered when q3SkipCount is 3", () => {
    mockEnsureProfile.mockReturnValue(SKIP_COLLAPSED_PROFILE);
    render(<Questions />);

    expect(screen.queryByRole("checkbox", { name: /veg only/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /fast delivery/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /budget/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /high-rated/i })).not.toBeInTheDocument();
  });

  it("party-size stepper is not visible when Q3 is collapsed", () => {
    mockEnsureProfile.mockReturnValue(SKIP_COLLAPSED_PROFILE);
    render(<Questions />);

    expect(screen.queryByRole("button", { name: /increase party size/i })).not.toBeInTheDocument();
  });

  it("Q1 and Q2 sections still render when Q3 is collapsed", () => {
    mockEnsureProfile.mockReturnValue(SKIP_COLLAPSED_PROFILE);
    render(<Questions />);

    expect(
      screen.getByRole("heading", { name: /how hungry are you\?/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /what kind of meal\?/i }),
    ).toBeInTheDocument();
  });

  it("submit body has no 'q3' key when Q3 is collapsed (q3SkipCount >= 3)", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue(SKIP_COLLAPSED_PROFILE);
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect("q3" in req.answers, "q3 must be absent when Q3 section is collapsed").toBe(false);
    });
  });

  it("submit body has no 'partySize' key when Q3 is collapsed (q3SkipCount >= 3)", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue(SKIP_COLLAPSED_PROFILE);
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      expect("partySize" in req.answers, "partySize must be absent when Q3 is collapsed").toBe(
        false,
      );
    });
  });

  it("skip-count is NOT incremented when Q3 is collapsed (showQ3 is false)", async () => {
    const user = userEvent.setup();
    mockEnsureProfile.mockReturnValue(SKIP_COLLAPSED_PROFILE);
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByTestId("dish-card");

    // saveProfile should not be called with a skip-count bump when Q3 is hidden.
    const skipBumpCalls = mockSaveProfile.mock.calls.filter(
      ([p]) => (p as UserProfile).q3SkipCount > 3,
    );
    expect(skipBumpCalls, "skip count must not go above 3 when Q3 is already collapsed").toHaveLength(0);
  });

  it("veg auto-select does NOT apply when Q3 is collapsed (q3SkipCount >= 3)", async () => {
    const user = userEvent.setup();
    // Veg persona but skip count at threshold — Q3 is hidden.
    mockEnsureProfile.mockReturnValue({
      ...VEG_PROFILE,
      q3SkipCount: 3,
    });
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await waitFor(() => {
      const req = mockPostRecommend.mock.calls[0]?.[0] as RecommendRequest;
      // q3 should be absent — no auto-select applies when Q3 is hidden.
      expect("q3" in req.answers).toBe(false);
    });
  });
});
