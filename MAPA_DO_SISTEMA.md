# MAPA DO SISTEMA — all4pay

Documento-ponto: organização das páginas, funcionalidades, camada de dados,
integrações e — no fim — **os dados/funcionalidades que ainda NÃO estão
correlacionados** (lacunas a fechar). Gerado a partir do código em
`claude/epic-fermi-i423xk`.

> Para as regras de design e detalhes de cada módulo, ver `CLAUDE.md`.
> Este arquivo é o **mapa executivo** do que existe e do que está solto.

---

## 1. Visão geral

all4pay é um ERP financeiro / "sistema operacional financeiro" para PMEs, com
um **hub de dados único** (`getRiscoInput()` em `src/lib/data.ts`) que alimenta
~20 motores puros e tipados em `src/core/*`. Roda **idêntico em demo e live**:

- **Demo** (`NEXT_PUBLIC_ALL4PAY_DEMO=true` ou sem Supabase): serve um seed
  determinístico e os dados importados ficam em `localStorage`.
- **Live**: Supabase (Postgres + RLS multi-tenant + Edge Functions).

**Stack:** Next.js (App Router) · TypeScript · Tailwind (tokens) · Supabase ·
React Query · Recharts · fonte **Onest** (DS v2).

---

## 2. Mapa de navegação (Sidebar)

`INÍCIO` é link de topo. Os demais são grupos acordeão. Em **Modo Simples**
(padrão) escondem-se o grupo *Inteligência* e o subgrupo *Plataforma*.

| Grupo | Submenu | Rota | Função |
| --- | --- | --- | --- |
| — | Início | `/` | Dashboard financeiro (widgets + cockpit modular + calendário) |
| **Pagar** | Central de pagamentos | `/pagamentos` | Execução em lote de títulos de saída (idempotente, comprovante, gate de alçada) |
| | A pagar | `/pagaveis` | Lista de saídas em aberto (editar/cancelar/lote) |
| | Solicitações & aprovações | `/aprovacoes` | Gate de alçada (fila/minhas/todas/rejeitadas) |
| | Reembolsos | `/reembolsos` | Reembolso do colaborador (OCR + Pix) → vira saída |
| | Lixeira | `/lixeira` | Cancelados recuperáveis (restaurar/expurgar) |
| **Receber** | Central de recebimentos | `/recebimentos` | Execução em lote de entradas |
| | A receber | `/recebiveis` | Lista de entradas em aberto |
| | Inadimplência | `/inadimplencia` | Risk Intelligence de crédito (previsão + AI Collections) |
| | Recorrências / Contratos | `/recorrencias` | MRR: contratos que projetam faturas futuras |
| | Boleto | `/boletos` | Boletos (colados ao movement via jsonb) |
| | Notas fiscais (NFS-e) | `/notas-fiscais` | Emissão NFS-e (simulada / store local) |
| | Lixeira | `/lixeira` | (mesma da Pagar) |
| **Upload de dados** | Open finance | `/contas` | Conexão bancária (Pluggy) + contas unificadas |
| | Importar dados | `/upload` | Caixa de Entrada (OCR) + Onboarding FDIP (OFX/CSV) |
| | Conciliação | `/conciliacao` | Reconciliation engine (matching probabilístico) |
| **Central POS** | Configuração de taxas all4pay | `/pos/taxas` | Simulador de MDR + antecipação (aba TAXA PADRÃO) |
| | Simulador de venda | `/pos/venda` | Maquininha 9:16 → vende produtos → recebível líquido |
| **Cartões** | (Cartões all4pay / outros / conciliação IA) | — | **Em breve** (sem rota) |
| **Relatórios** | DRE | `/dre` | DRE Intelligence Center (gerencial/caixa/cliente/linha/projetado) |
| | Fluxo de Caixa | `/fluxo-caixa` | 14 blocos (Monte Carlo, what-if, digital twin) |
| **Cadastros** | Contatos | `/contatos` | Clientes/fornecedores/transportadoras (editar) |
| | Produtos | `/produtos` | Cardápio (imagem + preço) |
| | Serviços | `/servicos` | Catálogo de serviços |
| | Vendas | `/vendas` | Documentos de venda/compra/orçamento |
| **Inteligência** (Pro) | Copiloto | `/copiloto` | IA executiva + abas (Quant/Risco/Decisão/Autônomo/Dados) |
| **Configurações** | Empresa | `/configuracoes` | Identidade jurídica + perfil (onboarding) |
| | Governança & Auditoria | `/governanca` | Trilha imutável + RBAC + alçada + **gestão de usuários** |
| | Plataforma (Pro) | `/orquestracao` `/infraestrutura` `/arquitetura` `/automacoes` | Consoles de arquitetura/SO financeiro |
| | Adicionar Empresa | `/comecar` | Onboarding wizard (7 passos) |

