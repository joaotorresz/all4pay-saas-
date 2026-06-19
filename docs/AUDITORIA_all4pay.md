# all4pay — Inventário completo + Auditoria de correlações

> Extração de todas as páginas, funcionalidades e da camada de dados, com foco
> nas **correlações que ainda não fecham** (fontes de verdade duplicadas, stores
> só locais, caminhos live não exercitados, integrações pendentes).
>
> Gerado a partir do estado atual do repositório `all4pay-saas` (branch
> `claude/epic-fermi-i423xk`). Data: 2026-06-18.

---

## 1. Visão geral da arquitetura

- **Stack:** Next.js (App Router) + TypeScript + Tailwind (DS por tokens) + Supabase (Postgres/RLS/Edge Functions) + React Query + Recharts.
- **Multi-tenant:** toda tabela tem `org_id default auth_org_id()` + RLS por organização (migrations 0005–0007).
- **Demo vs Live:** `isDemo` (env `NEXT_PUBLIC_ALL4PAY_DEMO` ou ausência do Supabase) → seed determinístico + stores locais; live → Supabase.
- **Duas “fontes de verdade” coexistindo (ver §4):**
  1. `movements` (partida simples) — alimenta dashboard, DRE gerencial, risco, quant, etc.
  2. **Razão de dupla entrada** (`journal_entries`/`journal_lines`, migration 0010) — base contábil nova (Fases 0–6 do blueprint Campfire).

---

## 2. Mapa de páginas (todas as rotas)

### Núcleo
| Rota | Página | Função |
| --- | --- | --- |
| `/` | Início | Dashboard (widgets + cockpit + período global + Nova transação) |
| `/upload` | Upload de dados | Importação lote/individual (CSV/OFX/OCR) → confirmação estilo Open Finance |
| `/visao-geral` `/import` `/inbox` | — | **Redirects** (`/`, `/upload`, `/upload`) |

### Contabilidade (Razão / GL — novo, blueprint Campfire)
| Rota | Página | Função |
| --- | --- | --- |
| `/razao` | Razão (GL) | Balancete + lançamentos + backfill + lançamento manual + importar Open Finance |
| `/relatorios` | Relatórios (Razão) | DRE do razão + Balanço patrimonial + Orçado×Realizado + pivot por dimensão |
| `/assistente` | Assistente (Razão) | IA conversacional sobre o GL (Claude) + rascunho com aprovação + trilha `ai_actions` |

### Relatórios gerenciais
| Rota | Página | Função |
| --- | --- | --- |
| `/dre` | DRE Intelligence | DRE gerencial sobre `movements` (intervalo + cadência + regime + drill-down) |
| `/fluxo-caixa` | Fluxo de Caixa | 14 blocos (Monte Carlo, cenários, what-if, heatmap, digital twin…) |
| `/orcamento` | Orçamento vs Realizado | Variância sobre `movements` (baseline automático) — engine local |
| `/cronogramas` | Cronogramas | Amortização/depreciação → lançamento mensal (lança no razão) |
| `/fechamento` | Fechamento contábil | Checklist + provisões (lança no razão) + travar período (banco) |
| `/receita` | Reconhecimento de receita | MRR/ARR + diferida + waterfall + reconhecer no razão |
| `/dimensoes` | Dimensões & Tags | Pivot por categoria/centro/contraparte/tag (sobre `movements`) |

### Receber
| Rota | Página | Função |
| --- | --- | --- |
| `/recebiveis` | Entradas | Lista unificada (Em aberto · Realizado · Recorrente) |
| `/recebimentos` | Central de recebimentos | Execução/baixa de entradas |
| `/recorrencias` | Recorrências/Contratos | MRR; projeta faturas futuras |
| `/inadimplencia` | Inadimplência | Risk intelligence de crédito + AI Collections |
| `/boletos` | Boleto | Boleto colado ao recebível |
| `/notas-fiscais` | NFS-e | Emissão/controle de NFS-e (ISS) |

