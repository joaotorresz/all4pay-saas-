# Auditoria de correlações de dados — all4pay

> Mapa do que foi construído nesta linha de trabalho, de **como os dados se
> correlacionam** entre os módulos, e — o ponto central — das **correlações que
> não estão funcionando** (com evidência em arquivo:linha, impacto e correção
> sugerida). Gerado a partir de inspeção do código, não só da documentação.

Branch: `claude/epic-fermi-i423xk` · data da auditoria: 2026-06-12

---

## 1. Inventário do que foi construído

Agrupado por área (commits desta sequência de trabalho, do mais antigo ao mais
recente).

### Copy / onboarding / cobrança (base)
- **Copy da Início** + período do fluxo de caixa (`9ca6a4b`).
- **Notificações reais**: WhatsApp via Twilio + e-mail via Resend, server-side
  (`27cef58`); cobrança por cliente (`f388de7`); endpoint de teste manual
  (`abdb1c7`); templates aprovados (`aeae734`); selo de status (`c37ae62`).
- **Motor de regras (financial-os)** operando sobre eventos reais em live
  (`8e67afd`).
- **Onboarding "Criar empresa"** em 7 passos + Financial DNA + Maturity Score
  (`88fba6a`), conclui autenticando e entrando no sistema (`07c72eb`),
  **persiste a estrutura** (contas/centros/unidades) (`d01b8f9`).
- **Golden path**: liga movimentos importados às parties (`726fa7e`); editar
  contato + telefone inline na cobrança (`1f5fb50`); first-run no dashboard/DRE
  quando a org está vazia (`6912d08`).
- **Configurações / Empresa** (perfil/governança/estrutura) (`c0cda79`).
- **Command palette global (⌘K)** funcional (`10d74bd`).

### Redesenho da Home (command center / cockpit)
- **Pílula de período global** + Personalizar Home (Fase 1, `4f485a5`); período
  dirige Fluxo + Faturamento (Fase 2, `1321eb6`); cards do command center
  reusando os motores (Fase 3, `263667f`); blocos + arrastar-e-soltar (Fase 4,
  `dbdcaff`); Home contextual por perfil + reordenação por IA (Fase 5,
  `83ea9ba`); cockpit modular + card "Hoje" (`af1bb40`).
- Pílula só Hoje·7·14·30 + Personalizável (`c002466`).
- **A receber/A pagar** com nova lógica (recebido hoje / a receber essa semana /
  esse mês, sem vermelho) + **Operação** em 1º (`74bdbc6`, `db9b4e1`).

### Design System (dark mode, charts, tipografia)
- **Dark mode** completo via tokens var-backed + `html.dark` (`60eb61a`).
- **Linha dos gráficos**: preta no claro / verde (lime) no escuro, traço mais
  fino + **glow** em gradiente; correção e engrossamento dos candles
  (`071d517`→`07088b4`→`db9b4e1`→`92fc506`).
- **Tratamento Money** (`<BRL>`: R$/decimais menores+faint) em todo o site
  (`716abd0`).
- **Fontes +20%** (`ab89e2f`) e migração para **Roc Grotesk Regular**
  (400/-0.01em/22px, sem caixa-alta) (`bac6d5b`).
- **Fix de rolagem**: AppShell `fixed inset-0` (`b09c869`, `e9896fa`).

### Caixa de Entrada / OCR / Upload
- **Caixa de Entrada Financeira** + botão fixo na home (`8f4f662`).
- **OCR real** via visão do Claude (`7d8475b`); **OCR local** gratuito sem chave
  (Tesseract.js) (`63b945a`); **PDF rasterizado** (pdf.js → PNG → Tesseract)
  (`e09f195`).
- **Upload de dados**: mescla `/inbox` + `/import` em `/upload` + **wizard de 3
  etapas** na home (`95d819e`); **ação editável** na confirmação (`cebb3e6`).

### Fluxo de Caixa
- **`/fluxo-caixa`** — centro operacional com 14 blocos (`919de35`); **remoção
  da lógica de holding/multiempresa** (`48ff776`).

---

## 2. Mapa de correlações de dados (como tudo se liga)

### 2.1 Fonte única em demo: o "imported store"
```
Upload/Import/Wizard ──► src/lib/imported.ts (localStorage)
        (aplicarOnboarding / appendImported)         │
                                                      ▼
   src/lib/data.ts: seedMovements() = importedMovements() ?? DEMO_MOVEMENTS
                    seedAccounts()  = importedAccounts()  ?? DEMO_ACCOUNTS
                                                      │
        ┌─────────────────────────────────────────────┼───────────────────────────┐
        ▼                 ▼                ▼            ▼              ▼             ▼
 getReceivables    getPayables      getAccounts   getDailyCashflow  getRiscoInput  listParties
        │                 │                │            │              │             │
        ▼                 ▼                ▼            ▼              ▼             ▼
   ReceivablesCard   PayablesCard    AccountsCard   SalesChart   TODOS os motores  Contatos
```
- **Verdadeiro hub:** `getRiscoInput()` (`src/lib/data.ts`) — alimenta
  `scoreRiscoCaixa`, `analisarQuantitativo`, `decidir`, `centroInteligencia`,
  `financialDRE`, `analisarInadimplencia`, `treasuryCore` e o novo
  `montarFluxoCaixa`. **Um único input → todas as telas consistentes.** ✅

