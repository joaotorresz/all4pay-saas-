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

### ⚡ Identidade corporativa all4pay — **DS LEDGER** (ATIVA — escopo `.ds-visor`)

O app roda no escopo **`.ds-visor`** (aplicado pelo `AppShell` a todo o app),
que **sobrescreve** os tokens-base abaixo com a identidade **Ledger**
(editorial-terminal; refs: Vaulto/Awwwards, Mercury/Ramp). Regras VIGENTES
(editar em `globals.css` `.ds-visor` / `.a4p-canvas` + `layout.tsx`):

- **Tipografia (Fontsource, self-hosted — sem fetch externo):**
  **Schibsted Grotesk** (neo-grotesca) em TODA a UI — títulos 600, corpo 400/500,
  tracking −0.01em, **prosa em numerais proporcionais** (sem `tnum` no body: o
  tnum da Schibsted alarga ponto/vírgula). **Geist Mono em TODOS os VALORES**:
  `Money`/`BRL` carregam a classe **`.a4p-num`** e `globals.css` põe mono nela,
  em `.tabular-nums` (contextos tabulares) e nos eixos de gráfico
  (`.recharts-cartesian-axis-tick-value`, 11px). É a assinatura do sistema —
  colunas alinham como um ledger.
- **Canvas** (`.a4p-canvas`): base **#F4F3F0** (paper) com véu de lime a ≤8%
  (whisper — nunca preenchimento). Dark: near-black + véu ≤5%. O `<main>`
  `.ds-visor` é transparente.
- **Cards SÓLIDOS** (`[data-card="1"]`): `--color-white` + **hairline 1px**
  (`--color-border` = rgba(17,25,12,0.08)) + **micro-sombra** (`--shadow-card`).
  **O vidro fica SÓ nos overlays**: popover/menu/palette (`.shadow-popover`),
  Sidebar (`.a4p-sidebar`), drawers (`.a4p-glass`) — `--glass-bg-strong` + blur.
  `prefers-reduced-transparency` → sólido.
- **Cores:** títulos/ink **#11190C** · corpo/labels **#787664** (taupe) · acento
  **lime #DFFF00** (só acentos).
- **Formas:** raio dos cards **16px** (`--a4p-box-radius`) · padding 24px ·
  controles 10px · pills 999.
- **Tabelas (padrão Ledger):** cabeçalho em **micro-label** — `text-[11px]
  font-medium uppercase tracking-[0.08em] text-faint` (única exceção sancionada
  ao "sem caixa-alta") · linhas hairline (`border-border-soft`) · valores à
  direita em mono (via `BRL`).
- **Botões: "nada parece botão" TOTAL** — `Button` sem chrome nem fill escuro
  (pill; primary/accent = chip neutro sutil `surface-2` · secondary/ghost = só
  texto muted→ink). Pills de período/segmented = texto (ativo = pill discreto).
  Os FABs **Guia** e **Upload de dados** são pills BRANCOS flat; o de Upload
  saiu da Home e só aparece em `/upload`, a casa da entrada de dados. O FAB **All 4 Pay AI** é a exceção sancionada:
  **centralizado** no rodapé (`left-1/2 -translate-x-1/2`), carrega o **degradê
  oficial da marca** com texto em **`on-lime`** e, num **tile BRANCO**, o **"4" da
  marca** (`Marca4` em `AssistantWidget.tsx` — o raio do wordmark, vetorizado do
  próprio `public/all4pay-dark.png` por flood fill do glifo + contorno
  simplificado; o mesmo path vive em `public/all4pay-4.svg`). SVG inline, sem
  fetch, degradê lime→verde com id único por `useId`. Ele usa
  a variante **onda** (`--gradient-marca-onda`, os mesmos 5 stops do guia
  — `#D0FF00 → #D8FF00 → #E1FF00 → #E8FF00 → #F5FF00` — reordenados num eixo de
  100°) animada pela classe **`.a4p-onda`**: `background-size: 320%` + keyframes
  de `background-position` (7s, ease-in-out, propriedade composta — não repinta),
  desligada em `prefers-reduced-motion`. Os stops verticais originais seguem em
  `--gradient-marca` / `--gradient-marca-inv` (box de dicas).
- **Ícones: Hugeicons (Stroke Rounded) SEMPRE** (`Icon`) — traçados, leves,
  cantos arredondados; espessura padrão 1.5 (ajustável por `strokeWidth`). Nos
  cabeçalhos de card, o glifo entra num **tile discreto** (`IconTile`,
  `src/components/visao-geral/shared.tsx`: `rounded-[12px] bg-ink` + glifo lima;
  `WidgetHeader` aceita `icon`). Os ícones 3D (`Icon3D`) foram **removidos** do
  sistema — não reintroduzir (`Icon3D` segue só como alias do `IconTile`).
- **Gráficos vivos, no MESMO padrão:** eixos em mono 11px faint; toda série
  Recharts anima na ENTRADA da página via **`chartAnim(begin?)`**
  (`src/lib/chart-anim.ts`: 700ms ease-out, escalona séries do mesmo gráfico com
  `begin` 0/120/240, respeita `prefers-reduced-motion`) e responde ao hover
  (`activeDot` em linhas/áreas, `activeBar` em barras). Nunca
  `isAnimationActive={false}` (exceto âncoras invisíveis de label).

Os tokens-base abaixo são o fallback/legado (tema claro base + dark mode); a
identidade viva é a de cima.

### Tipografia vigente (promovida do Laboratório)

> **Pareamento atual:** a UI é **Hanken Grotesk** (tracking base −0.01em) e os
> **valores** ficam em **Roobert Variable** — o Lab veio com "aplicar a fonte
> também nos números" DESLIGADO. O conteúdo dos **cards** também fala Roobert
> Variable, peso 400, por uma regra POR TIPO em `.ds-visor [data-card="1"]`
> (aplicada ao card, não a `*`, para que pesos explícitos dentro continuem
> vencendo).

- **Fonte do app: `Roobert Variable`** (com fallback `Roobert`), inclusive nos
  NÚMEROS — `.ds-visor`, `.ds-visor *`, `.a4p-num`, `.tabular-nums` e os eixos
  de gráfico. O alinhamento tabular continua vindo de `tabular-nums`, não da
  família. Tracking base 0.
- **H1 da página** (`AppShell`): Variable **29/500**, tracking −0.02em,
  entrelinha 110%, sem caixa-alta.
- **H2 / `.text-h2`** (regra POR TIPO, em `globals.css`): Variable **17/400**,
  tracking −0.02em, cor ink. Vem DEPOIS do bloco que põe 600 nos títulos.
