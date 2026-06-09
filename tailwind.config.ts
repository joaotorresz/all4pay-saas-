import type { Config } from "tailwindcss";

/**
 * ============================================================
 *  all4pay Design System — Tailwind token extraction
 * ------------------------------------------------------------
 *  This is the CANONICAL source of truth for the visual layer.
 *  Tokens were extracted from the "Round Treasury / all4pay"
 *  design system (colors pixel-sampled from production, type
 *  scale / radii / shadows / spacing calibrated from the spec).
 *
 *  RULES (see CLAUDE.md):
 *   - Off-black `ink` (#171717), NEVER pure #000 in the app.
 *   - Lime is a spice: <5% of any screen, brand/badge/micro-CTA only.
 *   - The number commands: Money treatment, tabular-nums always.
 *   - 3 radii, 2 working weights (400/500), base-4 spacing.
 *  Do NOT introduce colors, fonts, radii or shadows outside this file.
 * ============================================================
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // ---- Neutrals (the backbone) ----
        "black-pure": "#000000", // hero/marketing background ONLY
        ink: {
          DEFAULT: "#171717", // primary app text, solid buttons, numbers
          soft: "#0C0C0B", // near-black variant
        },
        white: "#FFFFFF",
        surface: {
          1: "#FDFDFD", // subtly off-white surface
          2: "#F7F7F5", // row hover / zebra, section background
          3: "#F4F4F3", // tertiary surface
        },
        border: {
          DEFAULT: "#E9E9E9", // card borders, dividers, inputs
          soft: "#EFEFEF", // lighter dividers
        },
        muted: "#797975", // secondary text / labels
        faint: "#959595", // currency prefix + decimals, disabled
        placeholder: "#B3B3B2", // very subtle text, placeholders

        // ---- Accent (lime — the only brand color, a spice) ----
        lime: {
          DEFAULT: "#DCFF00", // logo, treasury icon, "Render mais"
          alt: "#E0F80A", // observed render variant
          tint: "#F8FFCB", // desaturated lime wash (command bar bg)
        },

        // ---- Hero glow (marketing only) ----
        "hero-from": "#000000",
        "hero-glow": "#4B4D3D", // smoky olive at the hero's lower edge

        // ---- Status / semantic ----
        warning: "#E8821E", // amber alert
        positive: "#3F8F5B", // muted green (approved / gains)
      },
      fontFamily: {
        sans: [
          "var(--font-hanken)",
          "Hanken Grotesk",
          "Roc Grotesk",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      fontSize: {
        // size, { lineHeight }  — weights applied per usage (400 / 500)
        display: ["52px", { lineHeight: "1.0", letterSpacing: "-0.02em" }], // hero money value (Regular)
        h1: ["40px", { lineHeight: "1.05", letterSpacing: "-0.02em" }], // marketing hero title (Medium)
        "value-lg": ["32px", { lineHeight: "1.1", letterSpacing: "-0.01em" }], // dashboard balance (Regular)
        h2: ["28px", { lineHeight: "1.15" }], // section titles (Medium)
        h3: ["20px", { lineHeight: "1.2" }], // card subtitles
        body: ["15px", { lineHeight: "1.5" }], // default body
        label: ["13px", { lineHeight: "1.4", letterSpacing: "0.01em" }], // labels, nav, table headers
        caption: ["12px", { lineHeight: "1.4" }], // currency prefix, decimals
      },
      fontWeight: {
        // Discipline: only two working weights in the app.
        regular: "400", // body, descriptions, big values
        medium: "500", // labels, button text, headers, nav
      },
      letterSpacing: {
        tight: "-0.02em",
        label: "0.01em",
      },
      spacing: {
        // base-4 / 8 scale
        "1": "4px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "5": "20px",
        "6": "24px",
        "8": "32px",
        "10": "40px",
        "12": "48px",
        "16": "64px",
        sidebar: "240px",
      },
      borderRadius: {
        // 3 levels + pill. Bigger container => bigger radius.
        card: "16px", // large cards, panels, tooltip
        md: "10px", // buttons, inputs, command bar
        sm: "8px", // smaller buttons, rectangular badges
        pill: "999px", // action pills, avatars
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)",
        popover: "0 4px 24px rgba(0,0,0,0.10)", // tooltips, dropdowns, modals
        pill: "0 1px 3px rgba(0,0,0,0.08)", // floating action pills
        "hero-glow": "0 -40px 120px -20px rgba(220,255,0,0.18)", // marketing only
      },
      transitionDuration: {
        "100": "100ms",
        "120": "120ms",
      },
    },
  },
  plugins: [],
};

export default config;