### 2.2 Cadeia documento → sistema (home wizard)
```
UploadWizard (etapa 1 arrasta) ─► lerDocumento() (OCR IA/local ou FDIP)
   └─ etapa 2 ─► analisarDocumento(fields, parties, pendentes)   [cross-check]
   └─ etapa 3 ─► confirmarDocumento({acaoOverride, criarContato})
                    ├─ demo: appendImported({movement, party, baixaDe})
                    └─ live: Supabase (party + movement, ou baixa do pendente)
                    └─ qc.invalidateQueries()  ──► dashboard/DRE/risco/fluxo refazem
```
✅ Funciona ponta a ponta (com ressalvas A/E/G abaixo).

### 2.3 Outras correlações que funcionam
- **Período global da Home** (`PeriodContext`) → Fluxo de caixa diário +
  Faturamento. ✅
- **Editar contato → telefone → cobrança WhatsApp** (`updateParty` /
  `updateImportedParty`). ✅
- **Live: party_id** ligando movimentos importados ao cadastro
  (`aplicarOnboarding`, `726fa7e`) → segmentação/inadimplência/DRE-por-cliente. ✅
- **Categoria/centro de custo** resolvidos em `getRiscoInput` (embed PostgREST em
  live, derivado em demo) → linha certa da DRE. ✅
- **invalidateQueries** após qualquer escrita → React Query recarrega todas as
  páginas. ✅

---

## 3. Correlações que NÃO estão funcionando

Ordenadas por severidade. Cada uma com evidência, impacto e correção sugerida.

### 🔴 A. Seed perde os nomes de contraparte após o 1º "Confirmar" do wizard (demo)
- **Onde:** `src/lib/data.ts` `getRiscoInput()` (linhas ~325-345) + `src/lib/demo/seed.ts` `buildMovements()`.
- **O quê:** `appendImported()` tira um snapshot do seed para o imported store.
  A partir daí `getRiscoInput` entra no ramo `usandoImport = true`, que resolve a
  contraparte por **`party_id`**. Mas os `DEMO_MOVEMENTS` do seed **não têm
  `party_id`** — usam `description`. Resultado: depois de confirmar **um único
  documento** na home, **todos os lançamentos do seed viram "Sem contraparte"**.
- **Impacto:** quebra concentração, inadimplência por cliente, DRE por cliente,
  top clientes, segmentação — tudo que depende do nome da contraparte. Alto,
  porque é disparado por uma ação comum (confirmar 1 upload).
- **Correção:** no ramo de import do `getRiscoInput` (demo), usar
  `party_id = m.party_id ?? m.description ?? null` e popular `partyNames` para o
  `description` também; **ou** `appendImported` preencher `party_id` a partir de
  `description` ao snapshotar o seed.

### 🔴 B. "Confirmar e processar" da Caixa de Entrada é um no-op
- **Onde:** `src/components/inbox/InboxView.tsx` `confirmar()` (linhas 139-142).
- **O quê:** o botão só troca o status local para "processado" e mostra um toast
  dizendo *"atualizou contas, fluxo, DRE, tesouraria e o resto do ecossistema"* —
  mas **não grava nada**, não chama `confirmarDocumento` nem `invalidateQueries`.
- **Impacto:** o operador acha que processou um boleto/comprovante pela tela de
  Upload, mas nada entra no sistema. Só o wizard da home persiste de verdade.
- **Correção:** ligar `confirmar()` ao `analisarDocumento` + `confirmarDocumento`
  (mesma cadeia do wizard) e `qc.invalidateQueries()`.

### 🔴 C. "Regime" e "Visão" do Fluxo de Caixa não afetam nada
- **Onde:** `src/components/fluxo-caixa/hooks.ts` (chamada de `montarFluxoCaixa`)
  + `src/core/cashflow/index.ts` (`opts: { dias, conta }`).
- **O quê:** o header persiste `regime` (Competência/Caixa/Híbrido) e `visao`
  (Previsto/Realizado/Consolidado), mas `montarFluxoCaixa` só recebe `{ dias,
  conta }` e o `useMemo` nem inclui `regime`/`visao` nas dependências.