### Pagar
| Rota | Página | Função |
| --- | --- | --- |
| `/pagaveis` | Saídas | Lista unificada (Em aberto · Realizado · Recorrente) |
| `/pagamentos` | Central de pagamentos | Execução em lote + comprovante + gate de alçada |
| `/aprovacoes` | Solicitações & aprovações | Gate de alçada (fila/minhas/todas) |
| `/reembolsos` | Reembolsos | Reembolso do colaborador (OCR + Pix) → saída |
| `/lixeira` | Lixeira | Cancelados recuperáveis |

### Contas & Banco
| Rota | Página | Função |
| --- | --- | --- |
| `/contas` | Open Finance | Conectar banco (Pluggy) |
| `/conciliacao` | Conciliação | Matching probabilístico |
| `/automacoes` | Automações | Regras low-code + auditoria |

### Cadastrar
| Rota | Página |
| --- | --- |
| `/contatos` `/produtos` `/servicos` `/vendas` | Cadastros + documentos de venda |

### Central POS
| Rota | Página | Função |
| --- | --- | --- |
| `/pos/taxas` | Config. de taxas | Simulador MDR + antecipação + online |
| `/pos/venda` | Simulador de venda | Líquido ao EC + recebível líquido + tarifa como custo |

### Inteligência (Modo Pro)
| Rota | Página |
| --- | --- |
| `/copiloto` `/inteligencia` `/risco` `/inadimplencia` `/decisao` `/autonomo` `/dados` | Motores de IA/quant/risco/decisão/autônomo/moat |

### Equipe / Plataforma / Config
| Rota | Página |
| --- | --- |
| `/governanca` | Auditoria imutável + RBAC + aprovação |
| `/orquestracao` `/infraestrutura` `/arquitetura` | Event sourcing, ledger-core, treasury, reliability |
| `/configuracoes` | Empresa + governança (participantes) |
| `/comecar` `/login` | Onboarding / login (fora do AppShell) |

### APIs (server)
`/api/inbox/ocr` (OCR Claude) · `/api/ledger/categorize` (categorização IA) ·
`/api/ledger/assistant` (assistente) · `/api/design` (auto-save do editor) ·
`/api/cobranca/whatsapp` · `/api/notificacoes/teste|status` ·
`/api/financial-os/run` (cron) · `/api/recorrencias/run` (cron).

### Motores (`src/core/*`)
`ledger`, `dre`, `budget`, `close`, `schedules`, `revenue`, `dimensions`,
`risk`, `risk-engine`, `quant`, `decision`, `executive`, `autonomous`,
`datamoat`, `orchestration`, `platform`, `treasury`, `reliability`,
`architecture`, `institutional`, `financial-os`, `fdip`, `onboarding`, `ai`.

---

## 3. Camada de dados

### Tabelas no Postgres (versionadas)
- `0001` financial_accounts, movements · `0002` categories/cost_centers/parties/splits/recurrences · `0003` brands/units/salespeople/products/services/sales_docs/sale_items · `0004` financial_rules/rule_executions/audit_log · `0005–0007` multi-tenant + RLS + `auth_org_id()` · `0008` pluggy_items/bank_accounts/bank_transactions · `0009` approvals/reembolsos/nfse/pos_rates/company_profiles + colunas de governança · **`0010` razão**: entities, ledger_accounts, accounting_periods, journal_entries, journal_lines, dimensions, budgets, schedules, revenue_contracts/_schedule, close_tasks, raw_events, ai_actions (+ triggers D=C e período travado).

### Stores locais (localStorage — **não vão ao Postgres**)
`a4p_company` (parcial), `a4p_pos_taxas`, `a4p_orcamento` (orçamento /orcamento,
**só demo** — live em `budgets`), `a4p_cronogramas`, `a4p_tags`,
`a4p_locked_periods` + `a4p_close_tasks`, `a4p_ledger` (razão demo),
`a4p_recorrencias`, `a4p_home_*`, `a4p_visual_edits` + `a4p_theme_draft`.

---

## 4. ⚠️ Correlações que NÃO estão fechando (auditoria)

