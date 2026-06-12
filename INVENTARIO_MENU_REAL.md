# INVENTÁRIO DO MENU E DAS ROTAS — verdade do código (somente-leitura)

> Sessão somente-leitura. Nenhum arquivo de código alterado. Fonte da verdade:
> o App Router (`src/app/*/page.tsx`) + `Sidebar.tsx`. Toda afirmação carrega
> `arquivo:linha`. Branch `claude/epic-fermi-i423xk` · 2026-06-12.

---

## 1. Confirmação do PASSO 0

1. **Roteador raiz:** não existe um `routes.tsx` — o projeto é **Next.js App
   Router**. Cada rota é um `src/app/<rota>/page.tsx`; o shell raiz é
   `src/app/layout.tsx` e a home é `src/app/page.tsx`. Sem route groups
   (`ls src/app` não tem `(grupo)`).
2. **Componente do menu lateral:** `src/components/dashboard/Sidebar.tsx` —
   array `NAV` em **linhas 33-55** (21 itens) e `FOOTER` em **57-61** (3 itens).
3. **Total de rotas:** **29** arquivos `page.tsx` (21 no NAV + Configurações e
   Adicionar Empresa no FOOTER + `/login` + 3 stubs de redirect:
   `/visao-geral`, `/inbox`, `/import`).

---

## 2. Tabela mestra

> "Engines" = motor real que a tela consome (resolvido pelos hooks de
> `src/components/visao-geral/hooks.ts`). Quase todos os motores leem o mesmo
> hub **`getRiscoInput()`** (`src/lib/data.ts:319`), que em demo lê
> `imported.ts ?? seed` e em live o Supabase.

