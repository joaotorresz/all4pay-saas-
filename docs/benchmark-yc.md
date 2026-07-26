# Benchmark — all4pay × stack financeiro das startups YC

Matriz de capacidades contra as referências que as startups investidas pela
Y Combinator de fato usam para operar finanças: **Mercury** (banking +
dashboards), **Brex/Ramp** (spend management + cartões + aprovações),
**Runway.com** (planejamento de cenários), **Puzzle** (contabilidade
automatizada), **Finta/Fondo** (impostos) e **Campfire** (ERP com IA).

Legenda: ✅ coberto (módulo citado) · 🟡 parcial · 🔜 roadmap · — fora de tese.

## Visão executiva & planejamento (Mercury · Runway.com)

| Capacidade | Referência | all4pay | Onde |
| --- | --- | --- | --- |
| Dashboard de caixa/burn/runway | Mercury | ✅ | Início (Saúde financeira), `/fluxo-caixa` (executive summary) |
| Score de saúde financeira | — (diferencial) | ✅ | `core/quant` `scoreSaudeFinanceira` (8 pilares explicáveis) |
| Projeção de caixa probabilística | Runway.com | ✅ | Monte Carlo (`core/decision` `preverCaixa`, bandas p10/p50/p90) |
| Cenários what-if (receita/despesa/equipe/aquisição) | Runway.com | ✅ | `simularCenario` (sliders ao vivo em `/fluxo-caixa`) |
| Orçamento vs realizado | Runway.com | ✅ | `/orcamento` + Previsto×Realizado no fluxo |
| **Investor update mensal gerado dos números** | Mercury | ✅ | `/investidores` (`core/investor`, PT/EN, e-mail) |
| Benchmark vs pares (coorte) | — (diferencial) | ✅ | `core/datamoat` (percentil vs 320 empresas sintéticas; produção = cross-tenant real) |
| Consolidado multiempresa | — | ✅ | `/consolidado` (RPC `org_consolidado`) |
| Headcount planning dedicado | Runway.com | ✅ | `/contratacoes` (`core/headcount`: custo real c/ encargos, caixa M1–M12, runway/score antes→depois) |

## Pagamentos & spend management (Brex · Ramp)

| Capacidade | Referência | all4pay | Onde |
| --- | --- | --- | --- |
| Central de pagamentos em lote (idempotente) | Ramp | ✅ | `/pagamentos` (`FinancialPlatform.processarPagamento`) |
| Fluxo de aprovações por alçada | Brex/Ramp | ✅ | `/aprovacoes` (`core/institutional`, gate na Central) |
| Reembolsos com OCR de comprovante | Ramp | ✅ | `/reembolsos` (item→movement por categoria) |
| Cartões corporativos próprios | Brex/Ramp | — | fora de tese (exige emissor); POS/maquininha coberto em `/pos` |
| Cobrança automática por WhatsApp/e-mail | — (diferencial BR) | ✅ | Twilio/Resend (`notifications.server`), segmentação do motor de crédito |

## Contabilidade & conciliação (Puzzle)

| Capacidade | Referência | all4pay | Onde |
| --- | --- | --- | --- |
| Razão de dupla entrada como fonte da verdade | Puzzle | ✅ | `/razao` (`core/ledger`, trial balance, backfill idempotente) |
| DRE competência/caixa com drill-down | Puzzle | ✅ | `/dre` (`core/dre`, 3 datas IULI) |
| Auto-categorização por IA que aprende | Puzzle | ✅ | FDIP + Puzzlebot (`/api/ai/categorizar`, self-learning) |
| Conciliação bancária probabilística | Puzzle | ✅ | `/conciliacao-bancaria` (matching ponderado, filas auto/sugestão/exceção) |
| OCR de documentos (boleto/NF/comprovante) | — | ✅ | `/upload` (Claude vision + Tesseract fallback local) |
| Fechamento mensal guiado | Puzzle | ✅ | `/fechamento` |
| Exportação para o contador | — (realidade BR) | ✅ | `/contabilidade` (TXT Domínio) |

## Impostos (Finta · Fondo)

| Capacidade | Referência | all4pay | Onde |
| --- | --- | --- | --- |
| Visão fiscal do período + carga tributária | Finta | ✅ | `/impostos` + motor DRE |
| Simulador Simples Nacional (alíquota efetiva) | — (BR) | ✅ | `core/tax` (Anexos I/II/III/V, via chat da IA) |
| Provisão trabalhista (13º/férias/FGTS) | — (BR) | ✅ | `core/payroll` (via chat da IA) |
| Filing automático de guias | Fondo | 🔜 | exige integração com governo/parceiro fiscal |

## Inteligência & IA (Campfire · diferencial all4pay)

| Capacidade | Referência | all4pay | Onde |
| --- | --- | --- | --- |
| Chat financeiro ancorado nos números reais | Campfire (Ember) | ✅ | All 4 Pay AI (KB + motor nativo ~60 intents + Claude com memória de conversa) |
| Funciona SEM chave de IA | — (diferencial) | ✅ | motor nativo determinístico + calculadoras (`core/assistant`, 8 guardas de regressão) |
| Detecção de anomalias de despesa | — | ✅ | `core/executive` `detectarAnomalias` (z-score, duplicidade) |
| Score de crédito por cliente (explicável) | — | ✅ | `core/risk` (fatores + recomendação + ficha 360º) |
| Ações autônomas com human-in-the-loop | — | ✅ | `/copiloto` aba Autônomo (`core/autonomous`, guardrails por valor) |
| Lançamento contábil rascunhado por IA + aprovação | Campfire | ✅ | CopilotoChat (rascunho balanceado → aprovar e postar) |

## Infraestrutura de confiança (o que banco/auditoria exige)

| Capacidade | all4pay | Onde |
| --- | --- | --- |
| Trilha de auditoria hash-chain (tamper-evident) | ✅ | `core/institutional` (SHA-256, replay temporal, export legal) |
| Multi-tenant com RLS por organização | ✅ | migrations `0005–0007` |
| Idempotência de pagamento + fila com retry | ✅ | `core/platform` (queue, circuit breaker, DLQ em `core/reliability`) |
| Admin cross-tenant (MRR, assinaturas, impersonação auditada) | ✅ | `/admin` (`0014–0017`) |

## Billing por ciclo (recorrências → cobrança)

Coberto no que código alcança: o **scheduler de faturamento** roda em Vercel
Cron (`/api/recorrencias/run`, diário, idempotente por `reference_code`) e
materializa as faturas de cada contrato como recebíveis; `/boletos` emite por
fatura o **PIX copia-e-cola real** (BR Code/EMV, sem PSP) e o trilho do boleto
(nosso número + linha digitável — registro no banco emissor é o passo externo);
marcar pago concilia e credita o saldo. A cobrança por WhatsApp/e-mail usa a
mesma esteira de notificações.

## Gaps que exigem parceiro externo (roadmap honesto)

1. **Open Finance real** (Pluggy/Belvo) — conciliação e saldo ao vivo sem upload.
2. **Registro de boleto no banco emissor + NFS-e municipal** — PSP/prefeituras.
3. **Filing fiscal automático** — parceiro para emissão/pagamento de guias.
4. **Cartões corporativos** — fora de tese enquanto não houver emissor parceiro.

Com `/contratacoes` entregue, **todas as capacidades alcançáveis por software
próprio estão cobertas** — os itens acima dependem de integrações de terceiros
(agregador bancário, PSP, prefeituras, emissor de cartão), não de código.

> Atualize esta matriz a cada feature de benchmark entregue — ela é a
> evidência viva de onde o all4pay está vs o stack YC.
