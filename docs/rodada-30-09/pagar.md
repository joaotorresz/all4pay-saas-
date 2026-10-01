## ⚠️ FOLHA, COMPRAS E REEMBOLSOS — o que a rodada de 30/09 achou dirigindo como usuário

Jornadas: `scripts/e2e/folha-colaborador.mjs` (25 verificações),
`folha-rescisao.mjs` (14), `compras-aprovacao.mjs` (21),
`compras-recebidos.mjs` (17), `reembolsos-aprovacao.mjs` (14). Guardas no
`engine-audit`, blocos `FOLHA, COMPRAS E REEMBOLSOS` e `COMPRAS · CAIXA DE
ENTRADA FISCAL`.

### O escritor morto, mais três vezes

A mesma família de defeito ("gravação que em produção cai só no navegador")
estava viva em três lugares desta área:

- **Aprovar uma compra em produção não criava título nenhum** (`if (!isDemo)
  return` em `lib/compras-store`). A compra aparecia "Aprovada" e nunca chegava
  ao contas a pagar. Agora o título nasce no banco pelo escritor da compra, com
  `origem`, espécie e a chave `compra:<id>:<n>` — é a chave que permite
  reprovar sem deixar parcela órfã. ⚠️ **O dinheiro vem ANTES do status**: se o
  banco recusa, a compra continua como estava e a mensagem real sobe.
- **A compra morava no `localStorage` cru.** Quem lança e quem aprova são
  pessoas diferentes; num navegador só, o aprovador nunca via o pedido. Foi para
  `store-org`.
- **A importação em planilha de contas a pagar/receber** era `else if (isDemo)`:
  em produção não gravava nada e anunciava "N registros importados". Vai por
  `criarTitulos`.

### Folha

- ⚠️ **O 13º de quem entrou no meio do ano era INTEIRO.** Um CLT admitido em
  setembro agendava R$ 2.500 de 1ª parcela; o devido são 4/12 (R$ 833,34), e a
  2ª desconta o INSS do 13º proporcional. A descrição do título diz a proporção.
- ⚠️ **Os encargos do 13º (FGTS e patronal/INSS) não viravam título** — só o
  13º em si. O custo que o painel mostrava não chegava ao caixa.
- **Pensão alimentícia** descontada vira título próprio (salário + pensão = o
  líquido sem a pensão; o dinheiro não some). **PJ fora do Simples** gera o
  DARF das retenções (IRRF 1,5% + PCC 4,65%); antes a nota entrava cheia e a
  retenção sumia do caixa. Sem declaração, a memória NÃO afirma que o prestador
  é do Simples.
- ⚠️ **A competência do título da folha é o MÊS DE TRABALHO, não o
  vencimento** (`linhaDoTituloDaFolha` em `lib/folha`). O salário de setembro
  vence em outubro; mapeado pelo vencimento, setembro ficava sem folha no DRE e
  outubro com duas. A tela da folha já usa o mapeamento único; o formulário de
  conta a pagar no modo Colaborador ainda NÃO (ver arquivos reservados).
- ⚠️ **Rescisão SUBSTITUI o agendado** — retira o salário do mês do
  desligamento em diante e o 13º do ano (vira proporcional na rescisão), e
  mantém FGTS/DARF de competências já trabalhadas. Pago, de outro colaborador e
  digitado à mão nunca saem. Os novos títulos entram ANTES de os velhos saírem:
  na ordem inversa, uma recusa do banco deixaria o caixa sem nenhuma das duas
  obrigações. Férias com adiantamento do 13º substituem a 1ª parcela (e só ela).
- O aviso de FGTS da tela comparava com `custo − bruto` (que inclui provisões) e
  acusava o recolhimento correto; agora compara com o projetado de FGTS +
  patronal.
- O colaborador só é gravado DEPOIS dos títulos (já era assim no formulário;
  conferido).

### Compras e caixa de entrada fiscal

- Número = maior + 1 (contar repetiria o número de uma compra excluída).
- Parcela paga RECUSA cancelar/excluir a compra: apagaria dinheiro que já saiu.
- Colar de novo o mesmo boleto (código de barras) ou a mesma nota (chave de
  acesso) não substitui o registro existente — a duplicata é conferida ANTES de
  gravar. Chave com dígito verificador errado não entra (antes era gravada com
  status "erro"); valor digitado que não é número não vira R$ 0,00 calado.

### Reembolsos