**Rotas-motor standalone** (vivas, fora do menu Simples): `/risco`,
`/inteligencia` (quant), `/decisao`, `/autonomo`, `/dados`.
**Redirects:** `/visao-geral`→`/`, `/inbox` e `/import`→`/upload`.
**Pública:** `/login`, `/comecar`.

---

## 3. Funcionalidades por módulo (`src/core/*`)

- **`risk-engine/`** — `scoreRiscoCaixa()`: liquidez, runway, burn, inadimplência,
  concentração (HHI), sazonalidade, stress, score 8 pilares → 0-100.
- **`risk/`** — `analisarInadimplencia()`: behavior → scoring (PD logística) →
  early-warning → recovery → AI Collections.
- **`quant/`** — `analisarQuantitativo()`: KPIs institucionais, score de saúde,
  radar, cenários, benchmark, narrativa CFO.
- **`executive/`** — `centroInteligencia()`: copiloto, anomalias, forecast,
  insights priorizados, briefing, memória, simulador.
- **`decision/`** — `decidir()`: feature store, risk matrix, Monte Carlo,
  recomendações (re-roda o motor), ações autônomas.
- **`autonomous/`** — `operacaoAutonoma()`: policy engine + HITL + cobrança +
  roteamento de pagamento + next best action.
- **`dre/`** — `financialDRE()`: gerencial/financeiro/cliente/linha/comparativo/
  projetado, por regime (competência/caixa).
- **`cashflow/`** — `montarFluxoCaixa()`: 14 blocos do `/fluxo-caixa`.
- **`fdip/`** — `analisarImportacao()`: ingestão OFX/CSV → classificação →
  entidades → padrões → plano de setup.
- **`financial-os/`** — gateway + reconciliation + event-bus + rules-engine +
  automation + audit + notificações.
- **`orchestration/` `platform/` `architecture/` `treasury/` `reliability/`** —
  event sourcing, ledger dupla-partida, idempotência, fila, circuit breaker.
- **`institutional/`** — auditoria SHA-256 encadeada, RBAC, approval flow.
- **`datamoat/`** — coorte sintética, modelo auto-treinado, DNA, benchmark.
- **`onboarding/`** — Financial DNA + Business Maturity Score.
- **`ai/`** — narrativa, insights, alertas (determinístico, plugável a LLM).

---

## 4. Camada de dados

### 4.1. Tabelas no Postgres (migrations versionadas)

| Migration | Tabelas |
| --- | --- |
| `0001_financial_overview` | `financial_accounts`, `movements` |
| `0002_lancamentos` | `categories`, `cost_centers`, `parties` (doc_digits STORED), `movement_splits`, `recurrences` |
| `0003_vendas_cadastros` | `brands`, `units`, `salespeople`, `products`, `services`, `sales_docs`, `sale_items` |
| `0004_financial_os` | `financial_rules`, `rule_executions`, `audit_log` |
| `0005_multi_tenant` | `organizations`, `organization_members` + `org_id` em todas |
| `0006_rls_hardening`, `0007_auth_org_id_invoker` | RLS por `auth_org_id()` |

### 4.2. Stores locais (localStorage — **não vão ao Postgres**)

| Chave | Conteúdo | Onde |
| --- | --- | --- |
| `a4p_imported_dataset` | dataset importado (demo) | `lib/imported.ts` |
| `a4p_company` | perfil da empresa (onboarding) | `lib/company.ts` |
| `a4p_aprovacoes` | solicitações/alçada | `lib/aprovacoes.ts` |
| `a4p_reembolsos` | reembolsos | `lib/reembolsos.ts` |
| `a4p_recorrencias` | contratos MRR (demo) | `lib/recorrencias.ts` |
| `a4p_nfse` | notas fiscais | `lib/nfse.ts` |
| `a4p_comprovantes` | comprovantes por movement | `lib/pagamentos.ts` |
| `a4p_pos_taxas` | config de taxas POS | `lib/pos-taxas.ts` |
| `a4p_produto_imagens` | imagens de produto (dataURL) | `lib/produto-imagem.ts` |
| `a4p_fdip_memory` | aprendizado contraparte→categoria | `core/fdip/learning.ts` |
| `a4p_visual_edits`, `a4p_theme_draft` | edições do editor visual | `components/app/VisualEditor.tsx` |
| `a4p_theme`, `a4p_modo`, `a4p_sidebar_collapsed`, `a4p_home_*` | preferências de UI | vários |

---

## 5. APIs, cron e integrações

