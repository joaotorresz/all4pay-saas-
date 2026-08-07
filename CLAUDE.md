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

App shell: `src/components/app/AppShell.tsx` — **barra superior** (`TopBar`) +
**menu vertical em ACORDEÃO** como CARTÃO flutuante.

- **`TopBar`**: marca à esquerda e, à direita, **três ícones limpos** —
  Configurações · sino (Anúncios) · **⋮**. Nada mais. O resto das ações globais
  (busca ⌘K, perfil, ajuda, tema, sair) mora DENTRO do ⋮: uma barra com sete
  controles disputa atenção com o conteúdo, e o conteúdo é a razão da tela
  existir. O sino usa um **ponto**, não um número — ele diz "tem coisa nova"; a
  contagem exata é da tela de anúncios, e um badge numérico aqui vira um número
  que ninguém zera sem abandonar o que estava fazendo. `bell` e `more-vertical`
  entraram em `CUSTOM_ICONS` (o set gerado não os traz), desenhados no mesmo
  padrão: traço 1.5, cantos arredondados, viewBox 24. A marca subiu para cá
  porque, presa no cartão do menu, ela encolhia junto e sumia ao recolher.
- A Sidebar virou cartão com raio e respiro; o rodapé dela mantém Configurações,
  Modo Pro e a conta. Busca e tema saíram de lá (viraram duplicata da TopBar).
  **Criar e o botão de recolher dividem a MESMA linha** no topo do cartão —
  empilhá-los custava uma faixa de altura para nada; recolhida (68px) eles
  voltam a empilhar, porque lado a lado não cabem. O recolher tem fundo cinza
  do DS (`surface-2`): sem ele o controle só existia no hover, e um botão que
  aparece ao passar o mouse é um botão que metade das pessoas nunca acha.
- **TopBar e Sidebar são o MESMO material — e o material é o do CARTÃO**
  (`.a4p-topbar` entra na regra de `.a4p-sidebar` em `globals.css`): branco
  sólido, raio 20px e o **mesmo hairline dos boxes da Home**, que agora vive no
  token **`--a4p-hairline`** (`#f1f3f5` claro · `#232323` escuro) consumido pelos
  dois lugares — `.ds-visor [data-card="1"]` e o chrome. Estilizar um sem o outro
  faz a moldura do app parecer duas peças de sistemas diferentes em volta do
  conteúdo.
  ⚠️ **Sólido, não vidro.** As duas peças eram `--glass-bg-strong` + `backdrop-
  filter`, e ao rolar o conteúdo aparecia POR BAIXO da barra de cima — ela lia
  como se tivesse um fundo próprio atrás. Chrome que mostra o que está sob ele
  não separa nada, e separar é a função dele.
- A **marca da TopBar** é 20% maior que os 22px originais (26px); a barra subiu
  para 60px para acomodá-la sem apertar os três ícones.
- **Item selecionado do menu = a cor do FUNDO DA PÁGINA** (`bg-surface-1`, tanto
  no grupo quanto na folha): dentro do cartão branco do menu, o ativo vira um
  recorte do canvas — a mesma relação que o conteúdo tem com os boxes da Home.
  Era `surface-2` no grupo e branco na folha (invisível sobre o cartão branco).

Menu vertical em ACORDEÃO
(`Sidebar`, `.a4p-sidebar`), na taxonomia do ERP: marca · **Criar** · busca ⌘K ·
grupos que abrem · rodapé com Configurações, Modo Pro, tema e conta.

- **Grupos** (`SECTIONS` em `dashboard/nav-data.ts` — a fonte única): Início ·
  All 4 Pay AI · Dashboards · Cadastros · DRE & DFC · Orçamento · Movimentações ·
  Vendas e NFs · Compras · Contabilidade · Entrada de dados · Inteligência (Pro) ·
  Governança (Pro) · Comece por aqui · Ajuda. `Section.href` presente ⇒ o grupo
  **é** um destino (folha, sem chevron) — é assim que Início, Orçamento e Ajuda
  ficam no mesmo nível dos que abrem.
- ⚠️ **Um grupo aberto por vez.** Com quinze grupos, deixar todos abertos
  devolveria a lista de 60 itens que o agrupamento existe para evitar — o menu
  viraria rolagem em vez de índice. O grupo da rota atual abre sozinho e não
  fecha: o menu tem de dizer onde você está mesmo depois de você abrir outro
  grupo para explorar.
- O marcador lima do item ativo fica à **direita**: à esquerda competiria com o
  fio vertical que amarra os filhos ao pai, e os dois juntos viram ruído.
- **Recolhida** vira trilho de ícones; clicar num ícone expande E abre o grupo —
  recolher não pode custar o acesso.
- **A borda direita ARRASTA** (`role="separator"`): largura de 200 a 420px,
  guardada em `a4p_sidebar_width` por usuário; duplo clique restaura os 240
  padrão. Arrastar até quase fechar **recolhe** em vez de espremer o rótulo até
  virar reticências, e arrastar o trilho recolhido para a direita o **reabre**.
  Os listeners de `pointermove/up` ficam no `document`, não na alça — o ponteiro
  sai da barra assim que ela alarga, e presos à alça o arrasto morreria no
  primeiro pixel. A transição de largura é desligada durante o gesto: com ela, a
  barra persegue o ponteiro com atraso e o arrasto parece travado.
- **Criar** (`components/app/CriarNovo.tsx`, montado no `AppShell`, evento
  `a4p:criar`): painel de duas colunas (Cadastros · Movimentações). ⚠️ Não
  reimplementa formulário nenhum — cada item navega para a tela que já cria
  aquilo ou abre o MESMO modal dos lançamentos; um segundo caminho de criação
  divergiria do primeiro no dia em que um campo mudasse. No modo PF a lista é
  curta (não há venda, contrato nem NF).
- Guardas no `engine-audit`: rota duplicada, grupo sem destino, grupo sem ícone,
  tela principal fora do menu e cobertura do dia a dia no Modo Simples.

