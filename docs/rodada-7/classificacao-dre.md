# Rodada 7 — Classificação do DRE (01/10/2026)

Escolha do dono: "Classificação do DRE". Tudo medido em produção antes, só leitura.

## O que a medição achou

| Medida | Valor |
| --- | --- |
| Lançamentos reais com a categoria só no TEXTO (`category_id` nulo) | 1.685 |
| … com o nome igual a UMA categoria do cadastro | 1.418 |
| … sem categoria nenhuma com aquele nome (20 nomes) | 267 |
| Categorias sem linha do DRE declarada | 269 de 296 |
| Lançamentos com categoria do Open Finance em inglês | 31 (2 empresas) |
| Restituição de imposto dentro da Receita Bruta (palpite) | R$ 655,30 |

## 1. A chave única de categoria (`core/categorias/chave`)

A declaração do palpite casava o nome SEM acento; o DRE procurava a linha COM
acento. Lançamento "Manutencao" + categoria "Manutenção": a pessoa declarava, a
declaração ia para o cadastro acentuado e o DRE não a achava — o botão dizia
"declarado" e nada mudava. Zero casos hoje (latente). `chaveCategoria` é a
única normalização: DRE, banco, plano local e declaração. Guarda com teto ZERO
de montador à mão; provada plantando a chave antiga.

## 2. Open Finance em português (`supabase/functions/_shared/categorias-open-finance.ts`)

O Pluggy devolve categoria em inglês e as Edge Functions gravavam cru. Uma
tabela só: as Edge Functions traduzem ao GRAVAR, o mapeador único
(`lib/risco-linhas`) traduz ao LER (o legado já gravado chega em português).

⚠️ Traduzir não é classificar. "Credit card payment" e "Transfer - Bank Slip"
são ambíguos (fatura pode ser a única despesa registrada; boleto pode ser de
fornecedor) e ganham tradução LITERAL — continuam no palpite, para a empresa
declarar. Provado: os 9 nomes vistos em produção mudam de nome e NÃO de linha.
Correções deliberadas (o palpite não lia inglês): Taxes → dedução, Bank fees e
Interests charged → financeiro, Same person transfer → fora do DRE.

⚠️ **As Edge Functions precisam ser republicadas pelo dono** (`pluggy-sync-item`
e `pluggy-webhook`) — já pendente desde a Rodada 5.

## 3. Restituição de imposto é estorno, não faturamento

O palpite mandava toda entrada não financeira para a Receita Bruta; a regra de
estorno só valia para quem declarasse. Agora a restituição de imposto sobre a
venda reduz a dedução sem declaração, e sai da base tributável. Restituição de
IRPJ/CSLL e de outra coisa (caução) não entram na regra. Efeito medido: R$ 655,30
saem da Receita Bruta de uma organização e reduzem a dedução pelo mesmo valor:
o faturamento deixa de ser inflado, e o resultado líquido não se move (a
entrada só mudou de linha, de + na receita para − na dedução).

## 4. O lançamento aponta para a categoria (migration `20261002130000`)

`vincular_categorias_por_nome` liga o texto à categoria de mesmo nome e pula:
mês fechado, grupo, nome ambíguo, amostra, inativa, sem cadastro, chave já
preenchida. Medido: os 1.418 elegíveis não caem em nenhum corte. O DRE não muda
(a linha declarada já casava pelo nome). Guarda de banco
`scripts/categoria-vinculo.sql` (9 casos, no CI), provada plantando três
funções frouxas: sem o corte do mês fechado, sem o do grupo, sem o da
ambiguidade — as três reprovam nomeando a causa.

## O que NÃO foi feito, e por quê

- **Declarar em massa as categorias sem linha (269).** Uma migration que grava a
  escolha do palpite como "declarada" apagaria o aviso sem ninguém ter
  conferido — e é justamente essa indistinguibilidade que o aviso existe para
  evitar. A declaração em um clique por empresa (Rodada 5, "Revisar e
  declarar") continua sendo o caminho, e agora funciona também com acento
  divergente.
- **Linha "de fábrica" para as categorias do seed.** "Impostos e taxas" e
  "Fornecedores" são ambíguas (imposto sobre venda × lucro; custo × despesa) —
  decidir por elas seria um palpite com outro nome.
- **Os 267 lançamentos sem cadastro.** Criar categoria é decisão da empresa; o
  "Revisar e declarar" já cria a que falta.