- **Edge Functions (Pluggy/Open Finance):** `pluggy-connect-token`,
  `pluggy-webhook`, `pluggy-sync-item` → ETL para `movements`. Usam as tabelas
  `bank_accounts`, `bank_transactions`, `pluggy_items`.
- **`/api/inbox/ocr`** — OCR via Claude (Anthropic) ou Tesseract local (fallback).
- **`/api/financial-os/run`** — runner agendado (Vercel Cron) do SO financeiro.
- **`/api/recorrencias/run`** — Cron: materializa faturas de recorrências
  (entrada **e** saída) + `audit_log`.
- **`/api/cobranca/whatsapp`**, **`/api/notificacoes/{teste,status}`** —
  WhatsApp (Twilio) + e-mail (Resend), gated por env.

---

## 6. Multi-tenant & auth

- Cada signup cria `organizations` + `organization_members` (`owner`) e roda o
  `seed_org`. Todas as tabelas têm `org_id default auth_org_id()`; RLS isola
  leitura e escrita. App **não envia `org_id`** (DEFAULT resolve).

---

## 7. Design System v2 (Onest) — resumo

Fundo `#eceef2` · boxes brancos `Card` (36px, sem borda, padding 45px, sem
sombra) · **Onest** 3 pesos (400/500/600, títulos 600) · números `tabular-nums`
tracking −1.04px · lime como tempero (<5%) · `<Money>`/`<BRL>` para valores.
Editor visual in-app (`VisualEditor`) exporta `all4pay-edicoes.json`.

---

## 8. ⚠️ Dados / funcionalidades NÃO correlacionados (lacunas)

Pontos onde algo **existe mas não conversa** com o resto do sistema — candidatos
a fechar a junta.

### 8.1. Persistência só local (some em outro device / não entra no banco)
1. **Governança & participantes** — usuários adicionados em `/governanca` ficam
   só no perfil local (`a4p_company`). **Não viram `organization_members` reais**,
   logo **não afetam RLS, permissões nem alçada de verdade**. Não há tabela de
   usuários/papéis de produto.
2. **Config de taxas POS** (`a4p_pos_taxas`) — só localStorage e **por
   dispositivo**. Só o `/pos/venda` consome (para calcular o líquido). Nenhuma
   outra tela (DRE, fluxo, recebíveis) desconta a taxa MDR das vendas reais.
3. **Imagens de produto** (`a4p_produto_imagens`) — `ProductInput` **não tem
   campo de imagem**; o "cardápio" vive em localStorage (dataURL). Em live/outro
   device o produto fica sem imagem.
4. **Aprovações/alçada** (`a4p_aprovacoes`) — store local; **não grava em
   `audit_log`** nem numa tabela de aprovações. A trilha de auditoria
   institucional não registra os aprovar/rejeitar reais.
5. **Reembolsos** (`a4p_reembolsos`) e **NFS-e** (`a4p_nfse`) — stores locais;
   sem tabela própria.
6. **Perfil empresarial do onboarding** — só identidade jurídica + estrutura
   (contas/centros/unidades) persistem em DB; **perfil empresarial e governança
   coletados no wizard ficam só em `a4p_company`**.

### 8.2. Esquema fora do controle de versão
7. **Tabelas do Pluggy** (`bank_accounts`, `bank_transactions`, `pluggy_items`)
   são usadas pelas Edge Functions, mas **não há migration no repo** que as crie
   — o schema de Open Finance só existe no banco remoto (aplicado à mão).
8. **`0002`/`0003` "geradas, não aplicadas ao remoto"** (ver CLAUDE.md) — risco
   de **drift**: o código espera `categories/parties/products/...`, mas o banco
   live pode não ter, a menos que aplicadas manualmente.

### 8.3. Fluxos que não fecham o ciclo
9. **Venda no POS** (`/pos/venda`) cria **só um `movement` de entrada
   (categoria "venda")** — **não cria `sales_docs`/`sale_items`**, então não
   aparece em `/vendas` nem no DRE por produto/cliente como venda formal.
10. **Estoque não é movimentado** — `products.track_stock`/`stock_initial`
    existem, mas nenhuma venda (POS ou `VendaCompraForm`) **decrementa estoque**.
11. **Duas naturezas de recorrência** — `ContratoForm` e `/recorrencias` ambos
    gravam em `recurrences`, mas `/recorrencias` mantém um store local paralelo
    (`a4p_recorrencias`) para o dashboard de MRR; conferir se não divergem.
12. **Taxa MDR ↔ resultado** — a venda POS já entra **líquida** em "a receber",
    mas a **diferença (taxa)** não vira uma linha de despesa/− no DRE; o "custo
    de adquirência" não é registrado como lançamento.