- O `insert` dos títulos em produção não olhava `error`: recusado, o reembolso
  virava "A pagar" sem título nenhum na Central. Agora a falha fica no
  reembolso (continua "Aprovado"), volta para a tela, e a nova tentativa é
  idempotente pela chave `reembolso:<id>:<item>`.
- Sem conta bancária a recusa é DITA. A solicitação cuja aprovação não foi
  gravada no banco é recusada (nasceria presa em "Em aprovação" para sempre).
- O colaborador é casado por `eq`, não `ilike` (o nome é texto livre; `_` e `%`
  viravam curinga).

## ⚠️ REVISÃO ADVERSARIAL (r3/pagar-rev) — o que a revisão achou

Jornadas novas: `scripts/e2e/folha-rescisao-dezembro.mjs` (15 verificações) e
`scripts/e2e/compras-excluir.mjs` (10). Guardas no `engine-audit`, bloco
`PAGAR · REVISÃO`, cada uma provada plantando o defeito.

- ⚠️ **A rescisão de dezembro pagava a 1ª parcela do 13º DUAS vezes.** Quem
  recebeu a parcela de 30/11 (ou o adiantamento nas férias) e era desligado em
  dezembro levava o 13º proporcional INTEIRO na rescisão. `EntradaRescisao`
  ganhou `decimoAdiantado`, descontado do 13º (sem tributo próprio: INSS, IRRF
  e patronal continuam sobre o 13º inteiro; o FGTS da rescisão sai só sobre o
  que ela paga). O modal já abre com o valor lido das 1ªs parcelas BAIXADAS
  (`decimoJaPagoNoAno`) e o campo é editável. Medido: R$ 22.068,80 → R$ 19.068,80
  para um CLT de R$ 6.000.
- ⚠️ **O adiantamento do 13º nas férias virou título PRÓPRIO**, com o nome da
  1ª parcela. Somado ao título das férias ele era invisível para a rescisão. O
  total agendado não muda.
- ⚠️ **O FGTS da 1ª parcela acompanha a 1ª parcela.** A rescisão retirava o
  "FGTS do 13º · 1ª parcela" mesmo quando a parcela já tinha sido paga — o FGTS
  devido pelo que já saiu sumia do caixa. Agora ele só sai junto com a parcela
  prevista.
- ⚠️ **"Desfazer" sumia no mesmo instante da exclusão.** O aviso era filho do
  botão "Excluir", que mora na LINHA excluída: a linha saía da lista, o botão
  desmontava, e a promessa "você terá 8 segundos para desfazer" entregava zero
  (compras, folha, e todo `AcaoDestrutiva` dentro de lista). O aviso mora agora
  numa raiz própria no `<body>`.
- **"Confirmado" não é pago.** Em produção a compra recusava cancelar dizendo
  "parcela já paga" sobre título apenas aprovado na Central
  (`situacaoPaga`: só baixado e conciliado).
- **O insert dos títulos da compra em produção não tinha guarda** contra engolir
  a recusa (plantar a remoção do `if (error) throw error` passava verde).

### Achados que ficaram como registro

- ⚠️ **`ImportacaoView` não é montado em lugar nenhum.** A rota
  `/dashboard/financial/import` é alias para `/upload` (A4P-040). O conserto do
  "escritor morto" da rodada e a guarda `importacao:` protegem código
  inalcançável. O componente ainda carrega um parser de valor que lê "1.500"
  como R$ 1,50 (o do `/upload` já trata). Decisão pendente: apagar o
  componente e a guarda juntos.
- **O número da compra é reutilizado depois de excluir a ÚLTIMA.** "Máximo + 1"
  sobre uma lista da qual a compra excluída sai fisicamente repete o número
  dela. Resolver exige a exclusão lógica da compra (ou um contador), não um
  ajuste na conta.
- **Reembolso: a competência é o dia da despesa.** Com o mês dela fechado, o
  banco recusa o título e o reembolso aprovado fica preso em "Aprovado" (a
  mensagem do banco aparece). É a regra contábil certa; falta a saída
  (lançar no mês aberto com motivo) — decisão do dono.
- **`npm run coerencia` reprova no conjunto [demonstração] em 01/10/2026** —
  "saldo × liquidados" de outubro e dos últimos 90 dias diferem em
  R$ 205.455,00. Reprova IGUAL no commit base `3871008` (medido num worktree
  limpo), então não nasce desta rodada: é dependente da data (primeiro dia do
  mês) e do seed. Como o `npm test` encadeia com `&&`, as guardas DEPOIS dela
  foram rodadas uma a uma, todas verdes.
