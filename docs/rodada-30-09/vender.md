# Rodada 30/09 — área VENDER (vendas, notas, impostos, assinaturas, POS)

Branch `r3/vender`. Dois commits: o primeiro (568fabc) consertou o caminho de
produção do POS, dos impostos e da NF da venda; o segundo traz as jornadas e2e
da área, mais três consertos achados dirigindo as telas.

## Decisões que merecem ir ao CLAUDE.md

- **"Não houve venda" é UMA lista** — `STATUS_SEM_FATURAMENTO` /
  `temFaturamento` em `core/vendas`. O provisionamento de impostos, o card
  "NFs a emitir"/"com erro" e o botão "Emitir NF" da linha perguntam a mesma
  coisa. Antes eram duas listas cravadas e o card de NF não usava nenhuma: uma
  venda com chargeback ficava "a emitir" com o valor cheio, enquanto o botão
  da própria linha recusava emitir — a tela pedia um trabalho que ela mesma
  não deixava fazer.
- **Configuração de impostos e links de pagamento passam por `store-org`.**
  As duas chaves (`a4p_impostos_config`, `a4p_links_pagamento`) já estavam
  classificadas como dado da empresa em `CHAVES_ORG`, mas `lib/vendas-store`
  gravava no `localStorage` cru. Efeito em produção: a alíquota e os
  fornecedores que o contador configurou valiam só naquela máquina, e a
  hidratação (o servidor vence) devolvia a cópia migrada uma vez, DESFAZENDO a
  edição na sessão seguinte. A chave da venda (`a4p_vendas_docs`) continua
  local de propósito: está congelada, a casa é `sales_docs`.
- **Cartão com alerta de limiar também não pinta o número.** O churn acima de
  20% saía em vermelho em `RecorrenciasView`; a guarda `cor:` só pega
  comparação com ZERO, então o limiar passou. Virou ponto de alerta ao lado do
  rótulo (o mesmo desenho do cockpit).
- **Número da NF na lista de vendas.** A busca da lista já casava pelo número
  da nota, mas a coluna só mostrava o status: a linha achada não mostrava o
  que fez ela ser achada.

## Do commit anterior (568fabc), para o registro

- POS: o insert mandava `status` para a coluna GERADA (o Postgres recusa toda
  venda) e a tela mostrava "Aprovado" do mesmo jeito. Agora vai por
  `criarTitulos` e a recusa aparece. A taxa MDR saía duas vezes do resultado;
  agora é bruto a receber + taxa a pagar na data de cada repasse.
- Impostos: "Criar contas a pagar" devolvia 0 em produção e a tela dizia "nada
  a criar". `gravarContasDeImpostos` grava pelos dois caminhos, idempotente por
  competência; a categoria deixou de travar o botão; o título leva o NOME.
- NF da venda: "Emitir NF" reaproveita o título da venda (a avulsa lançava a
  receita de novo) e devolve status e número aos dois painéis.
- Assinaturas: o gerenciador (criar/ativar/pausar/cancelar/MRR) estava órfão.

## Jornadas (scripts/e2e/)

| Jornada | Verificações | O que prova |
| --- | --- | --- |
| `vender-impostos.mjs` | 29 | regime ausente não inventa alíquota; base exclui chargeback; ISS editado muda o valor; UMA conta por imposto (2 cliques), valor e vencimento no mês seguinte, nome da categoria, visível em Títulos a pagar |
| `vender-nota.mjs` | 13 | "a emitir" sem o chargeback; emitir pela linha leva a venda a "emitidas" nos DOIS painéis, com número; a nota aparece no emissor; título a receber continua um e o DRE não se move |
| `vender-assinaturas.mjs` | 19 | rascunho fora do MRR; MRR normalizado (1.200/3 + 3.200/12 = 666,67); faturas em Títulos a receber; fluxo 180 dias sobe EXATAMENTE as faturas da janela; pausar/cancelar tiram as faturas e o fluxo volta; churn 50% com ponto, número na tinta |
| `vender-pos.mjs` | 11 | taxa da maquininha = taxa da tabela /pos/taxas; líquido = bruto − taxa; 3 parcelas a receber somando o bruto, 3 taxas a pagar somando a taxa uma vez, na data do repasse |
| `vender-links.mjs` | 8 | criar, QR desenhado, persistência pela chave da empresa, excluir; mede (informativo) o 404 da URL do link |
| `vender-receber.mjs` | 9 | painel de contas a receber = cards de Títulos a receber; faixas de atraso somam o vencido; exposição soma a carteira; venda nova entra em "a vencer" e na carteira pelo valor exato |

Provas de que reprovam com o defeito plantado:
- `vender-assinaturas` reprovou contra o build anterior (churn `rgb(179, 38, 30)`).
- `vender-nota` reprovou contra o build anterior ("o número da NF aparece na lista").
- As guardas `vender/store`, `vender/nota` (chargeback) e `vender/assinaturas`
  (churn, NFS-e) do `engine-audit` reprovaram plantando cada defeito de volta.