### 4.1. Duas fontes de verdade: `movements` × razão (GL) — **a maior** · ✅ RESOLVIDO
> **Atualização (18/06):** o razão passou a ser uma **projeção determinística dos
> `movements`** (recalculada em `getLedgerEntries`) + os lançamentos nativos do GL
> (manual/cronograma/provisão/receita, `external_key` sem `mov:`). Não há mais
> divergência por construção — `movements` e razão sempre batem; os 702 `mov:`
> antigos no banco são ignorados (não duplicam). **Os dois DREs foram fundidos:**
> `/relatorios` aponta para o `/dre` único (números reconciliam). Texto original
> abaixo mantido como histórico.

- ✅ **RESOLVIDO (18/06):** o razão agora é uma **projeção determinística** de `movements` (em `getLedgerEntries`) + lançamentos nativos do GL — sem re-backfill manual, sem divergência. Texto histórico abaixo.
- ~~O razão só é populado por ação explícita (Backfill, manual, Pluggy, "Lançar no razão" de cronogramas/provisões/receita).~~
- ~~Lançamentos novos em `movements` não postam no GL → razão diverge.~~
- ✅ **Os dois DREs e os dois orçamentos foram fundidos:** `/relatorios` aponta para o `/dre` único e para o `/orcamento` único (números reconciliam pela projeção). `/relatorios` mantém só o que é exclusivo do GL (Balanço, pivot).
- **Correção sugerida:** ou (a) postar todo novo `movement` no GL em tempo real (dual-write/derivação automática), ou (b) migrar os relatórios/motores para lerem `journal_lines`. O blueprint pede o GL como verdade única.

### 4.2. Tabelas do `0010` existem mas as UIs usam stores locais
- `budgets`, `schedules`, `revenue_contracts/_schedule`, `close_tasks`, `dimensions` foram criadas, mas:
  - ✅ **Orçamento** (`/orcamento`, único): **live grava em `budgets`** (período sentinela + `dimensions.linha`); demo em `localStorage`. `a4p_budget_gl` e o orçamento duplicado de `/relatorios` foram removidos.
  - ✅ **Cronogramas** (`/cronogramas`): **live grava em `schedules`** (tipo→kind, categoria packed em `description`); demo em `localStorage`.
  - ✅ **Fechamento** (`/fechamento`): lock vai a `accounting_periods` e as **tarefas do checklist a `close_tasks`** (live), com **cache hidratado cross-device** (`hydrateClose`); `localStorage` segue como camada síncrona (lida no render do `MovementsTable`). Leituras unem as duas camadas.
  - ✅ **Tags** (`/dimensoes`): nova tabela **`movement_tags`** (migration `0011`, RLS por org) guarda a atribuição de tag por movimento; `tags.ts` grava live e usa cache hidratado (`hydrateTags`) p/ `tagsDe`/`allTags` seguirem síncronos. Demo segue em `localStorage`.
  - ✅ **Receita** (`/receita`): é derivada das **recorrências**, que **já persistem live** em `public.recurrences` (com `itens jsonb`) — logo a receita é multi-device, e o reconhecimento posta no ledger. As tabelas `revenue_contracts/_schedule` (modelo CPC 47 paralelo) ficam para quando houver UI que as consuma.
- **Efeito:** orçamento, cronogramas, fechamento e tags agora multi-device em live, usando as tabelas versionadas; receita já persistia via recorrências.

### 4.3. Caminhos LIVE não exercitados nesta sessão
- **Razão live** (insert em `journal_entries/_lines` + `posted`), **Pluggy→razão**, **categorização Claude** e **assistente Claude** rodam pelo padrão do projeto, mas **só foram validados em demo + build** — não com usuário autenticado/credenciais reais.
- **Pluggy 100%** depende de: secrets na Supabase (`PLUGGY_CLIENT_ID/SECRET`, `PLUGGY_WEBHOOK_SECRET`), ambiente **não-demo** no Vercel (`NEXT_PUBLIC_ALL4PAY_DEMO=false` + URL/anon key), e **sandbox→produção** na Pluggy.

