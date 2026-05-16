import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Dish } from "@shared/types";
import DishCard from "./DishCard";

// ---------------------------------------------------------------------------
// Fixture factory — every test gets its own fresh object; no shared state.
// ---------------------------------------------------------------------------

const makeDish = (overrides: Partial<Dish> = {}): Dish => ({
  id: "d1",
  name: "Chicken Biryani",
  imageUrl: "https://example.com/biryani.jpg",
  priceInr: 260,
  cuisineTags: ["Mughlai", "North Indian"],
  healthNudge: false,
  restaurant: {
    name: "Biryani House",
    rating: 4.3,
    etaMinutes: 28,
    swiggyUrl: "https://www.swiggy.com/restaurants/biryani-house-12345",
    ...(overrides.restaurant ?? {}),
  },
  ...overrides,
});

// ===========================================================================
// 1. Card anatomy — all six required fields render
// ===========================================================================
describe("DishCard — anatomy", () => {
  it("renders the dish name", () => {
    render(<DishCard dish={makeDish()} />);
    expect(screen.getByText("Chicken Biryani")).toBeInTheDocument();
  });

  it("renders the restaurant name", () => {
    render(<DishCard dish={makeDish()} />);
    expect(screen.getByText("Biryani House")).toBeInTheDocument();
  });

  it("renders an <img> with alt equal to the dish name", () => {
    render(<DishCard dish={makeDish()} />);
    const img = screen.getByRole("img", { name: "Chicken Biryani" });
    expect(img).toBeInTheDocument();
  });

  it("renders the rating as a number string somewhere in the card", () => {
    render(<DishCard dish={makeDish({ restaurant: { name: "Biryani House", rating: 4.3, etaMinutes: 28, swiggyUrl: "https://www.swiggy.com/restaurants/biryani-house-12345" } })} />);
    expect(screen.getByText("4.3")).toBeInTheDocument();
  });

  it("renders the ETA with ' min' suffix", () => {
    render(<DishCard dish={makeDish()} />);
    expect(screen.getByText("28 min")).toBeInTheDocument();
  });

  it("renders the price prefixed with the rupee sign ₹", () => {
    render(<DishCard dish={makeDish()} />);
    expect(screen.getByText("₹260")).toBeInTheDocument();
  });
});

// ===========================================================================
// 2. <a> wrapper — href, target, rel
// ===========================================================================
describe("DishCard — link element", () => {
  it("wraps the entire card in exactly one <a> element (single tap target)", () => {
    const { container } = render(<DishCard dish={makeDish()} />);
    const anchors = container.querySelectorAll("a");
    expect(anchors).toHaveLength(1);
  });

  it("<a> href equals dish.restaurant.swiggyUrl", () => {
    const dish = makeDish();
    const { container } = render(<DishCard dish={dish} />);
    const anchor = container.querySelector("a") as HTMLAnchorElement;
    expect(anchor.href).toBe(dish.restaurant.swiggyUrl);
  });

  it("<a> has target='_blank'", () => {
    const { container } = render(<DishCard dish={makeDish()} />);
    const anchor = container.querySelector("a") as HTMLAnchorElement;
    expect(anchor).toHaveAttribute("target", "_blank");
  });

  it("<a> has rel='noopener noreferrer' (exact value, non-negotiable security requirement)", () => {
    const { container } = render(<DishCard dish={makeDish()} />);
    const anchor = container.querySelector("a") as HTMLAnchorElement;
    // The rel attribute must contain both tokens. Browsers normalise order but
    // the spec requires both; we split and sort to make the assertion order-agnostic.
    const relTokens = (anchor.getAttribute("rel") ?? "").split(/\s+/).sort();
    expect(relTokens).toContain("noopener");
    expect(relTokens).toContain("noreferrer");
  });

  it("there is no second tabbable or link element nested inside the card", () => {
    const { container } = render(<DishCard dish={makeDish()} />);
    // buttons, inputs, additional anchors would constitute a second tap target
    const interactive = container.querySelectorAll("a, button, input, select, textarea");
    expect(interactive).toHaveLength(1);
  });
});