- **Impacto:** contraria o requisito explícito ("toda alteração atualiza a página
  inteira, inclusive projeções, IA, cenários"). Dois controles do header são
  decorativos.
- **Correção:** passar `regime`/`visao` ao core. `regime` escolhe a data-base
  (competência=`due_date`, caixa=`paid_date`) como já faz o motor de DRE; `visao`
  filtra previsto (pendente) / realizado (pago) / consolidado (ambos).

### 🟠 D. Arrastar OFX/CSV na Caixa de Entrada não importa
- **Onde:** `src/components/inbox/InboxView.tsx` `ingerir()` (ramo `isText`).
- **O quê:** dropar um extrato na Inbox roda `analisarImportacao` só para montar
  o resumo do card; **nunca chama `aplicarOnboarding`**. A importação real só
  acontece no `/upload` (ImportView "Criar empresa") ou no wizard da home.
- **Impacto:** comportamento divergente entre dois lugares que parecem fazer a
  mesma coisa; a cópia do canal sugere processamento.
- **Correção:** no ramo OFX/CSV da Inbox, oferecer "Importar" que chame
  `aplicarOnboarding(report)` + `invalidateQueries`.

### 🟠 E. Saldos são estáticos em demo — "Caixa atual" não reage a novos lançamentos
- **Onde:** `getRiscoInput()` demo (`saldoAtual = soma de account.balance`) +
  `appendImported()` (não ajusta saldo).
- **O quê:** o saldo consolidado em demo é a soma fixa dos `balance` do seed. Um
  "Recebi R$X" via wizard anexa um **movimento**, mas não altera nenhum saldo de
  conta — então **"Caixa atual" (Executive Summary do Fluxo) e o Saldo total não
  mudam**, embora a receber/a pagar/DRE/fluxo previsto mudem.
- **Impacto:** inconsistência percebida ("recebi e o caixa não subiu").
- **Correção:** em demo, derivar o saldo dos movimentos pagos
  (`Σ entrada_paga − Σ saida_paga`) **ou** ajustar `account.balance` no
  `appendImported` quando o movimento for "pago".

### 🟠 F. Filtro "Conta" do Fluxo não escopa os lançamentos
- **Onde:** `src/core/cashflow/index.ts` (`opts.conta`) + `RiskMovement` (sem
  `account_id`).
- **O quê:** `RiskMovement` não carrega `account_id`, então escolher uma Conta só
  reescala o **saldo**; fluxo, projeção, calendário e heatmap continuam usando
  **todos** os movimentos.
- **Impacto:** filtro parcial (esperado pela limitação atual do `getRiscoInput`).
- **Correção:** propagar `account_id` no `getRiscoInput` e filtrar os movimentos
  por conta no core.

### 🟠 G. Movimento do wizard usa `account_id: "acc-import"`, ausente das contas demo
- **Onde:** `src/lib/upload-doc.ts` (`ACC_FALLBACK = "acc-import"`) +
  `appendImported` (base = `DEMO_ACCOUNTS`).
- **O quê:** o lançamento anexado aponta para uma conta que não existe no seed.
- **Impacto:** a conciliação **por conta** (AccountsCard) não inclui esse
  lançamento; ele fica "órfão" de conta.
- **Correção:** usar o `id` da 1ª conta existente (`accounts[0].id`) no
  `confirmarDocumento`/`appendImported`.

### 🟡 H. Waterfall (bloco 8) ignora o período do header
- **Onde:** `src/core/cashflow/index.ts` — `financialDRE(input, periodoPreset(input.hoje, "mes"))`.
- **O quê:** o waterfall sempre usa o preset "mês", independentemente do período
  selecionado (Hoje/7D/3M/1A…).
- **Correção:** mapear o período do header para o `DREFiltro` (de/até) e passar ao
  `financialDRE`.

### 🟡 I. Beneficiário novo entra sem telefone → não alimenta a cobrança
- **Onde:** `confirmarDocumento` (cria party sem `phone`).
- **O quê:** o contato criado a partir de um documento não tem telefone, então
  não aparece no disparo de WhatsApp até alguém editar o contato.
- **Correção:** já existe o caminho (editar contato adiciona telefone); opcional:
  sinalizar "sem telefone" na cadeia documento→cobrança.

### 🟡 J. Cross-check (bloco 5) tem flags ilustrativas
- **Onde:** `src/core/cashflow/index.ts` (`crossChecks`).
- **O quê:** alguns passos são fixos/placeholder ("Nota fiscal" sempre `false`;
  "Contrato/recorrência" derivado só da presença de sazonalidade).
- **Correção:** ligar a sinais reais quando houver tabela de NF/contratos/
  recorrências.

### 🟡 K. Heatmap mostra ~60 dias mesmo em períodos curtos
- **Onde:** `montarFluxoCaixa` usa `risco.liquidez` (horizonte mín. 60) e fatia 60.
- **O quê:** para "Hoje"/"7D" o heatmap ainda exibe ~60 células.
- **Correção:** limitar o heatmap a `dias` quando o período for curto.

---

## 4. Resumo executivo da auditoria

| # | Correlação quebrada | Severidade | Disparo | Correção (resumo) |
|---|---|---|---|---|
| A | Seed perde contrapartes após 1 upload (demo) | 🔴 | Confirmar 1 doc | fallback `party_id ?? description` |
| B | "Confirmar" da Inbox não grava | 🔴 | Botão da Inbox | ligar a `confirmarDocumento` |
| C | Regime/Visão do Fluxo não fazem nada | 🔴 | Toggles do header | passar ao `montarFluxoCaixa` |
| D | OFX na Inbox não importa | 🟠 | Drop OFX na Inbox | chamar `aplicarOnboarding` |
| E | Caixa atual estático em demo | 🟠 | Recebi/Paguei | derivar saldo dos pagos |
| F | Conta não escopa lançamentos | 🟠 | Filtro Conta | `account_id` no RiskInput |
| G | `acc-import` inexistente | 🟠 | Wizard confirma | usar conta real |
| H | Waterfall ignora período | 🟡 | Trocar período | `DREFiltro` do período |
| I | Contato novo sem telefone | 🟡 | Doc→cobrança | sinalizar/editar |
| J | Cross-check com flags fixas | 🟡 | Bloco 5 | ligar a sinais reais |
| K | Heatmap fixo ~60d | 🟡 | Período curto | limitar a `dias` |

**Prioridade de correção sugerida:** A → B → C (as três 🔴 são as que mais
comprometem a confiança no "tudo se correlaciona"), depois E/G (consistência de
saldo) e D.

---

## 5. O que está sólido (não mexer sem motivo)
- Hub único `getRiscoInput()` alimentando todos os motores → telas coerentes.
- Padrão demo-safe (`importedMovements() ?? seed`) em todos os accessors de
  leitura verificados.
- `invalidateQueries()` após escrita propagando para todas as páginas.
- Período global da Home dirigindo Fluxo + Faturamento.
- Live: `party_id` ligando importados ao cadastro (segmentação/cobrança/DRE).

---

## 6. Correções aplicadas (re-investigação)

Status após a sessão de correção. Evidência nos arquivos citados.

| # | Achado | Status | O que mudou |
|---|---|---|---|
| A | Seed perde contrapartes após 1 upload | ✅ corrigido | `getRiscoInput` demo resolve `party_id ?? description` e popula `partyNames` com ambos (`src/lib/data.ts`). Seed mantém nomes mesmo com dataset importado. |
| B | "Confirmar" da Inbox era no-op | ✅ corrigido | `InboxView.confirmar` agora grava: extrato→`aplicarOnboarding`; documento→`analisarDocumento`+`confirmarDocumento`; `qc.invalidateQueries()`. Payload por doc em `payloadRef`. |
| C | Regime/Visão do Fluxo não faziam nada | ✅ corrigido | `montarFluxoCaixa` recebe `regime`/`visao`; `dataRef` (competência=vencimento/caixa=pagamento/híbrido) + `passaVisao` (previsto/realizado/consolidado) na árvore e no calendário; entram na chave do `useMemo`. |
| D | OFX na Inbox não importava | ✅ corrigido | doc de extrato guarda o `FDIPReport`; "Confirmar" chama `aplicarOnboarding`. |
| E | Caixa atual estático em demo | ✅ corrigido | `appendImported` ajusta `account.balance` quando o lançamento é pago (sem dobrar: `summarizeAccounts` usa `account.balance`). Reflete em Saldo total e no Executive Summary. |
| F | Conta não escopava lançamentos | ✅ corrigido | `RiskMovement.accountId` propagado em `getRiscoInput` (demo+live); `montarFluxoCaixa` filtra `movements` por conta → risco/quant/projeção também escopam. |
| G | `acc-import` órfão | ✅ corrigido | `appendImported` reatribui o lançamento à 1ª conta real. |
| H | Waterfall ignorava o período | ✅ corrigido | `financialDRE` recebe `DREFiltro` montado do período (janela retroativa) + regime. |
| K | Heatmap fixo ~60d | ✅ corrigido | `risco.liquidez.slice(0, min(60, max(7, dias)))`. |
| I | Contato novo sem telefone | 🟡 por design | segue editável em Contatos; fora do escopo desta correção. |
| J | Cross-check com flags ilustrativas | 🟡 parcial | depende de tabelas de NF/contratos/recorrências (roadmap). |

**Resultado:** as 3 🔴 e as 🟠 de integridade de dados foram fechadas. O hub
único `getRiscoInput` agora propaga conta/contraparte/saldo de forma consistente,
e a Caixa de Entrada deixou de prometer sem gravar — dashboard, fluxo, DRE,
heatmap, projeção e cenários reagem ao mesmo dado.