- **Título de card da Home** ("Distribuição dos gastos", "Calendário de
  transações"): o MESMO tratamento do H2 — Variable 17/400, −0.02em, sem
  caixa-alta.
- **Herói** (`.a4p-heroi`): inteiro em Variable **35/500** tracking −0.055em ·
  prefixo `R$` em **Semi Mono 30/500** ink · centavos **22** · sufixo
  ("a menos este mês") 14/200 em `#CAC4B7`.
- **Donut**: centro em Semi Mono (rótulo −0.065em · valor **18/400** −0.045em);
  legenda com o NOME em `Roobert` **13/100**, o % em Semi Mono 12/900 e o valor
  em Semi Mono 600.
- **Fluxo de caixa**: totais do período em Variable **21/400** tracking
  −0.075em; o subtítulo do período em 14/200 `#CAC4B7`.
- **Botões** (`Button`): raio **10px** (variantes não-pill).

### Laboratório de Design — regra de ouro

O Lab é **sandbox**: `DesignLabStyle` só injeta CSS quando há estado SALVO no
`localStorage`. Sem nada salvo ele não emite nada e quem manda é o design
system. E os `DEFAULT_CORES` do Lab **têm de espelhar** os tokens reais do
bloco `html:not(.dark) .ds-visor`. Quando divergem, o Lab repinta o app com
valores que ninguém escolheu — foi o que aconteceu com as semânticas
(verde-oliva `#3f6212` e tijolo `#b42318` no lugar do `#00ff62`/`#ff1100` do
DS) para todo usuário que nunca abriu o Laboratório.

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
- **Shadows (aurora glass):** var-backed — `shadow-card` (fio luminoso inset +
  ambiente suave) · `shadow-popover` (overlay) · `shadow-pill`; claro/escuro em
  `globals.css` (`:root` + `html.dark`). Nunca um `box-shadow` literal novo.
- **Glass:** `bg-glass` / `bg-glass-strong` (`--glass-bg`/`--glass-bg-strong`) +
  `--glass-edge`/`--glass-blur` — as únicas superfícies translúcidas sancionadas.
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
- **`Icon`** — conjunto **Hugeicons (Stroke Rounded)** (Iconify, prefixo
  `hugeicons`): glifos **traçados**, leves, geométricos e de cantos
  arredondados. Monocromáticos via `currentColor` → a prop `color` carrega a
  identidade all4pay (ink · muted · faint · lime · on-lime) e `strokeWidth`
  ajusta a espessura (**padrão 1.5**, do próprio set; o `Icon` reescreve o
  `stroke-width` do glifo quando você passa outro valor). SVG inline (sem fetch
  em runtime, **viewBox 24**); dados em `src/components/ui/solar-icons.ts`
  (gerados do Iconify — vide `scratchpad/gen-hugeicons.mjs`, que valida os 56
  nomes e falha se algum sumir do set). Ids internos de glifos (se houver
  `<defs>/<mask>/<use>`) são renomeados por instância (`useId` no `Icon`).
  Ícones custom (ex.: `inicio`, pentágono à la Visor) em `CUSTOM_ICONS` no
  `Icon`, sobrepondo o set gerado. As **chaves** (`house`, `trending-up`, …)
  são estáveis: trocar de set é reescrever o mapa no gerador, não o app.

App shell: `src/components/app/AppShell.tsx` — **menu vertical** (`Sidebar`,
`.a4p-sidebar`: marca no topo · busca ⌘K · grupos planos · rodapé com Modo Pro ·
tema · conta) + coluna de conteúdo com o header da página. Em < lg a Sidebar
vira drawer (hambúrguer no header, evento `a4p:toggle-nav`). Os grupos/itens
vêm de **`src/components/dashboard/nav-data.ts`** — a **fonte única**
(`SECTIONS`/`CONFIG`/`SECTIONS_PESSOAL`/`CONFIG_PESSOAL`/`leafAtivo` +
`useNavSections()`, que resolve PF/PJ · Simples/Pro · admin). The reference
composition is the **Início** dashboard (`/`) — see the Feature modules section
below.

**Busca global / Command palette** (`src/components/app/CommandPalette.tsx`):
montada no `AppShell`, abre por **⌘K/Ctrl+K** ou pelo botão de busca da Sidebar
(evento `a4p:open-search`). Busca navegação (rotas) + contatos/produtos/serviços/
vendas (via os `list*` accessors, só quando aberta) com teclado (setas/Enter/Esc).
Demo-safe; navega para a página do resultado.

---

## Feature modules

### Adesão progressiva — menu Simples×Pro + Jornada (`/comece`)

O sistema tem MUITA função; a tese de adesão é **revelar aos poucos até 100%**.

- **Menu por JOB, não por taxonomia** (`nav-data.ts`): o **Modo Simples** (padrão,
  `useModo`) mostra 5 grupos do dia a dia — **Início · Receber · Pagar · Caixa &
  Resultado · Dados & Cadastros** (~15 itens). O **Modo Pro** REVELA a
  profundidade — **Fiscal & vendas · Contabilidade · Estrutura · Inteligência ·
  Governança & Plataforma** (`pro: true`). Toda rota continua acessível; nada
  removido, só reagrupado/priorizado. O toggle comunica o que o Pro desbloqueia.
- **Jornada de Adesão** (`src/lib/adoption.ts`, `adoption/1.0.0`): motor puro,
  demo-safe. 4 estágios progressivos — **Conectar → Organizar → Analisar →
  Operar** — cada passo com `feito` derivado do **estado real** (`getRiscoInput`:
  dados importados, contatos, categorias, recebíveis) + as **rotas já vistas**
  (`RouteTracker` no AppShell grava em `localStorage` `a4p_seen_routes`).
  `montarJornada(input, vistas)` → estágios, `%`, `proximo` passo, `nivel`.
- **UI** (`src/components/comece/Jornada.tsx`): `JornadaCard` na Home (progresso +
  próximo passo; some em 100%; **handoff limpo com o `FirstRunCard`** — só aparece
  quando o primeiro dado já entrou) + `JornadaView` na página **`/comece`** (os 4
  estágios inteiros, passos riscados ao concluir, botão "Abrir/Ver X" por passo).
  Entrada "Comece por aqui" no topo do menu + na command palette.

### Correlações (drill-down & CTAs) — o número/vazio nunca é terminal

Para descobrir as funções, cada superfície **leva à próxima**:
- **`MetricCard`** (cockpit) e **`Stat`** (DRE) aceitam `href`/`hrefLabel` →
  link "ver detalhe ↗" no rodapé (sem colidir com o botão "i"). ~25 widgets do
  cockpit + os KPIs do DRE levam ao **motor de origem** (risco→`/copiloto?aba=risco`,
  inadimplência→`/inadimplencia`, decisão/autônomo, contas→conectar, DRE, etc.).
- **`EmptyState`** (`visao-geral/shared.tsx`) e **`Empty`/`EntityTable`**
  (`listas/ListChrome.tsx`) têm slot `action`/`emptyAction`: um vazio sempre
  oferece o botão que o preenche (Conectar banco, Nova venda, Novo X).
- Ações que criam algo **linkam para onde foi** (Reembolsos→aprovações/pagamentos;
  Recorrências→a receber/fluxo).

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
  não renderizam. O catálogo já traz **~55 widgets** cobrindo os motores:
  **quant** (KPIs, benchmark, tendência, previsibilidade), **inadimplência**
  (perda esperada, segmentos, alto risco, recuperação), **decisão** (Monte Carlo:
  prob. de caixa negativo, p50/p10, data de aperto; matriz de risco; impacto da
  melhor ação; plano autônomo), **contas** (caixa consolidado, maior conta, HHI),
  **risco de caixa** (runway pessimista, ruptura, stress, alertas, pilar frágil) e
  **centro de inteligência** (insights, oportunidades/ações do briefing, anomalias,
  clientes de risco), **lançamentos** (movimentos/contrapartes/ticket) e o
  **DRE do mês** (competência via `useDRE`: EBITDA, lucro líquido/bruto, margem
  bruta/líquida, receita líquida, carga tributária, CMV, OPEX, resultado
  financeiro) e **tesouraria** (`useTreasuryCore`: concentração bancária HHI,
  liquidez imediata/30d/90d, exposição líquida, caixa em 4 semanas). São
  **~94 widgets**; cada categoria mapeia num bloco de `BLOCK_ORDER`; próximas
  fases seguem para a meta de 80–150.
- **Home contextual + reordenação por IA** (`useHomeContext`): ordem-base dos
  blocos por **setor** (`a4p_company.perfil.setor` → `SETOR_BASE`) e, com o toggle
  "Reorganizar por urgência (IA)" ligado (`a4p_home_auto`, default on), reordena os
  blocos por **urgência** calculada dos motores (quant: score/runway/ruptura →
  Saúde; pendências vencidas/a vencer → Operação; insights críticos →
  Inteligência; anomalias de despesa → Despesas). O bloco no topo ganha o selo
  **"Prioridade · {motivo}"**. Empate desfeito pela ordem-base do setor.
- **Pílula de período** (`PeriodFilter`): DUAS pills — **Essa semana** e **o MÊS
  selecionado** (rótulo dinâmico "Julho 2026", não "Mês atual"). O botão do mês
  abre o painel, com o **mês de referência primeiro** e a duração depois;
  escolher 1 mês entra como `setMonth` (modo "mes"), não como range, e uma
  janela de N meses mantém o botão do mês marcado. A pílula "Personalizado" e a
  **engrenagem** saíram do header; **Personalizar Home** agora se abre pela
  command palette (⌘K → "Personalizar Home"), que é o único acesso ao drawer.
- **Gráfico herói** (`VisorHomeTop`): o valor é o **saldo em conta**
  (`saldoAtual`) e o gráfico traz **duas linhas em gradiente** — entradas em
  verde e saídas em vermelho, acumuladas dia a dia no período (só liquidados,
  pela data de pagamento) — com área suave sob cada uma e legenda. O sufixo do
  herói mostra o **resultado do período** (entradas − saídas). O box ao lado
  ("Distribuição") segue a MESMA janela e exibe o `period.label` sob o título.
- **Card de dicas** (`VisorHomeTop`): fundo no **degradê da marca invertido**
  (`--gradient-marca-inv`, os mesmos stops do FAB "All 4 Pay AI" de baixo para
  cima), com texto e controles em `on-lime`.
- **Transações recentes** (`TransacoesRecentesCard`): o **extrato** da Home —
  últimas 12 movimentações liquidadas, entradas E saídas juntas na ordem em que
  caíram no caixa, com dia · contraparte · categoria · valor com sinal. Clicar
  abre a ficha do contato. Substituiu "Últimos gastos" (só saídas).
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
Plataforma). Pilares conceituais do IULI a
replicar: Plano de Contas com "Uso Padrão" (auto-classificação), **3 datas**
(competência→DRE · vencimento→aging · caixa→DFC), venda como documento-mãe que
propaga para recebível/NF/imposto, rateio por projeto/centro de custo, DRE/DFC em
cascata com drill-down, conciliação IULI×OFX.

