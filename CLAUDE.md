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

### Dark mode (mesma linguagem, invertida)

Os tokens de cor das **neutras + status** no `tailwind.config.ts` apontam para
**CSS variables** (`var(--color-*)`), e `html.dark` (em `globals.css`) redefine
essas variables com a paleta escura (near-black `#0e0e0e` + texto near-white
`#f4f4f2` + lime mandando igual). Assim **toda a UI e os gráficos** (Recharts lê
`var()` em `stroke`/`fill`) invertem sem `dark:` por componente — a regra é usar
sempre os tokens, nunca hex literal.

- **`on-lime`** (`--color-on-lime` = `#171717`, fixo nos dois temas): texto/ícone
  **sobre o lime brilhante** (`text-on-lime`, `color: var(--color-on-lime)`).
  Nunca use `ink` sobre lime (inverte e some no escuro).
- **Sem opacidade em token var-backed** (`bg-ink/30` quebra): para overlays use
  `bg-black/30`; para divisores que invertem, um token que vira (`border-border`).
- Toggle: `ThemeToggle`/`useTheme` (`src/components/app/`) no rodapé da Sidebar —
  classe `dark` no `<html>` + `localStorage('a4p_theme')`. Script anti-flash no
  `layout.tsx` aplica o tema (e respeita `prefers-color-scheme`) antes da pintura.
  `darkMode: "class"` no Tailwind habilita `dark:` (usado p/ trocar a logo).
- **Logo por tema:** `all4pay-dark.png` (claro, `dark:hidden`) · `all4pay-lime.png`
  (escuro, `hidden dark:block`) — Sidebar, login e onboarding.
- **Linha dos gráficos = verde da marca:** as séries temporais (Line/Area de saldo/
  score/curva/projeção) usam `var(--color-lime)`, traço **1.4** (−30%) e um **glow
  em gradiente** lime sob a linha (`<defs><linearGradient>` + `<Area>`; ex.: fluxo
  de caixa, risco). Vale nos dois temas. Barras/diverging mantêm as cores semânticas.
- `black-pure` e o hero glow **não** invertem (marketing).

### Token cheat-sheet

