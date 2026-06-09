# CLAUDE.md — all4pay

Guidance for any agent (or human) working in this repository.

---

## ⚠️ The Design System is the ONLY source of visual truth

all4pay is built on the **all4pay Design System** (derived from the
*Round Treasury* fintech design system: monochrome to the extreme + a single
lime accent, with the **monetary value as the hero**).

This design system is **non-negotiable and immutable as a foundation**. Every
screen, every component, every feature — present and future — **MUST** be built
from its tokens and its components.

### Hard rules (do not break these)

1. **Never introduce a new color, font, radius, shadow or spacing value** that
   isn't already a token. If you reach for a raw hex, a new font, or an
   arbitrary `px` shadow — stop. Use a token, or escalate to extend the system
   deliberately (see "Extending" below).
2. **Never replace, fork, or bypass the design system.** Do not add a second UI
   library (Material, Chakra, shadcn copies, etc.) or a competing token set.
3. **Build screens from the existing primitives** in `src/components/ui/`. If a
   primitive is missing, add it *to the DS* in the same style — don't inline a
   one-off.
4. **The number commands.** Money is always rendered with the `<Money>`
   component (faint currency prefix · ink integer · faint decimals) and
   **`tabular-nums` everywhere** numbers appear.
5. **Lime is a spice — under ~5% of any screen.** Sanctioned uses only: the
   brand mark, the `NEW` badge, the "Render mais ↗" yield pill, the ⌘K command
   bar tint, an occasional dot/marker. **Never** as a large fill or background.