- **HUBS — um destino por página (menu 39 → 18 entradas).** Telas irmãs viraram
  ABAS de um hub em vez de N entradas de menu. O componente genérico é
  **`HubShell`** (`src/components/app/HubShell.tsx`): só a aba ATIVA monta, e a
  ordem/rótulo vivem numa lista `AbaHub[]` na própria `page.tsx` do hub.
  - `/contabilidade` — Razão · Fechamento · Reconhecimento de receita · Relatórios ·
    Plano de contas · Dimensões · Cronogramas · TXT Domínio · Consolidado
  - `/cadastros` — Clientes & Fornecedores · Produtos · Serviços · Projetos ·
    Centros de custo
  - `/vendas` — Vendas · Painel · Nova venda · Notas fiscais · POS · Taxas do POS
    (o POS estava **órfão do menu**; aqui fica onde se procura por ele)
  - `/recebimentos` — Contas a receber · Recorrências · Inadimplência · Boletos
  - `/pagamentos` — Contas a pagar · Reembolsos
  - `/orcamento` — Planejado × Realizado · **Posso comprar?**
  - `/copiloto` — All4Pay IA · Quant · Decisão · Risco · Autônomo
  - `/upload` — Conectar · Enviar · Conciliar · **Regras**
  A **1ª aba de cada hub é o uso diário**, então continua a um clique.

- **`AppShell` aninhado vira passthrough.** Cada tela traz o seu próprio
  `AppShell`; dentro de um hub isso duplicaria sidebar/header. `ShellGate`
  (`src/components/app/shell-nesting.tsx` — módulo client, porque `AppShell` é
  server component e não pode criar contexto) detecta o aninhamento e renderiza
  só o conteúdo **+ as `actions` do header** (senão o botão "Novo produto"
  sumiria dentro da aba). Foi o que permitiu consolidar ~20 telas **sem
  reescrever nenhuma delas**.

- **Rotas antigas redirecionam** para `hub?aba=…` (deep-links preservados):
  `/razao` `/fechamento` `/receita` `/relatorios` `/plano-de-contas` `/dimensoes`
  `/cronogramas` `/consolidado` → `/contabilidade`; `/contatos` `/produtos`
  `/servicos` `/projetos` `/centros-custo` → `/cadastros`; `/painel-vendas`
  `/nova-venda` `/notas-fiscais` `/pos/*` → `/vendas`; `/recorrencias`
  `/inadimplencia` `/boletos` → `/recebimentos`; `/reembolsos` → `/pagamentos`;
  `/decisao` `/risco` `/autonomo` `/inteligencia` → `/copiloto`;
  `/recebiveis` `/pagaveis` `/conciliacao` `/contas` → hub correspondente.
  Command palette e `guides.ts` apontam para o destino **com a aba**; o guia é
  **por aba** (`guideForPath(pathname, aba)` + `PADRAO_DO_HUB`).

- **REMOVIDOS (não reintroduzir).** Eram vitrine técnica sem uso operacional:
  `/arquitetura`, `/infraestrutura`, `/dados`, `/orquestracao`, o hub
  `/plataforma` e os motores `core/architecture`, `core/reliability`,
  `core/orchestration`, `core/datamoat` (~2.600 linhas). **`core/platform` e
  `core/treasury` FICARAM** — o primeiro é a idempotência de pagamento usada em
  `lib/pagamentos.ts` (apagar reintroduz pagamento duplicado), o segundo alimenta
  cockpit, `/contas` e o motor autônomo.

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

