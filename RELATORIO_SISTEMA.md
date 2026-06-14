# Relatório completo do sistema — all4pay

> Inventário de **tudo** que o sistema possui hoje: páginas, subpáginas, cards/
> blocos, o mapa de correlações de dados, as correlações que **não** estão
> funcionando e as **atualizações** recomendadas. Gerado por varredura do código.
> Branch `claude/epic-fermi-i423xk` · 2026-06-14.

---

## 1. Arquitetura em uma página

- **Stack:** Next.js (App Router) + TypeScript + Tailwind (Design System próprio,
  off-black `ink` + lime) + Supabase. Fonte Roc Grotesk. Dark mode por classe.
- **Hub único de dados:** `getRiscoInput()` (`src/lib/data.ts`) — quase todos os
  motores e telas leem dele. **Um input → telas coerentes.**
- **Demo-safe:** `isDemo` (`src/lib/demo.ts`). Em demo, os accessors leem o
  **imported store** (`src/lib/imported.ts`, localStorage) `?? seed`
  determinístico (`src/lib/demo/seed.ts`). Em live, Supabase.
- **20 motores puros** em `src/core/*`: `risk-engine`, `risk` (inadimplência),
  `quant`, `executive`, `decision`, `datamoat`, `treasury`, `dre`, `fdip`,
  `financial-os`, `institutional`, `orchestration`, `platform`, `reliability`,
  `architecture`, `autonomous`, `cashflow`, `onboarding`, `ai`.
- **Propagação:** `qc.invalidateQueries()` (React Query) após cada escrita
  recarrega as ~telas que leem do hub.

---

## 2. Mapa do menu (Sidebar — 7 grupos + Configurações)

`INÍCIO` é link de topo. Itens `[Em breve]` são desabilitados (sem rota).

```
INÍCIO → /

PAGAR
 ├─ A pagar                  → /pagaveis
 ├─ Central de pagamentos    → /pagamentos
 ├─ Solicitações & aprovações→ /aprovacoes
 └─ Reembolsos               → /reembolsos

RECEBER
 ├─ A receber                → /recebiveis
 ├─ Inadimplência            → /inadimplencia
 ├─ Recorrências / Contratos → /recorrencias
 ├─ Boleto                   [Em breve]
 └─ Notas fiscais (NFS-e)    → /notas-fiscais

CONTAS
 ├─ Contas financeiras       → /        (gap: sem rota /contas)
 ├─ Conciliação              → /conciliacao
 └─ Importar dados           → /upload

CARTÕES
 ├─ Cartões all4pay          [Em breve]
 ├─ Outros cartões           [Em breve]
 └─ Conciliação por IA       [Em breve]

RELATÓRIOS
 ├─ DRE                      → /dre
 ├─ Fluxo de Caixa           → /fluxo-caixa
 └─ Vendas                   → /vendas

INTELIGÊNCIA
 ├─ Copiloto                 → /copiloto
 ├─ Quant                    → /inteligencia
 ├─ Decisão                  → /decisao
 ├─ Risco                    → /risco
 ├─ Autônomo                 → /autonomo
 └─ Dados                    → /dados

CONFIGURAÇÕES (rodapé)
 ├─ Empresa                  → /configuracoes
 ├─ Governança & Auditoria   → /governanca
 ├─ Cadastros: Contatos /contatos · Produtos /produtos · Serviços /servicos
 ├─ Plataforma (avançado): Orquestração /orquestracao · Infraestrutura
 │                          /infraestrutura · Arquitetura /arquitetura · Automações /automacoes
 ├─ Adicionar Empresa        → /comecar
 └─ Central de Ajuda         [Em breve]
```

Rotas fora do menu: `/login` (auth) · `/visao-geral`→`/` · `/inbox`,`/import`→`/upload` (stubs de redirect).

---

## 3. Inventário de TODAS as páginas (34 rotas)

