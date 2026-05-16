import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RecommendRequest, Dish, RecommendResponse } from "@shared/types";

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any import of the mocked modules.
// ---------------------------------------------------------------------------

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

// Mock ensureProfile so tests don't depend on localStorage seeding and the
// profile block passed into postRecommend is deterministic.
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
}));

// Import after mocks are registered.
import Questions from "./Questions";
import { postRecommend, RecommendApiError } from "../lib/recommend";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cast the mocked postRecommend to a typed vi.Mock for cleaner assertions. */
const mockPostRecommend = postRecommend as ReturnType<typeof vi.fn>;

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
// 6. Success state
// ===========================================================================
describe("Questions — success state", () => {
  it("renders 'Received 5 dishes.' after a successful response", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByText(/received 5 dishes/i);
  });

  it("renders a <pre> element containing the serialised dishes JSON after success", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    // First wait for the success heading so we know the view has transitioned.
    await screen.findByText(/received 5 dishes/i);

    // <pre> has no implicit ARIA role — query by tag.
    const preEl = document.querySelector("pre");
    expect(preEl).not.toBeNull();
    // The serialised JSON should include dish names from the response.
    expect(preEl!.textContent).toContain("Dish 1");
  });

  it("hides the spinner after a successful response", async () => {
    const user = userEvent.setup();
    mockPostRecommend.mockResolvedValue(makeSuccessResponse());
    render(<Questions />);

    await user.click(screen.getByRole("radio", { name: /regular meal/i }));
    await user.click(getCta());

    await screen.findByText(/received 5 dishes/i);

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

    await screen.findByText(/received 5 dishes/i);
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