### Investor Update (`/investidores`)

`montarInvestorUpdate()` + `gerarTextoInvestorUpdate()` (`src/core/investor/`,
versão `investor/1.0.0`) — o relatório mensal para investidores (benchmark
Mercury/Runway): KPIs do mês (caixa, burn, runway, receita, MoM, **MRR
estimado** = share recorrente × receita mensal, margem, score) derivados da
camada quantitativa sobre o MESMO `RiskInput` — nada digitado à mão — +
destaques/atenção automáticos (fatores do score) + o **texto pronto para o
e-mail** (TL;DR / Métricas / Destaques / Pontos de atenção / asks). Campos do
fundador (empresa, destaques, pedidos) entram nas seções. Hook
`useInvestorUpdate()`; UI em `components/investidores/InvestorUpdateView.tsx`
(KPIs + "Sua parte" + preview ao vivo com Copiar). Menu no grupo Inteligência;
palette + guia cobertos. Puro, demo-safe. Datas fatiadas da string (regra tz).

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

A IA tem **duas portas para o MESMO cérebro**:

1. **FAB flutuante** (`src/components/app/AssistantWidget.tsx`, montado no
   `AppShell`) — painel à direita, disponível em toda tela. Some em
   `/all4pay-ai` (lá seria redundante e cobria o campo de mensagem).
2. **Tela cheia `/all4pay-ai`** (`src/components/ia/IAView.tsx`, entrada no menu
   logo abaixo de *Início*) — chat completo com **histórico de conversas** à
   esquerda, agrupado por recência (Hoje · Últimos 7 dias · Últimos 30 dias ·
   Mais antigas), saudação pelo primeiro nome do perfil, chips de sugestão e
   campo grande. Retomar uma conversa recarrega os turnos; "Nova conversa" zera.

**O cérebro e as peças são compartilhados** — nada de duas IAs divergindo:

- **`src/components/ia/useChatIA.ts`** — o pipeline (KB → motor nativo → Claude
  com fallback determinístico), as etapas de análise, feedback, cópia e
  `carregar()` para trocar de conversa. `onMudou` avisa a cada resposta (a
  página usa para gravar).
- **`src/components/ia/chat-kit.tsx`** — `Turno`, `MarcaIA`/`Marca4`,
  `GraficoDaResposta`, `EtapasAnalise`, `BolhaResposta` e as `CURADAS`.
- **`src/lib/ia-conversas.ts`** — histórico em `localStorage` (`a4p_ia_conversas`,
  teto de 60), demo-safe e **síncrono**: a conversa entra na lista assim que a
  primeira resposta chega. `agruparPorRecencia` compara **dias de calendário
  local** (não 24h corridas — senão "ontem à noite" cairia em "Hoje").
  Sincronizar por organização é evolução futura.

**Identidade e movimento do chat** (regras próprias — o FAB e o painel são
IRMÃOS do `<main>.ds-visor` no `AppShell`, então **nada em `.ds-visor …` os
alcança**, inclusive o Laboratório):

- **Âncoras `.a4p-ia-fab` (botão) e `.a4p-ia` (painel)** — declaradas em
  `globals.css` e registradas como **raízes** no `DesignLab` (`raizDe`,
  `PADROES`: *IA · botão · pergunta · resposta · sugestão · painel*, e o papel
  **"All 4 Pay AI"** na aba Fontes). Sem isso o picker devolvia `null` e o botão
  era ineditável.
- **Tipografia do chat:** **Roobert Variable 400, tracking −0.5px** em TODOS os
  itens (`.a4p-ia, .a4p-ia *`); os valores fogem da regra e seguem em mono
  (`.tabular-nums`/`.a4p-num`), como no resto do sistema.
- **Logo:** `MarcaIA` — o MESMO "4" da marca **girado 90°**, branco sobre o
  degradê lima. Aparece no cabeçalho, no estado vazio e em cada análise. O
  sparkle antigo saiu.
- **Abertura:** o painel entra com slide + escala + desfoque que se dissolvem
  (`.a4p-ia[data-aberto]`, cubic-bezier com overshoot suave). As mensagens e os
  chips entram escalonados (`.a4p-entra` + `--a4p-atraso`).
- **Nenhuma resposta é instantânea:** toda pergunta passa pelas **4 etapas
  visíveis** de `ETAPAS` (lendo lançamentos → cruzando histórico → conferindo
  números → redigindo), no ritmo de `RITMO` (~2,1s), com barra varrida e o passo
  concluído ganhando um check. `analisar()` roda a encenação e o trabalho em
  paralelo (`Promise.all`): para o motor nativo quem manda é o ritmo; para o
  Claude, a rede. A pergunta entra na conversa na hora — só a resposta espera.
- **Registro FORMAL:** o motor nativo e o prompt do Claude escrevem em terceira
  pessoa, com vocabulário contábil ("A receita apurada em julho soma…",
  "Recomenda-se antecipar…"), sem gíria nem tratamento direto. Os guardas
  (`corpus`/`values`/`audit`) acompanham a prosa nova.
- **Gráficos na resposta:** `responderLocal` pode devolver um `GraficoResposta`
  (`{tipo: barras|linha, titulo, tom, dados}`) — hoje em receita/despesa por
  categoria, receita por cliente, concentração, fornecedores, crescimento e
  melhor/pior mês. Quem desenha é o `GraficoDaResposta` no chat, seguindo o DS:
  **linha na cor da marca** com glow em degradê, **barras nas cores semânticas a
  70%** (`color-mix` — cor de status é sinal, não preenchimento grande), eixos em
  11px e entrada por `chartAnim()`. ⚠️ `YAxis` de barras precisa de
  `interval={0}`: por padrão o Recharts **omite** ticks que julga colidir e some
  com rótulos do meio.