6. **Off-black `ink` (#171717), never pure `#000`** in the app. Pure black is
   reserved for the marketing hero only.

---

## Where the tokens live

| Concern | Source of truth |
| --- | --- |
| Colors, type scale, weights, spacing, radii, shadows | **`tailwind.config.ts`** (canonical extraction) |
| Runtime CSS variables (for SVG fills, gradients, inline) | **`src/app/globals.css`** — mirrors the config, keep in sync |
| Components (the primitives) | **`src/components/ui/`** |

Prefer Tailwind utility classes backed by these tokens
(`bg-ink`, `text-muted`, `rounded-card`, `shadow-card`, `text-h2`, …). Reach for
the CSS variables (`var(--color-ink)`) only where Tailwind can't go — SVG
`stroke`/`fill`, gradients, and a few computed inline styles.

### Token cheat-sheet

- **Neutrals:** `ink` (#171717), `ink-soft`, `white`, `surface-1/2/3`,
  `border` / `border-soft`, text greys `muted` (#797975) · `faint` (#959595) ·
  `placeholder` (#B3B3B2).
- **Accent:** `lime` (#DCFF00), `lime-tint` (#F8FFCB).
- **Status:** `warning` (#E8821E), `positive` (#3F8F5B), `negative` (#C2473D —
  overdue / vencido, same desaturated family). Status colors are *small
  semantic signals* (labels, dots, the negative integer in a value) — never
  large fills.
- **Type scale:** `text-display` 52 · `text-h1` 40 · `text-value-lg` 32 ·
  `text-h2` 28 · `text-h3` 20 · `text-body` 15 · `text-label` 13 ·
  `text-caption` 12. **Working weights: 400 / 500.** The single sanctioned
  exception is the **page title** (`AppShell` h1, 29px) at **600** — matches the
  reference design's header. No 700 bold anywhere in the app.
- **Radii:** `rounded-card` 16 · `rounded-md` 10 · `rounded-sm` 8 ·
  `rounded-pill` 999.
- **Shadows:** `shadow-card`, `shadow-popover`, `shadow-pill`. Whisper-soft —
  no hard or colored shadows.
- **Spacing:** base-4 (`1`=4 … `16`=64). Card padding 24–32, list rows 12–16,
  page sections 48–64.

---

## The components (`src/components/ui/`)

Import from the barrel: `import { Button, Card, Money } from "@/components/ui";`

- **Core:** `Button` (primary/secondary/ghost/accent), `Card`, `Badge`
  (new/count/neutral), `Pill` (yield/surface/muted/ghost), `Avatar`.
- **Forms:** `Input`, `Checkbox`, `Select` (styled native), `DateField`
  (native date, ISO value), `CurrencyInput` (BRL mask → numeric value),
  `Switch` (toggle), `Textarea`.
- **Menus/actions:** `DropdownMenu` (grouped anchored menu, shortcut hints),
  `SplitButton` (primary + secondary actions, e.g. "Salvar e criar outro").
- **Data:** `Money` ★ (the signature treatment), `StatusBadge` (icon + text,
  never a filled colored pill), `Skeleton` (quiet per-widget loading
  placeholder — surface-2 + soft pulse).
- **`Icon`** — thin linear Lucide icons (~1.75 stroke), monochrome. Substitution
  for the product's real icon set; add new glyphs to the registry in `Icon.tsx`.

App shell: `src/components/app/AppShell.tsx` (route-aware `Sidebar` +
header) wraps every screen. The reference composition is the **Início**
dashboard (`/`) — see the Feature modules section below.

---

## Feature modules

### Início (`/`) — financial overview dashboard

The home screen and the reference module for data-driven screens. Five isolated
widgets, each with its own hook and its own loading / empty / error state — the
page never blocks as a whole. (`/visao-geral` redirects here.)

- **Widgets** (`src/components/visao-geral/`): `ReceivablesCard` & `PayablesCard`
  (mirrored `OpenAmountWidget`: hero VENCIDO in `negative`, secondary VENCE HOJE
  in `positive` + restante do mês), `AccountsCard` (saldo consolidado +
  per-account reconciliation badges), `DailyCashflowChart` (Recharts
  `ComposedChart`: diverging stacked bars + dashed accumulated-balance line,
  period selector), `SalesChart` (12-month bars). The amount cards use the
  shared **`HeroValue`** (the "Saldo total" treatment: muted label · big Money
  500 · faint R$ prefix · optional delta + dashed `Sparkline`).
- **Data layer:** `src/lib/data.ts` exposes one accessor per widget; hooks in
  `hooks.ts` wrap them with **React Query**. Pure aggregations live in
  `src/lib/aggregations.ts` and run identically over demo and live rows.
- **`isDemo`** (`src/lib/demo.ts`): true when `NEXT_PUBLIC_ALL4PAY_DEMO=true` or
  the Supabase env is absent. In demo mode the deterministic seed
  (`src/lib/demo/seed.ts`) is served and a `DemoBadge` shows. **Never** mock
  data in a non-demo render.
- **Schema:** `supabase/migrations/0001_financial_overview.sql`
  (`financial_accounts`, `movements`). Set `NEXT_PUBLIC_ALL4PAY_DEMO=false` with
  real Supabase vars to go live.
- **Money & a11y:** all values go through `<Money>` + `formatBRL`
  (`src/lib/format.ts`, pt-BR). Charts are wrapped in `role="img"` with an
  `aria-label` summary; figures also carry an sr-only text summary.

Data libs (React Query, Recharts) are sanctioned for feature logic — they are
**not** a second UI/token system and must never style outside the DS.

### Lançamentos / "Novo depósito" (Início header)

`NovoDeposito` (`src/components/visao-geral/`) is the primary header action: a
grouped `DropdownMenu` (Lançamentos · Vendas/Compras · Cadastros) with 16 actions
and Alt+letter shortcuts fired globally. Each action opens its own modal/form.

All 16 actions are built (`src/components/lancamentos/`), each an isolated form
+ a submit hook per entity (`hooks.ts`), demo-safe (no write in demo) and
writing to Supabase when live. Shared scaffold: `FormModal` + `SectionTitle`.

- **`ReceitaForm`** — the **mold**: Receita + Despesa (mirror via `kind`).
  Sections "Informações do lançamento" + "Condição de pagamento", rateio
  (splits), repetir (recurrence), parcelamento, baixa imediata, NSU.
- **`TransferenciaForm`** — 2 linked movements (saída + entrada).
- **`VendaCompraForm`** — venda/compra × produto/serviço **and** orçamento
  (item lines, totais, "Converter em venda"). Writes `sales_docs` + `sale_items`
  (+ a movement when not orçamento).
- **`ContratoForm`** — writes a `recurrences` row.
- **`PartyForm`** — Cliente/Fornecedor/Transportadora (CPF/CNPJ validation in
  `src/lib/validators.ts`, ViaCEP lookup in `src/lib/viacep.ts`).
- **`ProdutoServicoForm`** (Produto/Serviço), **`MarcaForm`**, **`UnidadeForm`**.
- **Data:** `src/lib/data.ts` (lançamentos) + `src/lib/cadastros.ts` (vendas +
  cadastros) — `getX` selects + `createX` writers, all demo-safe.
- **Schema:** `supabase/migrations/0002_lancamentos.sql` (categories,
  cost_centers, parties with a STORED `doc_digits` dedup column, movement_splits,
  recurrences, + movements columns) and `0003_vendas_cadastros.sql` (brands,
  units, salespeople, products, services, sales_docs, sale_items). **Generated as
  files, NOT applied to remote** — apply both, then set
  `NEXT_PUBLIC_ALL4PAY_DEMO=false` to persist live.

### Telas de listagem

Read screens reusing the cadastros: `/produtos`, `/servicos`, `/contatos`
(clientes + fornecedores), `/vendas`. Shared kit in
`src/components/listas/ListChrome.tsx` (`EntityTable` generic, `NewButton` that
opens the matching form, `useToast`). List data via `list*` accessors in
`src/lib/cadastros.ts` + `use*List` hooks. Sidebar links to all of them.

## Voice & copy (this is part of the brand)

- Sober, confident, operational — finance operators, not consumers.
- Sentence case nearly everywhere; short ALL-CAPS only for micro-labels.
- **Verbs on actions:** *Depositar, Sacar, Agendar, Render mais.* Bake counts
  into labels ("Agendar 2 Pagamentos").
- **Numbers are copy.** Always tabular, with the grey currency prefix.
- **No emoji, ever.** Iconography carries meaning instead.
- The product UI is pt-BR; money is **BRL (`R$`, "," decimal separator)**.

---

## Extending the system (rare, deliberate)

If a genuinely new need arises (a new component, a missing shade):

1. Add the token to `tailwind.config.ts` **and** the mirror in `globals.css`.
2. Add/extend the component in `src/components/ui/` in the existing style.
3. Document it here. Then use it everywhere via the token/component.

Never satisfy a one-off by inlining a raw value. Discipline > variety:
**3 radii, 2 weights, base-4 spacing, one accent.**

---

## Tech stack

- **Next.js** (App Router) + **TypeScript**
- **Tailwind CSS** (token-driven, see above)
- **Supabase** — clients in `src/lib/supabase/` (`client.ts` for the browser,
  `server.ts` for Server Components / actions). Env vars in `.env.example`.
- Font: **Hanken Grotesk** via `next/font` (substitute for the commercial Roc
  Grotesk — swap back when licensed; update `--font-hanken` + the `sans` stack).

### Commands

```bash
npm run dev        # local dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```
