/**
 * Unit tests for frontend/src/components/Pill.tsx — Item 11: Shared Pill primitive.
 *
 * Spec: .claude/specs/11-further-questions.md §"frontend/src/components/Pill.tsx"
 *
 * Pill is a stateless, fully prop-driven primitive used by Q1 (radio), Q2 (radio),
 * and Q3 (checkbox). Tests verify:
 *   - Children rendering
 *   - Selected / unselected colour class application
 *   - role prop: defaults to 'radio', honouring 'checkbox' override
 *   - aria-checked derived from selected prop
 *   - onClick fires on click
 *   - Renders as <button type="button">
 *   - tabIndex prop is forwarded
 *   - refCallback is invoked with the DOM element
 *
 * No mocks required — Pill has no I/O and no module dependencies beyond React.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Pill from "./Pill";

// ===========================================================================
// 1. Children rendering
// ===========================================================================
describe("Pill — children rendering", () => {
  it("renders the text content passed as children", () => {
    render(<Pill selected={false} onClick={() => {}}> Light snack</Pill>);
    expect(screen.getByRole("radio")).toHaveTextContent("Light snack");
  });

  it("renders a ReactNode children (non-string)", () => {
    render(
      <Pill selected={false} onClick={() => {}}>
        <span data-testid="inner">Budget</span>
      </Pill>,
    );
    expect(screen.getByTestId("inner")).toBeInTheDocument();
  });
});

// ===========================================================================
// 2. Renders as <button type="button">
// ===========================================================================
describe("Pill — rendered element", () => {
  it("renders a <button> element", () => {
    render(<Pill selected={false} onClick={() => {}}>Label</Pill>);
    expect(screen.getByRole("radio").tagName).toBe("BUTTON");
  });

  it("the button has type='button' (not 'submit')", () => {
    render(<Pill selected={false} onClick={() => {}}>Label</Pill>);
    expect(screen.getByRole("radio")).toHaveAttribute("type", "button");
  });
});

// ===========================================================================
// 3. role prop — defaults to 'radio', honouring 'checkbox' override
// ===========================================================================
describe("Pill — role prop", () => {
  it("defaults role to 'radio' when the prop is omitted", () => {
    render(<Pill selected={false} onClick={() => {}}>Label</Pill>);
    expect(screen.getByRole("radio")).toBeInTheDocument();
  });

  it("renders role='radio' when explicitly provided", () => {
    render(<Pill selected={false} onClick={() => {}} role="radio">Label</Pill>);
    expect(screen.getByRole("radio")).toBeInTheDocument();
  });

  it("renders role='checkbox' when provided", () => {
    render(<Pill selected={false} onClick={() => {}} role="checkbox">Label</Pill>);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("does not render a radio element when role='checkbox'", () => {
    render(<Pill selected={false} onClick={() => {}} role="checkbox">Label</Pill>);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 4. aria-checked — derived from selected prop
// ===========================================================================
describe("Pill — aria-checked attribute", () => {
  it("aria-checked is 'true' when selected=true", () => {
    render(<Pill selected={true} onClick={() => {}}>Label</Pill>);
    expect(screen.getByRole("radio")).toHaveAttribute("aria-checked", "true");
  });

  it("aria-checked is 'false' when selected=false", () => {
    render(<Pill selected={false} onClick={() => {}}>Label</Pill>);
    expect(screen.getByRole("radio")).toHaveAttribute("aria-checked", "false");
  });

  it("aria-checked is 'true' on a checkbox-role Pill when selected=true", () => {
    render(<Pill selected={true} onClick={() => {}} role="checkbox">Label</Pill>);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });

  it("aria-checked is 'false' on a checkbox-role Pill when selected=false", () => {
    render(<Pill selected={false} onClick={() => {}} role="checkbox">Label</Pill>);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
  });
});

// ===========================================================================
// 5. onClick handler
// ===========================================================================
describe("Pill — onClick handler", () => {
  it("calls onClick once when the pill is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Pill selected={false} onClick={onClick}>Label</Pill>);

    await user.click(screen.getByRole("radio"));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not call onClick when not clicked", () => {
    const onClick = vi.fn();
    render(<Pill selected={false} onClick={onClick}>Label</Pill>);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("calls onClick each time the pill is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Pill selected={false} onClick={onClick}>Label</Pill>);

    await user.click(screen.getByRole("radio"));
    await user.click(screen.getByRole("radio"));

    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// 6. Selected / unselected colour class application
// ===========================================================================
describe("Pill — colour classes (selected vs unselected)", () => {
  it("applies 'bg-primary' class when selected=true", () => {
    render(<Pill selected={true} onClick={() => {}}>Label</Pill>);
    expect(screen.getByRole("radio")).toHaveClass("bg-primary");
  });

  it("applies 'text-white' class when selected=true", () => {
    render(<Pill selected={true} onClick={() => {}}>Label</Pill>);
    expect(screen.getByRole("radio")).toHaveClass("text-white");
  });

  it("applies 'border-primary' class when selected=true", () => {
    render(<Pill selected={true} onClick={() => {}}>Label</Pill>);
    expect(screen.getByRole("radio")).toHaveClass("border-primary");
  });

  it("applies 'bg-surface-warm' class when selected=false", () => {
    render(<Pill selected={false} onClick={() => {}}>Label</Pill>);
    expect(screen.getByRole("radio")).toHaveClass("bg-surface-warm");
  });

  it("applies 'text-text-primary' class when selected=false", () => {
    render(<Pill selected={false} onClick={() => {}}>Label</Pill>);
    expect(screen.getByRole("radio")).toHaveClass("text-text-primary");
  });

  it("applies 'border-border' class when selected=false", () => {
    render(<Pill selected={false} onClick={() => {}}>Label</Pill>);
    expect(screen.getByRole("radio")).toHaveClass("border-border");
  });

  it("does not apply 'bg-primary' when selected=false", () => {
    render(<Pill selected={false} onClick={() => {}}>Label</Pill>);
    expect(screen.getByRole("radio")).not.toHaveClass("bg-primary");
  });

  it("does not apply 'bg-surface-warm' when selected=true", () => {
    render(<Pill selected={true} onClick={() => {}}>Label</Pill>);
    expect(screen.getByRole("radio")).not.toHaveClass("bg-surface-warm");
  });
});

// ===========================================================================
// 7. Base classes always present (accessibility / tap-target invariants)
// ===========================================================================
describe("Pill — base classes always present", () => {
  it("always has 'min-h-11' class (≥44px tap target)", () => {
    render(<Pill selected={false} onClick={() => {}}>Label</Pill>);
    expect(screen.getByRole("radio")).toHaveClass("min-h-11");
  });

  it("always has 'min-w-11' class (≥44px tap target)", () => {
    render(<Pill selected={false} onClick={() => {}}>Label</Pill>);
    expect(screen.getByRole("radio")).toHaveClass("min-w-11");
  });

  it("always has 'rounded-full' class (pill shape)", () => {
    render(<Pill selected={false} onClick={() => {}}>Label</Pill>);
    expect(screen.getByRole("radio")).toHaveClass("rounded-full");
  });

  it("always has 'border' class (pill border)", () => {
    render(<Pill selected={false} onClick={() => {}}>Label</Pill>);
    expect(screen.getByRole("radio")).toHaveClass("border");
  });
});

// ===========================================================================
// 8. tabIndex prop
// ===========================================================================
describe("Pill — tabIndex prop", () => {
  it("forwards tabIndex=0 to the underlying button", () => {
    render(<Pill selected={false} onClick={() => {}} tabIndex={0}>Label</Pill>);
    expect(screen.getByRole("radio")).toHaveAttribute("tabindex", "0");
  });

  it("forwards tabIndex=-1 to the underlying button", () => {
    render(<Pill selected={false} onClick={() => {}} tabIndex={-1}>Label</Pill>);
    expect(screen.getByRole("radio")).toHaveAttribute("tabindex", "-1");
  });
});

// ===========================================================================
// 9. refCallback prop
// ===========================================================================
describe("Pill — refCallback prop", () => {
  it("calls refCallback with the DOM button element on mount", () => {
    const refCallback = vi.fn();
    render(<Pill selected={false} onClick={() => {}} refCallback={refCallback}>Label</Pill>);
    expect(refCallback).toHaveBeenCalledOnce();
    expect(refCallback.mock.calls[0]?.[0]).toBeInstanceOf(HTMLButtonElement);
  });
});
