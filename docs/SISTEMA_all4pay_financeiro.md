# Sistema all4pay-financeiro — Especificação completa

> **Blueprint de um ERP nativo de IA**, baseado na auditoria do Campfire AI e adaptado à stack do all4pay (React 18 / Vite / TypeScript / Supabase / Tailwind / Cloudflare Pages) e ao contexto regulatório brasileiro.
>
> Documento de referência de arquitetura e produto. Pensado para viver no repositório e servir de contexto para sessões de Claude Code.

---

## Nota de método

Este documento combina três fontes, sempre rastreáveis:

1. **Lógica pública do Campfire** — site oficial, Y Combinator, G2 e análises de mercado (lista no fim). Afirmações atribuídas a eles são paráfrases dessas fontes.
2. **Descrição oficial do vídeo de demo** — o índice de módulos e os marcadores de tempo. (A transcrição falada foi bloqueada pelo YouTube; o detalhe visual tela-a-tela não está coberto.)
3. **Conhecimento contábil padrão** — dupla entrada, IFRS 15 / CPC 47, fechamento. Não é segredo do Campfire e é livremente replicável.

Nada foi inventado para "preencher" a lógica do sistema.

---

## Sumário

- [Parte I — A tese](#parte-i--a-tese)
- [Parte II — Arquitetura](#parte-ii--arquitetura)
- [Parte III — Módulos e funcionalidades](#parte-iii--módulos-e-funcionalidades)
- [Parte IV — Adaptação ao Brasil](#parte-iv--adaptação-ao-brasil)
- [Parte V — Roadmap de construção](#parte-v--roadmap-de-construção)
- [Parte VI — Riscos de arquitetura](#parte-vi--riscos-de-arquitetura)
- [Apêndice A — Esquema SQL consolidado](#apêndice-a--esquema-sql-consolidado)
- [Apêndice B — Mapa de funcionalidades](#apêndice-b--mapa-de-funcionalidades)
- [Fontes](#fontes)

---

## Parte I — A tese

### 1. O trabalho que ninguém quer fazer

A tese comercial: automatizar o trabalho contábil repetitivo — categorização de transações, conciliação bancária, reconhecimento de receita, análise de variação — para o time financeiro permanecer enxuto enquanto o negócio escala. Caso emblemático do Campfire: ir de US$ 10M a US$ 200M+ de ARR sem aumentar o time de contabilidade.

> **O insight a roubar:** o valor não está em "ter um ERP". Está em **eliminar trabalho humano repetitivo com confiança auditável**. Toda decisão de arquitetura existe para sustentar esse "com confiança auditável" — sem ele, automação vira risco, não produto.

### 2. A estratégia de cunha (wedge)

O Campfire não lançou um ERP completo. Lançou **um** módulo (Revenue Automation) e depois expandiu para o razão geral completo. A cunha resolve uma dor aguda, conquista o cliente, e a expansão vem por gravidade.

**Tradução para o all4pay:** sua cunha não é receita — é o **Open Finance**. Você já ingere transações via Pluggy. A dor aguda do público brasileiro (PME e consumidor) é não saber para onde o dinheiro vai. Cunha = ingestão Open Finance → categorização automática → verdade financeira em tempo real. O razão de dupla entrada entra por baixo depois.

### 3. "Nativo de IA" não é IA acoplada

Em sistemas legados, a IA é um chatbot por cima de um banco que ele não entende. Aqui, categorização, conciliação e análise de variação acontecem **dentro** do razão. A IA não consulta o sistema — ela opera o sistema, e cada ação vira lançamento auditável.

> **Consequência de projeto:** você não constrói "o produto" e depois "adiciona IA". Você constrói o razão e as views de leitura **desde o dia 1** pensando em como um agente vai ler (consultas seguras) e escrever (rascunhos com aprovação humana).

O assistente do Campfire (Ember AI) é movido pelos modelos **Claude, da Anthropic** — a mesma stack de IA que você já acessa. O equivalente no all4pay não exige tecnologia nova; exige a modelagem certa por baixo.

---

## Parte II — Arquitetura

### 4. As quatro camadas

Regra de ouro: **dados sobem, comandos descem, nada pula camada.**

| Camada | Função | No all4pay |
|---|---|---|
| **1. Ingestão** | Trazer eventos financeiros externos, normalizados e idempotentes. | Pluggy/Open Finance (já tem), conectores AR/AP, upload de PDF. Edge Functions de ETL + webhooks. |
| **2. Razão (GL)** | Fonte única da verdade. Tudo vira lançamento de dupla entrada, balanceado e imutável. | Postgres no Supabase, com constraints/triggers garantindo invariantes no banco. |
| **3. Automação** | Categorizar, conciliar, provisionar, reconhecer receita, fechar o mês. | Edge Functions agendadas (pg_cron) + chamadas a Claude. |
| **4. Leitura & IA** | Relatórios, drill-down, dashboards, assistente conversacional. | React + views SQL sob RLS; assistente via Claude com ferramentas (MCP). |

> A camada 2 (razão) é a única que você **não consegue refatorar depois sem dor**. Se a ingestão de hoje gravar transações soltas sem dupla entrada por baixo, você reprocessa tudo quando quiser DRE, balanço ou auditoria. **Comece pelo razão.**

### 5. Os seis princípios inegociáveis

1. **Dupla entrada desde o dia 1** — todo evento gera lançamento com débitos = créditos. Não existe "transação avulsa".
2. **Dinheiro nunca é float** — use `NUMERIC(20,4)` no Postgres (ou inteiro em centavos). Float corrompe centavos silenciosamente.
3. **Lançamento postado é imutável** — correção por estorno (reversal), nunca editando o original. Requisito de auditoria.
4. **Idempotência na ingestão** — cada evento externo tem chave única (ex.: id Pluggy). Reprocessar webhook não duplica lançamento.
5. **Períodos travados no banco, não na UI** — mês fechado → o banco rejeita postagens. Trava em trigger/constraint, não em React.
6. **RLS é a fronteira de segurança** — isolamento multi-tenant por `org_id` em toda tabela.

### 6. O modelo de dados central

Sete tabelas sustentam tudo. (Esquema completo no [Apêndice A](#apêndice-a--esquema-sql-consolidado).)

- `entities` — entidades legais (multiempresa: All4Pay, UserFly, Hangar 267), moeda funcional, hierarquia de consolidação.
- `accounts` — plano de contas hierárquico (ativo/passivo/PL/receita/despesa); só folhas recebem lançamento.
- `accounting_periods` — períodos (open/closed/locked); o cadeado do fechamento.
- `journal_entries` — cabeçalho do lançamento; `external_key` única dá idempotência.
- `journal_lines` — a dupla entrada vive aqui; débito, crédito, moeda, `fx_rate`, `dimensions jsonb`.
- `dimensions` — definição das tags configuráveis (cliente, depto, projeto, centro de custo).
- `budgets` — orçamento por conta × dimensão × período.

**A invariante que define o sistema:** para todo `journal_entry` postado, `SUM(debit) = SUM(credit)`. É um trigger no Postgres — a linha de SQL que separa um sistema contábil de uma planilha glorificada.

> **Dimensões = o "ilimitado" do Campfire.** As tags/dimensões ilimitadas do vídeo são o campo `dimensions jsonb` em cada linha. É isso que permite DRE por departamento, margem por cliente e drill-down por projeto **sem mudar o esquema**. Modele genérico desde o início.

---

## Parte III — Módulos e funcionalidades

Formato de cada módulo: **o que faz · regra central · adaptação BR**. São as funcionalidades demonstradas no vídeo, reconstruídas como decisões de engenharia.

### 3.1 Razão geral + plano de contas
- **Faz:** a camada 2 inteira. Recebe lançamentos de todas as fontes; única verdade.
- **Regra:** saldo da conta = `SUM(debit) − SUM(credit)`, respeitando a natureza (ativo/despesa sobem no débito; passivo/receita/PL no crédito).
- **BR:** plano de contas alinhado ao padrão brasileiro, "SPED-ready" no campo `code` (mapeável para ECD/ECF). Não precisa emitir SPED no MVP.

### 3.2 Consolidação multiempresa e multimoeda
- **Faz:** DRE/balanço de várias entidades lado a lado em colunas + consolidado, sem trocar de instância.
- **Regra:** cada `entity` tem moeda funcional; consolidação converte por `fx_rate` e agrega filhos via `parent_entity_id`; eliminações intercompany são lançamentos no nível consolidado.
- **BR:** seu ecossistema de três empresas (All4Pay, UserFly, Hangar 267) é o caso de uso perfeito — base BRL. Diferencial real para PMEs com mais de um CNPJ.

### 3.3 Relatórios, drill-down e construtor pivot
- **Faz:** DRE personalizável, demonstrações customizadas, construtor arrastar-e-soltar (pivot), envio agendado. Qualquer número desce até a transação.
- **Regra:** relatórios são agregações sobre `journal_lines` por conta e dimensão; drill-down filtra as linhas do recorte; o pivot monta `GROUP BY` dinâmico sobre (conta × dimensão × período).
- **BR:** DRE e Balanço no formato brasileiro; "não-GAAP" → "gerencial".

### 3.4 Orçado vs. realizado e análise de variação (flux)
- **Faz:** importa orçamento em qualquer nível e compara ao realizado (variação R$ e %); IA explica a variação no nível da transação.
- **Regra:** `variância = realizado(journal_lines) − budgets.amount`.
- **IA:** pega as maiores variações, busca as transações causadoras e pede ao Claude o comentário. Leitura + síntese — baixo risco, alto valor.

### 3.5 Categorização por IA e conciliação bancária
> **Módulo onde você está mais perto** — já ingere Pluggy; falta a ponte transação → lançamento categorizado.
- **Categorização:** para cada transação nova, monte prompt com (a) descrição/valor/contraparte e (b) exemplos das categorizações históricas mais parecidas daquela org. Claude devolve conta + dimensões + score. Acima do limiar, posta automático; abaixo, fila de revisão. Cada correção humana vira exemplo futuro → "aprende com os dados".
- **Conciliação:** casamento contínuo transação bancária ↔ (fatura | conta a pagar | lançamento). Auto-match por valor + data + contraparte; ambíguos viram sugestão agrupada.
- **BR:** a contraparte no Open Finance vem com CNPJ/CPF — chave forte de categorização **e** de KYB (conecta ao trabalho de due diligence: BigDataCorp/uPlexis).

### 3.6 Checklist de fechamento (close) com tarefas de IA
- **Faz:** gestão de fechamento com tarefas padrão e personalizadas; tarefas de IA automáticas (provisões, lançamentos faltantes, rascunhos).
- **Regra:** tarefas de IA produzem **rascunhos** (`status review`), nunca postam direto em valores materiais. Humano aprova → `posted`.
- **Ganho:** transformar "construir o fechamento" em "revisar o fechamento" (Campfire cita até ~70% mais rápido; PostHog cortou 5–6 dias).

### 3.7 Despesas antecipadas e ativo imobilizado
- **Faz:** cronogramas automáticos de amortização (antecipadas) e depreciação (imobilizado) que viram **um** lançamento mensal para aprovar.
- **Regra:** job mensal (pg_cron) gera 1 `journal_entry` consolidando as parcelas do período.
- **BR:** taxas de depreciação conforme legislação fiscal; permita método contábil (CPC 27) ≠ fiscal.

### 3.8 Reconhecimento de receita (equivalente ao ASC 606)
> **Maior diferença de contexto:** o Campfire usa **ASC 606** (EUA); no Brasil o equivalente é **IFRS 15 / CPC 47**. Lógica análoga: identifica obrigações de desempenho e reconhece receita conforme cumpridas.
- **Modelo:** contrato → obrigações de desempenho → cronograma. Receita antecipada é passivo (receita diferida) que migra para receita ao longo do tempo.

| Modelo de cobrança | Como reconhece |
|---|---|
| Assinatura | Linear (ratable) ao longo do contrato |
| Por uso | Conforme incorre o consumo |
| Por marco | No cumprimento de cada milestone |

- **Ingestão de contrato:** sincroniza do CRM (HubSpot/Salesforce) ou extrai de PDF via IA. Para você, **upload de PDF → Claude extrai termos → gera cronograma** é o caminho de menor atrito.
- **Waterfall:** roll-forward do MRR/ARR — saldo inicial + novos + expansões − contrações − churn = saldo final, período a período.

### 3.9 Faturamento, cobrança e módulo fiscal brasileiro
- **Faz:** faturas agendadas e avulsas, links de pagamento, régua de cobrança (dunning) automática, imposto sobre vendas.
- **BR (a maior reescrita):**
  - **Pagamento:** PIX (QR dinâmico), boleto e cartão — não só cartão.
  - **Fiscal:** emissão de **NFS-e** (já arquitetado por você), com impostos brasileiros (ISS em serviços) em vez de sales tax.
  - **Conciliação:** pagamento recebido casa com a fatura e gera lançamento no razão, fechando receita → caixa → conciliação.

### 3.10 Assistente conversacional (equivalente ao Ember AI)
> Por último de propósito: só funciona bem com as camadas 2 e 4 corretas. É a cereja, não a base.
- **Arquitetura segura** — o assistente não recebe o banco cru. Ele recebe:
  1. **Ferramentas de leitura** — consultas parametrizadas sobre views já filtradas por RLS. Claude escolhe a ferramenta, não escreve SQL livre.
  2. **Ferramentas de escrita com aprovação** — "rascunhar lançamento" cria `draft`; humano aprova. Nunca posta direto.
  3. **Geração de artefatos** — slides de conselho e visuais a partir dos números reais.
- **Trilha de auditoria:** toda ação do assistente (leitura ou rascunho) é logada com usuário, prompt e resultado.
- **Ângulo MCP:** o Campfire lançou uma "MCP store dentro do ERP". Se você expuser o razão do all4pay como ferramentas MCP, o mesmo Claude passa a operar o sistema — e agentes externos também. Você já tem MCPs conectados (Supabase, Figma…); o passo é expor seu próprio domínio financeiro como MCP.

---

## Parte IV — Adaptação ao Brasil

| Tema | Campfire (EUA) | All4Pay (Brasil) |
|---|---|---|
| Receita | ASC 606 | IFRS 15 / CPC 47 |
| Imposto na venda | Sales tax | ISS / PIS / COFINS, NFS-e |
| Pagamento | Stripe (cartão) | PIX, boleto, cartão |
| Ingestão bancária | Plaid-like | Open Finance / Pluggy (já tem) |
| Identidade | SSN/EIN | CPF/CNPJ (chave forte p/ KYB) |
| Contábil/fiscal | US GAAP, SOX | CPC, SPED ECD/ECF |
| Privacidade | — | LGPD |
| Regulatório | — | BACEN (você é IP, Res. 494) |

> **Vantagem competitiva escondida:** o Open Finance brasileiro é mais rico e padronizado que o open banking americano. A camada de ingestão que para o Campfire é trabalhosa, para você já está parcialmente pronta. É onde o all4pay pode ser **melhor**, não só equivalente.

---

## Parte V — Roadmap de construção

Cada fase entrega valor sozinha e prepara a próxima.

| Fase | Entrega | Depende de | Status provável |
|---|---|---|---|
| **0** | Backbone do razão: dupla entrada, constraints de balanceamento, períodos+trava, trilha de auditoria, RLS. | — | A construir (fundação) |
| **1** | Ingestão → razão: mapear transações Pluggy em lançamentos; categorização por IA; conciliação. | Fase 0 + Pluggy | Pluggy pronto; falta a ponte |
| **2** | Relatórios + drill-down + dimensões: DRE, balanço, construtor pivot. | Fase 0 | Dashboard existe; falta motor de relatórios |
| **3** | Orçado vs. realizado + flux analysis com IA. | Fases 0–2 | A construir |
| **4** | Fechamento (checklist + IA) + cronogramas de antecipadas/imobilizado. | Fases 0–3 | A construir |
| **5** | Receita (CPC 47) + faturamento + NFS-e + PIX/boleto. | Fases 0–2 | NFS-e já pesquisado; a construir |
| **6** | Assistente conversacional sobre o razão (Claude + MCP). | Todas | A construir por último |

> **O erro a evitar:** construir a Fase 6 antes da Fase 0. Assistente sobre dados sem dupla entrada dá resposta bonita e errada. **Contábil primeiro, IA depois** — é o que faz o Campfire ser confiável.

---

## Parte VI — Riscos de arquitetura

- **Materialidade no loop humano** — defina limiar (por valor e por confiança) abaixo do qual a IA posta sozinha, acima do qual exige aprovação.
- **Reprocessamento determinístico** — guarde os eventos brutos (raw) separados dos lançamentos; você deve conseguir reconstruir o razão reprocessando eventos.
- **Imutabilidade vs. correção** — nunca `UPDATE` em linha postada. Estorno + novo lançamento. Auditor e BACEN querem ver o histórico.
- **Travamento no banco** — trava de período e balanceamento como triggers/constraints, não regra no front. O banco é a última linha de defesa.
- **Custo de IA** — não jogue LLM em tudo. IA para o caso difícil/novo; regras determinísticas/cache para o repetido (mesma contraparte → mesma conta).
- **LGPD e sigilo bancário** — dados de Open Finance são sensíveis. RLS, criptografia e minimização não são opcionais; como IP regulada pelo BACEN, o padrão de cuidado é mais alto.

---

## Apêndice A — Esquema SQL consolidado

> Esquema simplificado de referência. Ajustar tipos, índices e políticas RLS ao padrão do projeto `all4pay-saas` antes de aplicar como migration.

```sql
-- ============================================================
-- CAMADA 2 — RAZÃO (núcleo do sistema)
-- ============================================================

-- Entidades legais (multiempresa + consolidação)
create table entities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  functional_currency char(3) not null default 'BRL',
  parent_entity_id uuid references entities(id),
  created_at timestamptz default now()
);

-- Plano de contas (hierárquico)
create table accounts (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id),
  code text not null,
  name text not null,
  type text not null check (type in
    ('asset','liability','equity','revenue','expense')),
  parent_account_id uuid references accounts(id),
  is_postable boolean not null default true,  -- só folhas recebem lançamento
  unique (entity_id, code)
);

-- Períodos contábeis (o cadeado do fechamento)
create table accounting_periods (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id),
  period date not null,  -- 1º dia do mês
  status text not null default 'open'
    check (status in ('open','closed','locked')),
  closed_at timestamptz, closed_by uuid,
  unique (entity_id, period)
);

-- Lançamento (cabeçalho)
create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id),
  period_id uuid not null references accounting_periods(id),
  entry_date date not null,
  description text,
  source text not null,  -- manual|bank|ar|ap|revrec|depreciation|system
  status text not null default 'draft'
    check (status in ('draft','posted','void')),
  is_reversal_of uuid references journal_entries(id),
  external_key text unique,  -- idempotência (ex.: id Pluggy)
  created_by uuid, posted_by uuid, posted_at timestamptz,
  created_at timestamptz default now()
);

-- Linhas do lançamento (a dupla entrada vive aqui)
create table journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  account_id uuid not null references accounts(id),
  debit numeric(20,4) not null default 0,
  credit numeric(20,4) not null default 0,
  currency char(3) not null default 'BRL',
  fx_rate numeric(20,8) not null default 1,
  dimensions jsonb not null default '{}',  -- {cliente, depto, projeto...}
  memo text,
  check (debit >= 0 and credit >= 0),
  check (not (debit > 0 and credit > 0))   -- linha é débito OU crédito
);

-- Definição das dimensões (tags) configuráveis
create table dimensions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  key text not null,
  label text not null,
  unique (org_id, key)
);

-- Orçamento (Fase 3)
create table budgets (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id),
  account_id uuid not null references accounts(id),
  period date not null,
  dimensions jsonb not null default '{}',
  amount numeric(20,4) not null
);

-- ============================================================
-- INVARIANTE: lançamento postado tem débitos = créditos
-- ============================================================
create or replace function check_entry_balanced()
returns trigger as $$
declare diff numeric;
begin
  if new.status = 'posted' then
    select coalesce(sum(debit) - sum(credit), 0) into diff
      from journal_lines where journal_entry_id = new.id;
    if diff <> 0 then
      raise exception 'Lançamento % desbalanceado (diferença %)', new.id, diff;
    end if;
  end if;
  return new;
end; $$ language plpgsql;

create trigger trg_entry_balanced
  before update of status on journal_entries
  for each row execute function check_entry_balanced();

-- ============================================================
-- INVARIANTE: período travado rejeita postagem
-- ============================================================
create or replace function check_period_open()
returns trigger as $$
declare st text;
begin
  select status into st from accounting_periods where id = new.period_id;
  if st in ('closed','locked') and new.status = 'posted' then
    raise exception 'Período fechado/travado: não é possível postar';
  end if;
  return new;
end; $$ language plpgsql;

create trigger trg_period_open
  before insert or update on journal_entries
  for each row execute function check_period_open();

-- ============================================================
-- CAMADA 3 — AUTOMAÇÃO
-- ============================================================

-- Cronogramas: amortização (prepaid) e depreciação (fixed_asset)
create table schedules (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id),
  kind text not null check (kind in ('prepaid','fixed_asset')),
  description text,
  total numeric(20,4) not null,
  start_period date not null,
  periods int not null,
  method text not null default 'straight_line',
  account_id uuid not null references accounts(id),
  contra_account_id uuid not null references accounts(id)
);

-- Reconhecimento de receita (CPC 47 / IFRS 15)
create table revenue_contracts (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id),
  customer text,
  total numeric(20,4) not null,
  model text not null check (model in ('subscription','usage','milestone')),
  start_date date, end_date date,
  source_pdf_url text  -- ingestão via upload + extração por IA
);
create table revenue_schedule (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references revenue_contracts(id),
  period date not null,
  amount numeric(20,4) not null,
  recognized boolean not null default false,
  journal_entry_id uuid references journal_entries(id)
);

-- Checklist de fechamento
create table close_tasks (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references accounting_periods(id),
  title text not null,
  kind text not null check (kind in ('standard','custom','ai')),
  status text not null default 'pending'
    check (status in ('pending','running','review','done')),
  assignee uuid,
  result_journal_entry_id uuid references journal_entries(id)
);

-- ============================================================
-- INGESTÃO — eventos brutos (reprocessamento determinístico)
-- ============================================================
create table raw_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  provider text not null,        -- pluggy | upload | manual
  external_id text not null,     -- idempotência
  payload jsonb not null,
  processed_at timestamptz,
  journal_entry_id uuid references journal_entries(id),
  unique (provider, external_id)
);

-- ============================================================
-- IA — trilha de auditoria do assistente
-- ============================================================
create table ai_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  kind text not null,            -- read | draft_entry | generate_artifact
  prompt text,
  tool_called text,
  result jsonb,
  created_at timestamptz default now()
);
```

> **RLS:** habilitar em todas as tabelas e criar políticas por `org_id` (ou via `entities.org_id`). Padrão do projeto: orgs do João e do Paulo já isoladas — o razão herda a mesma disciplina.

---

## Apêndice B — Mapa de funcionalidades

Checklist completo do que o sistema deve fazer (✓ = demonstrado no vídeo do Campfire).

### Razão e contabilidade
- ✓ Razão geral de dupla entrada como fonte única
- ✓ Plano de contas hierárquico
- ✓ Drill-down de qualquer relatório até a transação
- ✓ Dimensões/tags personalizadas ilimitadas
- ✓ Períodos com fechamento e trava
- Trilha de auditoria imutável (estorno em vez de edição)

### Consolidação
- ✓ Multiempresa lado a lado em colunas
- ✓ Multimoeda
- Eliminações intercompany

### Relatórios
- ✓ DRE personalizável
- ✓ Demonstrações financeiras customizadas
- ✓ Construtor arrastar-e-soltar (pivot)
- ✓ Relatórios gerenciais (não-GAAP)
- ✓ Envio agendado
- ✓ Dashboards em tempo real

### Orçamento e análise
- ✓ Orçado vs. realizado (variação R$ e %)
- ✓ Análise de variação (flux) com explicação no nível da transação

### Transações
- ✓ Categorização por IA que aprende com os dados
- ✓ Conciliação bancária contínua / auto-match
- ✓ Agrupamento de transações relacionadas + sugestões
- ✓ Aprovação por limite de valor

### Fechamento
- ✓ Checklist de fechamento (tarefas padrão e personalizadas)
- ✓ Tarefas de IA automáticas (provisões, lançamentos faltantes, rascunhos)

### Antecipadas e imobilizado
- ✓ Cronograma automático de amortização
- ✓ Cronograma automático de depreciação
- ✓ Consolidação em um lançamento mensal para aprovação

### Receita
- ✓ Dashboard de receita GAAP e gerencial
- ✓ Waterfall de receita recorrente
- ✓ Reconhecimento de receita (assinatura, uso, marco)
- ✓ Ingestão de contrato via CRM ou PDF/IA

### Faturamento
- ✓ Faturas agendadas e avulsas
- ✓ Links de pagamento (BR: PIX, boleto, cartão)
- ✓ Cobrança de acompanhamento (dunning) automática
- ✓ Imposto sobre vendas (BR: NFS-e / ISS)

### Assistente de IA
- ✓ Perguntas em linguagem natural
- ✓ Análise de variação com explicações
- ✓ Upload de contas/contratos para redação assistida
- ✓ Montagem de slides de conselho e visuais
- ✓ Trilha de auditoria completa
- Exposição do domínio financeiro como MCP

---

## Fontes

| # | Fonte | URL |
|---|---|---|
| 1 | Descrição oficial do vídeo (YouTube) | https://www.youtube.com/watch?v=OIWKSiCmHz8 |
| 2 | Site oficial Campfire | https://campfire.ai/ |
| 3 | Y Combinator — perfil Campfire | https://www.ycombinator.com/companies/campfire-2 |
| 4 | G2 — avaliações | https://www.g2.com/products/campfire-2026-02-16/reviews |
| 5 | Numeric — Rillet vs Campfire | https://www.numeric.io/blog/rillet-vs-campfire |
| 6 | Kruze Consulting — visão de produto | https://kruzeconsulting.com/partners/campfire/ |
| 7 | Trajectory — parceiro de implementação | https://trajectoryinc.com/products/campfire-ai/ |

*Afirmações atribuídas ao Campfire são paráfrases das fontes acima. As seções "No vídeo" vêm da descrição oficial, não da transcrição falada. A modelagem contábil é conhecimento padrão do domínio e livremente implementável.*