**Funciona sem chave** graças a três camadas encadeadas no `responder`:
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
   ficha"; **escopa por período** quando citado — "recebi da Alpha em maio"),
   maior gasto/**recebimento** individual, por centro de custo,
   **previsão do mês**, próximo receb./pagto, média mensal, **afordabilidade**
   ("posso gastar X?"), **onde economizar** (categoria que mais cresceu MoM),
   **comparação entre dois meses** ("gastei mais em maio ou junho?"), top
   fornecedores, contagem de contrapartes, **margem/lucratividade** (resultado ÷
   receita), **crescimento** (receita MoM), **ponto de equilíbrio** (break-even =
   despesa média mensal), **pontualidade de recebimento/pagamento** (atraso
   médio dos clientes / com que eu pago — DSO/DPO, % no prazo), **receita média
   por cliente** (proxy de LTV), **gasto médio por dia** (burn diário, 30d),
   **melhor/pior mês** (por resultado ou receita; "mais prejuízo" = pior),
   **EBITDA** (receita − saídas operacionais, exclui financeiro), **receita
   líquida** (bruta − impostos), **carga tributária** (impostos ÷ receita %),
   **fluxo de caixa livre** (exclui financiamento), **peso de uma categoria na
   receita** ("quanto a folha pesa"), **mix produto × serviço**, **total
   acumulado** (histórico), **previsto do mês seguinte** ("vou receber/pagar mês
   que vem"), **runway em dias**, **entradas × saídas** e **sinônimos de
   categoria** (pessoal→Folha, luz→Utilidades),
   **resumo do dia** e **resumo do
   período** (mês/trimestre/semestre/ano — janela *trailing*). A janela é
   detectada da própria pergunta (nomes de mês com limite de palavra: maio ≠
   maior); a ordem das intenções importa (as de cima vencem; as consultivas/
   pago-vs-pendente foram auditadas adversarialmente). Perguntas **possessivas**
   de métricas fortes ("qual meu EBITDA/runway/burn/score") caem no motor
   (número real); só "o que é X" vai à KB (conceito).
2b. **Calculadoras financeiras** (10 motores puros, respondidos na hora pelo motor
   nativo — a decisão que a PME precisa simular): **financiamento/empréstimo**
   (`src/core/financing` — tabela Price/SAC), **antecipação de recebíveis**
   (`financing` `antecipar`), **conversão de taxa** mensal↔anual (`financing`
   `equivalenteAnual/Mensal` — 2%/mês = 26,82%/ano composto, não 24%),
   **precificação** (`src/core/pricing` — preço/margem/**markup**, resolve
   margem≠markup; **gross-up com impostos** `precoComImpostos` — preço que embute
   imposto p/ margem LÍQUIDA alvo) e **ponto de equilíbrio em unidades** (`pricing`
   `pontoEquilibrioUnidades` — custo fixo ÷ margem de contribuição),
   **investimento** (`src/core/investment` — valor futuro de aportes + **payback**
   + **meta de poupança** `tempoParaMeta`: em quanto tempo se junta um alvo
   guardando Y/mês a juros compostos),
   **provisão trabalhista** (`src/core/payroll` — 13º/férias/FGTS e o custo ANUAL
   real da folha), **Simples Nacional** (`src/core/tax` `calcularSimplesNacional`
   — alíquota EFETIVA por faixa `(RBT12·nominal − dedução)/RBT12` ≠ a da tabela,
   DAS do mês, teto de 4,8M/ano; Anexos I/II/III/V), **juros de mora + multa**
   (`src/core/late-fee` `calcularMora` — título vencido corrigido: multa fixa 2% +
   juros de mora 1% a.m. **pro rata die**, praxe do Código Civil/CDC, percentuais
   custom) e **desconto/acréscimo** sobre um valor (inline). Ex.: "quanto fica a
   parcela de 50 mil em 12x a 2%?", "vale a pena antecipar 10 mil?", "que preço
   vender custo 100 com margem 30%?", "quantas unidades pra empatar?", "quanto
   rende guardar 1000/mês a 1%?", "quanto provisionar de 13º de uma folha de 12
   mil?", "quanto pago de Simples no Anexo III faturando 500 mil por ano?", "quanto
   cobrar de um boleto de 1000 vencido há 30 dias?", "200 com 15% de desconto?".
   Puros/tipados/demo-safe, cada um com guarda de valor no `engine-audit`.
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

### Simulador de decisão — "posso comprar?" (`/orcamento` → aba)

`simularAquisicao()` (`src/core/aquisicao/`, versão `aquisicao/1.0.0`) — responde
a pergunta que o dono faz antes de assumir compromisso: *"tenho X de caixa e Y
entrando por mês; se eu comprar isso, o que acontece com o meu caixa?"*. Puro,
tipado, demo-safe. **Compõe `core/financing`** (Price/SAC) — não reimplementa
amortização.

- **`situacaoDe(input)`** deriva caixa · receita/mês · despesa/mês dos MESMOS
  lançamentos do resto do sistema (média 6 meses, só realizado, ignora cancelado).
  Nada é digitado à mão; o usuário pode ajustar para testar hipótese.
- **Saída:** projeção mês a mês **com × sem** a compra · mês em que o caixa fica
  negativo · veredito (`confortavel`/`aperta`/`arriscado`/`inviavel`) **sempre**
  explicado por `Fator[]` (sobra, comprometimento da renda vs. teto de 30%,
  reserva de emergência de 3 meses, juros, payback) · `Alternativa[]` com o
  número de cada uma (mais entrada, mais prazo, "caberia até R$ X").
- **`taxaImplicita(principal, parcela, n)`** descobre por bissecção o juro REAL
  de um "3.200 em 48x". Uma parcela informada vale só para o cenário digitado —
  as alternativas soltam a parcela e usam a taxa implícita, senão todas
  repetiriam o mesmo valor.
- **PF e PJ com o MESMO motor:** mudam só os `PRESETS` (veículo/imóvel/viagem/
  educação × equipamento/unidade/estoque/contratação), que trazem prazo, taxa,
  entrada e **custo de posse** típicos (`custoAnualPct` — um carro não custa só a
  parcela: IPVA, seguro, combustível).
- **Na IA:** "posso comprar um carro de 150 mil em 48x?" cai no motor nativo
  (`core/assistant/engine`), que detecta o tipo pelo texto e já embute o custo de
  posse. Vem ANTES do simulador de financiamento e exige o verbo de decisão
  ("posso/consigo/vale a pena") — a conta PURA ("financiamento de 150 mil em
  48x a 2%") continua na calculadora de parcela. Guarda de controle no corpus.
- UI: `OrcamentoShell` + `SimuladorView` (`src/components/orcamento/`).

### CNPJ → CNAE — pré-categorização por atividade (no `/upload`)

`categoriaPorCNAE()` (`src/core/cnae/`, versão `cnae/1.0.0`) — "PIX ENVIADO
12.345.678/0001-95" não diz nada; o CNAE diz. ~110 regras hierárquicas
(subclasse > grupo > divisão) sobre a CNAE 2.3: `4731→Combustível`,
`6821→Aluguel`, `6920→Serviços profissionais`, `62→Assinaturas/software`.

- **`extrairCNPJ`/`extrairCPF`** validam os dígitos verificadores — é o que
  impede a linha digitável de um boleto de virar CNPJ falso.
- **⚠️ `normalizarCNAE`:** a BrasilAPI devolve `cnae_fiscal` como **NÚMERO**, e
  todo CNAE das divisões 01–09 (agro, pecuária, extração) começa com zero, que se
  perde: `0600-0/01` chega `600001` e lido cru vira divisão **60** (rádio/TV).
  Como só a 1ª casa pode ser zero, um código completo com 6 dígitos significa
  "faltou o zero". **Sem isso, todo o agronegócio era categorizado errado em
  silêncio** (a confiança seguia alta). Não remover.
- **`lib/cnpj.ts`** — BrasilAPI com cache de 60 dias, dedup de requisições em voo
  e concorrência limitada (o mesmo fornecedor repete dezenas de vezes num extrato:
  consulta uma vez). CORS da API é `*`, então o fetch sai do navegador.
- **`lib/cnae-enrich.ts`** — passada sobre o relatório do FDIP. NUNCA sobrescreve
  o que o usuário confirmou (`aprendido`) nem classificação já confiante (≥0.9):
  o CNAE entra onde há dúvida. **Best-effort** — sem rede, o import segue igual.

### Regras de categorização — conciliação automática (`/upload` → aba Regras)

`aplicarRegras()` (`src/core/regras/`, versão `regras/1.0.0`) — o degrau acima do
aprendizado do FDIP, que só casa a contraparte EXATA ("POSTO SHELL 042" e "POSTO
SHELL 118" eram dois aprendizados). A regra pega por PADRÃO.

- **Condições combináveis** (E lógico): contraparte/descrição (`contem`/`comeca`/
  `igual`), tipo, faixa de valor e **prefixo de CNAE** (amarra com a consulta de
  CNPJ). Uma regra **sem nenhuma condição não casa nada** — pegaria tudo, e isso
  é sempre engano.
- **A ORDEM é a prioridade:** a primeira regra que casa vence, como num firewall.
  O desempate é arrastar a regra para cima — sem pesos para o usuário entender.
- **`sugerirRegra()`** fecha o ciclo: ao corrigir uma categoria na revisão do
  import, extrai o NÚCLEO do nome (`nucleoContraparte`: tira número de loja/
  terminal e ruído de extrato — "PIX POSTO IPIRANGA 771" → "posto ipiranga") e
  propõe a regra que pega todas as próximas. Só entra se o dono aceitar.
- **Persistência:** `lib/regras.ts` (localStorage, síncrono — a importação precisa
  das regras na hora) + contador de uso por regra (mostra o que trabalha e o que
  virou letra morta). Aplicação: `lib/regras-aplicar.ts`.

**CASCATA DE CLASSIFICAÇÃO** (do explícito ao especulativo — cada etapa só recebe
o que a anterior não resolveu):
`1. REGRA do dono` → `2. aprendizado exato` → `3. CNPJ/CNAE` → `4. palavra-chave`
→ `5. inferência por tipo`. A regra vence até o "aprendido" porque aprendizado é
implícito (uma confirmação pontual) e regra é explícita. Orquestrado em
`UploadView.analisarEAuto`.

### Dashboards customizados (`/dashboard/dashboards/custom`)

O construtor: a Home é curada por nós, aqui a pessoa monta a DELA. `src/core/
dashboards/index.ts` (`dashboards/1.0.0`, puro/tipado/demo-safe) traz o modelo
(dashboard → **páginas** → widgets) e, o que importa, as **FONTES** — funções
puras sobre o MESMO `RiskInput` do DRE/fluxo/risco. Widget montado à mão e
número do sistema **nunca divergem**; é o inverso do "dashboard de planilha".

- **3 famílias de fonte:** métrica (12 — saldo, receita/despesa/resultado do mês,
  a receber/pagar, vencido dos dois lados, burn, runway, títulos em aberto,
  ticket médio) · série (4 — receita/despesa/resultado 12m e **saldo acumulado**,
  reconstruído para trás a partir do saldo de hoje para a linha FECHAR nele) ·
  categoria (3 — despesa/receita por categoria e títulos por status).
  `fonteMetrica/fonteSerie/fonteCategoria` caem no padrão quando o id não existe
  — um dashboard salvo com fonte antiga abre, não explode.
- **Janela casada:** as fatias respeitam os MESMOS 12 meses das séries
  (`ultimos12Meses`). Sem isso a pizza somava o histórico inteiro (R$ 442 mil) ao
  lado de um KPI "Despesa do mês" (R$ 38 mil) e os dois números brigavam na tela.
  Guarda no `engine-audit`: total da pizza == soma da série.
- **`FonteCategoria.unidade`**: "Títulos por status" CONTA — mostrar `R$ 6` para
  6 títulos seria mentira. A `unidade` decide total, tooltip e legenda.
- **6 widgets** (`CATALOGO`, espelhando o print): KPI · Texto livre · Gráfico de
  série · Pizza/rosca · Saldos das contas · Lista da semana (CP/CR). Na Lista da
  semana o total do grupo sai **separado por lado** (+entradas · −saídas): somar
  recebível com pagável num número só não quer dizer nada.
- **UI** (`src/components/dashboards-custom/`): `DashboardsCustomView` (lista com
  Todos/Pessoal/Empresa + editor: nome, descrição, "Visível em todas as minhas
  empresas", aparência, páginas múltiplas, **Assistente IA** = `sugerirWidgets()`
  determinístico, catálogo) e `WidgetRender` (os 6 renderizadores). O catálogo é
  modal por **`createPortal`** — o `Card` do DS tem transform e prenderia o
  `position: fixed` (a mesma armadilha do modal de baixa).
- Persistência em `src/lib/dashboards.ts` (localStorage `a4p_dashboards_custom`,
  lista inteira numa chave só). Sincronizar por organização é evolução futura.
- Entrada "Meus dashboards" no grupo Início + command palette.

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
- **Sidebar** (`useTipoConta`): no PF troca os grupos por `SECTIONS_PESSOAL`/
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
- **Comparativos período × período anterior** (`src/core/cashflow/comparativo.ts`,
  `cashflow-comparativo/1.0.0` + `components/fluxo-caixa/Comparativos.tsx`): o
  topo da página. `compararFluxo(input, {dias, conta, regime, visao})` confronta
  a janela retroativa com a **imediatamente anterior de mesmo tamanho** e devolve
  `resultado`/`gastos`/`receitas` (total, totalAnterior, variação e os pontos com
  o valor do balde equivalente anterior) + `categorias` + `sankey`. Granularidade
  automática: ≤14d dia · ≤45d semana · senão mês. Quatro cards, todos com a MESMA
  anatomia — micro-label + "Ver mais ↗" · janela em datas · valor-herói · pílula
  de variação (cor pelo SINAL) · gráfico com a **linha tracejada do período
  anterior**: **Resultado líquido** (barras divergentes verde/vermelho),
  **Gastos** (barras empilhadas pelas 5 maiores categorias + legenda),
  **Receitas** e **Para onde foi** (Sankey Receita → Despesas → categoria →
  contraparte, folhas deduplicadas por nome). Categorias se distinguem por
  INTENSIDADE do mesmo matiz (o DS não tem paleta categórica), nunca por matizes
  avulsos. Hook `useComparativo(filtros)`.
- **Dados:** `useFluxoCaixa(filtros)` (`hooks.ts`) sobre `getRiscoInput`+
  `getAccountsList`. Sidebar/command palette ligam a rota.

### Extrato de transações (`/recebimentos` e `/pagamentos`)

`ExtratoTransacoes` (`src/components/visao-geral/ExtratoTransacoes.tsx`) é a
**primeira aba** do `MoneyFunnel` nas duas páginas, no modelo de extrato:

- **Carrossel de períodos** — 12 cards, um por **mês** ou por **semana** (botão
  Mês/Semana), com o resultado líquido de cada um (verde/vermelho, **zero é
  neutro**) e uma linha ligando os pontos por cima. Clicar seleciona; as setas
  rolam. A faixa é montada do mais antigo ao mais novo, então um
  `useLayoutEffect` + `requestAnimationFrame` põe o scroll no período ATUAL —
  com `isLoading` nas deps, porque enquanto carrega a faixa nem existe no DOM.
- **Barra de resumo** do período: contagem, entradas, saídas e resultado.
- **Lista agrupada por dia** ("Hoje" · "Ontem" · "dom, jul 26"), com a conta, a
  contraparte, o chip de categoria e o valor; clicar abre a ficha do contato.

`direction` decide o que a LISTA mostra (entradas em Receber, saídas em Pagar);
carrossel e resumo mostram os dois lados, porque o resultado do período só faz
sentido com entradas e saídas juntas. Datas pela **data de caixa** (pagamento
quando liquidado, vencimento quando pendente). Puro sobre o `RiskInput`.

### Funil PAGAR / RECEBER (Contas a pagar/receber · Aprovações · Reembolsos)

Submenu **PAGAR**/**RECEBER** da Sidebar = funil de contas, sobre o mesmo hub
(`getRiscoInput`). Reusam motores existentes; nada de captura duplicada (a
Caixa de Entrada vive em `/upload`).