### 4.4. Governança: “Adicionar usuário” incompleto em live
- Editar papel/permissões/limite de **membros existentes** funciona (`organization_members`), mas **criar usuário novo** depende de um **fluxo de convite** (Edge Function service-role + e-mail) que **não existe** → botão desabilitado em live.

### 4.5. IA gated por chave (sem fallback de produção plena)
- OCR (`/api/inbox/ocr`), categorização (`/api/ledger/categorize`), assistente (`/api/ledger/assistant`): **precisam de `ANTHROPIC_API_KEY`**. Sem a chave caem em regras/OCR local/modo básico — funcional, mas a experiência "IA completa" só liga com a chave no Vercel.

### 4.6. Notificações / cobrança gated por env
- WhatsApp (Twilio) e e-mail (Resend) só disparam com as chaves (`TWILIO_*`, `RESEND_*`, `ALERTS_*`); sem elas, **simulado**. Templates de produção (`TWILIO_TEMPLATE_*`) opcionais.

### 4.7. Inbox / canais de ingestão “em breve”
- Em `/upload`/Inbox, os canais **E-mail, WhatsApp, Open Finance (na inbox), API/ERP, monitoramento de pasta** estão marcados "em breve" — **conectores de backend não construídos**. Só **upload/arrastar** e **OFX/CSV (FDIP)** funcionam de fato.

### 4.8. Detecção × ação no /upload
- O upload **detecta** pagamentos recorrentes/mensais e fornecedores, e **cadastra fornecedores** (via `aplicarOnboarding`), mas **NÃO cria os contratos de recorrência** a partir dos recorrentes detectados (é só insight). → falta o "criar recorrência" por item detectado.

### 4.9. `movements` sem `account_id`
- Os `movements` **não carregam conta financeira** (documentado no CLAUDE.md). → o escopo por conta (saldo/filtros por conta) é **limitado/derivado**; conciliação e saldo por conta no GL dependem disso.

### 4.10. NFS-e / Boleto / PIX — emissão real
- As telas existem e o modelo está arquitetado, mas a **emissão real** (provedor de NFS-e municipal, registro de boleto, PIX dinâmico) depende de **integração/credenciais** ainda não plugadas.

### 4.11. Editor de design — auto-save em arquivo
- O `/api/design` grava `design-edits.json` **só onde o FS é gravável** (dev/local). No **Vercel (read-only)** cai para localStorage + Exportar. Multi-device exigiria persistir no Postgres.

### 4.12. Motores proprietários ainda sobre `movements` (decisão pendente)
- Risco, Inadimplência, Quant, Decisão, Autônomo, Data Moat, Orquestração/Infra/Arquitetura leem `RiskInput`/`movements`. **Não consomem o GL.** São diferenciais que o Campfire não tem — decisão pendente de **portar para `journal_lines`** (mais rico) sem perder os diferenciais.

---

