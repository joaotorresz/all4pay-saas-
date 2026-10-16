import type { Config } from "tailwindcss";
// ⚠️ As escalas nomeadas (tipo, raio, borda de campo, botão) saem da FONTE
// ÚNICA do design system. Editar um valor aqui em vez de lá reprova a guarda
// `npm run tokens`. Ver o bloco `escalas` de src/design/tokens.json.
import tokens from "./src/design/tokens.json";
const { escalas } = tokens;

/**
 * ============================================================
 *  Quattro Design System — Tailwind token extraction
 * ------------------------------------------------------------
 *  ⚠️ A FONTE dos valores é src/design/tokens.json (cores e medidas viram
 *  variáveis CSS geradas no globals.css; as escalas abaixo são lidas de lá).
 *  Este arquivo só LIGA os nomes do Tailwind a essas variáveis e escalas.
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
          tint: "var(--color-lime-tint)", // lime em opacidade menor (2º acento)
          hover: "var(--color-lime-hover)", // hover do botão primário
        },
        // Areia — borda de campo e separador em fundo claro (guia Quattro).
        areia: "var(--color-areia)",

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
        // Quattro: Centra No.2 Black, CAIXA ALTA nos títulos (tem `tnum`).
        display: ['"Roobert"', "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "sans-serif"],
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
      fontSize: escalas.fontSize as unknown as NonNullable<Config["theme"]>["fontSize"],
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
        ...escalas.spacingNomeado, // sidebar · botao-y · botao-x
      },
      minWidth: escalas.minWidth, // largura mínima do botão (canvas Quattro ERP)
      // ⚠️ A CURVA PERTENCE AO CARD (card 26 · bloco 32 · campo 14 · modal 24).
      borderRadius: escalas.borderRadius,
      borderWidth: escalas.borderWidth, // borda do campo de formulário (guia Quattro)
      boxShadow: {
        // Aurora glass — sombras var-backed (globals.css define claro/escuro):
        // fio luminoso 1px (inset) + ambiente suave. hero-glow é marketing.
        card: "var(--shadow-card)",
        popover: "var(--shadow-popover)",
        pill: "var(--shadow-pill)",
        "hero-glow": "0 -40px 120px -20px rgba(236,253,82,0.18)", // marketing only
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