- **Neutrals:** `ink` (#171717), `ink-soft`, `white`, `surface-1/2/3`,
  `border` / `border-soft`, text greys `muted` (#797975) · `faint` (#959595) ·
  `placeholder` (#B3B3B2).
- **Accent:** `lime` (#DCFF00), `lime-tint` (#F8FFCB).
- **Status:** `warning` (#E8821E), `positive` (#3F8F5B), `negative` (#C2473D —
  overdue / vencido, same desaturated family). Status colors are *small
  semantic signals* (labels, dots, the negative integer in a value) — never
  large fills.
- **Type scale (DS Visor · DM Sans):** `text-display` 62 · `text-h1` 44 ·
  `text-value-lg` **36** (número-herói) · `text-h2` 30 · `text-h3` **18**
  (título de card) · `text-body` 16 · `text-label` 15 · `text-caption` 13.
  **Pesos:** Regular 400 · Medium 500 (`font-medium`) · SemiBold 600
  (`font-semibold`) · Bold 700 (heróis no escopo `ds-visor`); **títulos
  `h1/h2/h3` + `text-h*` em 600** (regra global). `letter-spacing` base −0.01em;
  **números (`tabular-nums`) com espaçamento NORMAL** (`0`, regra global — Visor).
  line-height base 22px; heróis grandes usam leading-none. Sem caixa-alta.
- **Radii:** `rounded-card` **14** · `rounded-md` 10 · `rounded-sm` 8 ·
  `rounded-pill` 999.
- **Shadows:** removidas de todo o sistema (tokens `none`). DS Visor é **flat**.
- **Background/box:** fundo da página **`surface-1` = #f6f7f9** (canvas Visor);
  **boxes brancos** (`Card` = branco · 14px · **sem borda/sombra** por padrão ·
  padding **24px**).
- **Spacing:** base-4 (`1`=4 … `16`=64). Card padding 24, list rows 12–16,
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
- **`InfoHint`** ★ — o botão **"i" universal** dos boxes (anti-burocracia):
  popover com **"Para que serve"** (`oQue`) + **"Como é calculado"**
  (`comoCalcula`), em linguagem simples. Todo box com número deve tê-lo. Duas
  formas: a prop `info={{ titulo?, oQue, comoCalcula? }}` do **`Card`** (renderiza
  o "i" no canto superior direito) — use quando o topo do card está livre; ou
  `<InfoHint align="left" oQue comoCalcula />` **inline** ao lado do título quando
  o card já tem controles no topo-direito (toggle/seta/badge). Wrappers de card
  locais recebem um prop `info` que repassa ao `Card`. `comoCalcula` deve ser
  ancorado no motor real do box (não genérico).
- **Data:** `Money` ★ (the signature treatment, px-sized para os heróis grandes)
  · **`BRL`** (`<BRL value={n} />`, o MESMO tratamento mas **inline e relativo ao
  contexto** em `em`: R$ menor+faint · inteiro herói · decimais menores+faint —
  use no lugar de `{formatBRL(x)}` em qualquer exibição de valor; `formatBRL`
  cru só em strings de aria/sr/mensagens). `StatusBadge` (icon + text,
  never a filled colored pill), `Skeleton` (quiet per-widget loading
  placeholder — surface-2 + soft pulse).
- **`Icon`** — conjunto **Phosphor (Fill)** (Iconify): glifos cheios,
  geométricos, modernos e com cantos bem arredondados (refresh do DS — menos
  genérico). Monocromáticos via `currentColor` → a prop `color` carrega a
  identidade all4pay (ink · muted · faint · lime · on-lime). SVG inline (sem
  fetch em runtime, viewBox 256); dados em `src/components/ui/solar-icons.ts`
  (gerados do Iconify — vide `scratchpad/gen-phosphor.mjs`). `strokeWidth` é
  aceito por compat, mas ignorado (preenchido, não traçado). Ids internos de
  glifos (se houver `<defs>/<mask>/<use>`) são renomeados por instância (`useId`
  no `Icon`). Ícones custom (ex.: `inicio`, pentágono à la Visor) em
  `CUSTOM_ICONS` no `Icon`, sobrepondo o set gerado.

App shell: `src/components/app/AppShell.tsx` (route-aware `Sidebar` +
header) wraps every screen. The reference composition is the **Início**
dashboard (`/`) — see the Feature modules section below.

**Busca global / Command palette** (`src/components/app/CommandPalette.tsx`):
montada no `AppShell`, abre por **⌘K/Ctrl+K** ou pelo botão de busca da Sidebar
(evento `a4p:open-search`). Busca navegação (rotas) + contatos/produtos/serviços/
vendas (via os `list*` accessors, só quando aberta) com teclado (setas/Enter/Esc).
Demo-safe; navega para a página do resultado.

---

## Feature modules

### Início (`/`) — financial overview dashboard

The home screen and the reference module for data-driven screens. Five isolated
widgets, each with its own hook and its own loading / empty / error state — the
page never blocks as a whole. (`/visao-geral` redirects here.)

- **Pílula de período global** (`PeriodContext` + `PeriodPill`, no header): um
  período único (Hoje · 7 dias · 14 dias · 30 dias · Personalizável — tudo em
  pills) que os widgets consomem via `usePeriod()`. Persistido. Liga o
  **Fluxo de caixa** (range + totais Entradas/Saídas/Resultado do período) e o
  **Faturamento** (destaca os meses no período + total no período). A receber/A
  pagar/Saldo são estado atual/futuro (vencido/vence hoje) — não tomam janela
  retroativa por design. Cards período-scoped novos entram por fase.
- **Blocos + Personalizar Home + Cockpit modular**: a Home é renderizada em
  **blocos com cabeçalho** (`BLOCK_ORDER`: Operação · Resumo executivo · Saúde
  financeira · Caixa · Receita · Despesas · Cobrança · Inteligência · Radares).
  O drawer `HomeCustomizeDrawer` liga/desliga cada widget (`a4p_home_widgets`) e
  **reordena por arrastar** (alça `grip-vertical`, ordem em `a4p_home_order`).
  Há **2 camadas de widgets**: os **curados** (`CURADOS`, ligados por padrão —
  `DEFAULT_WIDGET_IDS`) e o **catálogo modular** (`cockpit.tsx` `COCKPIT_CATALOG`,
  **desligado por padrão** — o usuário monta o cockpit). Cada widget do catálogo é
  uma função pura sobre `useCockpitCtx()` (motores quant/risco/inad/exec/decisão/
  input/contas) e **responde uma pergunta executiva** (não só um número), via o
  `MetricCard` genérico. O card **`ResumoHoje`** ("Hoje · briefing") é a assinatura:
  entram/saem/vencem/pendências do dia + prioridades da IA. `OverviewGrid`
  resolve o nó de cada id via `widgetNode` (curado/Hoje/catálogo); blocos vazios
  não renderizam. Próximas fases adicionam mais widgets ao catálogo (meta: 80–150).
- **Home contextual + reordenação por IA** (`useHomeContext`): ordem-base dos
  blocos por **setor** (`a4p_company.perfil.setor` → `SETOR_BASE`) e, com o toggle
  "Reorganizar por urgência (IA)" ligado (`a4p_home_auto`, default on), reordena os
  blocos por **urgência** calculada dos motores (quant: score/runway/ruptura →
  Saúde; pendências vencidas/a vencer → Operação; insights críticos →
  Inteligência; anomalias de despesa → Despesas). O bloco no topo ganha o selo
  **"Prioridade · {motivo}"**. Empate desfeito pela ordem-base do setor.
- **Cards do command center** (`HomeCards.tsx`, reusam os motores): `SaudeFinanceira`
  (Score·Runway·Burn·Liquidez via `useQuantitativo`), `IAInsights`/`Anomalias`
  (via `useCentroInteligencia`), `TopClientes`/`MaioresCategorias` (período-scoped
  via `useRiscoInput` + `usePeriod`), `UltimosGastos`, `Pendencias`. Cada um é
  isolado (loading próprio) e togglável. Reordenar por arrastar (Fase 4) + Home
  contextual por perfil/IA (Fase 5) são as próximas.

- **Ordem dos blocos:** **Operação** lidera a Home (`BLOCK_ORDER` + força em
  `homeContext`); o resto segue a ordem-base do setor / urgência da IA.
- **Widgets** (`src/components/visao-geral/`): `ReceivablesCard` & `PayablesCard`
  (mirrored `OpenAmountWidget`, **sem vermelho**): hero = **realizado hoje**
  (recebido/pago hoje, neutro) · secundários = **essa semana** + **esse mês**
  (pendentes, a receber/pagar). `summarizeOpen` (`aggregations.ts`): `today`
  (pago, paid_date=hoje) · `week` (pendente, vence até domingo) · `month`
  (pendente, vence até fim do mês; `week`⊆`month`). Clicar abre `/recebiveis`
  `/pagaveis` (`MovementsTable`, com coluna **Vencimento**). `AccountsCard` (saldo consolidado +
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
- **First-run** (`FirstRunCard` + `useFirstRun`): em live, quando a organização
  ainda não tem nenhum lançamento (`movements.length === 0`), o topo do dashboard
  e do DRE mostra orientação de onboarding (Importar dados → `/import` · Configurar
  empresa → `/comecar`) em vez de widgets vazios. Some sozinho quando o primeiro
  dado entra; nunca aparece em demo. As telas de listagem já têm empty states com
  o `NewButton` no header.

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

### Benchmark IULI — navegação em 9 módulos + Plano de Contas

A partir do relatório de engenharia reversa do **IULI** (ERP financeiro para
negócios digitais), a navegação (`Sidebar`) foi reorganizada nos **9 módulos do
IULI**: Dashboards · Cadastros · DRE & DFC · Orçamento · Movimentações · Vendas e
NFs · Compras · Contabilidade (+ extras all4pay em Pro: Inteligência · Equipe ·
Plataforma). Nenhuma rota mudou — só o agrupamento. Pilares conceituais do IULI a
replicar: Plano de Contas com "Uso Padrão" (auto-classificação), **3 datas**
(competência→DRE · vencimento→aging · caixa→DFC), venda como documento-mãe que
propaga para recebível/NF/imposto, rateio por projeto/centro de custo, DRE/DFC em
cascata com drill-down, conciliação IULI×OFX.

- **Plano de Contas** (`/plano-de-contas`, `components/cadastros/PlanoDeContasView.tsx`):
  a espinha dorsal — hierarquia Grupo → Categoria codificada por cor (verde =
  Receita · vermelho = Despesa · cinza = resultado/não operacional), no plano
  padrão opinativo do IULI (negócios digitais). Aba **"Uso padrão"**: o dicionário
  de auto-classificação (função do motor → categoria padrão → quando é usada).
  Demo-safe, estático (reconstrução fiel do relatório).

### Telas de listagem

Read screens reusing the cadastros: `/produtos`, `/servicos`, `/contatos`
(clientes + fornecedores), `/vendas`. Shared kit in
`src/components/listas/ListChrome.tsx` (`EntityTable` generic com `onRowClick`,
`NewButton` que abre o form, `useToast`). List data via `list*` accessors in
`src/lib/cadastros.ts` + `use*List` hooks. Sidebar links to all of them.
**Editar contato:** clicar numa linha de `/contatos` abre o `PartyForm` em modo
edição (prefill + `updateParty`/`useUpdateParty`; só grava endereço quando
preenchido, para não apagar o existente). Em demo, `updateParty` reflete no
dataset importado (`updateImportedParty`). Isso destrava o telefone de clientes
vindos da importação (que entram sem telefone) — alimentando a cobrança.

### Empresa / Configurações (`/configuracoes`)

`ConfiguracoesView` (`src/components/configuracoes/`) — tela de empresa: nome da
organização (lido do Supabase via RLS própria, `getOrganizationName`) + o perfil
salvo no onboarding (`a4p_company` no localStorage via `src/lib/company.ts`):
identidade jurídica **editável** (`saveCompany`), perfil empresarial, governança
(participantes) e estrutura financeira — read-only. É a camada de **consumo** do
que o wizard coletou (governança/perfil ainda não têm tabela). Sem dados salvos,
mostra CTA para `/comecar`. Link no rodapé da Sidebar ("Configurações"; "Adicionar
Empresa" → `/comecar`). Não toca em schema/RLS.

### Motor de Risco de Caixa (`/risco`)

`scoreRiscoCaixa()` (`src/core/risk-engine/`) is a proprietary operational
cash-risk engine, layered: Dados → Normalização → Métricas → Probabilística →
Cenários → Score → Narrativa → Alertas. Pure, typed, **auditável**
(`ScoreDetalhado` carries per-pillar scores, weights and `explicacoes`).

- **Engines:** `liquidez` (daily projection + runway 3-cenários + ruptura),
  `burn`, `inadimplencia`, `concentracao` (HHI + top clientes), `sazonalidade`,
  `stress` (queda de receita, atraso, despesa, combustível), `score` (8 pilares
  ponderados → 0-100 + nível + probabilidadeRuptura). `normalize.ts` pondera
  recebíveis por probabilidade.
- **IA (`src/core/ai/`):** `narrativa-financeira` (interpretação executiva,
  determinística — plugável a um LLM depois), `insights` (fatores críticos),
  `alertas`.
- **Dados:** `getRiscoInput()` (`src/lib/data.ts`) alimenta o motor de
  `movements`/`financial_accounts`/`parties`; hook `useRiscoCaixa()`. Roda
  idêntico sobre demo e live. UI em `src/components/risco/RiscoView.tsx`.

### Motor de Inadimplência / Inteligência de Crédito (`/inadimplencia`)

`analisarInadimplencia()` (`src/core/risk/`) é a **Risk Intelligence Layer**:
prevê inadimplência **antes** de acontecer a partir do comportamento financeiro
dinâmico (não de status estático). Pura, tipada, **explicável** (cada fator
carrega sua contribuição no score). Roda sobre o **mesmo `RiskInput`** do motor
de caixa — demo e live idênticos.

- **Camadas:** `behavior.ts` (reconstrói eventos de recebível por cliente +
  features: atraso médio/máx/recente, recorrência, oscilação, tendência, queda
  de ticket, concentração, sazonalidade, exposição) → `scoring.ts` (normaliza →
  pondera → score 0-100 + **probabilidade logística** + `classificar` baixo/
  moderado/alto/crítico + `fatoresRisco` explicados + `recomendar`) →
  `early-warning.ts` (sinais de stress antes do default) → `recovery.ts` (chance
  de recuperação) → `credit.ts` (**AI Collections**: ação, limite dinâmico,
  prazo, entrada, estratégia de cobrança adaptativa) → `index.ts` (segmentação:
  bom pagador / sazonal / deteriorando / crônico / novo + resumo da carteira:
  exposição, inadimplência esperada, score ponderado).
- `normalize.ts`: `normalizar/media/desvioPadrao/logistica/classificar`. Pesos
  do modelo auditáveis em `scoring.ts` `PESOS` (somam 1.0).
- **Dados:** reutiliza `getRiscoInput()`; hook `useInadimplencia()`. UI em
  `src/components/inadimplencia/InadimplenciaView.tsx` (resumo + heatmap de risco
  + perfil explicável do cliente + segmentação). Versão de modelo
  `risco-credito/1.0.0`. ML (XGBoost/etc.) é evolução futura — primeiro dados +
  features boas. **Nunca** retornar só o score: sempre os fatores.

### Camada Quantitativa (`/inteligencia`)

`analisarQuantitativo()` (`src/core/quant/`) — o "Bloomberg para PMEs": transforma
lançamentos em métricas executivas, score de saúde, radar, projeção e
interpretação de CFO digital. Pura, tipada, demo-safe, reusa os motores do
`risk-engine`. Versão `quant/1.0.0`.

- **`indicators.ts` `calcularIndicadores()`** — KPIs institucionais: liquidez
  corrente, runway, burn rate, **burn multiple**, margem operacional/líquida,
  receita recorrente, crescimento MoM, **eficiência operacional** (0-10), ROIC
  (proxy), ticket médio, inadimplência, concentração/dependência, **volatilidade
  do fluxo** (CV), sazonalidade e **qualidade da receita** (0-100). `series.ts`
  monta a série mensal realizada + recorrência; `stat.ts` (clamp/normalizar/
  desvioPadrao/coefVariacao).
- **`score.ts` `scoreSaudeFinanceira()`** — 0-100 ponderado (`PESOS` somam 1.0:
  liquidez·runway·inadimplência·margem·volatilidade·concentração·crescimento),
  classificação excelente→crítico, fatores ±, probabilidade de ruptura e
  **tendência** (via score temporal). `radarExecutivo()` (7 dimensões) e
  `cenariosPreditivos()` (choques receita/despesa/inadimplência → score projetado
  + prazo).
- **`benchmark.ts` `motorBenchmarking()`** (margem/eficiência/inadimplência/
  crescimento vs setor) e **`narrative.ts`** (CFO digital determinístico —
  plugável a um LLM).
- **Dados:** reutiliza `getRiscoInput()`; hook `useQuantitativo()`. UI em
  `src/components/quant/QuantView.tsx` (score + radar Recharts + KPIs + evolução
  do score + cenários + benchmark + narrativa).

### IA Executiva + Decision Engine (`/copiloto`)

`centroInteligencia()` (`src/core/executive/`) — a camada que faz o sistema
operar como analista + FP&A + tesouraria 24h. Não responde "o que aconteceu?",
e sim "o que vai acontecer, o que está errado, o que priorizar". Orquestra os
motores quant/risco/crédito (1 execução). Pura, explicável, demo-safe. Versão
`executivo/1.0.0`.

- **Context Builder** (`context.ts`): `rodarMotores()` + `construirContexto()` →
  contexto numérico estruturado (saldo, runway, burn, inadimplência,
  concentração, score…) — a IA recebe números, não texto solto.
- **`copilotoFinanceiro(pergunta, ctx)`** (`copilot.ts`): conversa contextual —
  detecta intenção (contratação, capacidade de investimento, cliente de risco,
  despesas, expansão) → resposta + números + **fontes** (explainability).
- **`detectarAnomalias()`** (`anomalies.ts`): despesa anormal por categoria
  (z-score), duplicidade e pagamento atípico. ML é evolução futura.
- **`motorPreditivo()`** (`forecast.ts`): média móvel ponderada × sazonalidade →
  fluxo projetado + janela de pressão de caixa.
- **`gerarInsights()` + `priorizar()`** (`insights.ts`): `ExecutiveInsight[]`
  ordenados por impacto × urgência × probabilidade × criticidade.
- **`executiveBriefing()`** (`briefing.ts`), **`memoryEngine()`** (`memory.ts`:
  sazonalidade, despesas recorrentes, clientes críticos) e **`simularCenario()`**
  (`scenario.ts`: recalcula runway/score/burn via `scoreDeIndicadores`).
- **Dados:** reutiliza `getRiscoInput()`; hook `useCentroInteligencia()`. UI em
  `src/components/copiloto/CopilotoView.tsx` (Intelligence Center: copiloto +
  briefing + insights + anomalias + forecast + simulador + memória).
- **Copiloto Ember (Claude grounded)** (`POST /api/ai/copiloto`, `runtime nodejs`,
  gated por `ANTHROPIC_API_KEY`): o chat do `/copiloto` (`CopilotoChat`) manda o
  **contexto numérico** (`ExecutiveContext` + anomalias + insights) e o Claude
  responde **ancorado nos números**, citando fontes e sugerindo **1 ação**.
  Determinístico (`copilotoFinanceiro`) é o **fallback** (sem chave/erro). Some
  o ar "artificial" sem perder explicabilidade (os números seguem do motor).
  Logado em `ai_actions`.

### All 4 Pay AI — assistente flutuante (global) + ficha de contato

A IA conversacional **saiu do menu** e virou um **FAB gradiente "All 4 Pay AI"**
(`src/components/app/AssistantWidget.tsx`, montado no `AppShell`) que abre um
painel de chat à direita, em toda tela. **Funciona sem chave** graças a três
camadas encadeadas no `responder`:
1. **Base de conhecimento** (`src/lib/assistant-kb.ts`): perguntas conceituais
   ("o que é runway?", "como calcula o EBITDA?") respondidas na hora + link
   **"Abrir {tela} ↗"** (a `rota` do conceito).
2. **Motor de resposta NATIVO** (`src/core/assistant/engine.ts` `responderLocal`):
   calcula a resposta real sobre `getRiscoInput` (movements/contas/clientes) —
   saldo, gasto/receita/resultado por janela (hoje/ontem/amanhã/semana/mês/mês
   passado/**trimestre**/**semestre**/ano/últimos N dias/**mês nomeado** "em
   março"), maiores gastos por categoria, **de onde vem a receita**, a receber/
   pagar, vencimentos, inadimplência, **total em atraso** (ambos os lados),
   maior/melhor cliente, **por contraparte** (devolve `contatoId` → botão "Abrir
   ficha"), maior gasto/**recebimento** individual, por centro de custo,
   **previsão do mês**, próximo receb./pagto, média mensal, **afordabilidade**
   ("posso gastar X?"), **onde economizar** (categoria que mais cresceu MoM),
   **comparação entre dois meses** ("gastei mais em maio ou junho?"), top
   fornecedores, contagem de contrapartes, **margem/lucratividade** (resultado ÷
   receita), **crescimento** (receita MoM), **ponto de equilíbrio** (break-even =
   despesa média mensal), **resumo do dia** e **resumo do
   período** (mês/trimestre/semestre/ano). A janela é detectada da própria
   pergunta (nomes de mês com limite de palavra: maio ≠ maior); a ordem das
   intenções importa (as de cima vencem; as consultivas/pago-vs-pendente foram
   auditadas adversarialmente).
3. **Claude** (`/api/ai/copiloto`) para perguntas abertas/consultivas, com o
   `copilotoFinanceiro` determinístico como fallback final.
Aprende com o uso (`src/lib/assistant-memory.ts`): frequência + recência +
👍/👎 reordenam as sugestões. O localStorage é a fonte **síncrona** (rápida,
demo-safe); em **live** sincroniza **best-effort** com a tabela por org
`ai_learning` (`0018`, RLS + RPCs `ai_learning_bump`/`ai_learning_feedback`):
cada pergunta/feedback dá um bump remoto e `hidratarAprendizado()` (ao abrir o
painel) mescla o aprendizado da organização de volta no local. Tolerante a
falha/ausência da tabela — nunca quebra o assistente. **Migration gerada como
arquivo** (aplicar ao remoto; a sincronização liga sozinha).

**Ficha de contato 360º** (`src/components/app/ContatoDrawer.tsx`, global, abre
por evento `a4p:open-contato { detail: { id } }`): recebido/pago, a receber/
pagar, vencido, **score de crédito** (motor de inadimplência) + fatores +
recomendação, e últimos lançamentos. Ligada a **5 caminhos**: Home "Top
clientes", a IA (pergunta por contraparte ou "mostre a ficha de X"), DRE por
cliente (nome clicável, reverse-map nome→id), e a coluna "ficha" em Contatos.

### Financial Orchestration Layer (`/orquestracao`)

`FinancialOrchestrator` (`src/core/orchestration/`) — o "cérebro operacional"
(GAP 1): deixa de ser "vários módulos" e vira uma **Financial Operating System
orientada a eventos**. Toda ação vira evento e propaga pela cascata. Puro,
tipado, demo-safe. Versão `orchestration/1.0.0`.

- **Event Store** (`event-store.ts`): append-only, **hash-chain SHA-256**
  (event sourcing — `replay()` reconstrói estado; `verificarIntegridade()`
  denuncia adulteração).
- **Ledger** (`ledger.ts`): **dupla partida** real-time (cada evento → débito/
  crédito por conta + hash + status); `saldos()` consolida.
- **State Engine** (`state-engine.ts`): `aplicarEvento()` muta o `RiskInput` e
  `calcularEstado()` recalcula caixa/liquidez/risco/projeção via
  `scoreRiscoCaixa` (1 execução); `calcularDeltas()` mostra a propagação.
- **Unified Financial Graph** (`graph.ts`): empresa → contas → clientes/
  fornecedores → fluxos (base de crédito/underwriting/antifraude).
- **`orquestrar(evento)`** (`index.ts`): roda a cascata Event Store → Ledger →
  State Engine → Decisão/IA → Auditoria → Antifraude → Webhook, devolvendo
  passos, deltas, reações e lançamentos. Eventos canônicos: `PIX_RECEBIDO`,
  `BOLETO_EMITIDO/VENCIDO`, `PAGAMENTO_APROVADO/EXECUTADO`, `SALDO_NEGATIVO`…
- **Dados:** reutiliza `getRiscoInput()`; hook `useOrquestracaoInput()`. UI em
  `src/components/orquestracao/OrquestracaoView.tsx` (estado vivo + disparo de
  eventos + cascata + event store + ledger + grafo). Stateful (orquestrador em
  `useRef`).

### Financial Infrastructure (`/infraestrutura`)

`FinancialPlatform` (`src/core/platform/`) — GAP 3: a evolução de "produto" para
**financial infrastructure company**. Domain Financial Architecture sobre um
**Double-Entry Ledger Core** (saldo = estado DERIVADO do ledger, a verdade
absoluta). Puro, tipado, demo-safe. Versão `platform/1.0.0`.

- **Ledger Core** (`ledger-core.ts`): plano de contas tipado (asset/liability/
  equity/revenue/expense), `postar()` rejeita transação **desbalanceada**
  (D≠C), `saldo()` derivado dos lançamentos, `trialBalance()` (invariante
  global), `reverter()` (estorno espelho). Caixa reconstruído por replay.
- **Idempotency** (`idempotency.ts`): `idempotency_key` — o mesmo pagamento
  nunca executa duas vezes.
- **Financial Queue** (`queue.ts`): fila com retry/backoff, dedup por key e
  `replay()`. **Payment Orchestrator** (`payment-orchestrator.ts`) coordena
  PIX/boleto/TED/cartão: idempotência → fila → ledger (dupla partida) →
  liquidação (`falharVezes` simula falha transitória reprocessada).
- **Observability** (`observability.ts`): invariantes em tempo real —
  integridade do ledger, divergência de saldo, jobs em falha, atraso de
  liquidação. **Domains** (`domains.ts`): mapa dos 10 domínios → módulos.
- **Facade** `FinancialPlatform` (`index.ts`): `processarPagamento()`, `saude()`,
  `recuperarCaixa()` (state recovery). UI em
  `src/components/infraestrutura/InfraestruturaView.tsx` (domínios + ledger +
  orquestrador interativo + fila + observabilidade). Console de arquitetura
  (stateful em `useRef`), independente de demo/live.

### Financial Decision Layer (`/decisao`)

`decidir()` (`src/core/decision/`) — GAP 4: industrializa a inteligência. Deixa
de "mostrar números" e passa a DECIDIR: interpretar, pontuar risco
probabilístico, prever, recomendar (com impacto quantificado) e agir. Une os
motores quant/risco/crédito. Puro, explicável, demo-safe. Versão `decision/1.0.0`.

- **Feature Store** (`features.ts`): variáveis estruturadas (atuais + histórico
  mensal) — runway, burn, liquidez, inadimplência, concentração receita/
  fornecedor, ticket, margem, sazonalidade — substrato dos modelos.
- **Risk Matrix** (`risk-matrix.ts`): risco **probabilístico multidimensional**
  (8 dimensões: caixa, liquidez, inadimplência, concentração, fornecedor,
  operacional, sazonal, crescimento) → probabilidade + nível + fator, agregadas
  numa **probabilidade de stress** (logística ponderada).
- **Prediction Engine** (`prediction.ts`): **Monte Carlo** do caixa (deriva
  diária + volatilidade, RNG determinístico) → probabilidade de ficar negativo,
  data/semana provável e bandas p10/p50/p90.
- **Recommendation Engine** (`recommendations.ts`): cada ação (antecipar
  recebíveis, postergar/renegociar fornecedor, reduzir despesa) constrói o
  cenário modificado e **RE-RODA `scoreRiscoCaixa`** medindo o impacto real
  (Δrunway, Δscore, Δprob. de ruptura) — recomendação quantificada.
- **Autonomous Actions** (`autonomous.ts`): plano de resposta coordenado com
  guardrails (`automatico` / `proposto` / `requer_aprovacao`).
- **Dados:** reutiliza `getRiscoInput()`; hook `useDecisao()`. UI em
  `src/components/decisao/DecisaoView.tsx` (headline + matriz de risco + Monte
  Carlo + recomendações com impacto + plano autônomo + feature store).

### Financial Data Moat (`/dados`)

`analisarMoat()` (`src/core/datamoat/`) — GAP 5: o moat de dados (cross-tenant
accumulated intelligence). Transforma cada empresa em sinal de uma rede que
aprende junto. Puro, tipado, demo-safe. Versão `datamoat/1.0.0`.

- **Data Lake / coorte** (`cohort.ts`): 320 empresas **sintéticas anonimizadas**
  (RNG semeado) com features estruturadas + desfecho histórico (escalou/
  saudável/stress/quebrou) — substrato de benchmark e modelos. Em produção vira
  a base cross-tenant real.
- **Self-Improving model** (`model.ts`): regressão logística treinada por
  gradiente na coorte (padroniza → treina → holdout). **Curva de aprendizado**
  (acurácia cresce com o nº de empresas — o moat). `probabilidadeStress()`.
- **Company DNA** (`dna.ts`): arquétipo (agressiva/conservadora/sazonal/
  recorrente…) + traços + assinatura.
- **Benchmark Engine** (`benchmark.ts`): percentil + mediana vs pares reais da
  coorte (setor/faixa). **Behavioral models** (`behavior.ts`): KNN aos desfechos
  da coorte → "% dos pares semelhantes entraram em stress".
- **Credit Intelligence** (`credit.ts`): PD pelo modelo + limite recomendado +
  confiabilidade. **Treasury network** (janelas de stress por setor).
- **Dados:** `mapearFeatures()` usa `analisarQuantitativo`; hook `useMoat()`. UI
  em `src/components/dados/DadosView.tsx` (DNA radar + modelo/curva de
  aprendizado + benchmark + comportamental + crédito + treasury).

### Arquitetura Institucional (`/arquitetura`)

GAP 6: a visão de **financial operating infrastructure** — unifica as camadas
já construídas e fecha o que faltava (Treasury Core + Reliability Layer). Puro,
demo-safe.

- **Treasury Core** (`src/core/treasury/`): posição consolidada por conta/banco,
  **concentração bancária** (HHI), liquidez em buckets (imediata/30d/90d), cash
  positioning (8 semanas), exposição e stress testing (reusa `scoreRiscoCaixa`).
  Consome `getAccountsList()` + `getRiscoInput()`.
- **Reliability Layer** (`src/core/reliability/`): `CircuitBreaker` (abre após N
  falhas → curto-circuito → meio-aberto), `DeadLetterQueue`, `LockManager`
  (distributed lock anti-duplicidade) e `simularResiliencia()` (runner: retries
  → DLQ → recuperação, sem duplicar dinheiro).
- **Control plane** (`src/core/architecture/`): `arquiteturaInstitucional()` —
  as 10 camadas institucionais, os 10 serviços financeiros distribuídos
  (latência/throughput), o pipeline de tempo real, métricas de observabilidade
  (liga ao ledger real via `FinancialPlatform`) e o isolamento multi-tenant.
- **Dados:** hook `useArquitetura()` (accounts + risco). UI em
  `src/components/arquitetura/ArquiteturaView.tsx` (camadas + serviços + pipeline
  + Treasury Core + Reliability console interativo + observabilidade + tenancy).

### Autonomous Decision Layer (`/autonomo`)

`operacaoAutonoma()` (`src/core/autonomous/`) — GAP 8: o salto de "informar o
problema" para DECIDIR e executar (supervisionado). Motor central de decisão
operacional que reúne decisão/crédito/anomalias/tesouraria. Puro, explicável,
demo-safe. Versão `autonomous/1.0.0`.

- **Policy engine low-code** (`policies.ts`): `POLITICAS` SE→ENTÃO (cliente de
  alto risco, saldo crítico, inadimplência alta, anomalia de despesa,
  concentração bancária, otimização de caixa). Cada política avalia o contexto
  e emite `FinancialDecision[]`.
- **`FinancialDecision`**: tipo (cobranca/pagamento/capital/risco), prioridade,
  impactoEsperado, **confiança**, fatores (explicabilidade), riscoExecucao.
- **Human-in-the-loop** (`index.ts`): guardrails — ações reversíveis (cobrança/
  monitoramento) são `automatico`; mover dinheiro acima de `LIMITE_AUTOMATICO`
  (R$2k) ou baixa confiança escala para `requer_aprovacao`.
- **Autonomous Collections** (`collections.ts`): canal/horário/estratégia/tom
  por cliente (modelo preditivo). **Smart Payment Routing**
  (`payment-routing.ts`): escolhe conta/banco que preserva liquidez e dilui
  concentração. **Next Best Action** (decisão de maior prioridade).
- **Dados:** hook `useOperacaoAutonoma()` (accounts + risco). UI em
  `src/components/autonomo/AutonomoView.tsx` (headline + next best action +
  decisões + HITL + políticas + cobrança + roteamento).

### DRE Intelligence Center (`/dre`)

`financialDRE()` (`src/core/dre/`) — não é "um DRE", é um centro de resultado
empresarial. Consome o mesmo `RiskInput`, classifica os `movements` em linhas
do DRE por palavra-chave na categoria e respeita o **regime** (competência por
`due_date` / caixa por `paid_date`). Puro, tipado, demo-safe. Versão `dre/1.0.0`.

- **`engine.ts`**: `classificarDespesa/Receita` (impostos/CMV/folha/financeiro/
  opex · vendas/serviços/juros/outras); `dreGerencial()` (waterfall Receita
  bruta → impostos → líquida → CMV → lucro bruto → opex → EBITDA → financeiro →
  lucro líquido, com **drill-down** por categoria); `dreFinanceiro()` (caixa:
  fluxo operacional/financeiro/livre + burn/runway); `drePorCliente()`
  (receita/share/margem + risco e vencido via motor de crédito); `drePorLinha()`
  (produto/unidade via linha de receita, custo rateado); `dreComparativo()`
  (mês atual/anterior/YTD/12m + variações); `dreProjetado()` (receita média ×
  margem para 30/90/180/360d).
- **`index.ts`**: `financialDRE(input, filtro)` + `periodoPreset()` + DRE
  executivo (problemas/oportunidades + comentário do copiloto).
- **Dados:** hook `useDRE(preset, regime)`. UI em
  `src/components/dre/DREView.tsx` (filtros dinâmicos período/regime + executivo
  + waterfall com drill-down + financeiro + comparativo + por linha + por
  cliente + projetado).
- **Fluxo categoria/centro de custo:** `getRiscoInput()` resolve o **nome** da
  categoria (`category_id→categories.name`) e do **centro de custo**
  (`cost_center_id→cost_centers.name`) — em live por embed PostgREST, em demo
  derivado. `RiskMovement.costCenter` alimenta `drePorCentroCusto()`. Assim, a
  categoria/centro escolhidos no lançamento/venda refletem na linha certa do DRE
  e no dashboard. O gráfico de **faturamento** conta toda a receita (não depende
  do texto `"venda"`).

### Onboarding guiado / Criar empresa (`/comecar`)

`OnboardingWizard` (`src/components/onboarding/`) — fluxo de 7 passos com barra
de progresso (MVP-permissivo: campos opcionais, avança em branco). Substitui o
login de convidado (removido). Rota **pública** (liberada no middleware).

- **Passos:** 1) Dados básicos (jurídico/representante/endereço/fiscal +
  "Consultar CNPJ" via BrasilAPI best-effort) · 2) Perfil empresarial (setor/
  modelo/receita/frequência/funcionários/faturamento + bancos/meios/despesas em
  multi-chip) · 3) Governança (participantes, função, aprovação, limite) ·
  4) Estrutura financeira (contas, centros, unidades, DRE, fluxo) ·
  5) Onboarding inteligente (reusa FDIP `analisarImportacao`) · 6) **Análise IA**
  (`src/core/onboarding/`: `montarDNA()` = Financial DNA + `calcularMaturidade()`
  = **Business Maturity Score 0-100** com pilares/fortes/atenção/recomendações) ·
  7) Ambiente criado (`aplicarOnboarding(report)` → cria/correlaciona tudo).
- Ao finalizar (`finalizar`, live): autentica → persiste a estrutura escolhida
  via `aplicarEstrutura` (`src/lib/onboarding.ts`: contas bancárias →
  `financial_accounts`, centros → `cost_centers`, unidades → `units`, **dedup por
  nome** para não duplicar o `seed_org`) → aplica o import (se houve) → entra no
  sistema. O perfil fica em `localStorage` (`a4p_company`). Governança ainda não
  tem tabela/consumo (fora do escopo). Login (`/login`) tem CTA "Criar empresa".

### Tipo de conta: Empresa (PJ) × Pessoa Física (PF)

A MESMA infraestrutura financeira servida em duas roupas. **Variável escolhida no
login e no cadastro** (`useTipoConta`, `src/components/app/useTipoConta.ts` —
espelha `useModo`: store reativo em `localStorage` `a4p_tipo_conta` + listeners;
default `empresa`; fallback no que o onboarding gravou em `a4p_company.db.tipoConta`).

- **Login** (`/login`): toggle segmentado **Empresa | Pessoal** (`setTipoConta`)
  que adapta o subtítulo, a arte e o CTA ("Criar conta pessoal/empresarial").
- **Cadastro** (`/comecar`): `OnboardingWizard` é um chooser fino — `pessoal` →
  **`OnboardingPessoal`** (3 passos enxutos: Você · Contas & renda · Gastos do dia
  a dia), senão `OnboardingEmpresa` (o wizard de 7 passos). Cada um tem um link
  "Sou empresa / Sou pessoa física" para trocar. O PF monta o MESMO `StoredCompany`
  (perfil `setor:"Pessoal"`, `estrutura.contas` = carteiras; campos próprios em
  `StoredCompany.pessoal`: renda/saldo/orçamento/carteiras/categorias) e persiste
  por `persistCompany` + `aplicarEstrutura` — reusa toda a camada de dados/motores.
- **Sidebar** (`useTipoConta`): no PF troca os grupos por `GROUPS_PESSOAL`/
  `CONFIG_PESSOAL` (Gastos · Renda & receitas · Contas & carteiras · Orçamento &
  metas · Meu perfil), Início vira "Resumo" e o toggle Modo Pro some. Esconde os
  módulos de empresa (POS, cadastros, governança, plataforma, motores).
- **Home** (`homeContext`): `SETOR_BASE.Pessoal` prioriza Despesas/Receita. O
  `NovoDeposito` no PF mostra só Despesa/Receita/Transferência ("Adicionar").

### Fluxo de Caixa (`/fluxo-caixa`) — centro operacional do caixa

`montarFluxoCaixa()` (`src/core/cashflow/`, versão `cashflow/1.0.0`) — assembla
**14 blocos** a partir do mesmo `RiskInput` + contas, reusando os motores
(risco/quant/decisão+Monte Carlo/DRE/executivo/tesouraria) em uma execução. Puro,
demo-safe. **Header** (`FiltrosContext` + `Header.tsx`): período (Hoje·7D·14D·30D·
3M·6M·1A·Personalizado em pills) + Conta + Regime (Competência/Caixa/Híbrido) +
Visão (Previsto/Realizado/Consolidado) — **toda alteração reprocessa a página**
(entra na chave do `useFluxoCaixa`, memoizado). **Conta** escopa saldo **e filtra
os movimentos** por `account_id` (`montarFluxoCaixa`). `movements.account_id` flui
ponta a ponta: escolhido no lançamento (`ReceitaForm`), gravado pelo writer, lido
no `getRiscoInput`/`Movement`, exibido nas listas (`MovementsTable` resolve o nome
da conta da lista real) e filtrável por conta na tela de Entradas/Saídas.

- **Blocos** (`FluxoCaixaView.tsx`): 1) **Executive summary** (caixa, entradas/
  saídas previstas, geração, burn, runway, chance de ruptura, Financial Score);
  2) **Fluxo inteligente** (árvore saldo inicial→entradas[PIX/boletos/cartões/…]→
  saídas[fornecedores/folha/impostos/…]→operacional→investimentos→financiamentos→
  livre→saldo final, linhas expansíveis); 3) **Previsto×Realizado** (por contraparte
  + comentário de IA); 4) **Calendário** (recebe/paga/saldo diário); 5) **Cross-check**
  (cadeias despesa/recebimento com flags vindas dos dados); 6) **Projeção ML**
  (Monte Carlo `preverCaixa` 7/30/90/180/365 + bandas p10/p50/p90 em Recharts);
  **Cenários** (`simularCenario`: atraso/queda/combustível/financiamento/equipe/
  aquisição); 7) **Heat map** (liquidez diária verde/amarelo/vermelho); 8) **Waterfall**
  (DRE receita→deduções→resultado); 9) **IA Copilot** (insights+sugestões); 10) **What-If**
  (sliders receita/despesa/inadimplência/folha → `simularCenario` ao vivo);
  11) **Eventos** (timeline de movements); 12) **Confidence layer** (confiança por
  horizonte, cai com prazo×volatilidade); 13) **Cash Flow Digital Twin** (feeds
  entradas/saídas/inteligência + explicação da IA do porquê das mudanças).
- **Dados:** `useFluxoCaixa(filtros)` (`hooks.ts`) sobre `getRiscoInput`+
  `getAccountsList`. Sidebar/command palette ligam a rota.

### Funil PAGAR (Central de Pagamentos · Solicitações & aprovações · Reembolsos)

Submenu **PAGAR** da Sidebar = funil de contas a pagar, sobre o mesmo hub
(`getOpenMovements("saida")` / `getRiscoInput`). Três telas reusam motores
existentes; nada de captura duplicada (a Caixa de Entrada vive em `/upload`).

- **Central de Pagamentos** (`/pagamentos`, `components/pagamentos/`): executa os
  títulos de saída lançados. Cards agrupados por dia/semana/mês/ano + busca +
  conta de saída + método; **seleção múltipla** e **pagar por linha** (botão
  "Pagar" aparece na linha selecionada → modal **Confirmar pagamento** +
  **anexar comprovante**). `lib/pagamentos.ts` `pagarLote()`: **idempotente**
  (reusa `FinancialPlatform.processarPagamento` do `core/platform` — reenviar o
  mesmo título não paga 2x) → **liquidar** (`liquidarImported`: marca pago +
  paid_date + **debita o saldo** da conta; live: Supabase). Card **"Contas pagas"**
  scoped por um **box de período** (7D/14D/30D/3M/Tudo, por `paid_date`, via
  `getRiscoInput`); comprovante por movement em `localStorage`
  (`anexarComprovante`). "Enviado" ≠ "pago": saldo só cai na liquidação.
  **Gate de alçada:** títulos acima do limite sem aprovação ficam **bloqueados**
  (selo + link p/ `/aprovacoes`), fora do lote.
- **Solicitações & aprovações** (`/aprovacoes`, `components/aprovacoes/`): gate de
  alçada reusando `core/institutional` (`REGRAS_PADRAO`/`iniciarAprovacao`/
  `aprovarPasso`/`regraParaValor`/`sugerirIA`). `lib/aprovacoes.ts` (store local)
  expõe `requerAlcada`/`estaAutorizado` (consumidos pela Central). Abas (fila/
  minhas/todas), painel Aprovar/Rejeitar/Devolver com sugestão de IA e trilha,
  segregação de funções. Semeia solicitações dos títulos acima da alçada (R$5k).
- **Reembolsos** (`/reembolsos`, `components/reembolsos/`): caso especializado —
  form do colaborador + itens (OCR do comprovante via `lerDocumento`) + chave Pix.
  Roteia pelo MESMO motor de alçada; ao aprovar (`sincronizarReembolsos`) gera
  **1 movement de saída por item** (categoria certa → DRE por item) que entra na
  Central/`/pagaveis`. `lib/reembolsos.ts` (store local).

### Recorrências (`/recorrencias`) — motor de MRR (funil RECEBER)

`lib/recorrencias.ts` (store local, demo-safe) — contrato (cliente + itens do
**catálogo** Produtos/Serviços + ciclo) que **projeta as próximas faturas como
`movements` de entrada PREVISTOS no hub** (receita contratada → `/recebiveis`,
fluxo previsto, DRE, risco). **Ativar** injeta as faturas via `appendImported`
(demo) / Supabase (live); **Pausar/Cancelar** (churn) remove do fluxo
(`removerImported`). Dashboard de assinatura (**MRR**/ativas/ticket/churn),
Nova recorrência, lista com próximas faturas. `party_id` do cliente resolvido
(DRE-por-cliente/cobrança). UI em `components/recorrencias/RecorrenciasView.tsx`.
Boleto/NFS-e por ciclo e scheduler de faturamento são roadmap.

> **Nota de validação (ambiente):** o funil PAGAR/RECEBER passa em
> typecheck/lint/build, mas o drive ao vivo via browser ficou **bloqueado** numa
> regressão do ambiente — `next start` não inicializa em background aqui (um
> servidor node puro inicializa; o Next, não). O mecanismo de liquidação/saldo
> (`liquidarImported`/`appendImported` → `getRiscoInput` → `summarizeAccounts`) é
> o MESMO caminho validado no browser antes (saldo reagiu pelo valor exato).

### Upload de dados (`/upload`) — Caixa de Entrada + Onboarding unificados

A página **`/upload` "Upload de dados"** (`src/components/upload/UploadView.tsx`)
**junta** a Caixa de Entrada (documentos/OCR) e o Onboarding inteligente (extratos
OFX/CSV em lote, FDIP) numa central só. `/inbox` e `/import` **redirecionam** para
`/upload` (Sidebar tem uma entrada única). UploadView só compõe `<InboxView/>` +
`<ImportView/>` em duas seções.

**Wizard rápido na home** (`src/components/upload/UploadWizard.tsx`): o botão fixo
da home (FAB lime "Upload de dados") **não navega** — abre um modal de **3 etapas**
(evento `a4p:open-upload`, montado no `OverviewGrid`):
1. **Enviar** — caixa arrastável (boleto/comprovante/nota PNG·JPG·PDF; OFX/CSV em lote).
2. **Leitura inteligente** — `lerDocumento()` (`src/lib/ocr-ingest.ts`: OCR por IA/
   local, ou FDIP p/ extrato) → `analisarDocumento()` (`src/lib/upload-doc.ts`):
   decide a **ação** (Vou pagar/receber · Paguei/Recebi), faz o **cross-check do
   beneficiário** contra os Contatos (por CNPJ/CPF ou nome), detecta **baixa** de um
   agendado (comprovante que casa com pendente ±2% do mesmo tipo), sinaliza
   beneficiário **novo** (sugerir cadastro) e gera **ideias**.
3. **Confirmar** — campos editáveis (valor/vencimento/categoria) + toggle de
   cadastrar o contato novo → `confirmarDocumento()` grava no sistema (demo:
   `appendImported()` anexa 1 lançamento ao dataset, partindo de um snapshot do seed
   p/ não escondê-lo; live: cria contato/lançamento no Supabase, ou dá baixa no
   pendente) → `invalidateQueries()` reflete em dashboard/DRE/risco/Upload.

`InboxView` (`src/components/inbox/`) — a "Inbox financeira" estilo e-mail: tudo
que entra (PDF/PNG/JPG/OFX/Excel/CSV/XML/DANFE/NFS-e/boleto/comprovante/contrato)
cai numa central. Materializa o blueprint (Financial Inbox → Document Intelligence →
Confirmation Workbench → Confidence Engine → Digital Twin):
- **Canais** (`INBOX_CANAIS`): Upload/arrastar (funcional), E-mail
  (`financeiro@…all4pay.com`), WhatsApp, Open Finance, API/ERP, OCR/scanner,
  monitoramento de pasta — os 3 últimos marcados "em breve" (conectores de
  backend). O **drag-drop** roda OFX/CSV pelo motor FDIP (`analisarImportacao`).
- **Status** (`STATUS_META`): Novo · Em análise · Pronto · Necessita revisão ·
  Processado. **Workbench** por documento: campos extraídos + **cross-check**
  (fornecedor/recorrência/NF batem?) + ação detectada (a pagar/receber/baixa/…)
  + sugestões (criar fornecedor/categoria/recorrência) + **matriz de confiança**
  (campo×%, ≥95% auto-aprovável) + "Confirmar" (propaga p/ contas/fluxo/DRE/
  tesouraria/forecast…). Callout do **Financial Digital Twin**.
- Dados de demo em `src/lib/inbox.ts`. **OCR REAL** (`POST /api/inbox/ocr`,
  `runtime nodejs`): a visão do **Claude** (Anthropic API, `fetch` cru — sem SDK)
  lê imagem/PDF e devolve os campos estruturados + confiança por campo (JSON).
  Gated por `ANTHROPIC_API_KEY` (`ANTHROPIC_MODEL` opcional, default
  `claude-sonnet-4-6`); `GET` reporta `configured`. A InboxView reduz a imagem
  (canvas, 1600px/JPEG) antes do POST e monta o `InboxDoc` real do retorno.
  **OCR LOCAL (fallback sem chave)** (`src/lib/ocr-local.ts`): sem
  `ANTHROPIC_API_KEY`, imagens caem no **Tesseract.js** (WASM, roda no navegador,
  grátis, import dinâmico — não pesa o bundle) → `ocrLocalImagem(file)` transcreve
  e `extrairCampos()` (heurísticas regex pt-BR: valor/vencimento/CNPJ/CPF/linha
  digitável/banco/beneficiário) monta o MESMO `DocExtraido`. **PDF sem chave**
  também é lido localmente: `ocrLocalPdf()` **rasteriza a 1ª página via pdf.js**
  (`pdfjs-dist`, worker do CDN na versão exata) num canvas PNG → Tesseract. Precisão
  menor → confiança capada em 0.82, entra como "revisão" para o operador confirmar.
  O canal "OCR" mostra "ativo · IA (Claude)" com a chave ou "ativo · local (sem
  chave)" sem ela.
  Upload OFX/CSV roda pelo FDIP. E-mail/WhatsApp/Open Finance plugam na mesma esteira.

### Onboarding inteligente / FDIP (em `/upload`)

`analisarImportacao()` (`src/core/fdip/`) — Financial Data Ingestion &
Intelligence Platform: não é importar, é fazer o **onboarding financeiro
automático** da empresa. Puro, demo-safe. Versão `fdip/1.0.0`.

- **Ingestão** (`engine.ts` `parseTexto`): OFX (`<STMTTRN>`) e CSV/extrato
  pt-BR (detecta delimitador, header ou posicional; valores `1.234,56`/`-`/`D/C`;
  datas dd/mm/aaaa, ISO, aaaammdd) → `FinancialRecord` normalizado (reusa
  `limparContraparte`/`fingerprint`). Conectores (Open Finance, API bancária,
  ERP, OCR PDF/imagem, e-mail/WhatsApp) entram na mesma normalização.
- **Classificação** (`classificarRecord`): destino + categoria + **confiança**
  por keyword (combustível, folha, aluguel, utilidades, impostos, tarifas,
  assinaturas, marketing, fornecedores) + detecção de transferência; **self-
  learning** (`learning.ts`) memoriza contraparte→categoria (localStorage) e
  sobe a confiança a ~99% na próxima vez.
- **Puzzlebot — auto-categorização por IA** (`src/lib/puzzlebot.ts` +
  `POST /api/ai/categorizar`, gated por `ANTHROPIC_API_KEY`): botão
  **"Auto-categorizar (IA)"** na revisão do upload pega os lançamentos de
  **baixa confiança** (<0.9), o Claude escolhe a categoria do vocabulário FDIP e
  o resultado é **memorizado** (`aprender`); re-analisar reflete o aprendizado
  (confiança sobe) — é como a acurácia chega a ~90%+ a cada upload. Fallback:
  fica nas regras (sem chave).
- **Entidades** (`resolverEntidades`): agrupa por contraparte normalizada
  (aliases) → cliente/fornecedor. **Padrões** (`descobrirPadroes`):
  recorrências (mensal/semanal), assinaturas, sazonalidade. **Grafo** + **plano
  de setup** (`montarPlano`): categorias, centros de custo, recorrências e
  **estimativas** (receita/EBITDA/margem/recorrente). **Central de confiança**
  (`centralConfianca`): total/lidos/alta/média/baixa + pendências.
- **Auto company setup / correlação no sistema inteiro:** `aplicarOnboarding(report)`
  (`src/lib/fdip.ts`) → `montarDataset()` converte os lançamentos lidos em
  `movements`+contas+parties. **Demo:** grava no store `src/lib/imported.ts`
  (localStorage) que vira a FONTE dos acessores — `getRiscoInput()`,
  `getReceivables/Payables/Accounts/DailyCashflow/Sales`, `getOpenMovements`,
  `listParties` leem `importedMovements()/importedAccounts()/importedParties()
  ?? seed`. **Live:** cria parties/categorias/centros **e os movimentos** no
  Supabase. A `ImportView` invalida o React Query → dashboard/DRE/risco/quant/
  decisão/copiloto/autônomo/dados/contatos passam a refletir o upload. Botão
  "Limpar dados importados" reverte (demo). Amostra de 12 meses em `sample.ts`
  (+ `public/exemplos/extrato-exemplo-all4pay.csv`). UI em
  `src/components/import/ImportView.tsx` (ingestão + confidence center +
  descobertas + destino com confirmação + padrões + setup).

### Sistema Operacional Financeiro (`/conciliacao`, `/automacoes`)

`src/core/financial-os/` — camada de SO financeiro orientada a eventos,
in-memory (arquitetura inicial; em escala troca-se o transporte por
Kafka/EventBridge/PubSub sem mexer no contrato). Tudo demo-safe.

- **Integration Gateway** (`gateway.ts`): `normalizar(fonte, raw)` traz qualquer
  fonte (pix/ofx/nf/boleto/comprovante/…) ao `FinancialTransaction`; `fingerprint()`
  (cyrb53) e `extrairComprovante()` (OCR stub plugável).
- **Reconciliation Engine** (`reconciliation.engine.ts`): `reconciliarAutomaticamente()`
  — matching **probabilístico** ponderado (valor 35 / data 25 / documento 20 /
  contraparte 15 / categoria 5) → confidence → filas auto (≥90) / sugestão (≥70) /
  exceção. UI em `components/financial-os/ReconciliationView.tsx`.
- **Event Bus** (`event-bus.ts`): `centralEventosFinanceiros()` / `FinancialEventBus`
  pub/sub por prioridade. **Rules Engine** (`rules-engine.ts`):
  `motorRegrasFinanceiras()` (FinancialRule = trigger + conditions + actions, low-code).
  **Automation** (`automation.ts`) executa ações; **AuditTrail** (`audit.ts`) registra
  tudo; **AI Interpretation** (`ai-interpretation.ts`) sugere regras.
- `operarFinanceiroOS(rules, eventos, riscoInput?)` (`index.ts`) roda o fluxo
  ponta a ponta (evento → regra → ação → auditoria). UI em `AutomacoesView.tsx`.
- **Ponte de risco** (`bridges/risco.bridge.ts`): `custo_variou` → recalcula
  `scoreRiscoCaixa` com despesa ajustada → **alerta executivo** + publica
  `anomalia_detectada` (event-driven). Mostrado no `AutomacoesView`.
- **Notificações** (`notifications.ts` simulado no engine + `notifications.server.ts`
  **server-only**): envio REAL de **WhatsApp via Twilio** e **e-mail via Resend**,
  disparado pelo runner (`dispararNotificacoes` no `/api/financial-os/run`,
  `runtime nodejs`). Gated por env (`TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM`
  + `ALERTS_WHATSAPP_TO`; `RESEND_API_KEY` + `ALERTS_EMAIL_FROM/TO`); sem chaves
  → simulado. `statusNotificacoes()` reporta o que está ativo.
  - **Cobrança por cliente** (`dispararCobrancas` + `POST /api/cobranca/whatsapp`):
    loop sobre inadimplentes com telefone (cadastro de Contatos). A segmentação é
    do all4pay; a Twilio só entrega. Disparado de `/autonomo`.
  - **Teste manual** (`testarWhatsapp` + `GET/POST /api/notificacoes/teste`):
    valida o Twilio na hora, sem depender de eventos/cron. Sem `CRON_SECRET`,
    só envia para `ALERTS_WHATSAPP_TO` (anti-relay); com ele, exige Bearer.
  - **Templates aprovados** (produção, fora da janela de 24h): `TWILIO_TEMPLATE_COBRANCA_SID`
    (ContentSid HX…, variáveis 1=nome · 2=valor) e `TWILIO_TEMPLATE_ALERTA_SID`
    (variável 1=texto). Quando definidos, `enviarWhatsapp` usa ContentSid +
    ContentVariables; senão, free-form (Body). **A transição sandbox→produção é só
    de ambiente** — o código não muda. `statusNotificacoes()` reporta
    `templateCobranca`/`templateAlerta`.
- **Live operacional** (`src/lib/financial-os.ts`): `loadAutomacoes()` carrega
  as regras de `financial_rules` (semeia os defaults se vazio) e roda a
  simulação sobre **eventos derivados do estado real** (`eventosDoInput` sobre
  `getRiscoInput`: saldo crítico, inadimplência, recebimento). `persistRule`
  grava regras e `logExecucoes` audita cada ação em `rule_executions`. Em demo
  usa o seed/o que foi importado. Tabelas `financial_rules`/`rule_executions`/
  `audit_log` (com `org_id`) **aplicadas ao remoto**; `AutomacoesView` carrega
  via React Query (demo + live).
- **Runner agendado:** `GET /api/financial-os/run` (`runScheduledOS()`, async)
  deriva eventos do estado atual → regras → ações → auditoria → alertas. Vercel
  Cron em `vercel.json` (diário); protegido por `CRON_SECRET` quando definido.
- Demo data + accessors em `src/lib/financial-os.ts`.

### Camada Institucional / Governança (`/governanca`)

`src/core/institutional/` — governança operacional de nível bancário (o que
separa "software bonito" de infraestrutura financeira usável por bancos, fundos
e auditorias). Pura, tipada, **auditável**, demo-safe. Três pilares:

- **Trilha de auditoria imutável** (`audit.ts` `TrilhaAuditoria` +
  `trilhaAuditoriaCompleta`): cada ação vira evento **encadeado por SHA-256**
  (`sha256.ts`, implementação pura/síncrona FIPS 180-4 — sem deps).
  `verificarIntegridade()` recomputa a cadeia e **denuncia adulteração**;
  `analisarMudanca()` é a **before/after intelligence** (aumento de valor,
  alteração após aprovação, troca de dado bancário → flags críticas);
  `reconstruirEstado()` faz **replay temporal / event sourcing** (estado em
  qualquer instante); `exportar()` (JSON/CSV) para export legal.
- **RBAC + Policy Engine** (`rbac.ts` `permissoesGranulares`): matriz papel×ação
  (`Role`/`Permission`), e `avaliarPolitica({usuario, transacao, ambiente,
  risco})` → `aprovar | exigir_mfa | escalar | rejeitar | bloquear` por valor,
  método, limite individual, país, horário e IP — explicável (motivos).
- **Approval Flow** (`approval-flow.ts`): `REGRAS_PADRAO` configuráveis por faixa
  de valor (auto → financeiro → CFO+tesouraria → CFO+compliance, sequencial/
  paralelo, biometria), `sugerirIA()` (consistência com histórico do favorecido),
  `assinar()` (assinatura eletrônica = SHA-256 + timestamp + device),
  `aprovarPasso()` e `executarEmergencia()` (bypass com justificativa), `slaPorEtapa()`.
- **Dados:** `getAuditTrail()` (`src/lib/institutional.ts`) — demo: trilha selada
  (`demo.ts`); live: constrói a cadeia sobre `audit_log` real. RBAC/policy/regras
  são **configuração** (não dados), expostas direto do core. Hook `useAuditTrail()`.
  UI em `src/components/institucional/InstitutionalView.tsx` (auditoria + teste de
  adulteração + matriz RBAC + policy engine interativo + escada de aprovação + SLA).
  Versão `institucional/1.0.0`.

### Multi-tenant & seed (`0005`–`0007`, aplicadas ao remoto)

A partir de `0005_multi_tenant.sql` o banco é **isolado por organização**:

- **`organizations`** + **`organization_members`** (papel `owner`/`admin`/`member`).
- Toda tabela de dados ganhou **`org_id uuid not null default public.auth_org_id()`**
  — o app **não envia `org_id`** nos inserts; o DEFAULT resolve a organização do
  usuário logado. As policies abertas `using (true)` viraram
  `using (org_id = public.auth_org_id())` (leitura **e** escrita).
- **`auth_org_id()`** (`SECURITY INVOKER`, `0007`) devolve a org do `auth.uid()`
  via `organization_members`. Sem recursão: a policy de `organization_members`
  usa só `auth.uid()`.
- **Provisionamento automático:** trigger `on_auth_user_created` em `auth.users`
  cria, a cada signup (inclusive convidado/anônimo), uma organização própria +
  membership `owner` e roda o **seed** (`seed_org`): categorias receita/despesa,
  centros de custo, unidades e uma conta inicial. `0006` revoga `EXECUTE` das
  funções internas (`handle_new_user`/`seed_org`).
- Avisos "Anonymous Access Policies" do linter são **esperados** — login de
  convidado está habilitado e o convidado opera na própria org, isolado por RLS.
- Para um novo membro entrar numa org existente (em vez de criar a sua), use
  **Configurações → Governança → Adicionar usuário** (por e-mail). Em live isso
  roda pelas funções `SECURITY DEFINER` do `0012` (`org_members` / `org_invite_by_email`
  / `org_member_update` / `org_member_remove`): o convidado precisa **já ter conta**
  (o convite o vincula à org; não cria conta nem envia e-mail). `governance.ts`
  consome essas RPCs; demo persiste no perfil local (`a4p_company`).
- **Consolidado multi-empresa** (`/consolidado`): agrega a posição (saldo/receita/
  despesa/resultado) das orgs em que o usuário é membro. Live: RPC
  `org_consolidado(de, ate)` (`0013`, `SECURITY DEFINER` escopado a
  `organization_members` do `auth.uid()`, anon revogado); demo: entidades
  sintéticas. Sem eliminações intercompany (v1). `lib/consolidado.ts` +
  `components/consolidado/ConsolidadoView.tsx`.

### Modo Administrador da plataforma (`/admin`)

Visão **cross-tenant** exclusiva do dono do SaaS (super-admin), separada do
owner-de-org. Migration **`0014`**: `platform_admins` (quem é super-admin; bootstrap
por e-mail), `plans` (mensalidades) e `subscriptions` (1 por org: plan/status/mrr).
Tudo acessível **só** pelas RPCs `SECURITY DEFINER` **gateadas por
`is_platform_admin()`** (as 3 tabelas têm RLS sem policy = nega acesso direto;
anon revogado): `admin_overview` (KPIs: orgs, ativas, trials, inadimplentes,
usuários, ativos 30d, MRR/ARR), `admin_orgs` (clientes + assinatura + atividade),
`admin_users` (contas + último acesso), `admin_plans`, `admin_set_subscription`
(configura a cobrança da org), `admin_upsert_plan`. UI em
`components/admin/AdminView.tsx` (`lib/admin.ts`): KPIs + tabela de orgs com
plano/status editáveis (define o MRR), planos e usuários. Link "Administração" na
Sidebar **só aparece** para super-admin (`isPlatformAdmin`); em demo é liberado
com dados sintéticos. Aplicado ao remoto.
- **`0015`**: `admin_growth` (novos clientes/mês) e `admin_org_detail` (snapshot da
  org p/ "ver como cliente" read-only) — gráfico de crescimento + modal no AdminView.
- **`0016`**: `mrr_snapshots` + `admin_capture_mrr`/`admin_mrr_history` (MRR mês a
  mês — snapshot real quando há, senão derivado das assinaturas); `admin_audit` +
  `admin_audit_log` (trilha das ações do admin; `admin_set_subscription`/
  `admin_upsert_plan` auditam). **Impersonação "logar como"** real:
  `POST /api/admin/impersonate` (`runtime nodejs`, **service role**, gateado por
  `platform_admins` + auditado) gera um magic link que loga como o **owner** da org
  (RLS resolve pra org dela); para voltar, logout. Gráfico de MRR + log de
  auditoria + botão "Logar como" no AdminView.
- **`0017`**: `admin_user_detail(p_user)` (gateado) — **drill-in cadastral do
  usuário**: clicar numa linha da tabela de usuários no `/admin` abre um modal com
  contato (e-mail/telefone do `auth`, nome/provedor dos metadados, confirmação,
  convidado, último acesso) e, por organização vinculada, o papel + o perfil da
  empresa (`company_profiles.profile->db`: razão social, CNPJ, cidade/UF,
  representante nome/CPF/e-mail/telefone, alçada). `getAdminUserDetail` em
  `lib/admin.ts` (demo sintético + live RPC); `UserDetailModal` no `AdminView`.

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
- Font: **DM Sans** (DS Visor) — carregada no `layout.tsx` via `<link>` do Google
  Fonts (eixos `opsz,wght@9..40,400..700`) e definida como `sans` no Tailwind
  (fallback `var(--font-onest)`/Onest). Pesos 400/500/600/700; títulos em 600,
  números-herói 700. `letter-spacing` base −0.01em, números (`tabular-nums`) com
  espaçamento **normal**. Onest/Roc Grotesk aposentadas (arquivos mantidos em
  `fonts/` como fallback). **Migração para o DS Visor** (estrutura Visor Finance +
  marca lime): tokens neutros/semânticos no `:root` (light) = paleta Visor
  (`surface-1` #f6f7f9 · `ink` #0e131e · `positive` #28aa00 · `negative` #d9000a),
  cards 14px flat (24px padding); o `AppShell` aplica `scopeClassName="ds-visor"`
  por padrão (cores Visor só no tema claro via `html:not(.dark) .ds-visor` — o
  **dark mode é preservado**).

### Commands

```bash
npm run dev        # local dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```