| Rota | Título | Componente | Engine/Store | Escreve? |
|---|---|---|---|---|
| `/` | Início | `OverviewGrid` (visao-geral) | hub + todos via cockpit | via FAB Upload |
| `/login` | Entrar | `app/login/page` | `supabase.auth` | sessão |
| `/comecar` | Criar empresa | `OnboardingWizard` | `fdip`+`onboarding`+`aplicarEstrutura` | **sim** |
| `/upload` | Upload de dados | `UploadView` (= Inbox + Import) | `fdip`/OCR (`ocr-ingest`) | **sim** |
| `/fluxo-caixa` | Fluxo de Caixa | `FluxoCaixaView` | `core/cashflow montarFluxoCaixa` | só-leitura |
| `/pagaveis` | A pagar | `MovementsTable` | `getOpenMovements("saida")` | só-leitura |
| `/pagamentos` | Central de Pagamentos | `CentralPagamentosView` | `lib/pagamentos`+`core/platform` | **sim** (liquida) |
| `/aprovacoes` | Solicitações & aprovações | `AprovacoesView` | `lib/aprovacoes`+`core/institutional` | local |
| `/reembolsos` | Reembolsos | `ReembolsosView` | `lib/reembolsos`+OCR+alçada | local→hub |
| `/recebiveis` | A receber | `MovementsTable` | `getOpenMovements("entrada")` | só-leitura |
| `/inadimplencia` | Inadimplência | `InadimplenciaView` | `core/risk analisarInadimplencia` | só-leitura |
| `/recorrencias` | Recorrências | `RecorrenciasView` | `lib/recorrencias` | local→hub |
| `/notas-fiscais` | Notas fiscais (NFS-e) | `NfseView` | `lib/nfse` | local→hub |
| `/conciliacao` | Conciliação | `ReconciliationView` | `core/financial-os` | só-leitura |
| `/dre` | DRE | `DREView` | `core/dre financialDRE` | só-leitura |
| `/vendas` | Vendas | inline + `useSalesList` | `lib/cadastros` | cria venda |
| `/copiloto` | Copiloto | `CopilotoView` | `core/executive` | só-leitura |
| `/inteligencia` | Quant | `QuantView` | `core/quant` | só-leitura |
| `/decisao` | Decisão | `DecisaoView` | `core/decision` | só-leitura |
| `/risco` | Risco | `RiscoView` | `core/risk-engine` | só-leitura |
| `/autonomo` | Autônomo | `AutonomoView` | `core/autonomous` | dispara cobrança |
| `/dados` | Dados | `DadosView` | `core/datamoat` | só-leitura |
| `/inadimplencia` | Inadimplência | `InadimplenciaView` | `core/risk` | só-leitura |
| `/orquestracao` | Orquestração | `OrquestracaoView` | `core/orchestration` | só-leitura (stateful) |
| `/infraestrutura` | Infraestrutura | `InfraestruturaView` | `core/platform` | só-leitura (stateful) |
| `/arquitetura` | Arquitetura | `ArquiteturaView` | `core/architecture`+`treasury`+`reliability` | só-leitura |
| `/governanca` | Governança & Auditoria | `InstitutionalView` | `core/institutional` | só-leitura |
| `/automacoes` | Automações | `AutomacoesView` | `core/financial-os`+`lib/financial-os` | **sim** (regras) |
| `/configuracoes` | Empresa | `ConfiguracoesView` | `lib/company` | localStorage |
| `/contatos` | Contatos | inline + `PartyForm` | `lib/cadastros` | **sim** |
| `/produtos` | Produtos | inline | `lib/cadastros` | **sim** |
| `/servicos` | Serviços | inline | `lib/cadastros` | **sim** |
| `/visao-geral`,`/inbox`,`/import` | — | redirects | — | — |

**API routes:** `/api/inbox/ocr` (OCR Claude) · `/api/notificacoes/teste` ·
`/api/notificacoes/status` · `/api/financial-os/run` (cron) · `/api/cobranca/whatsapp`.

---

## 4. Cards / blocos por página-chave

### Início (`/`) — cockpit modular
- **Pílula de período global** (Hoje/7/14/30/Personalizável) + **Personalizar Home**
  (drawer, arrastar/ordenar) + **Reorganizar por urgência (IA)**.
- Blocos com cabeçalho (`BLOCK_ORDER`): Operação · Resumo executivo · Saúde
  financeira · Caixa · Receita · Despesas · Cobrança · Inteligência · Radares.