Em < lg a Sidebar vira drawer (hambúrguer no header, evento `a4p:toggle-nav`).
Os grupos/itens vêm de **`src/components/dashboard/nav-data.ts`** — a **fonte
única** (`SECTIONS`/`CONFIG`/`SECTIONS_PESSOAL`/`CONFIG_PESSOAL`/`leafAtivo` +
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
    Plano de contas · Dimensões · Cronogramas · Envio das NFs · TXT Domínio ·
    Consolidado
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

### ⚠️ UMA VERDADE SÓ — `src/core/indicadores` (a camada canônica)

**Uma função por indicador. Nenhuma tela calcula indicador por conta própria.**
Se um número aparece em duas telas, ele sai daqui nas duas. Pura, tipada,
demo-safe, sem I/O e sem relógio (`hoje` vem do `RiskInput`). Versão
`indicadores/1.0.0`.

O defeito que ela existe para matar: cada tela somava os lançamentos do seu
jeito, e nenhuma estava "errada" isoladamente — estavam respondendo perguntas
diferentes com o mesmo rótulo.

- **`convencoes.ts` — as regras por escrito**, em código. Quatro perguntas, uma
  resposta cada:
  1. **SINAL** — `amount` é MAGNITUDE; a direção vive em `type` e em lugar
     nenhum mais. `assinado(m)` soma entrada e subtrai saída; ninguém escreve
     `-m.amount` à mão. **Saldo nunca é exibido em módulo** (`Math.abs` sobre um
     caixa negativo não formata, inverte).
  2. **O QUE CONTA** — `liquidado(m) = status === "pago"`, uma definição só. O
     sistema tinha três (`status==="pago"`, `paid_date != null`,
     `status !== "cancelado"`), e elas discordam justamente nas linhas que
     importam. `paid_date` é a DATA de um fato; quem diz que o fato aconteceu é
     o `status`.
  3. **QUAL DATA** — `dataDe(m, regime)`. No regime de **caixa** um movimento
     não liquidado **não tem data** (devolve `null`): o `paid_date ?? due_date`
     de várias telas fazia um pendente futuro cair no caixa de hoje.
  4. **O SALDO** — `saldoEm(input, data)`. O nível vem do `balance` das contas
     (o banco é a autoridade); os movimentos explicam a VARIAÇÃO, não o nível.
     Passado = saldo de hoje menos os liquidados depois; futuro = mais os
     previstos até lá. `saldoAbertura` é o ponto de partida de todo acumulado.
- **`janela.ts` — o recorte de tempo como TIPO.** ⚠️ Um intervalo invertido
  (`de > ate`, o caso "maior que hoje E menor que o fim do mês passado") vira
  `vazia: true` + `motivo`, e o indicador devolve 0 **com aviso**. Zero mudo
  lê-se "não há nada" quando a verdade é "você pediu um intervalo que não
  existe". `contemHoje` separa **"mês selecionado" de "hoje"** — o rótulo "este
  mês" só aparece quando o mês navegado é o corrente.
- **Os 10 indicadores** (`index.ts`), cada um devolvendo `{ valor, procedencia }`
  — de quantos lançamentos saiu, sob que regime, em que janela e por que
  fórmula: `saldo` · `entradas` · `saidas` · `resultado` · `burn` · `runway`
  (em DIAS; `runwayMeses` é ÷30, nunca um segundo teto) · `mrr` · `arr`
  (= MRR×12) · `inadimplencia` · `receitaTributavel`. `painelIndicadores()` roda
  os dez sobre a MESMA janela — é a forma preferida de consumo.
  - `runwayDeFluxo(saldo, liquido)` isola a FÓRMULA para os simuladores: um
    cenário é hipotético, mas o runway dele sai da mesma conta.
  - `receitaTributavel` exclui transferência/resgate/empréstimo/receita
    financeira. ⚠️ Regex ancorado em `\b` — sem isso `aporte` casa dentro de
    "transp**orte**" e um frete sai da base do imposto.
- **`reconciliarSaldo(input)`** — a conta que faltava entre o **Razão e o
  extrato**. A diferença nunca foi misteriosa: é títulos em aberto + saldo
  anterior ao histórico importado + liquidados sem data. Exibida no `/razao`
  (`ConciliacaoCaixa`).
- ⚠️ **O razão só posta o LIQUIDADO** (`lancamentosDeMovimentos` em
  `core/ledger/chart.ts`). Postar previstos debitava "Caixa e equivalentes" com
  dinheiro que não está na conta — era isso que descolava o balancete do extrato.
- **Já migrados** para a camada: Home (`VisorHomeTop`), `lib/aggregations`
  (`dailyCashflow`/`dailyCashflowRange`), `lib/ledger`, `core/quant`
  (indicators + score), `core/paineis`, `lib/recorrencias`, `core/investor`,
  `core/executive/scenario`. **A migração das demais telas segue por onda** —
  a regra vale para código novo desde já.

**`npm run consistencia` — A MATRIZ DE CONSISTÊNCIA CRUZADA** (14 linhas,
`scripts/consistencia.mts`, dentro de `npm test` e do CI). As outras guardas
verificam se um motor está certo sozinho; esta verifica se **dois caminhos
diferentes chegam ao mesmo número** — Home × canônico, DRE × canônico, gráfico
diário × total do período, risk-engine × quant × canônico (burn/runway), painel
de assinaturas × Investor Update × canônico (MRR), razão × extrato. É a guarda
que impede os defeitos de voltarem: enquanto ela não existia, a mesma pergunta
tinha resposta diferente por tela e ninguém descobria até um cliente conferir.

### ⚠️ INGESTÃO — `src/core/ingestao` (o pipeline ÚNICO de entrada)

Toda porta por onde um lançamento entra passa por aqui: extrato em lote
(CSV/OFX), documento avulso (OCR), Open Finance, planilha, recorrência. Antes
eram DOIS pipelines com taxonomias diferentes, e o mesmo gasto entrava com nomes
diferentes conforme a porta. Puro, tipado, demo-safe. Versão `ingestao/1.0.0`.

- **`chave.ts` — `chaveIdempotencia`**: SHA-256 de **conta · data · valor em
  CENTAVOS · sinal · descritivo normalizado**. ⚠️ NÃO inclui id da linha, nome
  do arquivo nem horário do upload — se incluísse, reimportar o mesmo extrato
  geraria chaves novas, que é o que produz a base duplicada. SHA-256 e não um
  hash de 53 bits: uma colisão aqui descarta um lançamento REAL, em silêncio.
  - **`normalizarDescritivo`** tira ruído bancário (`PIX`/`TED`/`ENV`/`REC`…),
    sufixo societário e sequências de 4+ dígitos (terminal/NSU/autorização).
  - ⚠️ **`chaveAproximada`** (conta·data·valor·sinal, SEM descritivo) existe
    porque a chave exata não resolve tudo: o mesmo lançamento sai do OFX e da
    API com textos diferentes, e nenhuma normalização honesta os cola sem colar
    também o que é diferente. Chave exata bate ⇒ pula. Aproximada bate ⇒
    **suspeita**, que **ENTRA marcada** — descartar sozinho apagaria duas vendas
    legítimas de mesmo valor no mesmo dia.
- **`taxonomia.ts`** — a lista ÚNICA de categorias, em português, com `natureza`.
  ⚠️ Uma categoria de RECEITA nunca classifica uma SAÍDA (e vice-versa):
  "pagamento ao Mercado Pago" é despesa mesmo casando com o padrão da
  plataforma. O desconhecido cai em "Outras receitas/despesas" com confiança
  **0.4** — é uma ADMISSÃO de que não se sabe, e a tela precisa destacá-la.
- **`prepararIngestao()` NÃO GRAVA.** Devolve um `PlanoIngestao` (linhas +
  resumo + classificação por categoria + contrapartes novas); gravar é outra
  chamada, depois da confirmação. Importar deixou de ser um botão que escreve.
- ⚠️ **O descritivo BRUTO é preservado em campo próprio** (`descritivo_bruto` em
  `movements`, `descritivoBruto` no plano). `description` é editável e
  `category` é classificação nossa; nenhum dos dois serve de evidência de
  origem, e é ela que resolve "esse lançamento não é meu".
- **`planejarLimpeza()`** — a limpeza RETROATIVA. ⚠️ Mantém o **PRIMEIRO** de
  cada grupo (id estável), porque é ele que baixas, conciliações, comprovantes e
  os lançamentos do razão (`mov:<id>`) já referenciam. Devolve RELATÓRIO com
  impacto em caixa; quem apaga é a tela, depois de mostrar — limpeza automática
  é indistinguível de perda de dados.
- **UI:** `PrevisaoImportacao` (a pré-visualização, em `/upload` → Enviar) e
  `LimpezaDuplicatas` (aba **Duplicatas** de `/upload`).
- **No banco (0023):** `movements.chave/descritivo_bruto/origem` + **índice
  ÚNICO parcial** `(org_id, chave) where chave is not null`. É o que transforma
  "o app tenta não duplicar" em "o banco não deixa". O `insert` virou `upsert`
  com `ignoreDuplicates` — um `insert` puro derrubaria as 499 linhas boas do
  lote junto com a repetida. Parcial porque o histórico anterior não tem chave.

### ⚠️ ONDA 7 — CONTROLES QUE FAZEM O QUE PROMETEM

**`src/core/controles/index.ts`** declara, para cada controle estrutural, o que
ele DEVE fazer. ⚠️ "Zero controles sem destino ou sem efeito" só é verificável
se alguém escrever qual É o destino — um botão que não faz nada é
indistinguível de um que faz algo invisível, e a diferença mora na intenção de
quem o escreveu, que não fica no código.

A guarda (linha 28 da matriz) cobra: navegação com destino que EXISTE no
inventário e que **não é alias** (senão o botão leva a um redirecionamento
visível a cada clique) · ação com efeito declarado · interruptor com papel ARIA
· sobreposto que fecha por Esc · e a regra das destrutivas. Provada quebrando
os cinco casos.

⚠️ A lista cobre os controles ESTRUTURAIS, não cada `<button>` do produto: uma
lista que tenta ser exaustiva envelhece na primeira tela nova e vira ficção.

- **`AcaoDestrutiva`** (`components/ui/`) — confirmação **e** desfazer.
  ⚠️ As duas metades resolvem coisas diferentes: a confirmação impede o
  acidente, mas quem clica em "Sim" por reflexo não leu; o **desfazer** é o que
  protege quem estava distraído, que é exatamente quem erra. Por isso
  `onConfirmar` devolve a função de reversão — sem ela não há o que oferecer. O
  foco abre no botão SEGURO (Cancelar): abrir em "Confirmar" faz um Enter
  distraído executar a ação. `clearImported` passou a devolver o restaurador
  (snapshot em memória; some ao recarregar, o que basta para 8 segundos).
  A guarda aceita `desfaz: false` só quando a ação mostra o impacto ANTES — é o
  caso da limpeza de duplicatas, que lista o que sai e quanto muda no caixa.
- **Cabeçalho de tabela FIXO** — regra GLOBAL em `globals.css`
  (`.ds-visor thead { position: sticky }`), não 29 edições. O produto tem 29
  tabelas e só 4 tinham cabeçalho fixo; corrigir uma a uma deixaria a trigésima
  de fora no dia em que fosse escrita. Fundo branco é obrigatório (sem ele as
  linhas passam por baixo e o texto se sobrepõe).
- **"Nova empresa" saiu do painel Criar** e vive em Administração. Criar tenant
  é uma organização com isolamento, membros e cobrança próprios; o painel
  explica onde ela está em vez de simplesmente sumir.
- **Modo Pro**: `role="switch"` + `aria-checked`, alterna por **Espaço** com o
  foco no controle (verificado no browser).

### ⚠️ ONDA 6 — UMA SÓ PORTA: o inventário de rotas

**`src/core/rotas/inventario.ts`** é a fonte da verdade para o menu, o teste e o
suporte. Toda rota viva tem entrada com **nome único**, **dono** (módulo que
responde), **status** (`canonica` · `aposentando` · `interna`) e, quando em
aposentadoria, **data-limite** — sem data, "vamos aposentar" é intenção que
nunca vence.

⚠️ **A guarda VARRE `src/app/**​/page.tsx`** e confronta com o declarado. Falha
nos dois sentidos: rota publicada sem declaração (é assim que uma rota nova
entra sem ninguém ver) e entrada sem página (o suporte manda o cliente para um
404). Provado quebrando os dois. Também cobra: nome único por tela, dono em
todas, data em toda aposentadoria, coincidência com o mapa de consolidação, e
nenhum alias com página publicada por baixo.

O placar sai a cada execução: `82 rotas publicadas · 76 canônicas · 6 em
aposentadoria`.

- **Nomes únicos.** A guarda achou quatro pares "duas telas, um nome" —
  `Início` em `/` e `/dashboard`, `Orçamento` em `/orcamento` e em
  `registrations/budgets`, `Fluxo de Caixa` em `/fluxo-caixa` e no relatório,
  `DRE` nas duas versões. Resolvidos: **Painéis** · **Planejado × Realizado** ·
  **Fluxo de caixa (relatório)** · **DRE (versão anterior)**. Dois nomes iguais
  tornam duas abas abertas indistinguíveis — é o P1-16 pela porta dos fundos.
- **Menu = tela.** Eram **33 divergências** entre o rótulo do menu e o título da
  tela. Clicar num nome e chegar em outro faz a pessoa duvidar de que clicou
  certo, e num produto com 82 rotas duvidar do caminho é perder o caminho.
  Guarda: rótulo do menu == nome da tela (rotas sem query; a aba de um hub tem
  nome próprio, legitimamente).
- **Registro de acesso aos aliases** (migration 0025, `rota_alias_acessos` +
  `registrar_acesso_alias`). ⚠️ "Remover o alias quando ninguém mais usar" só é
  possível se alguém contar — sem contagem, desligar é aposta: ou se remove cedo
  e um cliente perde o favorito, ou se mantém para sempre e a lista vira
  cemitério. O middleware conta por `event.waitUntil` (o 308 sai na hora; a
  contagem termina depois) e a falha é engolida de propósito — **a única exceção
  sancionada** à regra de não engolir erro: telemetria não derruba navegação.
  `anon` pode registrar porque o clique num link antigo costuma vir ANTES do
  login. `uso_dos_aliases(dias)` responde quem ainda usa.
- **`/dashboard/administration/routes`** (`InventarioRotasView`) — o inventário
  legível por quem atende. Um inventário que só o teste lê é metade de um
  inventário: com um print na mão, o suporte precisa responder em dez segundos
  se a rota existe, quem responde por ela e se vai continuar existindo.

### ⚠️ MAPA DE CONSOLIDAÇÃO — `src/core/rotas/consolidacao.ts`

**Fundir não é apagar.** A rota legada quase sempre faz UMA coisa melhor que a
canônica; apagá-la sem portar essa coisa é perda funcional que ninguém
registra — o usuário descobre meses depois procurando um painel que sumiu, e aí
já não há quem lembre que ele existia.

`FUSOES` é a decisão escrita ANTES da refatoração. Cada par declara `canonico`,
`aposentar`, o `porque` da escolha e a lista `portar` — o que precisa existir na
canônica antes do desligamento, cada item com o **custo de perder** e um
`feito`. Versão `consolidacao/1.0.0`.

⚠️ **A invariante que dá valor ao mapa** (guarda na matriz): *nenhuma rota entra
em `ALIASES` enquanto tiver item pendente*. Sem essa trava o mapa vira intenção,
e intenção não impede perda. A guarda também publica o placar a cada execução
(`3/8 fusões prontas · 10 itens a portar`), para a dívida não virar conhecimento
tribal.

**Os oito pares** (canônico ← aposentar): Cadastros `/dashboard/registrations` ←
`/cadastros` · Títulos `/dashboard/financial/accounts-and-transfers` ←
`/recebimentos` `/pagamentos` · DRE `/dashboard/reports/dre` ← `/dre` · Saldo
(não aposenta nada — o defeito era de rótulo) · Impostos
`/dashboard/sales-invoices/tax-provisioning` ← `/impostos` · IA `/all4pay-ai` ←
`/copiloto` · Assinaturas `/dashboard/sales-invoices/subscriptions` ← a aba de
Receber · Conciliação `/upload?aba=conciliar` ← `/conciliacao*`.

**Prontas e colhidas:** saldo, assinaturas, conciliação.

- **Item 4 (saldo) — `BaseDoSaldo`** (`components/movimentacoes/`). A função de
  saldo já era uma só desde a ONDA 1; o que faltava era cada tela DIZER o
  recorte. Agora `/fluxo-caixa` declara **projeção** (hoje + previstos até o fim
  da janela), o extrato declara **variação** (entradas − saídas, pode ser
  negativa) e o painel financeiro declara **posição** (saldo das contas hoje, não
  muda ao trocar o mês) — e **cada uma mostra as outras duas ao lado**, que é o
  que impede a tela vizinha de parecer errada.
- **Item 7 (assinaturas)** — a terceira porta (aba dentro de Receber) saiu.
  Sobram a LISTA (`Assinaturas e contratos`, em Vendas) e a LEITURA dela
  (`Assinaturas (MRR e churn)`, em Dashboards), com rótulos distintos. ⚠️ A
  guarda `nav: nenhuma rota duplicada` pegou a duplicata que eu mesmo criei ao
  apontar dois grupos para a lista canônica.
- **`ALIASES_DE_ABA`** (`core/rotas/aliases`) — uma aba tem endereço e as pessoas
  o guardam nos favoritos. Aposentar a aba sem desviar o endereço faz o hub abrir
  na primeira aba em silêncio, e a pessoa conclui que clicou errado. `destinoDe`
  casa PRIMEIRO por caminho+query (a aba é mais específica que o hub).

**Colhidas até aqui: 6 de 8.** Além de saldo, assinaturas e conciliação:

- **Cadastros** — `registrations` tinha `products` e NÃO tinha `services`.
  Serviços virou **segmentado visível** no topo de `ProdutosRegistroView` (com
  contagem dos dois lados), não uma opção escondida num select: uma aba que vira
  item de filtro só muda o lugar onde a perda acontece. `/cadastros` aposentado,
  com as dez abas mapeadas para as páginas canônicas.
- **Títulos** — `CarrosselSazonalidade` e `ModalBaixa` foram **extraídos** do
  extrato (não copiados: duas cópias divergem no primeiro ajuste, e a baixa move
  DINHEIRO) e montados na `TitulosView`. ⚠️ **Ao portar, descobri três abas
  órfãs** — Inadimplência, Boletos e Reembolsos só existiam dentro dos hubs
  legados. Registrei como item novo no mapa em vez de desligar assim mesmo, e
  cada uma ganhou rota própria em `/dashboard/financial/`. `/recebimentos` e
  `/pagamentos` aposentados.
  - Com as duas telas virando uma, o `EscopoDaTela` deixou de ser ponte entre
    telas e virou a **declaração** do que o número mede, com a outra leitura ao
    lado como contexto. O P0-16 foi resolvido na raiz, não por explicação.
- **DRE** — `CartoesExecutivos` (EBITDA, margem, lucro, runway, caixa) no topo do
  relatório, alimentado por `dreGerencial` + `core/indicadores`, os MESMOS
  motores da tabela: um cartão que discorda da tabela logo abaixo é pior que
  cartão nenhum. O preset **`doze_meses` virou o padrão** — abrir no mês corrente
  mostra um DRE quase vazio no dia 2 e o usuário conclui que não há dados. O
  drill-down já existia na canônica. `/dre` aposentado.

- **Impostos** — `ProjecaoCarga` no topo da canônica, projetando sobre a
  RECEITA TRIBUTÁVEL canônica (projetar sobre "todas as entradas" inflaria o
  imposto). E `core/tax/regime.ts`: o perfil sai do `RegimeTributario` da
  EMPRESA, não de um array cravado no arquivo. ⚠️ Simples e MEI declaram que
  **não têm tabela fixa** (faixa e valor fixo) em vez de fingir um percentual
  que não existe. `/impostos` aposentado.
- **IA** — `AssistenteShell` em `/all4pay-ai`: Conversa + Quant + Decisão +
  Risco + Autônomo, só a aba ativa montando (os motores são caros). O histórico
  passou a gravar por `store-org` num mapa `usuário → conversas`: a ORG vem da
  RLS de `org_state`, o USUÁRIO vem da chave dentro do valor — acompanha a
  pessoa entre máquinas e não vaza para os colegas. `/copiloto` aposentado.
  - ⚠️ **A conversa é Simples; os motores são Pro.** Trancar `/all4pay-ai`
    inteiro esconderia o chat de todo mundo — a porta da frente do produto. O
    gate é por ABA (`ABAS_PRO`), e as rotas legadas dos motores continuam
    trancadas para o redirecionamento não virar porta lateral.

**Placar: 8/8 fusões, 0 itens pendentes, 0 rotas em aposentadoria.** 79 rotas
publicadas, todas canônicas.

### ⚠️ ROTAS, TÍTULO E CRIAÇÃO (ONDA 3)

- **`src/core/rotas/aliases.ts`** — os **34** endereços antigos que ainda
  respondem, num registro só. Eram desvios feitos no CLIENTE (página em branco +
  `useEffect`), sem 308, sem canonical, sem teste e sem ninguém saber que
  existiam. Agora o **`middleware.ts`** os resolve com **308 antes da
  autenticação** — um link antigo tem de levar ao destino certo mesmo quando a
  pessoa ainda precisa entrar, senão ela loga e cai na Home. `ROTAS_REMOVIDAS`
  cobre `/arquitetura`, `/infraestrutura`, `/orquestracao`, `/dados` e
  `/plataforma`, que respondiam 404 e ainda apareciam em marcador de tour.
  Guarda: sem ciclo, sem origem repetida, nenhum alias no menu, todo desvio com
  motivo, e **nenhum alias de rota Pro desembocando em rota aberta**.
  - ⚠️ Foi essa última que achou **dois vazamentos**: `/consolidado` e
    `/inadimplencia` eram Pro e os aliases os mandavam para abas de hub do
    Simples — o redirecionamento virava a porta que o gate deveria fechar.
    `ABAS_PRO` em `core/planos` fecha por par **rota+aba** (fechar por prefixo
    trancaria o hub inteiro). Inadimplência **saiu** do Pro: o hub Receber já a
    entrega, e trancar o que o menu oferece é o outro lado do defeito.
- **`src/core/marca`** — **uma grafia só**: `all4pay` minúsculo (o assistente é
  `All 4 Pay AI`, a única exceção). O título da aba é **`<Tela> · all4pay`**,
  com a tela PRIMEIRO: quase todo o sistema anunciava "all4pay — Tesouraria",
  e com dez abas abertas histórico e favoritos ficam indistinguíveis. Aplicado
  por `TituloDaAba`, montado no `AppShell` — as telas são componentes de
  cliente e não podem exportar `metadata`, que era a causa estrutural.
- **`src/core/criar`** — o catálogo do painel Criar. ⚠️ Toda ação tem **rota**
  e é renderizada como **`<Link>`**: eram dezesseis `<button>` com navegação por
  código, sem nova aba, sem Ctrl+clique, sem endereço para mandar a um colega.
  O `onClick` só chama `preventDefault` quando NÃO há modificador.
  - **A regra modal × página**, que não existia: **modal** para cadastro
    simples (poucos campos), **página** para documento composto (itens, totais,
    impostos). O critério é o tamanho do formulário, cada ação declara o seu
    `forma`, e a tela anuncia "aqui" ou "abre a tela" ANTES do clique.
  - ⚠️ **"Nova empresa" saiu das colunas.** Criar tenant não é criar registro:
    é uma organização com isolamento, membros e cobrança próprios. Na mesma
    lista e com o mesmo peso de "Novo produto", a proximidade convida ao
    acidente. Fica no rodapé, dizendo o que é.
- **`core/ingestao/contraparte.ts`** — nome é nome, documento é documento.
  ⚠️ A causa raiz da lista de clientes contaminada era
  `sort((a, b) => b.length - a.length)[0]`: o nome escolhido era o alias **mais
  longo**, que é justamente o que traz o CNPJ grudado. `melhorNome` prefere o
  alias que é nome de gente; `sanearContraparte` extrai o documento (só com DV
  válido), limpa parêntese órfão e **recusa** o que não é nome — CPF solto,
  termo genérico, descrição de cobrança ("ANUIDADE DIFERENCIADA"). Estes não
  viram cadastro. ⚠️ E o antídoto contra o falso positivo: sufixo societário ou
  documento válido vencem a heurística, senão "Mensalidade Serviços Ltda" —
  empresa real — seria recusada. Recusar cliente real dói mais que aceitar nome
  feio.
- **`Modo Pro` é um `role="switch"`** com `aria-checked` e estado visível
  ("on"/"off"). Vinha sem papel e sem estado: um leitor de tela anunciava
  "Modo Pro, botão" e nada mais, então apertar não produzia retorno nenhum — e a
  conclusão correta a tirar era que o controle não funcionava.
- **`OndeMais`** (`components/app/`) liga telas irmãs. Assinaturas aparecia em
  três telas e IA em três superfícies, nenhuma citando as outras. A faixa diz o
  que ESTA responde, o que as outras respondem, e — em assinaturas — por que o
  MRR pode divergir do Investor Update (contratos × estimativa dos lançamentos;
  a função de cálculo é a mesma desde a ONDA 1). O FAB da IA agora some também
  em `/copiloto`, onde já era redundante.
- **Período da Home**: quando a janela salva **não contém hoje**, a pílula avisa
  ("Você não está vendo o mês atual") e volta em um clique. A Home abria em
  "Maio 2026" com o sistema em agosto, ao lado de "Essa semana" — erro de
  rótulo, não de cálculo, mas mina a confiança em tudo que está ao lado.

### ⚠️ PERSISTÊNCIA — `src/lib/store-org` + `org_state` (0024)

**Dado de negócio não pode morar só no navegador.** 74 chaves de `localStorage`
carregavam entidades inteiras — aprovações, orçamento, reembolsos, comprovantes,
tarefas de fechamento, taxas de POS, dados da empresa. As consequências:
trocar de máquina ou limpar o cache **perde** tudo · dois usuários da mesma
empresa **nunca** veem o mesmo estado · a trilha de auditoria fica em **zero**
porque nada passa pelo servidor · sem backup, restauração ou histórico · o teto
de ~5 MB já estava perto de 9% com UMA empresa.

- **`org_state`** (migration 0024): `(org_id, chave) → valor jsonb` + `versao` +
  quem/quando, RLS por org, RPC `org_state_set` (`SECURITY INVOKER`). Não é a
  modelagem final — uma aprovação merece a sua tabela. É a ponte que tira o dado
  do navegador HOJE, sem inventar quinze schemas antes de saber quais campos
  sobrevivem à primeira semana de uso.
- **`store-org.ts`** mantém a API **síncrona** (`ler`/`gravar`) que as telas já
  usam, com o localStorage como CACHE. Trocar quinze telas por leitura assíncrona
  de uma vez é a mudança que não se consegue revisar.
  - ⚠️ **O servidor vence na hidratação** — é o que faz o multiusuário
    funcionar. Exceção: chave com escrita pendente (trabalho recém-feito).
  - ⚠️ **O envio ao servidor vem ANTES do cache local.** `gravarLocal` lança
    quando a cota estoura; se o envio viesse depois, o dado que não coube no
    navegador também nunca subiria — perdido justamente quando o servidor é a
    única saída. E `QuotaExceeded` **não** é engolido.
  - `migrarParaServidor` só envia o que o servidor ainda NÃO tem: sobrescrever
    com o local de um segundo dispositivo desfaria o trabalho de quem entrou
    primeiro. Roda no `AppShell` (`SincronizacaoOrg`).
- **As QUATRO listas** (`CHAVES_ORG` · `PREFERENCIAS_LOCAIS` · `CACHES_LOCAIS` ·
  `PRECISAM_DE_TABELA_PROPRIA`) classificam **toda** chave usada no código.
  Guarda na matriz com **teto ZERO**: uma chave nova sem classificação é uma
  entidade que voltou a morar só no navegador — foi assim, em silêncio, que o
  defeito nasceu. Tema/largura da barra/widgets ficam locais de propósito
  (sincronizá-los faria a preferência de um mudar a tela do outro);
  `a4p_imported_dataset` (vai para `movements`) e `a4p_produto_imagens` (binário
  pertence a Storage) ficam de fora por decisão registrada.
- **`ROTULO_DA_CHAVE`/`rotuloDaChave`** dão nome em português a cada chave. Vive
  no registro, não na tela: a auditoria passou a registrar cada gravação, e um
  evento que diz `a4p_close_tasks` obriga quem audita a decifrar o
  identificador. Guarda: toda chave de negócio tem rótulo.
- **`/dashboard/administration/storage`** (`ArmazenamentoView`) torna a
  limitação VISÍVEL: quantas chaves estão no servidor, quantas ainda só neste
  navegador (com rótulo em português e tamanho), o % do teto de 5 MB e as
  escritas não confirmadas. Quem trocava de máquina descobria a perda depois de
  já ter perdido.
- **Migrados até aqui:** orçamentos, aprovações, reembolsos e taxas de POS.
  O restante está classificado e listado — a migração segue por leva, e a tela
  de armazenamento mostra o que falta.

### ⚠️ ONDA 8 — A TRILHA LIGADA, O BACKUP QUE VOLTA, O CACHE QUE VENCE (0026)

O achado era **"trilha de auditoria com ZERO eventos"**, e a causa não era a
trilha: nada passava pelo servidor. Com `org_state` (0024) o dado passou a
subir; faltavam o evento, a volta e a limpeza.

- **O evento vem do BANCO, não da tela** (`org_state_auditar`, gatilho `after
  insert or update` em `org_state`). ⚠️ Um evento escrito pelo código de tela
  depende de alguém lembrar de escrevê-lo em cada caminho novo, e o caminho que
  ninguém lembra é justamente o que a auditoria precisa. O gatilho não esquece:
  se a linha mudou, o evento existe. **O payload é pequeno de propósito** —
  chave, quem, quando, versão e tamanho, não o valor: um estado pode ter
  megabytes, e duplicá-lo a cada gravação faria a trilha crescer mais rápido que
  o dado. O valor continua em `org_state`, versionado.
- **`EntityType` ganhou `state`** e `lib/institutional` o deriva de `acao`
  (`estado.*`) e da CHAVE, não do id da linha. Sem isso toda gravação de
  orçamento/fechamento entrava na trilha como **"Lançamento"** (o tipo que o
  acessor usava por falta de outro) — a auditoria diria que houve um lançamento
  onde não houve nenhum. Nos Logs: tipo **"Dado salvo"** (entra em
  `TIPOS_ENTIDADE`, senão o filtro não o alcança) e frase própria
  ("Orçamentos · versão 4 · 11,8 KB → 12,3 KB") no lugar do diff cru.
- **Retenção como função** (`audit_log_expurgar(dias)`, 180 por padrão, gateada
  por `is_platform_admin`): trilha sem retenção fica grande demais para
  responder rápido, e resposta lenta vira resposta que não se pede.
- **Backup e restauração** (`exportarEstado`/`importarEstado`/`backupValido` +
  RPC `org_state_backup`, `SECURITY INVOKER` para a RLS continuar escopando).
  ⚠️ Só dado de NEGÓCIO entra: restaurar preferência sobrescreveria os ajustes da
  máquina onde a restauração acontece, e restaurar cache reintroduz o que a rede
  dá de graça. **Chave fora da lista é RECUSADA** mesmo vindo no arquivo — um
  backup adulterado não pode virar caminho para escrever no estado da
  organização. A restauração **mede o tempo** (`ms`): "dá para restaurar" sem
  tempo de recuperação é palavra. Na tela ela é `AcaoDestrutiva` com desfazer
  real — o estado vigente é exportado ANTES e é ele que volta.
- **Cache que EXPIRA** (`CACHES_LOCAIS` + `expurgarCaches`, no
  `SincronizacaoOrg` a cada sessão). ⚠️ `a4p_cnpj_cache` e `a4p_municipios` já
  tinham validade e mesmo assim cresciam sem parar: a leitura **ignorava** a
  entrada vencida em vez de removê-la — resposta certa, byte eterno. Ignorar não
  é expirar. O expurgo é por **ENTRADA**, não pela chave inteira: jogar tudo fora
  faria a próxima importação reconsultar centenas de CNPJs que continuavam bons.
- **A meta: menos de 50 KB locais** (`META_BYTES_LOCAIS`, `bytesDeNegocio`,
  `dentroDaMeta`) — o tamanho que sobra quando o disco guarda só preferência e
  cache. `enxugarLocal()` remove as cópias que **o servidor já confirmou nesta
  sessão** (trava em `MIGRADAS`); apagar antes disso trocaria "só existe no
  navegador" por "não existe em lugar nenhum".
- Guardas na matriz (LINHA 20b, com `localStorage` de mentira — sem ele as três
  funções devolveriam zero e a guarda passaria sem testar nada): o expurgo
  remove o vencido E preserva o válido, é idempotente · o backup leva negócio e
  não leva preferência · a restauração recusa chave estranha e mede o tempo ·
  enxugar não remove o que o servidor não confirmou.

### ⚠️ ONDA 9 — MULTIEMPRESA, PERMISSÃO E GATING DE VERDADE (0027–0029)

**`src/core/seguranca`** (`seguranca/1.0.0`, puro/tipado/demo-safe) + três
migrations. A camada pura **não autoriza nada** — quem autoriza é o banco; ela
dá o vocabulário, lê os relatórios do servidor e repete a MESMA regra de
segregação para o botão poder explicar antes do clique o que o banco recusaria
depois dele.

**O achado que sozinho justifica a onda:** ⚠️ **`anon` podia `TRUNCATE` em 57
das 59 tabelas — e a política de acesso por linha NÃO cobre TRUNCATE.** Isso foi
**medido, não deduzido**: numa tabela de teste com RLS ligada e política
`using (false)` para `anon`, o `truncate` como `anon` levou 2 linhas a 0 sem
erro nenhum. A chave `anon` viaja no pacote do navegador. Uma linha de SQL
apagaria `movements` de TODAS as organizações sem violar política nenhuma.
`TRUNCATE`, `TRIGGER` e `REFERENCES` foram revogados de `anon` e
`authenticated`, `anon` perdeu toda concessão de tabela, e os **privilégios
padrão** foram ajustados — sem isso a próxima tabela nasce com o buraco de novo.

- **A organização ativa é uma ESCOLHA** (`user_active_org` + `trocar_organizacao`
  + `minhas_organizacoes`, `SeletorOrganizacao` no rodapé da Sidebar).
  ⚠️ `auth_org_id()` devolvia **a organização mais ANTIGA** do usuário, e toda a
  RLS pende dela: quem entrava numa segunda empresa continuava vendo a primeira,
  sem escolha e sem aviso. A escolha é lida com **JOIN no vínculo** — removido da
  empresa, o JOIN não casa e a função cai no vínculo mais antigo em vez de
  continuar entregando dados da empresa que a pessoa deixou. Sem escolha
  registrada o comportamento é idêntico ao anterior (ninguém troca de empresa por
  causa da migration). A política de `organizations` passou a ser por vínculo —
  era `id = auth_org_id()`, então o seletor não conseguiria listar as outras, e
  "escolher" entre opções invisíveis não é escolher.
- ⚠️ **O plano vinha de OUTRA organização.** `meu_plano()` escolhia a assinatura
  **mais favorável** entre todas as organizações do usuário enquanto
  `auth_org_id()` escolhia a mais antiga: sócio de uma empresa Pro operava
  qualquer outra empresa **com direitos de Pro**. O portão existia e mirava a
  fechadura errada. Agora `meu_plano()` responde só pela organização aberta.
- **`teste_isolamento()`** — o critério de conclusão, executável em produção por
  qualquer usuário (`/dashboard/administration/security`). ⚠️ `SECURITY INVOKER`
  de propósito: roda com os privilégios de QUEM CHAMA, contra as políticas de
  verdade. Uma função `DEFINER` responderia sempre "está tudo bem", porque o dono
  enxerga tudo — testaria a si mesma. A varredura é **dinâmica** (toda tabela com
  `org_id` entra), senão a tabela criada depois deste arquivo — a que ninguém
  lembra de conferir — ficaria de fora. Verificado nos dois sentidos: 44 tabelas,
  0 vazamentos; e com uma tabela de política frouxa plantada, ele **nomeou** a
  tabela e contou as linhas.
  - **`verificar_isolamento()`** é o mesmo teste, **registrado** na trilha
    (`isolamento.verificar`, ou `isolamento.VAZAMENTO` quando acha algo — um
    achado desses não pode ficar com o mesmo rótulo dos dias em que estava tudo
    certo). Abrir a tela só LÊ; o botão "Testar agora" é que grava — registrar a
    cada montagem encheria a trilha de eventos que ninguém pediu.
  - ⚠️ **O que NÃO dá para registrar, e por quê:** a política de linha bloqueia a
    leitura cruzada **sem deixar rastro** — uma linha filtrada é indistinguível
    de uma linha que não existe, e o PostgreSQL não tem como registrar o que a
    política escondeu sem transformar cada consulta do produto num registro.
    Então o que fica na trilha é a VERIFICAÇÃO (quem conferiu, quando, quantas
    tabelas, com que resultado), não a tentativa. É a diferença entre "o
    isolamento está certo" e "o isolamento foi conferido no dia tal e estava
    certo" — e é a segunda que uma auditoria consegue ler.
  - Os eventos de segurança ganharam tipo próprio (`EntityType.security`, "Segurança" nos Logs): caídos no tipo de lançamento, ficariam escondidos entre
    centenas de movimentos de dinheiro, que é onde ninguém procura por eles.
- **Papéis reais** (`role_permissions` + `tem_permissao` + `minhas_permissoes`):
  leitor · lançador · aprovador · fechador · admin · titular, com as ações
  ler/exportar/lançar/baixar/aprovar/fechar/administrar/cobrança. ⚠️ **A matriz
  mora no servidor e a interface PERGUNTA** (`usePermissoes`) — uma cópia no
  cliente divergiria no primeiro ajuste, e a divergência vira botão que existe e
  não funciona, ou botão que some para quem tinha direito. `member` é legado e
  vale como `lancador`: reinterpretá-lo daria poder de aprovação, de uma vez, a
  todo mundo que já é membro. Aplicado no servidor por políticas **restritivas**
  (permissiva só amplia; restritiva é a única que tira) em `movements`,
  `financial_accounts` e `org_state` — com uma restritiva **separada para DELETE**,
  porque `with check` não cobre exclusão e apagar é a forma mais completa de
  alterar.
- **Segregação de funções** — o gatilho `approvals_segregacao` + a restrição
  `approver_id <> requester_id`. As duas não são redundantes: a restrição é
  estrutural (vale para qualquer caminho), o gatilho é quem **carimba** o
  aprovador — sem ele `approver_id` é um campo que o cliente preenche, e bastaria
  informar o nome de um colega. Verificado: auto-aprovação **bloqueada**, membro
  sem o papel **bloqueado**, aprovador de verdade passa, e o carimbo sai com quem
  decidiu.
  - ⚠️ **O teste pegou um defeito meu:** `tem_permissao` perguntava pelo papel na
    organização ATIVA, então quem é `member` na empresa A e `owner` na B aprovava
    um pedido da A com o papel que tem na B. É o mesmo defeito do plano,
    reaparecendo dentro do conserto. A pergunta certa nunca é "o que eu sou", é
    "o que eu sou AQUI" — daí `tem_permissao(acao, org)`.
- **Modo Pro é CONSEQUÊNCIA do plano** (`useModo`): sem direito, o interruptor
  não liga e leva a `/planos`. Ele revelava o menu Pro inteiro pelo localStorage e
  cada destino devolvia a tela de planos um clique depois — um menu que oferece o
  que não abre não é vitrine, é uma sequência de portas trancadas. A preferência
  local segue valendo para o caso oposto e legítimo: **quem TEM Pro simplificar a
  própria tela**.
- **O acesso administrativo deixa rastro** (`admin_acessos` + `admin_posso` +
  `admin_exigir_acesso`, migration 0029). ⚠️ Treze funções respondem pela área
  que enxerga **todas as organizações**, e **oito eram de leitura e não
  registravam nada**: mudar o plano de um cliente deixava rastro, abrir a lista
  de todos os clientes não. Numa investigação a pergunta nunca é "quem alterou",
  é "quem viu". As treze foram reescritas **mecanicamente** (a chamada do portão
  trocada, `STABLE` derrubado porque função não volátil não grava) — reescrever
  treze corpos à mão para acrescentar uma linha é a forma mais provável de mudar
  sem querer a consulta de um deles.
  - ⚠️ **Por que `admin_posso` E `admin_exigir_acesso`:** uma exceção desfaz a
    transação inteira, **inclusive o registro da negativa** — o primeiro teste
    mostrou isso (duas tentativas, um registro). Não há transação autônoma no
    PostgreSQL, e a saída por `dblink` foi descartada (exige guardar uma senha do
    banco dentro de uma função). Então `admin_posso` **nunca levanta exceção** e
    o registro dela sempre commita; o portão duro continua nas treze funções.
  - **Autenticação reforçada com PRAZO** e **revisão periódica** (`expira_em`,
    `revisado_em`, `mfa_prazo`): o único administrador de hoje não tem segundo
    fator, e exigir agora tiraria o acesso de quem precisaria dele para
    consertar. O prazo é uma data na tela, não uma intenção — e a tela alerta
    desde já, porque um aviso que só aparece no vencimento chega junto com o
    problema.
- **Teto de linhas** (`src/lib/supabase/consulta.ts`, `TETO_LINHAS = 5000`):
  eram **60 consultas sem limite** de 105. A política diz DE QUEM são as linhas,
  não QUANTAS — uma empresa com cinco anos de extrato pedia tudo e a tela
  congelava, e recarregar refazia a consulta. ⚠️ O `conferirTeto` existe porque
  truncar em silêncio é pior que travar: um DRE sobre as primeiras 5.000 de
  12.000 linhas não parece quebrado, parece um DRE. O teto definitivo é do
  servidor (`db.max_rows` do PostgREST) — este é o do cliente, que existe para
  dar o aviso que o servidor não tem como dar.
- **Guardas (LINHA 20c)**: teto ZERO de consultas sem limite · uma linha de outra
  empresa reprova · nenhuma tabela conferida **não** é aprovação · `anon` poder
  esvaziar é crítico · RLS ligada sem política **não** é achado (é o desenho das
  tabelas só-DEFINER) · segregação nos dois sentidos e na ordem certa · papéis
  coerentes · pendências do acesso administrativo. Provadas quebrando.

**O que fica para a continuação:** as políticas por papel cobrem as três tabelas
de maior risco (`movements`, `financial_accounts`, `org_state`) — as demais
seguem com a política de organização apenas, e a extensão é mecânica a partir
daqui. O `db.max_rows` do PostgREST precisa ser ligado no painel do projeto
(configuração de infraestrutura, não migration).

### ⚠️ ONDA 10 — FATO × MODELO, ERRO COM DONO, RECONCILIAÇÃO PAR A PAR

A camada canônica existia desde a ONDA 1; faltava torná-la **incontornável** e
separar o que é fato do que é modelo.

- **`Procedencia.natureza`** (`fato` · `estimativa` · `projecao`). ⚠️ A separação
  existia só como TEXTO — a palavra "ESTIMADO" grudada na frase da fórmula. Uma
  frase não deixa a tela marcar nada nem o gerador de planilha recusar nada, e
  por isso projeção de caixa e saldo de extrato saíam com a mesma cara. Regras:
  saldo em data futura é projeção · burn é estimativa (é média, não contagem) ·
  **ARR é projeção mesmo saindo de contrato** (×12 supõe que a base de hoje se
  repete o ano inteiro) · vencido é FATO (o título existe e a data passou).
  `naturezaDaSoma` DEDUZ da base: se alguma linha contada não foi liquidada, o
  número fala de expectativa.
- **`npm run reconciliacao`** — a matriz PAR A PAR (`scripts/reconciliacao.mts`).
  ⚠️ A matriz de consistência compara pares ESCOLHIDOS: protege o que alguém já
  viu quebrar. Esta lista TODOS os caminhos de cada indicador e confronta as
  n(n−1)/2 combinações — **13 indicadores · 42 caminhos · 53 pares**, critério de
  **um centavo**. Burn e runway são reconciliados sobre `INPUT_QUEIMANDO`: na
  fixture principal os dois dão zero/teto, e comparar zeros não reconcilia nada.
  A fixture virou `scripts/fixture.mts`, compartilhada — duas guardas sobre
  datasets diferentes podem discordar sem nenhuma estar errada.
- **`src/core/erros`** — toda falha tem **dono** e **impacto**. A varredura achou
  **33 `catch` de chamada a servidor engolindo o erro** (mais 77 de cache local,
  onde engolir é defensável). ⚠️ `degradado: true` é a marca do erro que o
  usuário NÃO vê — o 400 do embed de projeto seguiu por meses assim — e ele
  **agrava** a gravidade em vez de abrandá-la. `lib/erros.ts` (`reportar`,
  `comFalha`) nunca lança: instrumentação que derruba a tela é a primeira coisa
  que alguém remove.
- **`src/core/artefatos`** — projeção não vira planilha sem marca. **Marca, não
  impede**: impedir empurraria para o print de tela, que é a mesma exportação sem
  marca nenhuma. O bloqueio fica só para o indicador **inválido** (com `aviso`):
  exportar um zero que significa "sua pergunta não fecha" cria um documento
  afirmando que não houve receita. A nota **nomeia cada item**; "alguns valores
  são projeções" transfere ao leitor um trabalho que ninguém faz. O sufixo entra
  no RÓTULO, não numa coluna (colunas somem no copiar-e-colar).
- **`problemaDoIntervalo`** — intervalo invertido recusado na ENTRADA. O motor já
  tratava, mas entre digitar e ver a explicação a pessoa já pediu o relatório e
  leu um vazio. Data futura **não** é recusada: pedir o previsto é legítimo.
- **`MarcaProcedencia`/`InfoProcedencia`/`LinhaProcedencia`** (`components/ui/`):
  o selo some no FATO — marcar tudo é não marcar nada. Cor `warning`, nunca
  `negative`: projeção não é erro.
- **Guarda com teto ZERO: nenhuma tela soma lançamentos por conta própria.** Ela
  achou 9 recálculos em 3 telas, todos com `Math.abs(m.amount)` (a convenção de
  sinal contornada). Migrados para `posicaoDaContraparte`, `previstoNaJanela` e
  `previstoDaConta`. ⚠️ O primeiro padrão da varredura não pegava nada porque
  tentava casar a expressão inteira, e o corpo do filtro tem parênteses próprios
  (`(m) => …`); a versão que funciona acha o `.reduce(` e olha para trás.

### ⚠️ ONDA 11 — UMA LÍNGUA, UMA VOZ, UM FORMATO

**`src/core/glossario`** (`glossario/1.0.0`) — a decisão de vocabulário escrita,
publicada na Central de Ajuda (aba **Glossário**) e cobrada por guarda.

- **As decisões:** *a receber* (não "recebíveis" — palavra de banco; quem opera o
  caixa diz "o que tenho a receber") · *movimentações* (não "tesouraria" — nome
  de DEPARTAMENTO, e a maioria dos clientes é o dono sozinho) · *plano de contas*
  = a ÁRVORE × *categoria* = a FOLHA do lançamento · *baixa* (não "liquidação") ·
  *empresa* (não "tenant"/"workspace"). Cada termo carrega o **porquê** e as
  **exceções** — sem elas a guarda acusaria "antecipação de recebíveis", que é o
  nome do produto financeiro, e seria desligada na primeira semana.
- **404 e erro próprios** (`src/app/not-found.tsx`, `error.tsx`). ⚠️ A 404 era a
  tela padrão do framework: **"This page could not be found"** em inglês, sem
  marca e **sem caminho de volta** — um engano de digitação virava o fim da
  sessão. A tela de erro **reporta** a falha: sem isso, um erro de render morre
  no navegador da pessoa (a mesma família de defeito da ONDA 10).
- **Nenhum texto de interface em inglês** — a guarda achou 10 e todos foram
  traduzidos: *dashboard* → **painel**, *Insights priorizados* → **Leituras
  priorizadas**, *Cash Flow Digital Twin* → **Gêmeo digital do caixa**. A rota e
  o nome de arquivo continuam `dashboard`; o que a pessoa LÊ é que mudou.
- **Uma grafia da marca**: `all4pay` (o assistente, `All 4 Pay AI`, é a única
  exceção). O `ALL4PAY` do comprovante do POS virou a grafia canônica.
- **Um formato por grandeza** (`lib/format.ts` + `REGRAS_DE_FORMATO`):
  ⚠️ percentual saía com **0, 1 e 2 casas — três no mesmo arquivo**
  (`paineis/shared.tsx`). Agora `pct`/`pctDeInteiro` com **uma casa**: zero apaga
  a diferença entre 12,4% e 12,9%, duas fingem precisão que uma média de 90 dias
  não tem. 21 chamadas em 11 telas migradas. `dataBR` **fatia a string** (nunca
  `new Date`, que em UTC−3 faz o dia 1º virar o último do mês anterior). O
  negativo usa **`−` (U+2212)**, não o hífen (mais curto, serrilha a coluna) e
  nunca parênteses (metade lê como observação). Valor impossível vira **"—"**,
  nunca "NaN%".
- **A voz** (`VOZ`/`comVoz`): o assistente dizia *"O runway é de 4 meses"*. Não
  é — **seria**, se o ritmo dos últimos 90 dias continuasse. Fato afirma,
  estimativa declara a média, projeção condiciona ("No ritmo atual, …"). ⚠️ O
  primeiro rascunho tirou a palavra "runway" da resposta sobre runway e **a
  guarda do corpus pegou**: suavizar não pode custar o termo que a pessoa
  perguntou.
- **Origem e período a um toque**: `textoDeOrigem(procedencia)` monta a frase do
  que o motor devolveu — período, regime e de quantos lançamentos saiu. ⚠️ Não é
  microtexto escrito à mão: texto à mão envelhece na primeira mudança de fórmula
  e passa a descrever um cálculo que não existe, o que é pior que não explicar.

### ⚠️ ONDA 12 — TELEFONE, ACESSIBILIDADE E DESEMPENHO (medido, não suposto)

Este era o **ponto cego confesso** da auditoria: ninguém tinha validado o produto
numa tela pequena. Agora ele é medido — `npm run mobile` e `npm run fluxos`
dirigem um Chromium a **390×844** contra o build de produção.

⚠️ A nota antiga de que `next start` não subia neste ambiente **está
desatualizada**: ele sobe, e foi isso que permitiu medir em vez de supor.

**O que a medição achou (linha de base em `core/desempenho.MEDIDO_EM`):**

| Achado | Medida |
| --- | --- |
| Tabela do DRE num telefone | **15 colunas** · títulos 8 · extrato 5 |
| Alvos de toque abaixo do mínimo | **97** em Títulos · 90 no DRE · 76 na Home |
| Campos sem nome acessível | **51 numa tela só** (o checkbox de cada linha) |
| Contraste reprovado | **26 ocorrências**, todas no mesmo token |

- **O token que reprovava em TODO valor do produto.** `--color-text-quaternary`
  (#a8a595) pinta o prefixo "R$" e os CENTAVOS, a 7pt: 2,20:1 sobre o canvas
  contra os 4,5:1 exigidos. Agora **#6f6d62** (5,20:1 no branco). ⚠️ E as
  **semânticas eram NEON** no `.ds-visor` (#00ff62 · #ff1100 · #ff6200),
  promovidas do Laboratório: funcionam como preenchimento e são ilegíveis como
  TEXTO — que é justamente onde aparecem (o valor de um recebimento). Voltaram à
  família dessaturada que o DS documenta, escurecida o necessário para passar. O
  espelho do `DesignLab` foi atualizado junto, senão ele repinta o app com
  valores que ninguém escolheu.
- **`Checkbox`, `Select` e `DateField` agora SEMPRE têm id.** O id só nascia
  quando o rótulo era uma *string*; com rótulo em JSX (ou sem rótulo, como o
  checkbox de linha de tabela) o `<label>` não apontava para lugar nenhum. Uma
  correção nos três componentes zerou **51 + 9 campos anônimos**.
- **Alvo de toque: 97 → 0.** Regra global que estende a ÁREA SENSÍVEL por
  `::after` sem mexer no tamanho visual — aumentar o desenho resolveria o toque
  e destruiria a densidade da tabela. ⚠️ A primeira versão usava
  `@media (pointer: coarse)` e era **inverificável** (o navegador de automação
  não emula ponteiro grosso); numa onda cujo critério é "medido", correção que
  só funciona onde ninguém mede é indistinguível de correção nenhuma. O gatilho
  virou a LARGURA. Dentro de célula, a área cresce só na vertical e para em
  **24px** na horizontal — o piso do nível AA (WCAG 2.2, 2.5.8); os 44px são a
  meta do AAA e valem onde não há vizinho a poucos pixels.
- **Tabela vira CARTÃO no telefone** (`EntityTable`, `Column.noTelefone`). A
  saída anterior era rolagem horizontal, que é a pior das duas: some com o
  rótulo da coluna assim que a pessoa arrasta, e ninguém decide nada olhando um
  valor sem saber de que coluna ele é. No cartão o rótulo viaja junto com o
  valor, e a linha clicável virou `<button>` de verdade — uma `div` com
  `onClick` não recebe foco nem responde a Enter.
- **24 regiões roláveis ganharam foco de teclado** (`tabIndex`/`role="region"`):
  sem isso, quem navega por teclado não consegue rolá-las e o conteúdo à direita
  é inalcançável.
- **Orçamento por tela** (`core/desempenho`), com os tetos ancorados no medido —
  um teto que a tela já estoura nasce vermelho e é ignorado no primeiro dia.
- **Os quatro fluxos essenciais, dirigidos toque a toque** (`npm run fluxos`).
  ⚠️ Medir tela por tela não responde à pergunta: "a tela abre" e "dá para
  APROVAR UM PAGAMENTO" são coisas diferentes. Dirigir os fluxos achou dois
  defeitos que a medição por tela não acha:
  - **"Criar" mora dentro da gaveta do menu** — existe no DOM, passa em
    contraste e em alvo de toque, e está fora da tela no telefone. O caminho
    real é menu → Criar → Despesa: 3 toques, dentro do teto de 4.
  - **"Fotografar comprovante" não fotografava.** O campo não tinha `capture`,
    então tocar em "Escolher arquivos" abre a GALERIA — e o papel que está na
    mão da pessoa continua na mão. Agora há um botão **Fotografar** próprio
    (`capture="environment"`, só no telefone): pôr `capture` no campo existente
    resolveria a foto e quebraria o resto, porque ele também recebe CSV e OFX.

**Placar final: 7 telas · 0 com problema · 4 fluxos · 0 com problema.**

### ⚠️ ONDA 13 — PRONTIDÃO CONTÁBIL E FISCAL (0030)

O contador é quem decide se a ferramenta fica ou sai. Três defeitos que ele
encontra em dez minutos:

- **⚠️ O REGIME ESTAVA EM TRÊS CHAVES.** `NovaEmpresaForm` gravava
  `regimeTributario`; `DadosEmpresaView` gravava `regime`; a projeção de carga
  lia `regime`; a tela de notas lia `regimeTributario ?? regime`; e a **tela de
  impostos não lia nenhuma** — tinha as alíquotas do Lucro Presumido cravadas no
  arquivo. A mesma empresa aparecia como Simples numa tela e Presumido na outra.
  Não é divergência de cálculo, é de **cadastro** — pior, porque não há fórmula
  errada para consertar. `regimeDaEmpresa()` resolve com precedência
  DECLARADA (o cadastro jurídico vence a edição rápida) e `regimeEmConflito()`
  **denuncia** o desacordo: resolver em silêncio conserta o número e esconde que
  alguém preencheu dois campos com respostas diferentes.
- **⚠️ A BASE DO IMPOSTO ERA "TODA ENTRADA".** A tela somava
  `Math.abs(mv.amount)` de qualquer entrada — e entrada, num extrato, inclui
  **transferência entre contas próprias, resgate, empréstimo e rendimento**. O
  sistema provisionava tributo sobre dinheiro que a empresa moveu de um bolso
  para o outro. Agora as duas telas usam `receitaTributavel` (canônico, ONDA 1).
  Na fixture a diferença é exata: R$ 35.900 de não-faturamento fora da base.
- **⚠️ O FECHAMENTO NÃO FECHAVA NADA.** `isPeriodLocked` era lido no render de
  uma tabela — um AVISO que a importação em lote, a baixa em lote, a recorrência
  e o próprio PostgREST ignoram. Migration 0030 põe a fechadura no BANCO
  (gatilho em `movements`, por data de **competência**: um pagamento de hoje de
  título antigo pertence ao mês antigo). Verificado: lançar, editar e apagar em
  mês fechado → **bloqueados**.
  - **A regra não é proibir, é exigir ESTORNO RASTREADO.** Proibir sem saída faz
    o operador reabrir o mês, lançar e fechar de novo — o buraco que o
    fechamento existe para impedir, agora sem rastro. `estornar_lancamento()`
    cria a contrapartida **no mês aberto** ligada ao original por `estorno_de`;
    o original só ganha o carimbo. Estorno sem motivo é recusado, estorno duplo
    é recusado, e **reabrir mês exige motivo** — reabrir é a operação perigosa,
    não fechar.
- **Contador externo** é papel próprio: `ler` + `exportar` + `fechar`, **sem
  `lancar` e sem `aprovar`**. Dar-lhe o papel de admin "porque é mais fácil" põe
  um terceiro, fora da empresa, com poder de mover dinheiro. `fechar` sem
  `lancar` define a função: ele responde pelo resultado do mês, não pelos
  lançamentos que o formam.
- **Eliminações entre empresas** (`eliminacoesIntercompany`). ⚠️ Consolidar não
  é somar: a holding fatura para a operadora, a operadora paga, e no consolidado
  isso é receita de uma, despesa da outra e **receita nenhuma do grupo**. O
  grupo aparecia maior do que é — e é esse número que vai ao banco pedir
  crédito. O pareamento é **conservador de propósito** (mesmo valor, competência
  a até 5 dias, sentidos opostos, as duas pontas sendo empresas da consolidação):
  eliminar por semelhança apagaria venda legítima a terceiro, e eliminação errada
  some com receita real sem deixar rastro na soma. As eliminações ficam
  **listadas** na saída — eliminar em silêncio produz um consolidado menor que a
  soma das partes sem nada que explique a diferença.

**O que NÃO foi feito, e por quê:** "validar a exportação contábil contra um
arquivo real aceito pelo sistema do contador" exige o sistema Domínio do outro
lado, que não existe aqui. O que há é a validação estrutural já feita (ANSI
1252 conferido decodificando no Python, CRLF, layout visível na tela, recusa de
lançamento sem código contábil) — que é forte e **não é a mesma coisa**. A
conciliação com aceite formal também segue pendente.

### ⚠️ ONDA 14 — IA RESPONSÁVEL: sem contradição, sem palpite afirmado

**`src/core/ia/`** (`ia-coerencia/1.0.0` · `ia-confianca/1.0.0`) + o conjunto de
avaliação `npm run ia-eval`, dentro de `npm test`.

- **A CONTRADIÇÃO QUE A AUDITORIA NOMEOU** — "ruptura de caixa em zero dias" ao
  lado de "runway de vinte e quatro meses". ⚠️ **Nenhuma das duas está errada.**
  *Ruptura* olha o AGENDADO (títulos com data marcada nos próximos 60 dias);
  *runway* olha o RITMO (saldo ÷ queima média de 90 dias). Uma empresa que gera
  caixa tem runway no teto e ainda assim fica negativa amanhã se a folha vence
  antes do recebimento. É o mesmo defeito que a ONDA 1 achou entre POSIÇÃO e
  FLUXO: duas respostas verdadeiras a perguntas diferentes, exibidas com o mesmo
  peso. `ponteRupturaRunway()` devolve as duas com o que cada uma **mede** e o
  que cada uma **não enxerga** — e a frase que reconcilia diz o que FAZER
  ("é problema de DATA, não de tamanho: antecipar um recebimento resolve, cortar
  custo não"). Apagar uma das duas tiraria ou o aviso que evita o cheque
  devolvido, ou a leitura que diz se a empresa está de pé.
  - ⚠️ **`null` não é zero.** `rupturaDia` é `null` quando não há ruptura no
    horizonte; tratar isso como "ruptura no dia zero" é, muito provavelmente,
    como o zero foi parar ao lado de um runway longo. A guarda cobra os dois.
- **Confiança com CRITÉRIO** (`calcularConfianca`). O motor devolvia
  `confianca: 0.82` e a tela exibia "82%" — ninguém, nem quem escreveu, sabe o
  que separa 0,82 de 0,79. Um número de confiança sem critério **empresta
  autoridade** sem dar como conferir, e é sobre essas respostas que se decide sem
  checar. Agora são quatro fatores nomeados, cada um com a frase que explica o
  próprio valor: base · recência · **natureza** (o de maior peso) · cobertura.
  ⚠️ Nenhuma quantidade de dado transforma projeção em fato — uma projeção sobre
  5.000 lançamentos recentes vale menos que um fato sobre 30. E o **limitante**
  é o que mais SUBTRAI (peso × o que falta), não o de menor valor: apontar um
  fator fraco de peso baixo mandaria a pessoa consertar o que não importa.
- **Configuração de provedor saiu da tela.** A interface mandava o usuário
  "configurar a ANTHROPIC_API_KEY" — quem opera o caixa não tem acesso ao
  servidor, não pode agir sobre o aviso, e o nome da chave revela qual provedor
  está por trás. Guarda varrendo texto de tela (com os **comentários fora**: a
  primeira versão dela acusou o próprio comentário que documenta a correção, e
  guarda que reprova a documentação da correção treina quem a lê a ignorá-la).
- **`npm run ia-eval` — 31 casos conhecidos.** ⚠️ Ele existe separado do corpus
  e do `values` porque nenhum dos dois cobre o que a onda cobra: que a RESPOSTA
  continue confiável quando alguém mexe no prompt ou troca o modelo — e essas
  duas mudanças não tocam em fórmula nenhuma, então passam pelas outras guardas
  sem serem notadas. Fixa: número citado == camada canônica · a resposta cita a
  fonte · projeção no condicional · confiança com critério · valores fechados.
  - ⚠️ O extrator do próprio teste nasceu errado (exigia centavos; a IA escreve
    "R$ 42.000" quando o valor é redondo) e acusava a IA de citar número fora do
    canônico. Um teste que reprova o certo é pior que teste nenhum — manda
    consertar o que funciona.

**O que fica declarado como não feito:** o link clicável de cada número para a
tela de origem (a resposta já cita a fonte em texto, mas a navegação a partir
dela não existe); a persistência do histórico da IA por usuário/empresa no
servidor (segue em `localStorage`, classificado em `CHAVES_ORG`); e a separação
visual entre o que a IA sugere e o que ela executa — os guardrails de execução
existem em `core/autonomous` desde antes, mas a tela ainda não os distingue.

### ⚠️ PLANOS — `src/core/planos` (gating de servidor, não de menu)

**Gating de plano é decisão de SERVIDOR.** O Modo Pro era uma cortina: os grupos
Inteligência e Governança sumiam do menu e `/copiloto`, `/investidores`,
`/impostos`, `/aprovacoes`, `/governanca` e `/automacoes` continuavam
respondendo 200 para quem digitasse o endereço. Ruim das duas maneiras: se Pro é
plano pago, a receita vaza por digitação; se não é, esconde-se do usuário o que
ele já tem.

- **`ROTAS_PRO`** é a fonte única do mapa rota→plano (prefixos, pegando
  sub-rotas e query string). Inclui as rotas LEGADAS que redirecionam para as
  telas Pro — sem elas o redirect é porta lateral aberta.
- **`middleware.ts`** aplica: rota Pro + plano Simples → `/planos?de=<rota>`. A
  RPC **`meu_plano()`** (migration 0022, `SECURITY DEFINER` escopada ao
  `auth.uid()`) é a autoridade; falha de rede ⇒ trata como **Simples** (assumir
  Pro num erro liberaria o produto pago em toda instabilidade). Só consulta
  quando a rota exige Pro — uma RPC por navegação custaria latência em tudo.
- **`/planos`** (`PlanosView`) diz o que você pediu, por que não abriu e o que o
  Pro inclui. Bloquear sem oferecer caminho é pior que não bloquear.
- **`lib/plano.ts`** (`usePlano`) é só para APRESENTAR. Quem autoriza é o
  servidor; confiar nele para liberar tela repete o defeito.
- ⚠️ **`SEMPRE_ABERTAS`**: `/planos` e a tela de assinatura nunca são
  bloqueadas — trancá-las deixaria sem caminho para comprar.
- Guarda na matriz: as rotas `pro: true` do `nav-data` e `ROTAS_PRO` têm de
  coincidir nos dois sentidos. Divergir = a cortina de volta.

### ⚠️ Duas telas de "a receber" — POSIÇÃO × FLUXO

`/recebimentos` e `/dashboard/financial/accounts-and-transfers?tab=receivables`
mostravam números que não batiam, com o mesmo título na aba do navegador e
nomes quase idênticos no menu. **Nenhuma estava errada** — elas medem coisas
diferentes, e a interface não dizia isso:

- **Posição (estoque)**: quantos títulos existem e quanto somam. Sem período —
  um título de 2024 em aberto conta hoje. Nunca é negativo. É a pergunta de quem
  vai cobrar. → **"Títulos a receber"**.
- **Fluxo (resultado)**: entradas − saídas liquidadas na janela. Tem período por
  definição e **pode ser negativo**. É a pergunta de quem vai decidir gasto. →
  **"Extrato de recebimentos"**.

`pontePosicaoFluxo()` (`core/indicadores`) devolve as duas leituras juntas, e o
componente **`EscopoDaTela`** (`components/movimentacoes/`) põe no topo das duas
telas: o que ESTA mede, o que a OUTRA mede e o link para atravessar. A faixa não
some — um aviso que se fecha é um aviso que ninguém vê quando volta em dúvida.
Nomes e títulos de página passaram a ser distintos; guarda na matriz exige isso.

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

### Relatórios (`/dashboard/reports` — hub de 5 abas) + `core/relatorios`

`src/core/relatorios/index.ts` (`relatorios/1.0.0`, puro/tipado/demo-safe) — a
face de RELATÓRIO do resultado, ao lado do `core/dre` (que é o Intelligence
Center). Rotas próprias: `/dashboard/reports/{dre|dfc|dre-multi|dfc-multi|
monthly-closing}`.

- **Estrutura fixa e explícita** (`ESTRUTURA_DRE`): (+) Receita Bruta → (−)
  Deduções → (=) Receita Líquida → (−) Custos Variáveis → (=) Lucro Bruto → (−)
  Despesas Variáveis → (=) Margem de Contribuição → (−) Despesas Operacionais →
  (=) EBITDA → (+/−) Financeiro → (−) Impostos sobre o lucro → (+/−) Não
  operacional → (=) Resultado Líquido. As linhas "=" saem de FÓRMULA sobre as
  outras — nenhuma soma lançamento direto, o que impede valor contado 2×.
- ⚠️ **Siglas de tributo ancoradas em `\b`.** Sem isso `iss` casa dentro de
  "com**iss**ão" e toda comissão de afiliado vira imposto sobre vendas: some das
  Despesas Variáveis, infla a Dedução, e a cascata fecha "certo" no número
  errado. Vale para pis/ipi/das/icms/inss/irpj/csll. Guarda no `engine-audit`.
- **Toda célula carrega os ids dos movimentos** que a formaram (`Celula.
  movimentos`) — o drill-down abre a gaveta com as transações exatas, não uma
  segunda consulta que poderia discordar do número.
- **DRE = competência (vencimento) · DFC = caixa (pagamento).** É a diferença
  inteira entre os dois: um pendente existe no resultado e não existe no caixa.
  O DFC começa pelo **Saldo Inicial**, reconstruído do saldo de hoje (a mesma
  técnica do painel financeiro, para os dois fecharem no mesmo número); saldo é
  POSIÇÃO, então o "total" da linha é a última coluna, não a soma.
- **AV/AH**: vertical = % sobre a receita bruta; horizontal = variação contra a
  coluna anterior — `null` (→ "—") na primeira coluna, que não tem com que
  comparar. Zero diria "não variou".
- **Multiempresa**: consolida somando os `RiskInput` e rodando o MESMO motor
  (somar relatórios prontos dobraria a lógica). Ids prefixados por empresa —
  sem isso dois movimentos homônimos se anulariam no drill-down. Teto de 20.
- **Fechamento mensal** (`montarFechamento`): DRE comparativa de 3/6/12 meses +
  KPIs + pontos de atenção derivados dos próprios números + **textos redigidos e
  EDITÁVEIS**. Gerar sem deixar editar tiraria a assinatura de quem responde;
  pedir em branco faria o relatório nascer vazio todo mês. Histórico em
  `lib/fechamentos` guarda o relatório INTEIRO — um fechamento é uma fotografia
  assinada, recalculá-lo ao abrir mudaria o número depois de assinado.
- **10 temas** (`kit.tsx` `TEMAS`) — extensão sancionada: o tema pinta APENAS o
  cabeçalho e a faixa das linhas de total; o resto segue nos tokens.
- **Exportação:** XLSX por `lib/xlsx`; **PDF pela impressão do navegador**
  (`window.print()` — o gerador de PDF já está na máquina, respeita fonte e
  paginação, e não custa dependência); **DOCX** por `lib/docx`.

### `src/lib/docx.ts` — DOCX sem dependência

Um `.docx` também é ZIP de XMLs, então reusa `zipar`/`crc32`/`escaparXML` do
`lib/xlsx`. Escopo pequeno de propósito: título, parágrafo, lista e tabela.
⚠️ `docDefaults` + o estilo **Normal** são obrigatórios: sem eles um parágrafo
sem `pStyle` fica sem estilo nenhum e leitores que seguem a especificação
(python-docx) devolvem `null`. Validado com `python-docx`.

### Projeto no lançamento — o filtro que passou a filtrar

O projeto era cadastro sem vínculo: nenhum `movement` o referenciava, e por isso
o filtro "Projeto" ficou de fora dos painéis. Agora existe ponta a ponta:

- **`RiskMovement.projeto`** (nome) resolvido em `getRiscoInput` — em live pelo
  embed `project_id(name)`, em demo/pré-migration pelo vínculo local.
- **`lib/projeto-vinculo.ts`** — mapa `movimento → projeto` (localStorage,
  síncrono). É a fonte que faz funcionar HOJE, antes da migration.
- ⚠️ O embed do projeto é **otimista com queda**: pedir `project_id(name)` antes
  da migration não devolve nulo, o PostgREST devolve ERRO e derrubaria o
  `getRiscoInput` inteiro. A query tenta com o embed e cai no select base.
- **`0019_projects.sql`** (gerada como arquivo — aplicar ao remoto): tabela
  `projects` + `movements.project_id` + `movement_splits.project_id`, RLS por
  org, nome único por org, `on delete set null` (apagar projeto não pode apagar
  lançamento).
- **Onde se escolhe:** o `ReceitaForm` ganhou o select Projeto, e o modal de
  transação do `ExtratoTransacoes` permite vincular/desvincular uma transação
  existente. `FiltroPainel.projeto` e o filtro dos relatórios consomem isso.

### Vendas e Notas Fiscais (`/dashboard/sales-invoices/*`) + `core/vendas`

`src/core/vendas/index.ts` (`vendas/1.0.0`, puro/tipado/demo-safe) — a venda
como **documento-mãe**: gera o recebível, ampara a NF e é a base do imposto.

- **Lista** (`/dashboard/sales-invoices`): DOIS painéis — status da venda
  (iniciada/aprovada/completa/reembolsada/chargeback/total) e status da NF
  (emitidas/a emitir/com erro/total). São perguntas diferentes: venda completa
  com NF a emitir é trabalho pendente, e um painel só esconderia isso.
- **Nova venda** (`/new`): 13 status, 8 métodos, 21 plataformas, itens e o bloco
  que dá caráter — **cinco pares taxa + fornecedor** (plataforma, antecipação,
  streaming, coprodutor, afiliado) com o **líquido calculado ao lado do bruto**.
  Num negócio digital é ali que o dinheiro some. ⚠️ O líquido parte do total
  COM juros quando ele existe: o juro foi para a plataforma, e usar o total sem
  juros o deixaria parecendo margem.
- **Impostos** (`/tax-provisioning`): matriz ICMS/PIS/COFINS/IPI/ISS/CSLL/INSS/
  IRPJ por venda, alíquotas por regime (padrão Lucro Presumido serviços: PIS
  0,65 · COFINS 3 · ISS 5 · CSLL 2,88 · IRPJ 4,8) e **UMA conta a pagar por
  imposto** — o contribuinte recolhe o total do mês numa guia só; um título por
  venda sujaria o fluxo. Vencimentos padrão: PIS/COFINS 25 · ISS 10 · ICMS 20 ·
  IRPJ/CSLL/IPI último dia, sempre no mês SEGUINTE ao de competência.
  Chargeback/cancelada/reembolsada ficam fora da base (não houve faturamento).
  O botão só libera com a configuração completa (`pendenciasConfig`) — conta a
  pagar sem fornecedor é título órfão. "Propor fornecedores" cria Prefeitura,
  Fazenda Estadual e Ministério da Fazenda. As alíquotas são **editáveis**: ISS
  varia por município, ICMS por estado; o sistema garante a aritmética e o
  vencimento, não a alíquota.
- **Notas fiscais** (`/invoices`), **Assinaturas** (`/subscriptions`, sobre
  `lib/recorrencias`) e **Links de pagamento** (`/payment-links`).

### Central de Ajuda (`/dashboard/help`) + `core/ajuda`

`src/core/ajuda/index.ts` (`ajuda/1.0.0`, puro/tipado/demo-safe) — três abas:
Chat online · Tours guiados · Anúncios. ⚠️ **Nada aqui inventa conteúdo**: os
tours e as respostas de "como faço" saem do catálogo de guias que o sistema já
mantém por rota (`components/app/guides`). Uma segunda base envelheceria em
silêncio — a tela mudaria e o tour continuaria ensinando a versão antiga.

**O detector de segredos** (`core/ajuda/segredos.ts`) — o coração da parte.
"Não compartilhe senhas" é um aviso que ninguém lê; o que funciona é o sistema
ver o segredo ANTES de ele sair do navegador. Detecta senha declarada, JWT,
token (prefixo conhecido ou entropia), chave PIX (UUID), cartão (**Luhn**),
CPF/CNPJ (**dígito verificador**) e linha digitável — e **redige, não bloqueia**:
impedir o envio faria a pessoa reescrever a mesma mensagem por fora; o objetivo é
que a dúvida chegue ao suporte sem o segredo. O chamado grava o texto REDIGIDO.

- ⚠️ **A regra que decide se presta é NÃO GRITAR LOBO.** Um detector que acusa
  qualquer sequência longa treina a pessoa a ignorar o aviso — e aí o aviso
  deixou de existir. Por isso todo detector é ancorado e validado. O primeiro
  teste do próprio detector pegou o falso positivo que prova o ponto:
  `contas-a-pagar-2026-08-31` tem 3,4 bits/char e passava como token. **O que
  separa slug de token é a PONTUAÇÃO** — nome legível usa hífen entre palavras,
  token não; dois ou mais separadores ⇒ é nome. Guardas cobrem os dois lados:
  o que precisa ser pego E o que um financeiro escreve o dia inteiro (R$
  1.234,56, NF 000123456789, datas, slugs de rota).

**Chat em duas camadas** — CONCEITO ("o que é DRE") vem de `assistant-kb`; USO
("como emitir uma nota") vem do `comoUsar` do guia da tela, via `melhorGuia`.
⚠️ Sem a segunda camada, **14 das 16 perguntas sugeridas caíam em "não
encontrei"**, porque a KB responde conceito. A barra do `melhorGuia` é 3 pontos
(uma palavra no título ou três no corpo): menos que isso faria "valor" ou "tela"
elegerem uma tela qualquer com ar de resposta certa. Guarda no `engine-audit`
exige que **toda** sugestão resolva — sugestão órfã é pior que nenhuma.

**Tours derivados dos guias** (`catalogoTours` em `lib/ajuda-store`): 42 tours,
um por rota com ≥2 passos, agrupados pela seção do menu. ⚠️ **O disparo
automático tem duas travas**, porque um tour que reaparece deixa de ser ajuda e
vira obstáculo: **uma vez por tela, para sempre** (quem fechou, fechou) e **no
máximo um por sessão** (quatro telas atravessadas não podem render quatro
convites). E ele é um **convite discreto, não um modal** — a decisão anterior do
`PageGuide` (não abrir sozinho para não interceptar o clique da primeira visita)
continua valendo; há um interruptor para desligar de vez.

⚠️ **As telas das PARTES 08–11 não tinham guia** — descoberto ao medir a
cobertura das perguntas sugeridas. Foram adicionados 12 guias (Compras, Boletos,
NFs recebidas, os dois de Contabilidade, os seis de Administração e a própria
Ajuda), o que também levou o catálogo de tours de 30 para 42.

### Administração (`/dashboard/administration/*`) + `core/administracao`

`src/core/administracao/index.ts` (`administracao/1.0.0`, puro/tipado/demo-safe)
— a camada de CONFIGURAÇÃO: nada aqui apura dinheiro. Ela governa quem entra, o
que se conecta e o que sai, e por isso as regras que valem estão todas do lado
de **negar**. Seis telas com rota própria + hub de 6 abas em
`/dashboard/administration`.

- **Assinatura** (`subscription`): plano, ID, expiração com `diasRestantes` em
  dias de CALENDÁRIO (`diasEntre` fatia a string e compara em UTC — um "expira
  em 8 dias" que vira 7 depois das 21h é o erro que ninguém reporta), usuários
  ativos, dono ativo, panorama de contas e o que está conectado.
  ⚠️ **"Elegíveis sem conexão" ≠ "contas não conectadas"**: só entra o banco que
  TEM conector homologado; contar todas transformaria a métrica em ruído fixo.
- **Dados da empresa** (`company-data`, abas Dados gerais + Contatos): grava no
  **MESMO `a4p_company`** que o onboarding preencheu e `/configuracoes` lê — um
  segundo cadastro produziria duas razões sociais divergentes, e a que sai na
  nota fiscal seria a que ninguém editou. **O regime DECIDE o Simples**
  (`optantePeloSimples`), não é uma segunda caixinha: dois campos independentes
  divergem, e a divergência vira imposto errado. Logo até 5 MB; o aviso de
  200×200px é **sugestão, não bloqueio** (logo pequeno é melhor que nenhum).
- **Usuários** (`users`): lê `lib/governance` (RPCs com RLS em live).
  ⚠️ **O último admin não pode ser removido NEM rebaixado** (`podeRemover` /
  `podeTrocarPerfil`) — a organização ficaria sem quem convida outro, e desfazer
  exige justamente o papel que acabou de sumir. O dono também não sai: a
  titularidade se transfere. `usuariosDaEmpresa` costura o dono na lista quando
  a fonte não o traz (em demo `participantes` começa vazio, e a tela dizia
  "nenhum usuário" para quem estava logado).
- **Logs** (`audit-logs`): traduz a trilha encadeada de `core/institutional` (a
  que o sistema já assina por SHA-256) — um log paralelo discordaria do primeiro.
  O `resumo` é o **"de X para Y"** derivado de `before`/`after`: sem ele a busca
  por conteúdo seria inútil, porque ninguém procura "Lançamento", procura "de
  1.000 para 10.000". ⚠️ **`periodoForaDaJanela` avisa** quando o período pedido
  antecede os 30 dias de retenção: devolver vazio diria "nada aconteceu" quando
  a verdade é "isso foi descartado", e é numa auditoria que a diferença importa.
- **Integrações** (`integrations`): catálogo de 8 cartões (18 plataformas de
  venda · 19 bancos de Open Finance), cada um com painel próprio via
  `?cartao=`. ⚠️ **Um segredo se mostra UMA vez** (`mascararSegredo`): chave,
  token e senha de certificado aparecem no momento em que nascem e nunca mais —
  reexibi-los transforma qualquer print ou sessão aberta num vazamento que o
  dono não percebe. O que fica guardado é prefixo + 4 últimos. O **consentimento
  de Open Finance vale 12 meses** (regra do BC) e a tela avisa 30 dias antes:
  vencido significa extrato e saldo congelados. **Certificado A1 vencido = a
  captura de NF simplesmente para**, e ninguém nota, porque a tela continua
  abrindo. O Domínio tem **dois interruptores independentes** (NFs × extratos) —
  um só obrigaria a mandar o que ninguém pediu. O DDA exige **aceite**, não um
  toggle: a adesão é ato do titular.
  ⚠️ O estado vem do localStorage; lê-lo **durante o render** quebra a hidratação
  (o painel remontava do zero) — daí o gate `montado`.
- **Relatórios exportados** (`exported-reports`): ⚠️ os limiares são **por
  formato** (PDF > 300 linhas · XLSX > 5.000). Abaixo deles o arquivo baixa na
  hora e **não** entra na lista — registrar toda exportação transformaria a fila
  num log onde o relatório de 40 mil linhas que a pessoa espera se perderia.
  Retenção de 15 dias, e a exportação vencida **continua na lista marcada como
  expirada**: sumir faria parecer que ela nunca aconteceu.

### Contabilidade — a ponte com o contador (`/dashboard/accounting/*`)

`src/core/contabilidade/index.ts` (`contabilidade/1.0.0`, puro/tipado/demo-safe)
— as duas entregas que saem do sistema PARA fora. Nenhuma apura número novo:
elas empacotam o que o resto já apurou, e por isso o cuidado inteiro está em não
deixar sair errado. Rotas próprias + abas do hub `/contabilidade`.

**Envio de NFs ao contador** (`nfe-export`): pacote mensal com os XMLs de
entrada e saída. As duas pontas já existem — entrada são as **NFs Recebidas**
(`core/compras`) e saída são as notas das **Vendas** (`core/vendas`).

- ⚠️ **Double opt-in decide o status.** `statusEnvio` só devolve `ativo` com ao
  menos UM e-mail **verificado**. Não é etiqueta de newsletter: o pacote carrega
  a escrituração fiscal da empresa, e um endereço digitado errado — uma letra a
  mais no domínio — entregaria os XMLs a um estranho todo dia 1º, em silêncio,
  porque "o envio funciona". (Em demo há um botão "Simular confirmação"; em
  produção quem chama `verificarDestinatario` é o link do e-mail.)
- **Teto de 5 destinatários** — limite de escopo, não de infraestrutura.
- **`proximoEnvio` = dia 1º do mês SEGUINTE, 21h**, depois do fechamento: uma
  nota emitida no dia 31 à noite ainda é daquela competência. A data é montada
  **fatiando a string** (em UTC-3 um `Date` do dia 1º cai no mês anterior) e a
  virada de dezembro vira janeiro do ano seguinte, não mês 13.
- ⚠️ **"Arquivada" ≠ "existe".** `resumoMesNFs` só conta como arquivada a nota
  emitida a partir de `arquivamentoDesde` (a verificação do PRIMEIRO
  destinatário). Antes disso o sistema conta as notas mas não retém XML —
  mostrar "12 arquivadas" prometeria um pacote que ninguém montou.

**Gerar TXT contábil — Domínio** (`dominio-export`): o **consumidor** do campo
"Código contábil (Domínio)" que Contas bancárias e Centros de Custo pedem desde
a PARTE 03, e do `codigo` do Plano de Contas.

- **Partidas simples = uma conta por linha**, porque a outra ponta é fixa: é a
  conta bancária escolhida na tela. É por isso que ela pede o banco antes de
  carregar qualquer coisa — sem ele o arquivo não tem o outro lado. Saída
  **debita** a contrapartida, entrada **credita**.
- ⚠️ **O arquivo sai em ANSI (Windows-1252), não UTF-8** (`cp1252.ts`, encoder
  próprio — o `TextEncoder` do navegador só faz UTF-8). Um arquivo UTF-8 importa,
  os valores batem, e "Manutenção" chega como "ManutenÃ§Ã£o" no histórico de
  TODOS os lançamentos. A faixa 0x80–0x9F é onde o 1252 diverge do Latin-1 —
  travessão, reticências e aspas curvas, justamente o que aparece num histórico
  colado. O que não cabe é **transliterado** (acento removido), não descartado:
  "?" no meio da palavra é ruído que o contador não decifra. **O Blob é montado a
  partir dos BYTES** — passar a string faria o navegador regravar UTF-8. Quebras
  **CRLF**. Validado decodificando o arquivo com `cp1252` no Python (e a recusa
  do `utf-8` é a prova de que é ANSI).
- ⚠️ **Lançamento sem código contábil NÃO vira linha com o campo em branco** —
  ele sai da lista e entra em `pendencias`, listadas na tela. O Domínio aceita a
  linha vazia e joga o valor numa conta transitória: o mês fecha, o total bate, e
  o erro só aparece no balancete três semanas depois.
- Separador `;` — um ponto e vírgula dentro do histórico partiria a linha em duas
  e deslocaria todas as colunas seguintes daquele lançamento (`campoDominio`).
  Valor com **vírgula decimal e sem separador de milhar**; data `DDMMAAAA`
  fatiada da string. Débito e crédito **não fecham em zero** aqui: são os dois
  sentidos do extrato, não os dois lados de um mesmo lançamento.
- ⚠️ **A ordem dos campos varia entre versões do Domínio.** A emitida está em
  `LAYOUT_DOMINIO`, **visível na tela**, e a prévia mostra as linhas exatas antes
  de gerar — conferir contra a tela de importação do escritório evita reimportar
  um mês inteiro. O `ContabilidadeView` antigo (códigos `1.1.1`/`3.1.1`/`4.1.1`
  chumbados, sem conta, sem mês, Blob em UTF-8) foi **removido**: era exatamente
  o conjunto de erros que esta tela corrige.

### Compras (`/dashboard/purchases/*`) + `core/compras`

`src/core/compras/index.ts` (`compras/1.0.0`, puro/tipado/demo-safe) — a compra
como **PEDIDO que precisa de aprovação**, e é isso que a separa de "contas a
pagar". Três telas: a lista com o funil de aprovação, a Nova Compra e as duas
caixas de entrada fiscais (Boletos DDA · NFs SEFAZ).

- ⚠️ **`movimentosDaCompra` devolve vazio para tudo que não está aprovado.** É a
  regra central: um pedido *aguardando* que já entrasse no fluxo faria o dono
  planejar o mês contando com uma saída que talvez nunca aconteça, e um pedido
  *reprovado* ficaria para sempre pesando num caixa que nunca tocou. Aprovar/
  reprovar em `lib/compras-store` é o ÚNICO caminho que mexe no dinheiro — e a
  remoção usa `parcelasDaCompra` (não `movimentosDaCompra`, que já vem filtrado),
  senão reprovar deixaria títulos órfãos vivos.
- **Compra marcada como paga nasce APROVADA** (`statusInicial`): o dinheiro já
  saiu da conta, então ela não pode ficar aguardando autorização — o fluxo de
  caixa mostraria o dinheiro fora enquanto o card de aprovação ainda a contaria
  como pendente. Reconhecer o fato não afrouxa o controle: quem lançou segue no
  `criadoPor`.
- **Duas datas, dois relatórios:** vencimento é CAIXA (aging, e o filtro usa a
  data do PAGAMENTO quando a compra foi paga) · competência é RESULTADO (o mês
  no DRE). **A competência não se parcela** — comprar em março para pagar em 6x
  é uma despesa de março inteira. Parcelado exige ≥2 parcelas (sem quantidade
  não há o que criar) e a tela **mostra as datas antes de gravar**. O resto dos
  centavos vai na ÚLTIMA parcela; dia 31 em mês de 30 vira o último dia.
- Rateio por projeto/centro compara **centésimos inteiros** (o mesmo bug do
  `core/registros`: 33,33 × 3 = 99.99000000000001 e uma tolerância de 0,01
  rejeita a divisão em três). Anexos: **1 MB**, conferidos ANTES de guardar.

**Boletos Recebidos** (`received-boletos`) e **NFs Recebidas**
(`received-invoices`) dependem de integrações que não existem aqui — DDA pede
adesão bancária, captura de XML pede certificado A1/A3. **O documento, não.** As
telas nascem operáveis porque o número se explica sozinho:

- **`core/compras/boleto.ts`** — linha digitável (47) ⇄ código de barras (44),
  módulo 10 por campo + módulo 11 geral, banco, valor e vencimento. A remontagem
  é **posicional** (a linha reordena os campos e intercala 4 DVs que o código de
  barras não tem — não é "o mesmo número com pontinhos").
  ⚠️ **O fator de vencimento ACABA:** em 21/02/2025 chegou a 9999 e a FEBRABAN o
  reiniciou em 1000, então o mesmo fator representa duas datas separadas por
  9000 dias. Sem tratar o ciclo, todo boleto de 2025 em diante é lido com data
  de 2000-e-poucos e cai como "vencido há 20 anos". A desambiguação é por janela
  (mais de 3 anos no passado ⇒ ciclo novo); `fatorDaData` devolve o fator do
  ciclo CORRENTE, senão sairia com 5 dígitos e empurraria o campo livre uma casa.
  O beneficiário **não** está no código de barras (o campo livre é do banco):
  preenchê-lo com o banco emissor diria que o Itaú é quem cobra, quando ele é só
  o agente de arrecadação.
- **`core/compras/nfe.ts`** — chave de acesso (44): UF, competência de emissão,
  CNPJ do emitente, modelo (55 NF-e · 65 NFC-e · 57 CT-e), série, número e o DV
  módulo 11 (resto 0 ou 1 ⇒ 0 — nunca 10, que não cabe numa casa). O **modelo da
  chave** decide o tipo da nota, não o que o operador escolheria.
- Os filtros da NF são em **duas camadas** (rascunho × aplicado, botão "Aplicar
  filtros"): com volume de SEFAZ, refiltrar a cada tecla custa caro. O valor
  aceita "1300" e "1.300,00" e compara em **centavos**. Boleto e nota deduplicam
  pelo que os identifica de verdade — código de barras e chave de acesso.
- Persistência em `lib/compras-store` (localStorage). `CardAnel`/`Painel` (o
  cartão com anel do print) subiram para `components/paineis/shared.tsx`, agora
  compartilhados com Vendas. Guardas no `engine-audit`.

### QR Code (`src/lib/qrcode.ts`) — sem dependência

Modo byte, versões 1–10, nível M: GF(256), Reed-Solomon, as 8 máscaras e a
escolha por **penalidade** (máscara ruim = QR que "às vezes" lê). ⚠️ Os 15 bits
de formato entram do MAIS significativo para o menos (`14 - i`) e a cópia 2
divide em **7 + 8** — errar qualquer um dos dois produz um código de aparência
perfeita que **nenhum leitor decodifica**, porque o formato é a primeira coisa
lida. Foi assim que este arquivo nasceu quebrado. Validado por comparação
módulo a módulo com o `qrcode` do Python (0 diferenças) e por **decodificação
real via OpenCV**, inclusive com acento e travessão.

### Movimentações financeiras (`/dashboard/financial/*`) + `core/movimentacoes`

`src/core/movimentacoes/index.ts` (`movimentacoes/1.0.0`, puro/tipado/demo-safe)
— a camada OPERACIONAL do dinheiro: o que vence, o que já caiu, o que andou
entre contas. Tudo sobre o MESMO `RiskInput` do DRE/fluxo/risco.

- **Contas a receber / a pagar** (`/dashboard/financial/accounts-and-transfers`,
  `?tab=receivables|payables|transfers`): uma `TitulosView` com `direcao` — os
  dois lados são o mesmo problema espelhado. 4 cards com anel (recebidas · a
  receber · atrasadas · total, cada um com valor, quantidade e % do total),
  busca, filtro, **baixa em lote** (idempotente, via `pagarLote`/`receberLote`)
  e paginação de 50 a 5000.
- **Formulário** (`TituloForm`, `/dashboard/financial/{receivables|payables}/new`):
  as duas condicionais do print — marcar *realizado* revela data/valor/desconto;
  marcar *repetir* revela frequência e quantidade (obrigatórias: sem quantidade
  a recorrência geraria lançamento para sempre) e **mostra as datas** que serão
  criadas. Dia 31 num mês de 30 vira o último dia, nunca escorrega para o mês
  seguinte. Só o **pagar** tem Espécie (NF-e/NFS-e) e exibe a **chave PIX** do
  fornecedor escolhido. Anexos: png/jpg/jpeg/pdf/xml/xls/xlsx até 10 MB,
  checados ANTES de guardar.
- ⚠️ **Transferência é UM fato com DOIS lados.** O registro em
  `lib/movimentacoes` mantém os dois lançamentos amarrados; apagar o fato apaga
  os dois, senão o saldo entre as contas ficaria torto para sempre. Ela tem
  colunas PRÓPRIAS no fluxo de caixa — misturá-la com entradas/saídas inflaria
  o faturamento com dinheiro que já era da empresa. Origem = destino é recusado.
- **Conciliação** (`/dashboard/financial/reconciliation`): Quadros · Conferência
  · Regras · Fechamentos. A regra casa transação OFX com lançamento; a **ordem
  da lista é a prioridade** (a primeira que casa vence, como num firewall) e o
  desempate é arrastar. `candidatoPara` casa por sinal + valor a 1% + vencimento
  a até 5 dias — sem tolerância quase nada conciliaria. ⚠️ As funções "criar…"
  só agem quando NÃO acharam candidato: criar em cima de um título existente é
  o caminho mais curto para duplicar o financeiro.
- **Fatura do cartão** (`/dashboard/financial/credit-card-invoices`): agrupa por
  CICLO — compra depois do fechamento cai na fatura do mês seguinte. Depende de
  uma conta tipo Cartão com os dois dias preenchidos.
- **Extrato** (`/dashboard/financial/statement`) e **Fluxo de caixa do mês**
  (`/dashboard/reports/cash-flow`): saldo de abertura reconstruído do saldo de
  hoje — a mesma técnica do painel financeiro, para os dois fecharem no mesmo
  número.
- **Importação em lote** (`/dashboard/financial/import?tipo=…`): baixa o modelo
  `.xlsx`, sobe a planilha, **confere** e só então grava. Linhas com erro são
  ignoradas e listadas; as boas entram.

### Ler `.xlsx` (`lib/xlsx` `lerXLSX`) — sem dependência

Escrever era ZIP STORED; ler é mais duro porque planilhas reais vêm em DEFLATE.
A saída é a **`DecompressionStream("deflate-raw")`** do navegador — zero linhas
de inflate próprias. Lê `sharedStrings.xml` (o Excel/Sheets quase sempre usa) e
⚠️ **decodifica as referências NUMÉRICAS** (`&#231;`): o openpyxl e o Excel
gravam acentos assim, e sem isso "Descrição" chega "Descri&#231;&#227;o" — toda
importação em português vem quebrada. Round-trip validado contra `openpyxl`.

### Orçamento (`/dashboard/registrations/budgets`) + `core/orcamento`

`src/core/orcamento/index.ts` (`orcamento/1.0.0`, puro/tipado/demo-safe) — o
planejamento por categoria e mês, e a PONTE para o realizado.

- **Cadastro em 2 etapas**, e isso é regra: a alocação mensal só existe depois
  do período, porque é ele que decide quantas colunas a tabela tem. Etapa 1:
  nome, período, **regime** (competência/caixa), formato (detalhado/resumido),
  projeto, centro, descrição. Etapa 2: a tabela de alocação.
- ⚠️ **`orcadoPorLinha` é o elo:** o orçamento é digitado por CATEGORIA ("folha,
  40 mil/mês") e o relatório compara por LINHA da cascata (Despesas
  Operacionais). Cada categoria orçada vira um movimento SINTÉTICO e passa pelo
  MESMO classificador de `core/relatorios` — senão previsto e realizado
  comparariam linhas diferentes e o desvio seria fantasia. As linhas "=" saem
  das próprias fórmulas.
- **`distribuir`** põe o resto no ÚLTIMO mês: 100 ÷ 3 = 33,33 × 3 = 99,99 e o
  orçamento nasceria com um centavo a menos que o digitado.
- **`ajustarAlocacoes`** mantém uma casa por mês quando o período muda —
  tamanho diferente mostraria o valor do mês errado, calado.
- **Só orçamentos do MESMO regime** aparecem no DRE (competência) e no DFC
  (caixa): confrontar regimes diferentes produz um desvio que não diz nada. Se
  o orçamento não cobre a janela toda, a tela avisa quantos meses ficaram sem
  previsto.
- ⚠️ **A cor da diferença vem do SINAL DA LINHA**, não do sinal do número: numa
  linha de despesa, gastar mais que o orçado é diferença positiva e é RUIM.
  Pintar de verde diria que estourar o orçamento foi um bom resultado.
- Persistência em `lib/orcamentos` (localStorage). É também aba do hub de
  Cadastros. Distinto de `/orcamento` (Planejado × Realizado + "Posso
  comprar?"), que é a tela de ANÁLISE — aqui é o cadastro.

### Consolidação multiempresa de verdade (`0020`)

`org_movements(de, ate)` e `org_balances()` (`SECURITY DEFINER`, escopadas às
orgs do `auth.uid()` via `organization_members`, anon revogado) devolvem os
**lançamentos** de cada organização — o `org_consolidado` (0013) só dava totais,
e a cascata precisa classificar lançamento a lançamento. `getRiscoInputPorOrg`
(`lib/consolidado`) monta um `RiskInput` por org; devolve `null` quando a RPC
não existe (migration pendente) e a tela cai na empresa atual **dizendo isso**.
Migration gerada como arquivo — aplicar ao remoto.

### Cadastros (`/cadastros` — hub de 10 abas) + `core/registros`

`src/core/registros/index.ts` (`registros/1.0.0`, puro/tipado/demo-safe) — as
regras que as telas de cadastro compartilham. Cada aba tem **rota própria** em
`/dashboard/registrations/{bank-accounts|chart-of-accounts|products|projects|
cost-centers|clients|suppliers|contracts}` e abre sozinha; no hub viram abas
(`HubShell`/`ShellGate`) para o menu não ganhar nove entradas.

- **Chrome comum** em `src/components/registros/kit.tsx` (`CabecalhoRegistro`
  com "Novo X" + "Exportar XLSX" · `FiltrosRegistro` busca+selects ·
  `TabelaRegistro` com **ID copiável** · `Campo`/`BlocoForm`/`InputDia` ·
  `VazioRegistro`). Mudar o comportamento aqui muda nas oito telas.
- **Contas bancárias**: a regra que dá caráter é o **cartão de crédito** —
  escolhido o tipo, aparecem e passam a ser OBRIGATÓRIOS os dias de fechamento
  e vencimento da fatura (1–31). Campos extras (tipo, agência, número, código
  Domínio, dias) vivem em `lib/registros` indexados pelo id: `financial_accounts`
  não tem essas colunas e o saldo continua vindo da fonte real.
- **Plano de Contas** (substitui o `PlanoDeContasView` estático, agora removido;
  `/contabilidade?aba=plano-de-contas` aponta para cá): árvore **editável**
  (adicionar subcategoria, renomear, excluir), fio de cor por natureza (verde
  receita · vermelho despesa), busca que **mantém os pais** de quem casa, e
  `idsComDescendentes` para excluir grupo levando os netos. Subcategoria HERDA a
  natureza do grupo. Aba **Uso Padrão**: as **18 funções** de `USOS_PADRAO`
  amarradas a UMA categoria cada (só folhas entram).
- **Clientes × Fornecedores**: uma view (`PartesView lado=…`) — a mesma entidade
  `parties` com a flag invertida. Muda o vocabulário, a categoria padrão
  (receita × despesa) e o bloco só do fornecedor (chave PIX + Dados PJ). Abas
  Cadastro/Resumo. ⚠️ **`listParties` não devolve o endereço**, então os campos
  abrem vazios ao editar: o endereço só entra no patch quando foi PREENCHIDO na
  sessão — gravá-lo vazio apagaria o que está no banco.
- **Contratos**: rateio por projeto e centro que precisa **fechar 100%** e
  **vendas associadas** (só no contrato de CLIENTE) — `vendasDoContrato` traduz
  competência (dia fixo × mesma data) e vencimento (mesmo mês × seguinte) em
  datas reais dentro da vigência, e a tabela mostra o que SERÁ criado. Dia 31 em
  fevereiro vira o último dia do mês. Anexo único de 5 MB, checado antes de
  guardar.
- ⚠️ **Rateio compara CENTÉSIMOS inteiros**, não float: `33,33 × 3` soma
  `99.99000000000001` e `Math.abs(soma − 100) <= 0.01` dá `0.010000000000005` —
  rejeitava a divisão em três, que é a mais comum que existe. Guarda no
  `engine-audit`.

### Exportar XLSX (`src/lib/xlsx.ts`) — sem dependência

Um `.xlsx` é um ZIP de XMLs, e ZIP aceita entradas **STORED** (sem compressão):
`gerarXLSX`/`baixarXLSX` emitem o arquivo real (CRC32 + headers ZIP + as 5
partes do pacote OOXML) em ~150 linhas. O `xlsx` do npm acumulou CVEs e migrou
para fora do registro — não vale trazer isso para dentro de um ERP financeiro
por causa de um botão. Números saem como número (`<v>`), texto como `inlineStr`,
`&`/`<` escapados (um `&` cru invalida o XML e o Excel recusa o arquivo INTEIRO),
caracteres de controle removidos e nome de aba saneado (31 chars, sem `:\/?*[]`).
Data fixa em 1980-01-01 → mesma tabela, mesmos bytes. Validado com `openpyxl`.

### Painéis fechados (`/dashboard/dashboards` — hub de 7 abas)

`src/core/paineis/index.ts` (`paineis/1.0.0`, puro/tipado/demo-safe) — os
dashboards CURADOS, ao lado do construtor. Cada painel responde uma pergunta
definida e sai do MESMO `RiskInput` do DRE/fluxo/risco; o **EBITDA chega por
`dreGerencial`**, não por conta paralela. Nenhum número é digitado ou estimado
por fora. Um destino de menu (**Dashboards**), 7 abas, e cada painel com **rota
própria** (`/dashboard/dashboards/financial|sales|subscriptions|payables|
receivables`, `/dashboard/financial/calendar`) — o `HubShell`/`ShellGate` de
sempre.

- **Financeiro** (`painelFinanceiro`): saldo do mês, geração de caixa (mês e
  acumulada), entradas/saídas por categoria. ⚠️ **Saldo de mês passado não fica
  guardado** — parte-se do saldo de hoje e desfaz-se o que foi liquidado depois
  do fim daquele mês (no mês corrente dá o próprio saldo atual).
- **Vendas** (`painelVendas`): CAC · LTV · LTV/CAC · EBITDA em 3 janelas (mês/
  trimestre/ano) + faturamento, reembolsos, chargebacks e as curvas semana/ano.
  As definições são **explícitas no `InfoHint`** porque CAC e LTV mudam de
  empresa para empresa: **CAC** = gasto de marketing ÷ clientes NOVOS (primeira
  receita da história no período); **LTV** = (receita ÷ clientes que pagaram) ×
  margem do período — medida do PERÍODO, não projeção de vida (exigiria churn
  confiável); **chargeback** = entrada CANCELADA. Sem gasto de aquisição o
  **LTV/CAC mostra "—"**, não `0,00`: indefinido ≠ péssimo. A curva do ano
  **para no mês corrente** — mês futuro não vendeu zero, ele não aconteceu.
- **Assinaturas** (`painelAssinaturas`): MRR/ARR/assinantes/churn/produtos sobre
  `lib/recorrencias` (o mesmo contrato que projeta faturas para o fluxo). **MRR
  normaliza o ciclo** (anual de 1.200 = 100/mês) e o MRR por produto é rateado
  pelo peso do item na fatura.
- **Contas a pagar / a receber** (`painelTitulos`): UMA view (`TitulosView
  direcao=…`) — pagar e receber são o mesmo problema espelhado. Janela **por
  vencimento** (é ela que responde "o que cai no período"), total + pago/a
  vencer/atrasado, distribuição, fluxo de vencimentos empilhado e maiores
  contrapartes. Nas áreas grandes (donut/barras) a cor de status entra a **70%
  via `color-mix`** — cor semântica é sinal, chapada num donut vira fill.
- **Calendário** (`painelCalendario`): grade em semanas inteiras (sempre começa
  no domingo), colorir por **Fluxo diário** × **Saldo total**, intensidade
  proporcional ao maior valor DO MÊS (zero é neutro). O saldo parte do fim do
  mês anterior e **fecha no saldo do painel financeiro**.
- **Filtros:** `FiltrosPainel` oferece **Conta**, **Centro de custo** e
  **Projeto** — os três recortes que existem no lançamento e chegam ao motor.
  (O projeto passou a existir de verdade; ver "Projeto no lançamento".) Cada
  select só habilita quando há o que escolher.
- Peças comuns em `src/components/paineis/shared.tsx` (`MesPicker`,
  `FiltrosPainel`, `KpiSimples`/`KpiJanelas`/`KpiStatus`, `ListaFatias`).
  Guardas de valor fechado no `engine-audit`.

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
npm run consistencia  # A MATRIZ DE CONSISTÊNCIA CRUZADA (scripts/consistencia.mts):
                   # exige que DOIS CAMINHOS diferentes cheguem ao MESMO número.
                   # 14 linhas confrontando Home × canônico, DRE × canônico,
                   # gráfico diário × total do período, risk-engine × quant ×
                   # canônico (burn/runway), assinaturas × Investor Update ×
                   # canônico (MRR) e razão × extrato. É a guarda do "uma
                   # verdade só" — sem ela os mesmos defeitos voltam.
                   # Cobre também a ONDA 2: idempotência da ingestão (reimportar
                   # o mesmo extrato não grava nada; nenhuma linha legítima vira
                   # duplicata), taxonomia única (extrato e OCR classificam
                   # igual), limpeza retroativa (mantém o primeiro de cada
                   # grupo), gating de plano (menu e servidor coincidem) e as
                   # duas telas de "a receber" (posição × fluxo). E a ONDA 9:
                   # teto ZERO de consultas sem limite de linhas, uma linha de
                   # outra empresa reprova o isolamento, "não testei" não é
                   # aprovação, e a segregação de funções (quem pede não
                   # autoriza) nos dois sentidos. E as ONDAS 10/11: natureza de
                   # cada indicador (fato x estimativa x projeção), artefato
                   # externo com marca, intervalo invertido recusado na entrada,
                   # falha com dono, teto ZERO de cálculo em tela, glossário
                   # aplicado, nenhum texto de interface em inglês, uma grafia da
                   # marca e um formato por grandeza. E a ONDA 8:
                   # o expurgo REMOVE o cache vencido (ignorar não é expirar) e
                   # preserva o válido, o backup leva só dado de negócio e
                   # recusa chave estranha ao restaurar, e enxugar o disco não
                   # apaga o que o servidor ainda não confirmou.
npm run reconciliacao # A MATRIZ PAR A PAR (scripts/reconciliacao.mts): para cada
                   # indicador, TODOS os caminhos que o sistema tem de calculá-lo,
                   # confrontados em todas as n(n-1)/2 combinações, com critério de
                   # UM CENTAVO. 13 indicadores · 42 caminhos · 53 pares. A matriz
                   # de consistência compara pares ESCOLHIDOS (protege o que
                   # alguém já viu quebrar); esta não depende de ninguém ter
                   # previsto qual par quebraria. Burn e runway são reconciliados
                   # sobre uma empresa QUE QUEIMA — na fixture principal os dois
                   # dão zero/teto, e comparar zeros não reconcilia nada.
npm run mobile     # A MEDIÇÃO NO TELEFONE (scripts/mobile.mjs): Chromium a 390x844
                   # contra o build de produção — orçamento de desempenho por
                   # tela, alvos de toque, hierarquia de cabeçalhos e auditoria
                   # axe (WCAG 2.1 AA). Fora do `npm test` porque exige o app
                   # SERVIDO: uma suíte que precisa de build deixa de ser rodada
                   # antes de commitar. Suba `npx next start -p 3100` antes.
npm run fluxos     # OS QUATRO FLUXOS ESSENCIAIS no telefone, dirigidos toque a
                   # toque: consultar saldo, aprovar pagamento, lançar despesa e
                   # fotografar comprovante. "A tela abre" e "a tarefa termina"
                   # são perguntas diferentes — foi este que achou o "Criar"
                   # dentro da gaveta e a câmera que abria a galeria.
npm test           # suíte completa: typecheck + smoke + corpus + values + edge
npm run ia-eval    # O CONJUNTO DE AVALIAÇÃO DA IA (scripts/ia-eval.mts): 31 casos
                   # conhecidos que fixam o comportamento da RESPOSTA, não da
                   # fórmula — número citado == canônico, fonte citada, projeção
                   # no condicional, confiança com critério. Existe separado do
                   # corpus e do values porque mexer no prompt ou trocar o modelo
                   # não toca em fórmula nenhuma e passaria pelas outras guardas.
                   # + kb + tz + audit + consistencia + reconciliacao + ia-eval
                   # (11 guardas). Rode antes de commitar mudanças
                   # no motor da IA / core/* / lib de dados. Também roda no CI
                   # (.github/workflows/ci.yml) em push/PR.
```