| # | Rótulo menu | Path | Componente (arq:linha) | Engines / libs | Stores/tabelas | Escreve? | Domínio | Órfã? |
|---|---|---|---|---|---|---|---|---|
| 1 | Início | `/` | `OverviewGrid` (`src/app/page.tsx:3` → `components/visao-geral/OverviewGrid.tsx`) | `useReceivables/usePayables/useAccounts/useDailyCashflow/useSalesChart` + cockpit `useQuantitativo/useCentroInteligencia/useRiscoInput`; monta `UploadWizard` | `getRiscoInput`→`imported.ts ?? seed` / Supabase | **escreve** (via FAB `UploadWizard`→`confirmarDocumento`) | OPERACAO | não |
| 2 | Upload de dados | `/upload` | `UploadView` (`components/upload/UploadView.tsx`) = `InboxView` + `ImportView` | FDIP `analisarImportacao`; OCR `lerDocumento` (`ocr-ingest.ts`); `aplicarOnboarding` | `imported.ts` / Supabase; `/api/inbox/ocr` | **escreve** (ImportView) · Inbox **só-leitura** (ver D4) | OPERACAO | não |
| 3 | Fluxo de Caixa | `/fluxo-caixa` | `FluxoCaixaView` (`components/fluxo-caixa/FluxoCaixaView.tsx`) | `montarFluxoCaixa` (`core/cashflow`) → `scoreRiscoCaixa`+`analisarQuantitativo`+`decidir`+`preverCaixa`+`centroInteligencia`+`financialDRE`; `simularCenario` | `getRiscoInput`+`getAccountsList` | só-leitura | OPERACAO | não |
| 4 | Copiloto | `/copiloto` | `CopilotoView` (`components/copiloto/CopilotoView.tsx`) | `centroInteligencia` (`core/executive`) | `getRiscoInput` | só-leitura | IA_ENGINE | não |
| 5 | DRE | `/dre` | `DREView` (`components/dre/DREView.tsx`) | `financialDRE` (`core/dre`) via `useDRE` | `getRiscoInput` | só-leitura | RELATORIOS | não |
| 6 | **Inteligência** | `/inteligencia` | `QuantView` (`components/quant/QuantView.tsx`) | `analisarQuantitativo` (`core/quant` = `quant/1.0.0`) | `getRiscoInput` | só-leitura | IA_ENGINE | não |
| 7 | Decisão | `/decisao` | `DecisaoView` (`components/decisao/DecisaoView.tsx`) | `decidir` (`core/decision`) + `preverCaixa`+`gerarRecomendacoes` | `getRiscoInput` | só-leitura | IA_ENGINE | não |
| 8 | Autônomo | `/autonomo` | `AutonomoView` (`components/autonomo/AutonomoView.tsx`) | `operacaoAutonoma` (`core/autonomous`) + `useUpdateParty` | `getRiscoInput`+`getAccountsList`; cobrança WhatsApp | só-leitura (dispara cobrança externa) | IA_ENGINE | não |
| 9 | Risco de caixa | `/risco` | `RiscoView` (`components/risco/RiscoView.tsx`) | `scoreRiscoCaixa` (`core/risk-engine`) | `getRiscoInput` | só-leitura | IA_ENGINE | não |
| 10 | Inadimplência | `/inadimplencia` | `InadimplenciaView` (`components/inadimplencia/InadimplenciaView.tsx`) | `analisarInadimplencia` (`core/risk`) | `getRiscoInput` | só-leitura | IA_ENGINE | não |
| 11 | Orquestração | `/orquestracao` | `OrquestracaoView` (`components/orquestracao/OrquestracaoView.tsx`) | `FinancialOrchestrator` (`core/orchestration`), stateful `useRef` | `getRiscoInput` | só-leitura (estado in-memory, não persiste) | IA_ENGINE | não |
| 12 | Infraestrutura | `/infraestrutura` | `InfraestruturaView` (`components/infraestrutura/InfraestruturaView.tsx`) | `FinancialPlatform` (`core/platform`), stateful `useRef` | independente de demo/live | só-leitura (console técnico) | IA_ENGINE | não |
| 13 | Arquitetura | `/arquitetura` | `ArquiteturaView` (`components/arquitetura/ArquiteturaView.tsx`) | `arquiteturaInstitucional` (`core/architecture`) + `core/reliability` + `treasuryCore` | `getAccountsList`+`getRiscoInput` | só-leitura (console técnico) | IA_ENGINE | não |
| 14 | **Inteligência de dados** | `/dados` | `DadosView` (`components/dados/DadosView.tsx`) | `analisarMoat` (`core/datamoat` = `datamoat/1.0.0`) + `analisarQuantitativo` | `getRiscoInput` | só-leitura | IA_ENGINE | não |
| 15 | Governança | `/governanca` | `InstitutionalView` (`components/institucional/InstitutionalView.tsx`) | `getAuditTrail` (`core/institutional`: audit/rbac/approval) | `audit_log` (live) / `demo.ts` | só-leitura | CONFIG (governança) | não |
| 16 | Conciliação | `/conciliacao` | `ReconciliationView` (`components/financial-os/ReconciliationView.tsx`) | `core/financial-os` (`reconciliarAutomaticamente`) + `lib/financial-os` | `lib/financial-os` (seed/importado) | só-leitura (demo) | OPERACAO | não |
| 17 | Automações | `/automacoes` | `AutomacoesView` (`components/financial-os/AutomacoesView.tsx`) | `operarFinanceiroOS` (`core/financial-os`) + `loadAutomacoes/persistRule` (`lib/financial-os`) | `financial_rules`/`rule_executions` (live) | **escreve** (regras + auditoria, live) | OPERACAO (regras) | não |
| 18 | Vendas | `/vendas` | `page.tsx` inline (`EntityTable`+`useSalesList`) (`src/app/vendas/page.tsx:4-5`) | `listSales` (`lib/cadastros`) | `sales_docs` / `DEMO_SALES` | escreve (NewButton→`VendaCompraForm`) | RELATORIOS (lista de vendas) | não |
| 19 | Produtos | `/produtos` | `page.tsx` inline (`useProductsList`) | `listProducts` (`lib/cadastros`) | `products` / `DEMO_PRODUCTS` | escreve (NewButton→`ProdutoServicoForm`) | CADASTRO | não |
| 20 | Serviços | `/servicos` | `page.tsx` inline (`useServicesList`) | `listServices` (`lib/cadastros`) | `services` / `DEMO_SERVICES` | escreve (NewButton) | CADASTRO | não |
| 21 | Contatos | `/contatos` | `page.tsx` inline (`usePartiesList`+`PartyForm`) (`src/app/contatos/page.tsx:5-7`) | `listParties` + `createParty`/`updateParty` (`lib/cadastros`) | `parties` / `DEMO_PARTIES`/`imported` | **escreve** (criar/editar contato) | CADASTRO | não |
| F1 | Configurações | `/configuracoes` | `ConfiguracoesView` (`components/configuracoes/ConfiguracoesView.tsx`) | `lib/company` (`saveCompany`/`getOrganizationName`) | `localStorage a4p_company` + Supabase org | **escreve** (localStorage/identidade) | CONFIG | FOOTER |
| F2 | Central de Ajuda | — (sem href) | — (`Sidebar.tsx:59`, sem `href`) | — | — | — | INDEFINIDO | **órfã de rota** (item sem rota) |
| F3 | Adicionar Empresa | `/comecar` | `OnboardingWizard` (`components/onboarding/OnboardingWizard.tsx`) | `analisarImportacao`+`aplicarOnboarding`+`aplicarEstrutura`; `core/onboarding` (DNA/maturity) | Supabase (contas/centros/unidades) + `imported` | **escreve** | CONFIG (onboarding) | FOOTER |
| — | (sem menu) | `/recebiveis` | `MovementsTable` (`src/app/recebiveis/page.tsx`) | `getOpenMovements("entrada")` | `movements` pendentes | só-leitura | RECEBER | **órfã de menu** (só via card da home) |
| — | (sem menu) | `/pagaveis` | `MovementsTable` (`src/app/pagaveis/page.tsx`) | `getOpenMovements("saida")` | `movements` pendentes | só-leitura | PAGAR | **órfã de menu** |
| — | (sem menu) | `/login` | `page.tsx` inline (Supabase auth) | `supabase.auth` | `auth` | escreve (sessão) | CONFIG | órfã de menu (gate de auth) |
| — | (redirect) | `/visao-geral` | `redirect("/")` (`src/app/visao-geral/page.tsx`) | — | — | — | INDEFINIDO | **stub** (só redireciona) |
| — | (redirect) | `/inbox` | `redirect("/upload")` (`src/app/inbox/page.tsx`) | — | — | — | INDEFINIDO | **stub** (era a Caixa de Entrada) |
| — | (redirect) | `/import` | `redirect("/upload")` (`src/app/import/page.tsx`) | — | — | — | INDEFINIDO | **stub** (era o Onboarding inteligente) |