- Cards curados: **ResumoHoje** (briefing), Saúde financeira (score/runway/burn),
  A receber, A pagar, Contas (saldo + reconciliação), Fluxo de caixa diário
  (Recharts), Faturamento (12m), IA Insights, Anomalias, Top clientes, Maiores
  categorias, Últimos gastos, Pendências. + **catálogo modular** (cockpit, ~16
  widgets, desligados por padrão). **FAB "Upload de dados"** abre o wizard de 3 etapas.

### Fluxo de Caixa (`/fluxo-caixa`) — 13 blocos
Header reprocessa tudo (período · conta · regime · visão). Blocos: 1) Executive
summary · 2) Fluxo inteligente (árvore expansível) · 3) Previsto×Realizado · 4)
Calendário · 5) Cross-check · 6) Projeção ML (Monte Carlo p10/p50/p90) + Cenários
· 7) Heat map · 8) Waterfall (DRE) · 9) IA Copilot · 10) What-If (sliders) · 11)
Eventos · 12) Confidence layer · 13) Cash Flow Digital Twin.

### Central de Pagamentos (`/pagamentos`)
Cards de lote por período (dia/semana/mês/ano) · seleção múltipla · pagar por
linha · modal Confirmar pagamento + anexar comprovante · card **Contas pagas**
(box de período 7D/14D/30D/3M/Tudo) · gate de alçada (bloqueia acima do limite).

### Solicitações & aprovações (`/aprovacoes`)
Abas (fila/minhas/todas) · cards de solicitação · painel Aprovar/Rejeitar/
Devolver + sugestão de IA + trilha.

### Reembolsos (`/reembolsos`)
Form colaborador + itens (OCR do comprovante) + chave Pix · abas (meus/aguardando/
a pagar).

### Recorrências (`/recorrencias`)
Dashboard (MRR/ativas/ticket/churn) · Nova recorrência (catálogo) · lista com
próximas faturas + Ativar/Pausar/Cancelar.

### NFS-e (`/notas-fiscais`)
Nova NFS-e (tomador/serviço/ISS/aguardar pagamento) · lista (Tomador/Número/
Competência/Valor/ISS/Situação) · estados assíncronos.

### DRE (`/dre`)
Filtros (período/regime) · executivo · waterfall com drill-down · financeiro ·
comparativo · por linha · por cliente · projetado.

### Telas de IA (`/copiloto /inteligencia /decisao /risco /autonomo /dados /
orquestracao /infraestrutura /arquitetura /governanca`)
Cada uma é um console do seu motor (score, radar, cenários, insights, Monte Carlo,
ledger, RBAC/auditoria, etc.).

---

## 5. Mapa de correlações (como tudo se liga)

### 5.1 Hub + imported store
```
Upload/Wizard/Funil ──► imported.ts (localStorage)  ──┐
                                                       ▼
   data.ts: importedX() ?? seed  ──►  getRiscoInput / getReceivables / getPayables
                                       getAccounts / getDailyCashflow / getSales
                                                       │
        ┌──────────────────────────────────────────────┴───────────────┐
        ▼                  ▼               ▼              ▼              ▼
   Dashboard          Fluxo de Caixa     DRE           Risco/Quant   Inadimplência
                      Central/A pagar    Recebíveis    Decisão/Copiloto/Autônomo/Dados
```

### 5.2 Funil PAGAR
```
Upload (Caixa de Entrada)  → confirmarDocumento → movement saída no hub
A pagar (/pagaveis)        ← getOpenMovements("saida")
Central (/pagamentos)      → pagarLote (idempotente core/platform) → liquidar
                             → debita saldo, paid_date → Contas pagas, saldo, DRE caixa