- **Contas a pagar / a receber** (`/pagamentos`, `/recebimentos`) são **uma tela
  só**: o `MoneyFunnel` renderiza apenas o **`ExtratoTransacoes`** — carrossel de
  períodos + resumo + lista por dia — e a **baixa acontece na própria linha**.
  As abas "Pagar"/"Receber" (execução em lote) e "Títulos" saíram: eram três
  lugares para a MESMA operação. `CentralPagamentosView`/`CentralRecebimentosView`/
  `MovementsScreen` foram removidos; `/pagaveis` e `/recebiveis` (e os deep-links
  `?aba=…`) caem nesta tela — o parâmetro é ignorado.
- **Baixa na linha** (`ExtratoTransacoes`): clicar numa transação abre
  **Confirmar pagamento / Confirmar recebimento** (conta + método + **anexar
  comprovante**); já liquidada, o modal vira o comprovante do que aconteceu.
  Confirmar chama `pagarLote()` (`lib/pagamentos.ts`) ou `receberLote()`
  (`lib/recebimentos.ts`): **idempotente** (reusa
  `FinancialPlatform.processarPagamento` do `core/platform` — reenviar o mesmo
  título não move dinheiro 2x) → **liquidar** (`liquidarImported`: marca pago +
  paid_date + **move o saldo** da conta; live: Supabase). Comprovante por
  movement em `localStorage` (`anexarComprovante`/`comprovanteDe`); a coluna de
  status mostra pago/recebido/pendente.
  - ⚠️ **Overlays dentro de `Card` vão por `createPortal` no `<body>`.** O `Card`
    do DS tem `transform` (a micro-elevação) e um ancestral transformado vira o
    **bloco de contenção** de qualquer `position: fixed` — sem o portal o modal
    nasce do tamanho do card e cai centrado fora da dobra. Vale para o modal de
    baixa e para o `useToast` (`listas/ListChrome.tsx`).
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