---

## 3. Respostas dirigidas

### D1. Os dois "Inteligência" são o mesmo destino? **NÃO — são dois motores distintos.**
- **"Inteligência"** → `/inteligencia` → `QuantView` → `useQuantitativo` →
  `analisarQuantitativo` (`core/quant`, versão `quant/1.0.0`). Camada
  quantitativa (KPIs, score de saúde, radar, cenários).
  Evidência: `Sidebar.tsx:39`; `components/quant/QuantView.tsx` (`useQuantitativo`).
- **"Inteligência de dados"** → `/dados` → `DadosView` → `useMoat` →
  `analisarMoat` (`core/datamoat`, versão `datamoat/1.0.0`). Moat de dados
  cross-tenant (coorte sintética, modelo self-improving, benchmark, DNA).
  Evidência: `Sidebar.tsx:47`; `components/dados/DadosView.tsx` (`useMoat`).
- **Veredito:** **não é duplicata** — paths, componentes e engines diferentes.
  O problema é **nomenclatura**: a palavra "Inteligência" repetida em dois itens
  causa confusão de rótulo, não de destino.

### D2. "Infraestrutura" e "Arquitetura" são IA ou config técnica? **São consoles técnicos de engine (demo), não config.**
- **`/infraestrutura`** → `InfraestruturaView` → `FinancialPlatform`
  (`core/platform`): ledger core, fila de pagamentos, idempotência,
  observabilidade. Console **stateful** (`useRef`), independente de demo/live.
  Não é tela de setup do usuário — é a **vitrine do motor de infraestrutura**.