Solicitações (/aprovacoes) → gate de alçada: bloqueia execução até aprovado
Reembolsos (/reembolsos)   → alçada → 1 movement saída por item → Central
```

### 5.3 Funil RECEBER
```
Recorrências → projeta faturas como entrada PREVISTA no hub → /recebiveis, fluxo, DRE
NFS-e        → autorizada → receita (entrada) + ISS (dedução) no hub → DRE fiscal
Inadimplência← analisarInadimplencia sobre os recebíveis
Cobrança     → Twilio/Resend (WhatsApp/e-mail) sobre inadimplentes com telefone
```

### 5.4 Correlações que funcionam (verificadas)
- Hub único alimentando todos os motores. ✅
- Confirmar documento (Upload/Inbox) → saldo da home reage pelo valor exato
  (**validado no browser**: +R$18.990). ✅
- Fluxo de Caixa: **Visão** (previsto/realizado/consolidado) muda a árvore;
  **Regime** muda o Waterfall (**validado no browser**). ✅
- Editar contato → telefone → cobrança. ✅
- Categoria/centro resolvidos no `getRiscoInput` → linha certa da DRE. ✅

---

## 6. Correlações que NÃO estão funcionando / fracas

> As 🔴 da auditoria anterior (A/B/C/D/E/F/G/H/K) foram **corrigidas** (commit
> `e351b38`, validadas no browser). Abaixo, o que **resta** + o que as features
> novas do funil **introduziram**.

### 🟠 N1. Stores do funil são localStorage-only (sem persistência live)
- **Onde:** `lib/aprovacoes.ts`, `lib/reembolsos.ts`, `lib/recorrencias.ts`,
  `lib/nfse.ts` — todos usam `localStorage`, sem tabela Supabase.
- **Impacto:** em **live**, aprovações/reembolsos/recorrências/NF-e ficam **só no
  navegador** — perdem-se entre dispositivos/sessões e não são auditáveis no banco.
  O movement gerado (live) vai ao Supabase, mas o "objeto de negócio" (solicitação/
  contrato/nota) não.
- **Correção:** criar tabelas (`approvals`, `reembolsos`, `recurrences` já existe,
  `nfse`) + RLS `org_id`, e migrar os stores para Supabase em live.

### 🟠 N2. Risco de dupla contagem de receita (Recorrência × NFS-e)
- **Onde:** `recorrencias.ativarRecorrencia` cria `movement` de entrada (fatura
  projetada); `nfse.refletirNaDRE` também cria `movement` de entrada (receita).
- **Impacto:** se uma recorrência ativa **e** uma NFS-e forem emitidas para a
  mesma receita/ciclo, há **dois lançamentos de entrada** → receita/recebíveis
  inflados.
- **Correção:** ligar NFS-e à fatura da recorrência por `recorrencia_id`/
  `movement_id` (a spec prevê) e **não** criar um segundo movement quando a NF-e
  decorre de uma fatura já projetada.

### 🟡 N3. Reembolso exibe `colab:Nome` como contraparte
- **Onde:** `reembolsos.gerarPagamento` usa `party_id = "colab:" + nome` (não é id
  real de `parties`); `getRiscoInput` (demo) mapeia party_id desconhecido para si
  mesmo → aparece "colab:João" em vez de "João".
- **Impacto:** rótulo feio no fluxo/pagáveis; o colaborador não vira `party` real
  (DRE-por-pessoa/cobrança não funcionam para ele — parente do bug I).
- **Correção:** criar/resolver o colaborador como `party` (tipo colaborador) e
  usar o id real, como faz a NFS-e (tomador) e a Recorrência (cliente).

### 🟡 N4. ISS da NFS-e vira "a pagar" eterno
- **Onde:** `nfse.refletirNaDRE` cria o ISS como `movement` de **saída pendente**
  (categoria "Impostos · ISS").
- **Impacto:** alimenta a DRE (dedução) ✅, mas aparece em `/pagaveis` como conta a
  pagar que **nunca é liquidada** (não há guia/escopo de recolhimento). Polui o
  "a pagar".
- **Correção:** modelar ISS como dedução fiscal vinculada à nota (não como título
  avulso a pagar), ou gerar a guia de recolhimento no vencimento.

### 🟡 N5. NFS-e "aguardar pagamento" sem gatilho
- **Onde:** `nfse` cria em rascunho quando `aguardarPagamento=true`, mas **não há
  trigger** que emita a nota quando o recebimento é liquidado.
- **Correção:** hook na liquidação do recebível → `transmitirNfse` automático.

### 🟡 N6. Recorrência sem scheduler real
- **Onde:** `ativarRecorrencia` projeta as próximas 6 faturas **uma vez**; não há
  scheduler que gere novas faturas conforme o tempo passa nem que as marque
  "emitida" no dia do faturamento.
- **Correção:** job (Vercel Cron, como `/api/financial-os/run`) que materializa a
  próxima fatura no ciclo e dispara boleto/NFS-e/cobrança.

### 🟡 N7. Gate de alçada não cobre Reembolsos→Central explicitamente
- **Onde:** Reembolso aprovado gera movement de saída que entra na Central; a
  Central aplica `requerAlcada` por valor — mas o reembolso já passou por alçada
  (dupla alçada possível para reembolsos altos).
- **Correção:** marcar o movement de reembolso como "já autorizado" para a Central
  não exigir aprovação de novo.

### 🟡 N8. "Contas financeiras" (menu CONTAS) aponta para `/` (sem página)
- **Correção:** criar `/contas` dedicada (posição por conta/banco — o
  `treasuryCore` já calcula).

### 🟡 N9. Boleto / Cartões / NFS-e-por-recorrência ausentes
- Boleto `[Em breve]` é pré-requisito do ciclo de Recorrências (emissão própria +
  conciliação). Cartões inteiro `[Em breve]`.

### ⚙️ N10. Validação ao vivo bloqueada no sandbox
- `next start` não inicializa em background neste ambiente (servidor node puro
  inicializa; o Next, não). Build/typecheck/lint passam; o deploy na Vercel
  renderiza. As features do funil foram validadas por **equivalência** (mesmo
  caminho `appendImported`/`liquidarImported` → `getRiscoInput` já validado no
  browser), não por drive direto.

---

## 7. Atualizações recomendadas (priorizadas)

**Prioridade alta (integridade de dados / live):**
1. **N1** — persistir os stores do funil em Supabase (tabelas + RLS) para live ser
   real e auditável.
2. **N2** — unificar Recorrência↔NFS-e por `movement_id` (evitar dupla receita).
3. **N3** — colaborador de reembolso como `party` real (id, chave Pix, telefone).

**Prioridade média (fechar o funil):**
4. **Boleto** (RECEBER) — emissão no trilho próprio + conciliação; destrava o
   ciclo completo das Recorrências.
5. **N6** — scheduler de faturamento (Cron) para Recorrências/Boleto/NFS-e.
6. **N4/N5** — ISS como dedução fiscal (não título a pagar) + emissão de NFS-e ao
   liquidar quando "aguardar pagamento".
7. **N7** — reembolso aprovado não reabre alçada na Central.

**Prioridade baixa (completude / UX):**
8. **N8** — página `/contas` dedicada (tesouraria por conta/banco).
9. **Cartões** (domínio inteiro) + **Central de Ajuda** (item órfão sem rota).
10. KPIs de MRR/churn/ticket incorporados ao `analisarQuantitativo` (hoje só na
    tela de Recorrências).
11. Revisar o drawer **"Guia"** (intercepta cliques na 1ª visita de cada rota —
    fricção de UX observada na validação).

**Infra/validação:**
12. Destravar o drive ao vivo (restart do container / ambiente que inicialize o
    Next) e rodar os smoke tests do funil PAGAR/RECEBER (já há drivers Playwright
    prontos em `/tmp`).

---

## 8. Resumo executivo
- **34 rotas** (29 telas reais + 1 login + 1 onboarding + 3 redirects), **7 grupos
  de menu** + Configurações, **20 motores** em `core/*`, **~23 libs** de dados.
- O **funil PAGAR** (Caixa de Entrada → Central → Aprovações → Reembolsos) e o
  **funil RECEBER** (A receber → Inadimplência → Recorrências → NFS-e) estão
  construídos; **Boleto** e **Cartões** seguem `[Em breve]`.
- As correlações centrais funcionam e foram validadas; os gaps remanescentes são
  sobretudo de **persistência live** (N1) e de **integração fina entre as peças
  novas do funil** (N2/N3/N6) — todos endereçáveis, nenhum estrutural.
