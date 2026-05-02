// Design tokens: source of truth is nudge_spec.docx §6.2 (design language)
// and §6.5 (animations). Update values here, never inline in components.
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // §6.2 — Swiggy orange. CTAs, active states, borders, nudge text.
        primary: "#FC8019",
        surface: {
          // §6.2 — card backgrounds, chip fills, callout surfaces.
          warm: "#FFF3EA",
          // §6.4 — health-nudge surface. Spec says "light green"; tweak here when first card lands.
          health: "#E8F7E8"
        },
        text: {
          // §6.2 — near-black, dish names + headings.
          primary: "#2C2C2A",
          // §6.2 — restaurant name, metadata.
          secondary: "#888780"
        },
        // §6.2 — 0.5px card borders.
        border: "#E8E8E8",
        // §6.2 — filled green rating dot. Best-guess Swiggy green; tweak when card lands.
        rating: "#48C479"
      },
      fontFamily: {
        // §6.2 — system sans-serif stack. No web font load.
        sans: ["-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto", "sans-serif"]
      },
      fontSize: {
        // §6.4 — metadata row + health-nudge copy.
        "2xs": ["11px", { lineHeight: "14px" }]
      },
      borderRadius: {
        // §6.2 — Swiggy card radius.
        card: "14px"
      },
      borderWidth: {
        // §6.2 — 0.5px hairline card border.
        hairline: "0.5px"
      },
      spacing: {
        // §6.3 — "Find my meal" full-width CTA height.
        "13": "52px",
        // §6.4 — dish-card image (square).
        "22.5": "90px"
      },
      keyframes: {
        // §6.5 — bottom-sheet card entry.
        "sheet-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" }
        },
        // §6.5 — Not-quite refresh in/out.
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" }
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" }
        },
        // §6.5 — loading skeleton shimmer.
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" }
        }
      },
      animation: {
        "sheet-up": "sheet-up 280ms ease-out",
        "fade-in": "fade-in 200ms ease-out",
        "fade-out": "fade-out 150ms ease-out",
        shimmer: "shimmer 1.4s linear infinite"
      }
    }
  },
  plugins: []
} satisfies Config;