## 5. O que ESTÁ correlacionado e funcionando (demo)
- Upload/FDIP → `imported` store → **invalida React Query** → reflete em dashboard/DRE/risco/quant/decisão/contatos.
- `getRiscoInput()` resolve **categoria** e **centro de custo** por nome → DRE por linha/centro reflete o escolhido no lançamento.
- **Liquidação** (pagamentos/recebimentos) → `liquidarImported`/`appendImported` → `getRiscoInput` → saldo reage.
- **Backfill do razão** → balancete fecha → `/relatorios` (DRE/Balanço/pivot) e `/assistente` consomem o GL.
- **Cronogramas/Provisões/Receita** → "Lançar no razão" → aparecem em `/razao` e `/relatorios`.
- **Período travado** → trigger do banco rejeita postagem (live) + bloqueio na `MovementsTable`.
- ✅ **Copiloto que AGE (18/06):** `/copiloto` deixou de só informar — lê as decisões priorizadas do motor autônomo e EXECUTA a ação reversível (registra na trilha `ai_actions`, demo + live) ou ENVIA para a alçada (`/aprovacoes`), com human-in-the-loop. Os consoles read-only (`/decisao`, `/autonomo`, `/risco`, `/inadimplencia`, `/inteligencia`, `/dados`) viram **detalhamentos** linkados a partir dele. `ai_actions` agora também grava em demo (`a4p_ai_actions`), unificando a trilha do assistente do razão e do copiloto.
- ✅ **Chat unificado (19/06):** os dois chats viraram **um** (`CopilotoChat`): perguntas de negócio → motor executivo (números + fontes, sem chave); pedidos de lançamento → LLM rascunha o lançamento balanceado → aprovar e postar no razão. `/assistente` agora **redireciona** para `/copiloto` (view antiga removida; Sidebar/command palette/guia atualizados).
- ✅ **Fase 3 (19/06):** os 6 consoles (`/decisao`, `/autonomo`, `/risco`, `/inadimplencia`, `/inteligencia`, `/dados`) agora vivem **agrupados sob o submenu "Copiloto"** na Sidebar (telas preservadas como detalhamento). E a **cobrança é real a partir do painel de ações**: executar uma decisão de cobrança monta os alvos (telefone dos Contatos + canal WhatsApp) e dispara pelo mesmo caminho do `/autonomo` (`/api/cobranca/whatsapp` → Twilio em live, simulado sem chave), registrando na trilha.
- ✅ **Ingestão unificada (19/06):** `/upload` virou a esteira **"Entrada de dados"** com 3 abas de um só fluxo — **Conectar** (Open Finance + posição por conta), **Enviar** (extratos/documentos via FDIP/OCR) e **Conciliar** (matching → baixa única). `/contas` e `/conciliacao` **redirecionam** para as abas (`?aba=`); Sidebar/command palette/AccountsCard/close engine atualizados. Os componentes das 3 telas foram preservados (reusados como abas).

---

## 6. Priorização sugerida para "fechar" as correlações

| Prioridade | Item | Por quê |
| --- | --- | --- |
| 🔴 Alta | §4.1 GL como fonte única (dual-write `movements`→razão ou migrar relatórios) | Elimina as duas verdades; é o coração do blueprint |
| 🔴 Alta | §4.3 Pluggy 100% | Destrava live real (ingestão) |
| ✅ Feito | §4.4 Convite de membros | UI em Configurações → Governança; RPCs `SECURITY DEFINER` no `0012` (`org_invite_by_email`…), convidado precisa ter conta. Aplicado ao remoto. |
| 🟠 Média | §4.2 Persistir budgets/schedules/tags/close/revenue nas tabelas `0010` | Multi-device + usar o schema versionado |
| 🟠 Média | §4.8 "Criar recorrência" a partir do upload | Fecha o ciclo de cadastro automático |
| 🟠 Média | §4.5/§4.6 Ligar `ANTHROPIC_API_KEY` + Twilio/Resend no Vercel | Liga IA/cobrança de verdade |
| 🟡 Baixa | §4.7 Conectores de inbox (e-mail/WhatsApp/API) | Roadmap de ingestão |
| ✅ Feito | §4.9 `account_id` em `movements` | Coluna + fluxo ponta a ponta (lançamento→writer→leitura→listas→filtro fluxo de caixa). Listas mostram o nome da conta (lista real) e filtram por conta. |
| 🟢 Parcial | §4.10 Emissão real | **PIX real** (BR Code/EMV + CRC16, `src/lib/pix.ts`, chave = CNPJ da empresa) gerado no boleto e copiável na tela. Boleto bancário (linha digitável registrada) e NFS-e seguem simulados — dependem de PSP/banco emissor e provedor de prefeitura (config futura, padrão env). |

---

## 7. Pendências fora de código (do usuário)
- Secrets Pluggy + ambiente não-demo no Vercel + sandbox→produção.
- `ANTHROPIC_API_KEY`, `TWILIO_*`/`RESEND_*` no Vercel.
- Aplicar provedor de NFS-e / registro de boleto / PIX.