// ===========================================================================
// 3. <img> attributes
// ===========================================================================
describe("DishCard — image element attributes", () => {
  it("<img> has loading='lazy'", () => {
    render(<DishCard dish={makeDish()} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("<img> has decoding='async'", () => {
    render(<DishCard dish={makeDish()} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("decoding", "async");
  });

  it("<img> alt equals the dish name exactly", () => {
    const dish = makeDish({ name: "Paneer Tikka" });
    render(<DishCard dish={dish} />);
    expect(screen.getByRole("img", { name: "Paneer Tikka" })).toBeInTheDocument();
  });
});

// ===========================================================================
// 4. Rating dot — decorative marker
// ===========================================================================
describe("DishCard — rating dot", () => {
  it("the rating dot has aria-hidden attribute (it is decorative)", () => {
    const { container } = render(<DishCard dish={makeDish()} />);
    // The dot is the only element with bg-rating class per spec
    const dot = container.querySelector(".bg-rating");
    expect(dot).not.toBeNull();
    expect(dot).toHaveAttribute("aria-hidden");
  });

  it("exactly one element uses the bg-rating class", () => {
    const { container } = render(<DishCard dish={makeDish()} />);
    const dots = container.querySelectorAll(".bg-rating");
    expect(dots).toHaveLength(1);
  });
});

// ===========================================================================
// 5. Rating format — toFixed(1), always one decimal place
// ===========================================================================
describe("DishCard — rating number format (toFixed(1))", () => {
  it.each([
    { rating: 4.3, expected: "4.3" },
    { rating: 4,   expected: "4.0" },
    { rating: 5,   expected: "5.0" },
    { rating: 3.8, expected: "3.8" },
  ])("rating $rating renders as '$expected'", ({ rating, expected }) => {
    render(
      <DishCard
        dish={makeDish({
          restaurant: {
            name: "Test Restaurant",
            rating,
            etaMinutes: 20,
            swiggyUrl: "https://www.swiggy.com/restaurants/test-1",
          },
        })}
      />,
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});

// ===========================================================================
// 6. Price format — ₹{priceInr}, whole rupee, no decimals
// ===========================================================================
describe("DishCard — price format", () => {
  it.each([
    { priceInr: 260, expected: "₹260" },
    { priceInr: 149, expected: "₹149" },
    { priceInr: 0,   expected: "₹0"   },
  ])("priceInr $priceInr renders as '$expected'", ({ priceInr, expected }) => {
    render(<DishCard dish={makeDish({ priceInr })} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("price does not contain a decimal point for whole-rupee amounts", () => {
    render(<DishCard dish={makeDish({ priceInr: 260 })} />);
    expect(screen.queryByText(/₹260\./)).not.toBeInTheDocument();
  });

  it("price does not contain a thousand separator for sub-₹1000 values", () => {
    render(<DishCard dish={makeDish({ priceInr: 260 })} />);
    // Ensure neither comma-separated nor period-separated thousand formats appear
    expect(screen.queryByText(/₹\d{1,3}[,\.]\d{3}/)).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 7. ETA format — {n} min, singular always
// ===========================================================================
describe("DishCard — ETA format", () => {
  it.each([
    { etaMinutes: 28, expected: "28 min" },
    { etaMinutes: 10, expected: "10 min" },
    { etaMinutes: 1,  expected: "1 min"  },
    { etaMinutes: 0,  expected: "0 min"  },
  ])("etaMinutes $etaMinutes renders as '$expected' (singular always)", ({ etaMinutes, expected }) => {
    render(
      <DishCard
        dish={makeDish({
          restaurant: {
            name: "Test Restaurant",
            rating: 4.0,
            etaMinutes,
            swiggyUrl: "https://www.swiggy.com/restaurants/test-1",
          },
        })}
      />,
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("etaMinutes: 0 renders '0 min' without throwing", () => {
    expect(() =>
      render(
        <DishCard
          dish={makeDish({
            restaurant: {
              name: "Fast Place",
              rating: 4.0,
              etaMinutes: 0,
              swiggyUrl: "https://www.swiggy.com/restaurants/fast-1",
            },
          })}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByText("0 min")).toBeInTheDocument();
  });
});

// ===========================================================================
// 8. Truncation class hooks
// ===========================================================================
describe("DishCard — truncation class hooks (spec §Implementation notes)", () => {
  it("dish name element has the 'truncate' class", () => {
    const { container } = render(<DishCard dish={makeDish()} />);
    // Find the element whose text content is the dish name and check the class
    const nameEl = Array.from(container.querySelectorAll(".truncate")).find(
      (el) => el.textContent === "Chicken Biryani",
    );
    expect(nameEl).not.toBeUndefined();
  });

  it("restaurant name element has the 'truncate' class", () => {
    const { container } = render(<DishCard dish={makeDish()} />);
    const restaurantEl = Array.from(container.querySelectorAll(".truncate")).find(
      (el) => el.textContent === "Biryani House",
    );
    expect(restaurantEl).not.toBeUndefined();
  });

  it("the text column container has the 'min-w-0' class (required for truncate inside flex)", () => {
    const { container } = render(<DishCard dish={makeDish()} />);
    const minW0 = container.querySelector(".min-w-0");
    expect(minW0).not.toBeNull();
  });
});

// ===========================================================================
// 9. Scope-locked: healthNudge NOT rendered (Item 17 owns that surface)
// ===========================================================================
describe("DishCard — healthNudge is not rendered (Item 10 scope lock)", () => {
  it("no element with class 'bg-surface-health' appears when healthNudge is true", () => {
    const { container } = render(
      <DishCard dish={makeDish({ healthNudge: true })} />,
    );
    expect(container.querySelector(".bg-surface-health")).toBeNull();
  });

  it("no italic 11px health-nudge text is rendered when healthNudge is true", () => {
    render(<DishCard dish={makeDish({ healthNudge: true })} />);
    // The health-nudge surface uses a distinctive combination of italic and
    // small font. We assert that no <em> or italic-text element is present.
    const { container } = render(
      <DishCard dish={makeDish({ healthNudge: true })} />,
    );
    expect(container.querySelector("em")).toBeNull();
    expect(container.querySelector("i")).toBeNull();
    // Also assert the text-2xs italic class combo that Item 17 would introduce
    expect(container.querySelector(".italic")).toBeNull();
  });
});

// ===========================================================================
// 10. Scope-locked: cuisineTags NOT rendered (deferred per spec §Tech choices)
// ===========================================================================
describe("DishCard — cuisineTags are not rendered (Item 10 scope lock)", () => {
  it("no cuisine tag text appears in the DOM even when cuisineTags is non-empty", () => {
    const dish = makeDish({ cuisineTags: ["Mughlai", "North Indian"] });
    render(<DishCard dish={dish} />);
    expect(screen.queryByText("Mughlai")).not.toBeInTheDocument();
    expect(screen.queryByText("North Indian")).not.toBeInTheDocument();
  });

  it("a dish with many cuisine tags renders without error and none of the tags appear", () => {
    const dish = makeDish({
      cuisineTags: ["Mughlai", "North Indian", "Hyderabadi", "Awadhi", "Dum"],
    });
    expect(() => render(<DishCard dish={dish} />)).not.toThrow();
    for (const tag of dish.cuisineTags) {
      expect(screen.queryByText(tag)).not.toBeInTheDocument();
    }
  });
});

// ===========================================================================
// 11. Stateless smoke — same output on repeated render with identical props
// ===========================================================================
describe("DishCard — stateless / pure render", () => {
  it("renders the same dish name on a second render with identical props", () => {
    const dish = makeDish();
    const { unmount } = render(<DishCard dish={dish} />);
    expect(screen.getByText("Chicken Biryani")).toBeInTheDocument();
    unmount();

    render(<DishCard dish={dish} />);
    expect(screen.getByText("Chicken Biryani")).toBeInTheDocument();
  });

  it("renders different dish names when different dish props are provided", () => {
    const { rerender } = render(<DishCard dish={makeDish({ name: "Palak Paneer" })} />);
    expect(screen.getByText("Palak Paneer")).toBeInTheDocument();

    rerender(<DishCard dish={makeDish({ name: "Masala Dosa" })} />);
    expect(screen.getByText("Masala Dosa")).toBeInTheDocument();
    expect(screen.queryByText("Palak Paneer")).not.toBeInTheDocument();
  });
});