- **`/arquitetura`** → `ArquiteturaView` → `arquiteturaInstitucional`
  (`core/architecture`) + `core/reliability` (CircuitBreaker/DLQ) + `treasuryCore`.
  Mostra camadas institucionais, serviços, pipeline, reliability console,
  observabilidade. Também **console de motor**, não config.
- **Veredito:** ambas = **IA_ENGINE / console técnico**. Nenhuma é tela de
  configuração editável; são demonstrações de arquitetura/infra com estado
  in-memory.

### D3. Quantos dos ~10 itens de IA têm tela própria? **Todos os 10 têm componente próprio (nenhum reaproveita shell além do AppShell).**
| Item | Componente próprio | Engine |
|---|---|---|
| Copiloto | `CopilotoView` | `centroInteligencia` |
| Inteligência | `QuantView` | `analisarQuantitativo` |
| Decisão | `DecisaoView` | `decidir` |
| Autônomo | `AutonomoView` | `operacaoAutonoma` |
| Risco de caixa | `RiscoView` | `scoreRiscoCaixa` |
| Inadimplência | `InadimplenciaView` | `analisarInadimplencia` |
| Orquestração | `OrquestracaoView` | `FinancialOrchestrator` |
| Infraestrutura | `InfraestruturaView` | `FinancialPlatform` |
| Arquitetura | `ArquiteturaView` | `arquiteturaInstitucional`+`treasury` |
| Inteligência de dados | `DadosView` | `analisarMoat` |
- São **10 componentes distintos**, cada um com seu engine. **Não** há
  reaproveitamento de um "shell de Copiloto" com abas — são 10 telas separadas.
  Observação (não é reforma, é fato): vários consomem o **mesmo `getRiscoInput`**,
  então poderiam virar abas/seções de um centro único sem perder dado.

### D4. `Upload de dados` duplica captura? **Existem 4 superfícies de captura; 3 persistem, 1 é no-op.**
- **`UploadWizard`** (FAB da home) — `confirmarDocumento` (`upload-doc.ts`) +
  `aplicarOnboarding` (lote) + `lerDocumento` (OCR). **Persiste.**
  Evidência: `components/upload/UploadWizard.tsx:98,115,67`.
- **`ImportView`** (seção do `/upload`) — `aplicarOnboarding`.
  **Persiste.** Evidência: `components/import/ImportView.tsx:58`.
- **`OnboardingWizard`** (`/comecar`) — `aplicarOnboarding`/`aplicarEstrutura`.
  **Persiste.** Evidência: `components/onboarding/OnboardingWizard.tsx:118`.
- **`InboxView`** (seção do `/upload`) — só `analisarImportacao` para montar a
  lista; o botão "Confirmar e processar" **não grava** (no-op).
  Evidência: `components/inbox/InboxView.tsx:64` (lista) e `:139-141` (no-op).
- **Veredito:** o `/upload` **consolida 3** dessas superfícies numa página
  (Inbox + Import na `UploadView`, + o Wizard na home), mas há **redundância
  real** entre Wizard ↔ ImportView (ambos chamam `aplicarOnboarding`) e
  **sobreposição com `/comecar`**. A 4ª (Inbox) é captura **aparente** que não
  persiste — é o achado mais grave de captura.

