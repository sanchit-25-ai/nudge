import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ProgressDots from "./ProgressDots";

// ---------------------------------------------------------------------------
// ProgressDots — stateless leaf component (Item 12)
//
// Props: { count: number; current: number }
//   count   = total number of dots to render
//   current = zero-indexed index of the active dot
//
// Styling contract (spec §Deliverables):
//   Past dots (i < current): bg-primary
//   Active dot (i === current): bg-primary + ring-2 ring-primary ring-offset-2
//   Future dots (i > current): bg-border
//   The container is aria-hidden="true" (decorative; step heading carries meaning)
// ---------------------------------------------------------------------------

describe("ProgressDots", () => {
  // -------------------------------------------------------------------------
  // 1. Renders `count` dots
  // -------------------------------------------------------------------------
  describe("renders the correct number of dots", () => {
    it("renders 3 dots when count=3", () => {
      const { container } = render(<ProgressDots count={3} current={0} />);
      const dots = container.querySelectorAll("span");
      expect(dots).toHaveLength(3);
    });

    it("renders 2 dots when count=2", () => {
      const { container } = render(<ProgressDots count={2} current={0} />);
      const dots = container.querySelectorAll("span");
      expect(dots).toHaveLength(2);
    });

    it("renders 1 dot when count=1", () => {
      const { container } = render(<ProgressDots count={1} current={0} />);
      const dots = container.querySelectorAll("span");
      expect(dots).toHaveLength(1);
    });

    it("renders 5 dots when count=5", () => {
      const { container } = render(<ProgressDots count={5} current={2} />);
      const dots = container.querySelectorAll("span");
      expect(dots).toHaveLength(5);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Past + current dots carry bg-primary; future dots carry bg-border
  // -------------------------------------------------------------------------
  describe("dot colour — past and current are bg-primary, future are bg-border", () => {
    it("first dot (past) carries bg-primary when current=1", () => {
      const { container } = render(<ProgressDots count={3} current={1} />);
      const dots = container.querySelectorAll("span");
      expect(dots[0]?.className).toContain("bg-primary");
    });

    it("active dot carries bg-primary when current=1", () => {
      const { container } = render(<ProgressDots count={3} current={1} />);
      const dots = container.querySelectorAll("span");
      expect(dots[1]?.className).toContain("bg-primary");
    });

    it("future dot carries bg-border when current=1", () => {
      const { container } = render(<ProgressDots count={3} current={1} />);
      const dots = container.querySelectorAll("span");
      expect(dots[2]?.className).toContain("bg-border");
    });

    it("future dot does NOT carry bg-primary", () => {
      const { container } = render(<ProgressDots count={3} current={0} />);
      const dots = container.querySelectorAll("span");
      // dots[1] and dots[2] are future
      expect(dots[1]?.className).not.toContain("bg-primary");
      expect(dots[2]?.className).not.toContain("bg-primary");
    });

    it("all dots before current are bg-primary (past)", () => {
      const { container } = render(<ProgressDots count={4} current={3} />);
      const dots = container.querySelectorAll("span");
      for (let i = 0; i < 3; i++) {
        expect(dots[i]?.className, `dot ${i} should be bg-primary`).toContain("bg-primary");
      }
    });

    it("all dots after current are bg-border (future)", () => {
      const { container } = render(<ProgressDots count={4} current={0} />);
      const dots = container.querySelectorAll("span");
      for (let i = 1; i < 4; i++) {
        expect(dots[i]?.className, `dot ${i} should be bg-border`).toContain("bg-border");
      }
    });
  });

  // -------------------------------------------------------------------------
  // 3. The current dot has ring-2 ring-primary ring-offset-2
  // -------------------------------------------------------------------------
  describe("active dot ring styling", () => {
    it("active dot (current=0) has ring-2 ring-primary ring-offset-2", () => {
      const { container } = render(<ProgressDots count={3} current={0} />);
      const dots = container.querySelectorAll("span");
      const activeClass = dots[0]?.className ?? "";
      expect(activeClass).toContain("ring-2");
      expect(activeClass).toContain("ring-primary");
      expect(activeClass).toContain("ring-offset-2");
    });

    it("active dot (current=2) has ring-2 ring-primary ring-offset-2", () => {
      const { container } = render(<ProgressDots count={3} current={2} />);
      const dots = container.querySelectorAll("span");
      const activeClass = dots[2]?.className ?? "";
      expect(activeClass).toContain("ring-2");
      expect(activeClass).toContain("ring-primary");
      expect(activeClass).toContain("ring-offset-2");
    });

    it("past dots do NOT have the active ring", () => {
      const { container } = render(<ProgressDots count={3} current={2} />);
      const dots = container.querySelectorAll("span");
      // dots[0] and dots[1] are past
      expect(dots[0]?.className).not.toContain("ring-2");
      expect(dots[1]?.className).not.toContain("ring-2");
    });

    it("future dots do NOT have the active ring", () => {
      const { container } = render(<ProgressDots count={3} current={0} />);
      const dots = container.querySelectorAll("span");
      // dots[1] and dots[2] are future
      expect(dots[1]?.className).not.toContain("ring-2");
      expect(dots[2]?.className).not.toContain("ring-2");
    });
  });

  // -------------------------------------------------------------------------
  // 4. Component is aria-hidden="true" (decorative)
  // -------------------------------------------------------------------------
  describe("accessibility — decorative, aria-hidden", () => {
    it("container element has aria-hidden='true'", () => {
      const { container } = render(<ProgressDots count={3} current={0} />);
      const wrapper = container.firstElementChild;
      expect(wrapper).toHaveAttribute("aria-hidden", "true");
    });

    it("container does not have an interactive role that screen readers would announce", () => {
      const { container } = render(<ProgressDots count={3} current={1} />);
      const wrapper = container.firstElementChild;
      // role="presentation" is the implementation choice; the key invariant is
      // aria-hidden which ensures screen readers skip the entire subtree.
      expect(wrapper).toHaveAttribute("aria-hidden", "true");
    });
  });

  // -------------------------------------------------------------------------
  // 5. Edge: count=0 renders zero dots without throwing
  // -------------------------------------------------------------------------
  describe("edge cases", () => {
    it("count=0 renders without throwing and produces zero dots", () => {
      const { container } = render(<ProgressDots count={0} current={0} />);
      const dots = container.querySelectorAll("span");
      expect(dots).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // 6. current >= count renders only filled dots (no active ring);
    //    current=0 first dot active
    // -----------------------------------------------------------------------
    it("current=0 makes the first dot active-ringed", () => {
      const { container } = render(<ProgressDots count={3} current={0} />);
      const dots = container.querySelectorAll("span");
      expect(dots[0]?.className).toContain("ring-2");
    });

    it("current >= count — all dots are filled (bg-primary), last dot has the ring", () => {
      // current=3, count=3 — index 3 is out of range. The map uses i===current
      // which will never match, so no dot gets a ring. All 3 dots are past (i < 3).
      // This matches the spec edge case: "current >= count renders only filled dots
      // (no active ring)".
      const { container } = render(<ProgressDots count={3} current={3} />);
      const dots = container.querySelectorAll("span");
      expect(dots).toHaveLength(3);
      for (let i = 0; i < 3; i++) {
        expect(dots[i]?.className, `dot ${i} should be bg-primary (past)`).toContain(
          "bg-primary",
        );
        expect(dots[i]?.className, `dot ${i} should NOT have ring`).not.toContain(
          "ring-2",
        );
      }
    });

    it("current=1, count=2 — second dot is active-ringed", () => {
      const { container } = render(<ProgressDots count={2} current={1} />);
      const dots = container.querySelectorAll("span");
      expect(dots[0]?.className).toContain("bg-primary");
      expect(dots[0]?.className).not.toContain("ring-2");
      expect(dots[1]?.className).toContain("bg-primary");
      expect(dots[1]?.className).toContain("ring-2");
    });
  });
});