### 8.4. Cadastros sem UI completa
13. **Vendedores (`salespeople`)** — usados no `VendaCompraForm`, mas **sem tela
    de cadastro** (não há `/vendedores`).
14. **Marcas/Unidades** — têm formulário (`MarcaForm`/`UnidadeForm`), mas **sem
    página de listagem**.
15. **Convite de membro** para uma org existente — só inserindo linha em
    `organization_members` à mão; **sem UI**.

### 8.5. Roadmap declarado (não-bugs, mas soltos)
16. **Cartões** (grupo inteiro) — "em breve", sem rota.
17. **Boleto/NFS-e por ciclo + scheduler de faturamento** — roadmap.
18. **Conectores da Caixa de Entrada** (e-mail/WhatsApp/Open Finance/API/ERP
    como canais de OCR) — marcados "em breve".

---

### Sugestão de priorização para correlacionar

| Prioridade | Item | Por quê |
| --- | --- | --- |
| 🔴 Alta | #1 Governança→`organization_members` | Permissões/alçada hoje são "fachada" |
| 🔴 Alta | #7/#8 Schema Pluggy + 0002/0003 no repo | Risco de drift/quebra em live |
| 🟠 Média | #9/#12 Venda POS → `sales_docs` + taxa no DRE | Fechar o ciclo de venda/resultado |
| 🟠 Média | #3 Imagem de produto no DB | Cardápio multi-device |
| 🟡 Baixa | #13/#14 Cadastro de vendedores/marcas/unidades | Completar cadastros |
| 🟡 Baixa | #10 Estoque | Quando estoque entrar no escopo |

---

*Mapa gerado para o "ponto" de status. Atualizar conforme as juntas forem
fechadas.*

---

## 9. Status — execução do Relatório de Melhorias

| # do relatório | Ação | Status |
| --- | --- | --- |
| 1 | Versionar TODO o schema (Open Finance + locais) | ✅ `0008_open_finance.sql` + `0009_persist_local_stores.sql` (idempotentes) |
| 2 | Enxugar o menu (3 verbos; avançado atrás de Pro) | ✅ Sidebar: Entradas/Saídas/Contas & Banco · Cadastrar · Relatórios · Central POS; Equipe + Inteligência só no Modo Pro; Cartões "em breve" removido |
| 3 | Unificar Entradas/Saídas/Contas | 🟡 **Parcial** — agrupado no menu; **tela unificada com filtros ainda a construir** |
| 4 | "Nova transação" como porta única | ✅ `NovaTransacao` (AppShell) — Recebi/Paguei/Vou receber/Vou pagar → form progressivo → `useCreateLancamento` |
| 5 | Migrar localStorage→Postgres | ✅ **approvals/reembolsos/nfse**: as libs JÁ tinham caminho live; `0009` agora cria as tabelas **com as colunas exatas** do código → wiring completo (falta só aplicar no remoto). 🟡 **pos_rates/company_profiles**: tabelas criadas, wiring das libs pendente |
| 6 | Fechar ciclo POS→DRE com taxa MDR | ✅ `concluirVendaPos` grava "Tarifas de adquirência" (custo) além do recebível líquido |
| 7 | Completar OU acessorizar cadastros pela metade | ✅ vendedores/marcas/unidades **fora do menu** (não expõem incompleto); completar quando entrarem no fluxo |
| 8 | Reintroduzir inteligência/governança como Pro | ✅ grupos **Equipe** e **Inteligência** atrás do Modo Pro |

**Próximas juntas (precisam de banco ao vivo para validar):**
- **#5 restante**: `pos-taxas`/`company` ainda só locais (síncronos no client —
  o wiring vira refactor async; tabelas já versionadas em `0009`).
- **#1 governança real**: ✅ **ligada** — a tela de Governança (Configurações)
  agora lê/grava em `organization_members` via `src/lib/governance.ts`
  (display_name/email/permissions/approval_limit/can_cancel; demo segue no
  perfil local). Editar papel/permissões/limite de membros **existentes**
  persiste de verdade; o proprietário é protegido (não some/exclui).
  ⏳ **Adicionar usuário** ainda depende de **fluxo de convite** (criar conta no
  `auth` via service-role + e-mail) — botão desabilitado em live até lá.
- **#3 unificação**: telas únicas "Entradas"/"Saídas" com filtros (em aberto/
  realizado/recorrente), substituindo a navegação por sub-telas.
- **Aplicar `0008`/`0009`** no Supabase remoto (e gerar o ambiente de produção
  a partir das migrations versionadas). ✅ **Aplicadas** no projeto `all4pay-saas`
  (`dzszmbowhzopocqydnxu`) via MCP — idempotentes; advisor de segurança sem
  novos alertas de RLS. Continuam no repo para provisionar um ambiente limpo.
