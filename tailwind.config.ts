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
        // Verde-lima de estado do guia — MARCA/preenchimento pontual (ponto,
        // barra, realce), nunca texto: 1,69:1 sobre o branco quente.
        "positive-spot": "var(--color-positive-spot)",

        // ---- Aurora glass (superfícies translúcidas; blur via CSS) ----
        glass: {
          DEFAULT: "var(--glass-bg)", // vidro dos cards
          strong: "var(--glass-bg-strong)", // vidro dos overlays (popover/sidebar)
        },
      },
      fontFamily: {
        // ⚠️ TRÊS FAMÍLIAS, TRÊS PAPÉIS (guia vigente):
        //   display → Gellix Bold 700: número que impressiona e headline.
        //   sans    → Roobert 500: tudo que se lê.
        //   mono    → Roobert Mono: o papel de RÓTULO (11px, caixa alta,
        //             0,44px) — eyebrow, tag de estado, unidade, timestamp.
        //
        // Gellix carrega os VALORES porque o arquivo tem `tnum` (medido): sem
        // numeral tabular, cada linha de uma coluna de dinheiro começaria num
        // ponto diferente. É o que separa ela das outras candidatas.
        display: ['"Gellix"', '"Roobert"', "sans-serif"],
        sans: [
          '"Roobert"',
          '"Roobert Variable"',
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          '"Roobert Mono"',
          '"Roobert Semi Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        // Roc Grotesk Regular: peso 400, tracking -0.01em, line-height 22px na
        // escala de texto; nos tamanhos grandes (heróis de uma linha) o lh 22px
        // é menor que o glifo, então usamos leading-none (1) para não recortar.
        // Escala de tipos Visor (DM Sans): número-herói ~36 · título de card ~18.
        display: ["62px", { lineHeight: "1", letterSpacing: "-0.01em" }],
        h1: ["44px", { lineHeight: "1", letterSpacing: "-0.01em" }],
        "value-lg": ["36px", { lineHeight: "1", letterSpacing: "-0.01em" }],
        h2: ["30px", { lineHeight: "1.05", letterSpacing: "-0.01em" }],
        h3: ["18px", { lineHeight: "1.1", letterSpacing: "-0.01em" }],
        body: ["16px", { lineHeight: "22px", letterSpacing: "-0.01em" }],
        label: ["15px", { lineHeight: "21px", letterSpacing: "-0.01em" }],
        caption: ["13px", { lineHeight: "19px", letterSpacing: "-0.01em" }],
      },
      fontWeight: {
        // Onest — múltiplos pesos (Regular · Medium · SemiBold).
        regular: "400",
        medium: "500",
        semibold: "600",
      },
      letterSpacing: {
        tight: "-0.01em",
        label: "-0.01em",
      },
      spacing: {
        // Escala do guia: base 8, meio-passos de 4 e microajustes de 1,5 e 2
        // para bordas e traços. Nada fora desta lista.
        px2: "1.5px",
        "0.5": "2px",
        "1": "4px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "5": "20px",
        "6": "24px",
        "8": "32px",
        "10": "40px",
        "12": "48px",
        "14": "56px",
        "16": "64px",
        "18": "72px",
        "20": "80px",
        "22": "88px",
        "24": "96px",
        "26": "104px",
        "28": "112px",
        sidebar: "240px",
      },
      borderRadius: {
        // ⚠️ A CURVA PERTENCE AO CARD, NÃO AO CONTROLE. O card leva o raio
        // grande e constante da marca; o botão é reto (`rounded-none`), e
        // `pill` fica para os chips, onde a forma redonda É a função.
        card: "22px", // cards, panels, tooltip — grande e constante
        md: "10px", // campos e superfícies menores
        sm: "8px",
        pill: "999px", // chips, toggles, avatares
      },
      boxShadow: {
        // Aurora glass — sombras var-backed (globals.css define claro/escuro):
        // fio luminoso 1px (inset) + ambiente suave. hero-glow é marketing.
        card: "var(--shadow-card)",
        popover: "var(--shadow-popover)",
        pill: "var(--shadow-pill)",
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