### Upload de dados (`/upload`) — Entrada de dados unificada

A página **`/upload` "Entrada de dados"** (`src/components/ingestao/IngestaoView.tsx`)
é a central única de ingestão, em **3 abas**: **Conectar** (Open Finance) ·
**Enviar** (`src/components/upload/UploadView.tsx`: extrato em lote CSV/OFX/TXT
pelo FDIP **ou** documento individual PNG/JPG/PDF por OCR; a revisão é a
`RevisaoImportacao`) · **Conciliar** (`components/conciliacao/ConciliacaoView.tsx`:
Open Finance × títulos previstos, baixa por match + avaliação por IA).
`/inbox`, `/import`, `/conciliacao`, `/contas` e `/conciliacao-bancaria`
**redirecionam** para cá (a visão IULI×OFX paralela foi aposentada — uma única
conciliação). Os antigos `InboxView`/`ImportView`/`lib/inbox` foram removidos.

**Revisão da importação** (`src/components/upload/RevisaoImportacao.tsx`): resumo
(lançamentos/entradas/saídas/fornecedores/recorrentes) + painel **"Custos
recorrentes detectados"** — o "boleto fixo" da empresa: total `custoRecorrenteMensal`
por mês + lista `custosMensais` (contraparte · categoria · cadência ·
`mediaMensal`), com as receitas recorrentes separadas — + contatos a cadastrar +
amostra classificada + confirmação (`aplicarOnboarding`).

**Wizard rápido** (`src/components/upload/UploadWizard.tsx`): modal de **3 etapas**
que **não navega**, aberto pelo evento `a4p:open-upload`. O FAB **"Upload de
dados"** (documento avulso, manual) **saiu da Home e mora em `/upload`**
(`IngestaoView`): a Home ficou com um FAB só, o da IA, e o botão está na casa
dele — vale para qualquer aba da esteira e abre por cima dela. O `UploadWizard`
está montado nos **dois** lugares (`OverviewGrid` e `IngestaoView`) — sem o
ouvinte na tela ativa o evento não teria efeito:
1. **Enviar** — caixa arrastável (boleto/comprovante/nota PNG·JPG·PDF; OFX/CSV em lote).
2. **Leitura inteligente** — `lerDocumento()` (`src/lib/ocr-ingest.ts`: OCR por IA/
   local, ou FDIP p/ extrato) → `analisarDocumento()` (`src/lib/upload-doc.ts`):
   decide a **ação** (Vou pagar/receber · Paguei/Recebi), faz o **cross-check do
   beneficiário** contra os Contatos (por CNPJ/CPF ou nome), detecta **baixa** de um
   agendado (comprovante que casa com pendente ±2% do mesmo tipo), sinaliza
   beneficiário **novo** (sugerir cadastro), detecta **custo recorrente** (o
   beneficiário aparece em 3+ meses do histórico → "~R$X/mês" + sugestão de criar
   recorrência; o histórico vem de `getRiscoInput().movements` via o parâmetro
   `historico` — forma mínima `MovimentoHistorico`) e gera **ideias**.
3. **Confirmar** — campos editáveis (valor/vencimento/categoria) + toggle de
   cadastrar o contato novo → `confirmarDocumento()` grava no sistema (demo:
   `appendImported()` anexa 1 lançamento ao dataset, partindo de um snapshot do seed
   p/ não escondê-lo; live: cria contato/lançamento no Supabase, ou dá baixa no
   pendente) → `invalidateQueries()` reflete em dashboard/DRE/risco/Upload.