### D5. Vendas / Produtos / Serviços / Contatos — CRUD ou relatório?
- **Vendas** (`/vendas`) — **RELATORIOS**: a tela é uma **listagem** de
  `sales_docs` (`useSalesList`), com criação via `NewButton`→`VendaCompraForm`.
  Predominantemente leitura/relatório de vendas. (`src/app/vendas/page.tsx:5,62,71`).
- **Produtos** (`/produtos`) — **CADASTRO** (catálogo `listProducts` + criar).
- **Serviços** (`/servicos`) — **CADASTRO** (catálogo `listServices` + criar).
- **Contatos** (`/contatos`) — **CADASTRO** (CRUD: `listParties` + `createParty`
  + `updateParty`/editar). (`src/app/contatos/page.tsx:5-7,96`).

---

## 4. Mapa de duplicatas e órfãs

**Duplicatas / sobreposições (com evidência):**
- **Captura de dados em 3 lugares que persistem:** `UploadWizard`
  (`upload/UploadWizard.tsx:98,115`) ↔ `ImportView` (`import/ImportView.tsx:58`)
  ↔ `OnboardingWizard` (`onboarding/OnboardingWizard.tsx:118`) — todos chamam
  `aplicarOnboarding`. Wizard e ImportView fazem a mesma ingestão OFX/CSV.
- **Rótulo "Inteligência" repetido:** `Sidebar.tsx:39` ("Inteligência") e
  `:47` ("Inteligência de dados") — destinos diferentes, nome colidente.
- **Captura fantasma:** `InboxView.confirmar` (`inbox/InboxView.tsx:139-141`)
  promete propagar mas não escreve — duplica a aparência da captura do Wizard.

**Órfãs:**
- **Item de menu sem rota:** "Central de Ajuda" (`Sidebar.tsx:59`, sem `href`).
- **Rotas sem item de menu (mas alcançáveis):** `/recebiveis`, `/pagaveis`
  (abertas pelos cards A receber/A pagar da home), `/login` (gate de auth).
- **Stubs de redirect (rota existe, sem UI/menu):** `/visao-geral`→`/`,
  `/inbox`→`/upload`, `/import`→`/upload`.
- **Componentes que existem mas não são roteados diretamente:** `InboxView` e
  `ImportView` (só renderizados dentro de `UploadView`); `UploadWizard` (montado
  na home, não tem rota). Não são órfãos de fato — são compostos.

---

## 5. Contagem por domínio (dimensiona a reforma)

| Domínio | Qtd | Rotas |
|---|---|---|
| **IA_ENGINE** | **10** | copiloto, inteligencia, decisao, autonomo, risco, inadimplencia, orquestracao, infraestrutura, arquitetura, dados |
| **OPERACAO** | 5 | `/`, upload, fluxo-caixa, conciliacao, automacoes |
| **CONFIG** | 4 | configuracoes, comecar, governanca, login |
| **CADASTRO** | 3 | produtos, servicos, contatos |
| **RELATORIOS** | 2 | dre, vendas |
| **RECEBER** | 1 | recebiveis |
| **PAGAR** | 1 | pagaveis |
| **INDEFINIDO** | 4 | visao-geral*, inbox*, import* (stubs) + "Central de Ajuda" (sem rota) |
| **CONTAS** | 0 | — (saldo só dentro da home) |
| **CARTOES** | 0 | — ("Produtos" é catálogo, não cartões) |

**Headline para a reforma:** dos **21 itens do menu NAV**, **10 são motores de
IA** (≈48% do topo) — todos consumindo o mesmo `getRiscoInput`. PAGAR/RECEBER
estão **fora do menu** (órfãos, só via card). Não há agrupador CONTAS/CARTOES.
"Inteligência" aparece duas vezes (rótulos colidentes, destinos distintos).

---

*Observações registradas, sem reforma. Próxima sessão decide a reorganização
sobre estes fatos.*