## Defeitos em arquivos RESERVADOS (não editados — correção proposta)

1. **`src/components/vendas-nf/OutrasViews.tsx:262-274` + `src/lib/cadastros.ts:326`
   — "Propor fornecedores" não escolhe fornecedor nenhum.** `createParty`
   devolve `void` nos dois caminhos; a tela espera `criado?.id` e nunca o
   recebe. Em demonstração nada é criado; em produção os três órgãos são
   criados mas não escolhidos, e a tela diz "Fornecedores propostos criados".
   Correção: `createParty` devolver a linha (`.insert(...).select("id").single()`,
   e um id sintético em demonstração), ou a tela reler `partes` depois de
   criar e casar pelo nome.
2. **`OutrasViews.tsx:444` — o modal de configuração apaga o que o atalho
   gravou.** `ConfigImpostosModal` copia a configuração para estado local ao
   abrir; "Propor fornecedores" grava FORA dessa cópia, e "Salvar" devolve a
   cópia velha. Correção: `onPropor` devolver os ids e o modal fazer
   `setC((s) => ({ ...s, fornecedores: novos }))`.
3. **`OutrasViews.tsx:352` — a tela ainda chama a porta síncrona.** Mostra
   "N contas a pagar criadas" antes da gravação terminar e não mostra
   `jaExistiam`. Correção: aguardar `gravarContasDeImpostos` e dizer quais
   impostos já tinham título na competência.
4. **`OutrasViews.tsx:341` — "2 vendas" ao lado de uma tabela com 1 linha.**
   O resumo conta `doPeriodo` (inclui chargeback/cancelada); a tabela e o
   faturamento contam só as tributáveis. Correção: contar `provisao.linhas`.
5. **`OutrasViews.tsx:686/759` + `src/core/vendas/index.ts:513` — o link de
   pagamento aponta para `/pagar/<id>`, rota que NÃO existe (404, medido pela
   jornada).** E não há PIX copia-e-cola no link: `lib/pix` (reservado) existe
   e só os boletos o usam. O link também mora em `org_state`, que um pagador
   anônimo não lê. Correção (exige decisão do dono): ou o link vira PIX
   copia-e-cola + QR do PIX (`gerarPixCopiaECola` com `dadosPixEmpresa`), que
   funciona sem página pública; ou nasce a rota pública `/pagar/[id]`
   (inventário de rotas, middleware público e uma leitura `SECURITY DEFINER`
   do link). Até lá o texto "deixa o cliente pagar" promete o que não entrega.
6. **`OutrasViews.tsx:540` — o card "Expirada" conta as PAUSADAS**, e a coluna
   "Valor recorrente" mostra o valor por ciclo sem dizer o ciclo. Correção:
   rótulo "Pausadas" e coluna "Valor por ciclo".
7. **`OutrasViews.tsx:741` — o valor do link é `type="number"`**, não a
   máscara de dinheiro do resto do produto. Correção: `CurrencyInput`.
8. **`src/lib/recorrencias.ts` (caminho de produção) — escritor que engole erro,
   três vezes:** `:154` o insert de `recurrences` ignora `error` e devolve um
   `rec-<agora>` local (a tela diz "criada como rascunho" sem nada gravado);
   `:193` e `:265` ignoram o erro do `update active`; `:196-209` sem conta não
   cria fatura nenhuma em silêncio, e qualquer erro ≠ 23505 no insert de
   fatura cai num `continue` — a tela diz "Ativada — próximas faturas entram
   no previsto" com zero faturas. Correção: lançar com a mensagem do banco em
   cada passo; sem conta, recusar a ativação dizendo por quê.
9. **`recorrencias.ts:259` — em demonstração, pausar/cancelar apaga TODAS as
   faturas, inclusive as já recebidas** (produção só tira as pendentes
   futuras). Desfaz caixa recebido. Correção: remover só `status === "pendente"`.
10. **`recorrencias.ts:174` — o horizonte da demonstração é "6 faturas",
    não 180 dias.** Uma assinatura anual projeta SEIS ANOS de receita a receber
    (6 × R$ 3.200, medido pela jornada); produção usa 180 dias
    (`datasFaturaCron`). Correção: usar o mesmo horizonte em dias.
11. **`src/components/vendas-nf/VendaForm.tsx:438` — os rótulos não estão
    ligados aos campos** (`<label>` sem `htmlFor`): "Status", "Operação",
    "Método de pagamento" são campos anônimos para leitor de tela. Correção:
    `useId` no `Campo` e repassar o id ao filho.

## O que NÃO foi provado

- Nenhum caminho de PRODUÇÃO foi exercitado contra um banco nesta rodada: as
  jornadas rodam no build de demonstração. A leitura do código live está nos
  itens acima e no commit anterior; a gravação real em `org_state` da
  configuração de impostos não foi medida (só que a chave passa pelo
  `store-org`, cuja sincronização já é guardada na matriz).
- O QR do link é desenhado, mas não foi DECODIFICADO nesta máquina (sem
  decodificador disponível); o gerador tem validação própria registrada no
  CLAUDE.md.
