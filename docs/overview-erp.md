# Overview do ERP all4pay-saas (base para comparação com benchmarks)

Fonte: `CLAUDE.md` e código do repositório (branch `sala-86e3g2zfw`, 29/09/2026).
**Não houve acesso ao banco nesta execução**: nenhum número de dado (lançamentos,
categorias, organizações) é medido aqui; o que aparece é estrutura do repo.
Onde o estado real depende do banco, está marcado "confirmar no banco".

## 1. O que é

ERP financeiro para PMEs e pessoa física (Next.js App Router, TypeScript,
Tailwind, Supabase multi-tenant com RLS por organização). Tese: revelar a
profundidade aos poucos (Modo Simples × Pro) e mostrar números que se explicam
(procedência, regime, quais lançamentos). Desde 21/09/2026 é produto para
cliente. Escala do repo: ~82 rotas, 95 migrations, ~70 motores puros em
`src/core/*`.

## 2. Módulos (menu, `nav-data.ts`)

| Área | O que faz | Motor / rota principal |
| --- | --- | --- |
| Início | Painel com widgets (~94), período global, briefing do dia | `/`, `core/indicadores` |
| Contas a pagar | Painel, títulos, recorrentes, folha, projeção | `core/contas-pagar`, `core/folha` |
| Contas a receber | Painel, títulos, carteira, ponte venda→recebimento | `core/contas-receber` |
| Vendas / NFs | Venda como documento-mãe, impostos, assinaturas (MRR) | `core/vendas` |
| Compras | Pedido com aprovação, boleto DDA, NFs recebidas | `core/compras` |
| Caixa & resultado | DRE/DFC em cascata com drill-down, fluxo de caixa, orçamento | `core/relatorios`, `core/dre`, `core/cashflow`, `core/orcamento` |
| Contabilidade | Razão, fechamento, plano de contas, export TXT Domínio | `core/ledger`, `core/contabilidade`, `core/exportacao` |
| Cadastros | Contas bancárias, plano de contas, produtos, clientes, projetos, centros, contratos | `core/registros` |
| Entrada de dados | Open Finance (Pluggy, sandbox), upload CSV/OFX/OCR, conciliação, regras | `core/ingestao`, `core/fdip`, `core/regras`, `core/conciliacao` |
| Inteligência (Pro) | Score, risco de caixa, inadimplência, decisão, autônomo, IA (All 4 Pay AI) | `core/quant`, `risk-engine`, `risk`, `decision`, `autonomous`, `executive` |
| Governança (Pro) | Aprovações com alçada, trilha auditável, RBAC, segurança | `core/institutional`, `core/seguranca`, `core/central` |
| Plataforma | Administração cross-tenant (`/admin`), planos, cobrança | `core/planos`, `core/billing` |

## 3. Fluxos principais

1. **Entrada** (caminho ouro, 7 passos): criar conta → onboarding → importar
   extrato → DRE → fluxo de caixa → perguntar à IA → exportar.
2. **Ingestão**: toda porta passa por `prepararIngestao()` (não grava; devolve
   plano); chave de idempotência SHA-256 + índice único parcial no banco;
   cascata de classificação: regra do dono → aprendizado → CNPJ/CNAE →
   palavra-chave → tipo.
3. **Título**: lançamento (3 modos: à vista, recorrente, parcelada; competência
   não se parcela) → previsto → baixa (idempotente) → conciliado. Estado único
   em `movements.situacao`; `status` é coluna gerada.
4. **Conciliação**: Open Finance × títulos previstos, match probabilístico por
   valor/data/documento/contraparte; estorno de conciliação existe como
   transição nomeada; cancelado é terminal.
5. **Resultado**: `movements` → classificação por linha do DRE → cascata
   (bruta → deduções → líquida → custos → EBITDA → líquido). DRE por
   competência, DFC por caixa. Exportação ao contador do MESMO motor.
6. **Governança**: aprovação por alçada com segregação de funções; fechamento
   de mês travado no banco (estorno rastreado); trilha de auditoria por gatilho.

## 4. Estado atual (o que o repo afirma)

Pontos fortes: camada canônica de indicadores ("uma verdade só"), guardas
executáveis (`npm test`: ~14 guardas de valor/consistência/paleta),
isolamento multi-tenant testado, procedência em cada número, estados
"indisponível" no lugar de zero enganoso.

Dívida declarada (os 4 itens de `erp-gestor`; **confirmar no banco**):

1. **Plano de contas × razão**: `movements` carrega categoria em texto
   (`category`) e em chave (`category_id`); a aplicação lê o texto. A
   proporção com `category_id` preenchido precisa de consulta ao banco.
2. **DRE por linha declarada**: `categories.dre_linha` existe e já é lida
   (`getLinhasDeCategoria`); porém, sem linha declarada, o motor classifica por
   palavra-chave (palpite silencioso). Pendente de produto: obrigar a declarar
   no onboarding ou avisar na tela.
3. **Guarda de schema**: `npm run esquema` (offline, arquivo × manifesto) +
   `esquema:sync` (refaz o retrato a partir do banco, exige `SUPABASE_DB_URL`).
   Só `esquema:sync` enxerga deriva contra o banco.
4. **Regime tributário**: `regimeDaEmpresa()` unifica as chaves; PR recente
   remove o Presumido cravado. Gravar o regime no servidor: confirmar.

Outras pendências registradas: confirmação de e-mail desligada (religar antes do
1º cliente pagante, exige SMTP próprio); crons de recorrência e financial-os
sem execução comprovada (prova de carga pendente; PR #153 adiciona `?dryRun=1`);
persistência migrando de `localStorage` para `org_state` por leva; cobrança sem
integração de pagamento (`active` sem data de fim); Open Finance só em sandbox;
dados de demonstração marcados por `is_sample`, mas contatos/conta da amostra
não são purgados.

## 5. Onde o produto é mais fraco (candidatos a benchmark)

Perguntas para os passos 2–4: como concorrentes (Omie, Conta Azul, Nibo, Bling,
Granatum, IULI) tratam (a) conciliação bancária automática em volume,
(b) emissão de NF-e/NFS-e/boleto/Pix (aqui: só captura e exportação, sem
emissão), (c) cobrança recorrente e régua de cobrança, (d) multi-conta com
Open Finance em produção, (e) app mobile, (f) integrações contábeis além do
TXT Domínio, (g) permissões por papel em todas as tabelas (hoje só 3
tabelas de maior risco têm política por papel).