**OCR REAL** (`POST /api/inbox/ocr`, `runtime nodejs`): a visão do **Claude**
(Anthropic API, `fetch` cru — sem SDK) lê imagem/PDF e devolve os campos
estruturados + confiança por campo (JSON). Gated por `ANTHROPIC_API_KEY`
(`ANTHROPIC_MODEL` opcional, default `claude-sonnet-5`); `GET` reporta
`configured`. **OCR LOCAL (fallback sem chave)** (`src/lib/ocr-local.ts`): sem
`ANTHROPIC_API_KEY`, imagens caem no **Tesseract.js** (WASM, roda no navegador,
grátis, import dinâmico — não pesa o bundle) → `ocrLocalImagem(file)` transcreve
e `extrairCampos()` (heurísticas regex pt-BR: valor/vencimento/CNPJ/CPF/linha
digitável/banco/beneficiário) monta o MESMO `DocExtraido`. **PDF sem chave**
também é lido localmente: `ocrLocalPdf()` **rasteriza a 1ª página via pdf.js**
(`pdfjs-dist`, worker do CDN na versão exata) num canvas PNG → Tesseract. Precisão
menor → confiança capada em 0.82, entra como "revisão" para o operador confirmar.

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
  recorrências (mensal/semanal) com `tipo` (custo × receita recorrente) e
  `mediaMensal` (total ÷ meses observados), assinaturas, sazonalidade, e os
  **custos recorrentes/mensais**: `custosMensais` (saídas com cadência, maiores
  primeiro) + `custoRecorrenteMensal` (o "boleto fixo" do mês — soma das médias).
  **Grafo** + **plano de setup** (`montarPlano`): categorias, centros de custo,
  recorrências e **estimativas** (receita/EBITDA/margem/recorrente). **Central
  de confiança** (`centralConfianca`): total/lidos/alta/média/baixa + pendências.
- **Auto company setup / correlação no sistema inteiro:** `aplicarOnboarding(report)`
  (`src/lib/fdip.ts`) → `montarDataset()` converte os lançamentos lidos em
  `movements`+contas+parties. **Demo:** grava no store `src/lib/imported.ts`
  (localStorage) que vira a FONTE dos acessores — `getRiscoInput()`,
  `getReceivables/Payables/Accounts/DailyCashflow/Sales`, `getOpenMovements`,
  `listParties` leem `importedMovements()/importedAccounts()/importedParties()
  ?? seed`. **Live:** cria parties/categorias/centros **e os movimentos** no
  Supabase. A confirmação invalida o React Query → dashboard/DRE/risco/quant/
  decisão/copiloto/autônomo/dados/contatos passam a refletir o upload. Botão
  "Limpar dados importados" reverte (demo). Amostra de 12 meses em `sample.ts`
  (+ `public/exemplos/extrato-exemplo-all4pay.csv`). UI: aba **Enviar** de
  `/upload` (`UploadView` + `RevisaoImportacao`).

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
- **Roobert (self-hosted, `public/fonts/`):** quatro cortes estáticos —
  **Light** (100–350) · **Regular** (360–440) · **Medium** (450–550) ·
  **SemiBold** (560–800) — em faixas de `font-weight` que NÃO se sobrepõem (o
  browser escolhe o arquivo pela faixa). A **variável** (`roobert-variable.ttf`)
  entra numa família própria, **`Roobert Variable`**, para não competir com os
  estáticos; serve para testar pesos intermediários no Laboratório.
- Fontes (DS Ledger): **Schibsted Grotesk Variable** (UI) + **Geist Mono
  Variable** (valores) — importadas no `layout.tsx` via **Fontsource** (npm,
  self-hosted, sem fetch externo) e definidas como `sans`/`mono` no Tailwind.
  Títulos 600 · corpo 400/500 · heróis mono 600. DM Sans/Roobert/Onest/Roc
  aposentadas (arquivos antigos seguem em `src/app/fonts/` sem uso). O `AppShell`
  aplica `scopeClassName="ds-visor"` por padrão (paleta clara via
  `html:not(.dark) .ds-visor` — o **dark mode é preservado**).

### Commands

```bash
npm run dev        # local dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm run smoke      # roda os motores puros (src/core/*) sobre entradas normais +
                   # de borda e falha (exit 1) se algum número virar NaN/Infinity
                   # ou um score sair de [0,100]. Rede de segurança numérica dos
                   # 10 motores (risco/quant/inad/decisão/executivo/fluxo/DRE/
                   # autônomo/tesouraria). Usa scripts/ts-alias-loader.mjs
                   # (resolve @/ → src/) + --experimental-strip-types.
npm run corpus     # dispara ~247 frases pt-BR (formais + coloquiais) em
                   # responderLocal e falha (exit 1) se alguma cair no intent
                   # errado. Guarda de roteamento da IA nativa (assistant/engine):
                   # protege contra colisões de regex ao mexer nos intents.
npm run values     # complementa o corpus: sobre um dataset determinístico com
                   # respostas fechadas, exige que os NÚMEROS de cada intent
                   # (margem %, ponto de equilíbrio, LTV, concentração, DSO,
                   # gasto/receita/resultado/saldo…) batam exatamente. Guarda de
                   # corretude das FÓRMULAS (o corpus guarda o roteamento).
npm run edge       # crash-safety: dispara ~30 perguntas sobre 7 datasets
                   # DEGENERADOS (vazio/cancelado/pendente/futuro/negativo) e
                   # falha se responderLocal lançar exceção ou devolver vazio.
npm run kb         # cobertura da base de conhecimento: ~100 conceitos "o que é X?"
                   # devem resolver via buscarKB (~97 verbetes: métricas, fiscal,
                   # bancário, recebíveis, societário). Falha se algum sumir/for
                   # sombreado (protege a camada educativa).
npm run audit      # guarda de regressão dos bugs de auditoria (scripts/engine-
                   # audit.mts): valores fechados (cascata DRE, EBITDA, FCF, carga,
                   # receita líquida, peso na receita, contraparte por período) +
                   # invariantes direcionais dos motores proprietários (score de
                   # saúde, crédito, ruptura: saudável > crítica) + idempotência
                   # (ledger, fila, appendImported) + tamper-evidence + robustez a
                   # dados vazios. Cobre também aquisicao (valores fechados do
                   # caso real + degenerados), cnae (zero à esquerda, boleto que
                   # não vira CNPJ) e regras (regra sem condição não pega tudo,
                   # variação do fornecedor pega numa regra só).
                   # TZ=America/Sao_Paulo.
npm run tz         # fronteira de mês em fuso UTC-3 (força TZ=America/Sao_Paulo):
                   # `new Date("YYYY-MM-DD")` é meia-noite UTC → no dia 1, em
                   # UTC-3, getMonth() local cai no mês anterior. Exige que
                   # série/DRE/liquidez enxerguem o mês corrente. SEMPRE parseie
                   # data-só como `new Date(s + "T00:00:00")` (local) ou fatie a
                   # string; NUNCA getDate/getMonth de um Date UTC para exibir.
npm test           # suíte completa: typecheck + smoke + corpus + values + edge
                   # + kb + tz + audit (8 guardas). Rode antes de commitar mudanças
                   # no motor da IA / core/* / lib de dados. Também roda no CI
                   # (.github/workflows/ci.yml) em push/PR.
```
