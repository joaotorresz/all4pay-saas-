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

## Revisão adversarial (branch `r3/vender-rev`)

### Defeitos achados nas correções do caçador — e consertados

1. **"Emitir NF" da venda DOBRAVA a receita em produção** — o defeito que o
   commit 568fabc dizia ter fechado, fechado só na demonstração. `criarNfse`
   em produção devolvia a nota remontada da linha gravada (`fromRow`), que não
   tem `movimentoReceita`; a transmissão via a nota "sem receita" e lançava
   OUTRA. Agora o título reaproveitado vai para `nfse.movement_id` desde o
   rascunho e a nota devolvida o carrega.
2. **Cancelar a nota de uma venda apagava o recebível DA VENDA em produção**
   (depois de recarregar a tela). O vínculo "receita reaproveitada" só vivia na
   memória da sessão; recarregada, a nota parecia ter receita própria e
   `cancelarNfse` mandava o título da venda para a lixeira. A pergunta virou
   regra pura (`receitaReaproveitada` em `core/vendas/nota`) e, em produção,
   o cancelamento pergunta ao banco se o título tem `sale_doc_id`.
3. **A lista de vendas seguia dizendo "Emitida · nº X" de uma nota
   cancelada.** `refletirCancelamentoNaVenda` (lib/vendas-nf) devolve o status
   à venda; o emissor diz que o título da venda fica (dizia "lançamentos
   removidos"), e cancelar pede confirmação (era um "x" sem pergunta).
4. **Gravar a nota reescrevia a venda inteira** (`salvarVendaDoc`: itens para
   a lixeira e de volta, e o título previsto). Num mês fechado a reescrita do
   título é recusada DEPOIS de a nota estar autorizada: a venda ficava "a
   emitir" e o segundo clique emitia outra nota. Agora `gravarNotaDaVendaDoc`
   grava só `status_nf`/`numero_nf`.
5. **Impostos: dois cliques rápidos em produção dobravam o imposto.** A tela
   chama a porta síncrona sem travar o botão; as duas consultas viam "nenhum
   título" ao mesmo tempo. As gravações entram em fila.
6. **Impostos na demonstração SUBSTITUÍAM o título** — uma guia já paga
   voltava a pendente, e o segundo clique dizia "5 contas a pagar criadas" de
   novo. A demonstração passou a usar a regra de produção (`contasSemTitulo`):
   o que tem título vivo na competência não ganha outro nem é reescrito.
7. **Excluir uma venda com nota emitida** apagava a venda e o recebível com a
   nota valendo; e a demonstração apagava até recebimento BAIXADO (só produção
   recusava). Uma regra para os dois caminhos: `bloqueioDeExclusao`.
8. **`hydrateNfse` ignorava o `error` do banco** (o cliente não lança): uma
   recusa virava "nenhuma nota" sem aviso.

### Guardas do caçador que NÃO reprovavam o defeito plantado (consertadas)

- `vender/pos: cada taxa vence com o repasse da sua parcela` — com todas as
  taxas datadas de HOJE passava (a parcela 1 também vence hoje). Agora é
  parcela a parcela.
- `vender/impostos: produção é idempotente` — só conferia que as palavras
  existiam; `const novas = contas` passava. Agora é função pura conferida por
  valor + os dois caminhos obrigados a usá-la + a fila.
- `vender/assinaturas: churn sem vermelho` — só reconhecia a forma exata de
  antes; `style={{ color: alerta ? negative : … }}` passava (a jornada e2e
  pegava). Agora o cartão inteiro não pode decidir cor do número.
- A correção do recebível baixado em `salvarVenda` (demonstração) não tinha
  guarda nenhuma — ganhou.
- ⚠️ Medição contaminada, registrada: o primeiro build desta revisão rodou
  AO MESMO TEMPO que o script que planta defeitos, e embarcou o churn vermelho
  plantado. A jornada `vender-assinaturas` reprovou — o que serviu de prova de
  que ela pega o defeito —, e o build foi refeito.

### Fluxos novos dirigidos

- `vender-nota-cancelar.mjs` (14 verificações): emitir → excluir recusado →
  cancelar a nota sem perder o título → status "Cancelada" nos dois painéis →
  exclusão passa e o título sai junto. Reprovou com os dois defeitos plantados
  (exclusão sem regra e cancelamento sem refletir).
- `vender-impostos.mjs` ganhou a verificação do segundo clique.

### Não corrigido (decisão de produto)

- **A venda da maquininha (POS) não é documento de venda.** Ela grava títulos
  (bruto a receber + taxa a pagar), mas nenhuma linha em `sales_docs`: entra
  no DRE e no contas a receber e NÃO entra na lista de vendas, no painel de NF
  nem na base do provisionamento de impostos — duas faturas com o mesmo
  rótulo, a regra "a venda tem uma morada só". Correção proposta: o POS gravar
  pelo escritor da venda (`salvarVendaDoc`) com status `completa`, e o título
  da venda passar a aceitar parcelas + taxa (hoje ele cria UM título). Muda o
  formato do escritor único; fica para decisão.

## O que NÃO foi provado

- Revisão: os consertos 1, 2, 4 e 5 acima são de caminho de PRODUÇÃO e foram
  provados por leitura de código + guarda textual/por valor no `engine-audit`,
  NÃO contra um banco. A demonstração não os exercita (lá a nota guarda o
  vínculo no navegador).
- Nenhum caminho de PRODUÇÃO foi exercitado contra um banco nesta rodada: as
  jornadas rodam no build de demonstração. A leitura do código live está nos
  itens acima e no commit anterior; a gravação real em `org_state` da
  configuração de impostos não foi medida (só que a chave passa pelo
  `store-org`, cuja sincronização já é guardada na matriz).
- O QR do link é desenhado, mas não foi DECODIFICADO nesta máquina (sem
  decodificador disponível); o gerador tem validação própria registrada no
  CLAUDE.md.

## Rodada 3 (reservados) — branch `r4/vender`

Os itens da seção "Defeitos em arquivos RESERVADOS", agora editados. Cada um
tem guarda no `engine-audit` (bloco VENDER, "Rodada 3"), e as quinze foram
provadas plantando o defeito de volta: cada plantio reprovou a asserção que o
nomeia.

**O que mudou**

1. **Propor fornecedores escolhe de verdade.** `createParty` já devolvia o id
   (`{ id }` na demonstração, `.select("id").single()` no banco); a tela o lia
   por um `as { id?: string }` que escondia isso. Agora usa `criado.id`, a
   falha de criação vira aviso com a mensagem do banco, e o aviso diz quantos
   foram criados e quantos já existiam.
2. **O modal não apaga o que o atalho gravou.** `onPropor` recebe os
   fornecedores da cópia do modal e DEVOLVE a escolha; o modal faz
   `setC({ ...s, fornecedores: novos })`. "Salvar" deixou de devolver a cópia
   velha.
3. **Criar contas a pagar** já aguardava a porta assíncrona e mostrava
   `jaExistiam` (o reservado foi consertado na revisão); ganhou guarda.
4. **O resumo conta as vendas da tabela** (`provisao.linhas`), com o rótulo
   "venda tributável" — o chargeback não entra mais na contagem.
5. **Link de pagamento sem link morto.** `urlDoLink` (que montava
   `/pagar/<id>`, 404) saiu; `pixDoLink` (core/vendas) gera o PIX
   copia-e-cola (BR Code estático) com a chave = CNPJ do cadastro
   (`dadosPixEmpresa`), o valor do link e o id como txid. O QR carrega o PIX.
   Sem CNPJ a tela diz que não há chave e não desenha QR; link inativo não
   oferece o código e a tela diz que um PIX já enviado continua pagável (PIX
   estático não expira). Guarda de teto ZERO: nenhum `/pagar/` em `src/` e
   nenhuma pasta `src/app/pagar`.
6. **Assinaturas:** o card "Expirada" (que contava as pausadas) virou
   **Pausadas**; a coluna e a planilha dizem **Valor por ciclo**.
7. **Valor do link** é `CurrencyInput` (a máscara do produto), não
   `type="number"`.
8. **`lib/recorrencias` em produção não engole erro:** criar lança a recusa
   do banco (não devolve mais `rec-<agora>` inventado); ativar sem conta
   bancária é RECUSADO antes de marcar a assinatura ativa; a recusa do
   `update active` e de cada fatura (≠ duplicata 23505) sobe — e a marca de
   ativa é desfeita se uma fatura for recusada; encerrar lança a recusa do
   update e da leitura, e não cala as faturas que a exclusão lógica não tirou.
   A tela passou a dizer QUANTAS faturas a ativação lançou.
9. **Demonstração: pausar/cancelar tira só as pendentes de hoje em diante**
   (`faturasARemoverAoEncerrar`, a mesma regra da consulta de produção). A
   recebida e a vencida em aberto ficam.
10. **Mesmo horizonte em dias** (`HORIZONTE_ATIVACAO_DIAS = 180`, em
    `lib/recorrencias-sched`) na ativação de demonstração, na de produção, no
    roll-forward e na prévia da tela, todos por `datasFaturaCron`. A anual
    lança no máximo UMA fatura (eram seis anos). A prévia deixou de vencer
    "5 dias depois", data que nenhum caminho criava. O roll-forward deduplica
    contra TODAS as faturas da assinatura (antes só as pendentes: um mês
    recebido ganhava fatura nova).
11. **Rótulo ligado ao campo:** o `Campo` da Nova venda (e o de
    OutrasViews) gera id por `useId`, põe `htmlFor` e repassa o id ao filho.

12. **O segundo clique em "Criar contas a pagar" dizia "0 contas a pagar
    criadas · 5 já existiam"** (achado rodando a jornada nesta rodada); agora
    diz "Nada a criar: as 5 contas desta competência já existiam".

Jornadas atualizadas: `vender-impostos` (o atalho tem de escolher os três
órgãos; o resumo diz "1 venda tributável"), `vender-links` (PIX ou o aviso de
CNPJ; nenhuma URL `/pagar/`; sem `type=number`) e `vender-assinaturas`
(nenhuma fatura além de 180 dias; a anual lança no máximo uma).

**O que ficou (decisão do dono)**

- **Página pública do link de pagamento × PIX.** Hoje o link entrega o PIX
  estático da empresa. Página pública `/pagar/[id]` (rota no inventário,
  middleware público, leitura `SECURITY DEFINER` do link, que mora em
  `org_state`) ou PIX dinâmico com vencimento via PSP são decisões de produto.
  ⚠️ A chave usada é o CNPJ — a tela pede para conferir no banco que ele está
  cadastrado como chave PIX; não há campo de chave PIX própria da empresa.
  "Aberturas" do link continua sem contador (não há página para contar).
- **A venda do POS continua fora de `sales_docs`.** Avaliado e NÃO feito nesta
  rodada: `salvarVendaDoc` cria UM título (o total da venda) e a regra de
  edição/exclusão (`bloqueioDeExclusao`, reescrever só o previsto) foi escrita
  para esse um título; a venda da maquininha gera N parcelas de recebível e a
  taxa como conta a pagar, cada uma com seu vencimento. Gravar o POS pela
  morada única exige o escritor aceitar parcelas + taxa ligadas por
  `sale_doc_id` — mudança de formato do escritor e da migration de vínculo.
  **Impacto enquanto não for feito:** a venda do POS entra no DRE, no fluxo e
  no contas a receber, mas NÃO na lista de vendas, no painel de NF nem na base
  do provisionamento de impostos — o faturamento da lista e o do DRE divergem
  pelo total vendido na maquininha, com o mesmo rótulo.
- **Horizonte do cron × ativação.** O cron (`/api/recorrencias/run`) usa 90
  dias e a ativação 180. As datas e a chave são as mesmas (sem duplicata),
  mas o cron não completa o que a ativação lançou além dos 90 dias até o dia
  chegar. Unificar os dois é decisão de quanto previsto se quer no fluxo.
- **Pausada × cancelada em produção** seguem indistinguíveis no banco
  (`active` é um booleano); recarregada a tela, uma cancelada aparece como
  pausada. Limitação de schema já registrada.

**Medido:** `npm run e2e -- vender` contra o build de demonstração desta
branch — 7 de 7 jornadas verdes. ⚠️ O usuário da jornada não tem CNPJ, então
`vender-links` exercitou o ramo "sem chave"; o PIX com valor foi provado só
por valor no `engine-audit`.

**O que NÃO foi provado:** os caminhos de produção de `lib/recorrencias`
foram provados por leitura + guarda textual, não contra um banco. O PIX foi
conferido por CRC independente na guarda; o QR do PIX não foi decodificado
nesta máquina.
