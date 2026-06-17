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
  darkMode: "class", // tema escuro via classe `dark` no <html> (ThemeToggle)
  theme: {
    extend: {
      colors: {
        // ---- Neutrals (the backbone) ----
        // Var-backed so the whole DS flips in dark mode (html.dark in globals.css).
        // Inline/SVG uses read the same vars — single source of truth at runtime.
        "black-pure": "#000000", // hero/marketing background ONLY
        ink: {
          DEFAULT: "var(--color-ink)", // primary app text, solid buttons, numbers
          soft: "var(--color-ink-soft)", // near-black variant
        },
        white: "var(--color-white)", // card/raised surface (flips to dark)
        "on-lime": "var(--color-on-lime)", // text/icon ON bright lime — always dark
        surface: {
          1: "var(--color-surface-1)", // page surface
          2: "var(--color-surface-2)", // row hover / zebra, section background
          3: "var(--color-surface-3)", // tertiary surface
        },
        border: {
          DEFAULT: "var(--color-border)", // card borders, dividers, inputs
          soft: "var(--color-border-soft)", // lighter dividers
        },
        muted: "var(--color-text-secondary)", // secondary text / labels
        faint: "var(--color-text-tertiary)", // currency prefix + decimals, disabled
        placeholder: "var(--color-text-quaternary)", // very subtle text, placeholders

        // ---- Accent (lime — the only brand color, a spice) ----
        lime: {
          DEFAULT: "var(--color-lime)", // logo, treasury icon, accent
          alt: "var(--color-lime-alt)", // observed render variant
          tint: "var(--color-lime-tint)", // desaturated lime wash (command bar bg)
        },

        // ---- Hero glow (marketing only) ----
        "hero-from": "#000000",
        "hero-glow": "#4B4D3D", // smoky olive at the hero's lower edge

        // ---- Status / semantic ----
        warning: "var(--color-warning)", // amber alert
        positive: "var(--color-positive)", // muted green (approved / gains / vence hoje)
        negative: "var(--color-negative)", // muted brick red (overdue / vencido)
      },
      fontFamily: {
        sans: [
          "var(--font-onest)",
          "Onest",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      fontSize: {
        // Roc Grotesk Regular: peso 400, tracking -0.01em, line-height 22px na
        // escala de texto; nos tamanhos grandes (heróis de uma linha) o lh 22px
        // é menor que o glifo, então usamos leading-none (1) para não recortar.
        display: ["62px", { lineHeight: "1", letterSpacing: "-0.01em" }],
        h1: ["48px", { lineHeight: "1", letterSpacing: "-0.01em" }],
        "value-lg": ["38px", { lineHeight: "1", letterSpacing: "-0.01em" }],
        h2: ["34px", { lineHeight: "1", letterSpacing: "-0.01em" }],
        h3: ["24px", { lineHeight: "1.05", letterSpacing: "-0.01em" }],
        body: ["18px", { lineHeight: "22px", letterSpacing: "-0.01em" }],
        label: ["16px", { lineHeight: "22px", letterSpacing: "-0.01em" }],
        caption: ["14px", { lineHeight: "22px", letterSpacing: "-0.01em" }],
      },
      fontWeight: {
        // Roc Grotesk Regular — peso único 400 em todo o sistema.
        regular: "400",
        medium: "400",
      },
      letterSpacing: {
        tight: "-0.01em",
        label: "-0.01em",
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
        // Sombras removidas dos boxes do sistema (flat). hero-glow é marketing.
        card: "none",
        popover: "none",
        pill: "none",
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
