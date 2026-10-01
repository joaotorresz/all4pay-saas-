# CAMP-B — caixa de entrada de contas, edição em massa, extrato do contato, busca global e eliminações no consolidado

Pacote da rodada de 30/09/2026 (branch `r2/campb`). Cinco funções inspiradas no
Campfire, cada uma com núcleo puro em `src/core`, guarda no `engine-audit`
(bloco `/* ── CAMP-B ── */`, provada plantando o defeito) e jornada
`scripts/e2e/campfire-b.mjs` dirigindo as cinco como um usuário.

Uma migration: `20260930210000_trava_periodo_olha_a_origem.sql` (justificativa
abaixo, item 2). Nenhuma função SECURITY DEFINER nova; nenhuma concessão muda.

---

## O que entra no CLAUDE.md (no estilo dele)

### ⚠️ CAIXA DE ENTRADA DE CONTAS A PAGAR (`core/caixa-entrada`, aba de `/contas-a-pagar/titulos`)

Três portas trazem cobrança para dentro da empresa — o documento lido por OCR
(wizard de upload, botão novo "Deixar na caixa de entrada"), o boleto do DDA e
a nota da SEFAZ — e cada uma tinha a sua lista, nenhuma dizendo QUANTOS papéis
esperavam decisão. Agora há uma fila só, como **aba** de "Títulos a pagar"
(`?aba=caixa-de-entrada`), com o contador no rótulo da aba. Nenhum item novo de
menu: a pergunta "o que chegou e ainda não virou conta" é a porta de entrada da
lista de contas.

- ⚠️ **O motor NÃO guarda documento.** Boletos e notas continuam morando nas
  chaves deles (`compras-store`); `a4p_caixa_entrada` (store-org, em
  `CHAVES_ORG` com rótulo) guarda só o OCR deixado para depois e a DECISÃO
  sobre cada documento. Uma segunda cópia dos boletos seria a sétima "duas
  fontes para um fato".
- ⚠️ **A chave é a identidade do documento** — código de barras do boleto,
  chave de acesso da nota —, não o id da linha. Sem isso o mesmo boleto
  capturado de novo voltava à fila como novo e a decisão já tomada era ignorada.
- ⚠️ **"Criar conta a pagar" não grava nada na caixa:** abre o MESMO formulário
  (`TituloForm`) já preenchido (`?entrada=…`), e o documento só sai da fila
  DEPOIS de o formulário salvar. Tirá-lo antes faria um "cancelar" apagar o
  papel da fila sem virar conta nenhuma.
- ⚠️ **Descartar exige motivo (mínimo de 10 caracteres)** — recusado, nunca
  completado por conta própria. O descartado não some: fica no filtro
  "Descartados" com quem, quando e por quê, mesmo depois que a fonte deixa de
  trazê-lo (a decisão carrega o retrato do documento).
- ⚠️ **Nota sem vencimento abre o formulário SEM vencimento**, nunca com a data
  de emissão — senão toda nota nasceria vencida no dia em que chegou.
- ⚠️ **ACHADO E MORTO: `lancarBoleto` era um escritor morto.** Criava o título
  só dentro de `if (isDemo)`; em produção marcava o boleto como lançado e
  nenhuma conta nascia — com a tela anunciando "lançado em contas a pagar". E
  escolhia sozinho a PRIMEIRA conta e a PRIMEIRA categoria. Removido: o botão
  "Lançar" da tela de boletos agora abre o formulário preenchido, o mesmo da
  caixa. Guarda impede a volta.
- ⚠️ **`compras-store` lia e gravava direto no `localStorage`** as três chaves
  que já estavam declaradas como dado de NEGÓCIO em `CHAVES_ORG` — boleto e nota
  ficavam no navegador de quem digitou. Passaram por `store-org`.

### ⚠️ EDIÇÃO EM MASSA DE TÍTULOS (`core/movimentacoes/edicao-massa`, botão na `TitulosView`)

Categoria, centro de custo, projeto ou vencimento de vários títulos de uma vez,
nos dois lados (é a mesma `TitulosView`).

- ⚠️ **O PLANO VEM ANTES DA GRAVAÇÃO.** `planejarEdicao` não grava: devolve
  quantos mudam, quanto somam, o de→para por grupo e — com o mesmo peso — quais
  ficaram de fora e por quê. A tela mostra o plano e só então grava.
- As recusas, cada uma com o defeito que evita: **mês fechado** (nem o título
  que está nele, nem o vencimento que o levaria para ele — a correção é
  estorno); **vencimento só no previsto** (o baixado já moveu dinheiro numa data
  real; categoria/centro/projeto do baixado PODEM mudar, são classificação);
  **cancelado/estornado** (terminais — lidos nas DUAS colunas, `status` e
  `situacao`, senão o estornado passa como pago); **já igual** (não vira evento:
  evento que diz que nada mudou esconde o que mudou).
- ⚠️ **Em produção é UMA atualização por título**: o gatilho `auditar_escrita`
  grava um evento por linha com antes/depois (medido no banco local: um
  `movements.alterar` por UPDATE, com o campo trocado), e a recusa do banco de
  um título não derruba os outros — volta nomeada, com a mensagem real.
  Em demonstração o evento é escrito no registro administrativo e entra na
  mesma trilha que a tela de Logs lê ("Categoria: de X para Y").

### ⚠️ A TRAVA DO MÊS FECHADO OLHAVA SÓ PARA ONDE O TÍTULO IA (migration 20260930210000)

O gatilho `movements_periodo_fechado` (0030) decidia pela data NOVA. **MEDIDO
em transação desfeita no banco local:** com agosto travado, `update movements
set due_date = '2026-09-05'` num título de 20/08 **passava** — o título saía do
balancete de agosto já entregue. A edição em massa recusa isso na tela, mas a
tela não é a fechadura (ONDA 13): importação, PostgREST e `psql` não passam por
ela. A migration confere também a data de ORIGEM no UPDATE. Prova: mês aberto
continua editável; sair do mês fechado é recusado com a mensagem
"O mês 08/2026 está fechado…" (o teste negativo confere o texto); entrar no mês
fechado continua recusado; `estornar_lancamento` continua passando e carimba o
original; reaplicar é idempotente. Nada mais muda: pagar/editar título de mês
fechado JÁ era recusado (a data nova é igual à antiga).

### ⚠️ EXTRATO DO CLIENTE/FORNECEDOR EM PDF (`core/extrato-contato`, seção da ficha)

- ⚠️ **Fecha por construção, conferido por fora:** saldo anterior + lançado −
  quitado == soma dos títulos em aberto calculada de forma independente. Um
  extrato que não fecha é o pior documento que se manda a um cliente.
- ⚠️ **"Quitado" pega o título pago ANTES do período** (antecipado) — senão ele
  ficaria em aberto no extrato de quem já pagou.
- ⚠️ **O período padrão vai até o fim do MÊS SEGUINTE, não até hoje.** Com "até
  hoje" a fatura que vence semana que vem ficava fora do documento inteiro e o
  extrato dizia "nada em aberto" a quem tem conta emitida (achado dirigindo a
  jornada). O vencido continua medido até hoje.
- ⚠️ **Um lado por extrato**: somar o que o contato nos deve com o que devemos a
  ele dá um saldo que não é cobrável nem pagável.
- **PDF pela impressão do navegador em MODO DOCUMENTO** (`imprimirDocumento`,
  `html[data-imprimindo-documento]`): só o documento vai ao papel — o extrato é
  montado por portal no `<body>`, fora da gaveta. Identificação da empresa
  (razão social, CNPJ) no topo; sem cadastro, o documento DIZ que falta.
- A seção aparece mesmo para contato sem lançamento: "nenhum título no
  período" também é um extrato.

### ⚠️ BUSCA GLOBAL DE TÍTULOS E LANÇAMENTOS (`core/busca`, ⌘K)

- ⚠️ **Valor se casa em CENTAVOS, na grafia brasileira:** "1.234,56",
  "1234,56", "R$ 1.234,56" e "1.234" (ponto de milhar). Comparar texto acharia
  R$ 11.234,00 ao procurar R$ 1.234,00 — por isso a lista de títulos também
  deixou de casar o valor como texto contido.
- ⚠️ **Teto DECLARADO (8)**: o grupo diz "8 de 23 achados (refine a busca)".
  Cortar calado faria a pessoa concluir que o nono título não existe.
- Só com a paleta aberta (mesma `risco-input` em cache) e com debounce de
  250 ms. O resultado abre `/contas-a-pagar|receber/titulos?busca=<id>`, e a
  lista, com `busca` na URL, abre no período INTEIRO (o título de março
  procurado em setembro não pode cair fora do mês corrente).

### ⚠️ ELIMINAÇÕES INTERCOMPANY NO CONSOLIDADO (`core/relatorios/posicao-consolidada`)

`eliminacoesIntercompany` (ONDA 13) existia e só rodava dentro da DRE
multiempresas; a tela de Consolidado dizia "sem eliminações" e a DRE
multiempresas dizia "Sem eliminações intercompany (v1)" **enquanto eliminava**.
Agora as duas mostram a lista (quem, quanto, competência) e o critério
conservador; o Consolidado mostra soma das partes, (−) eliminações e o
consolidado.

- ⚠️ **O resultado NÃO muda — é a prova de que a eliminação é justa:** cada par
  sai da receita de uma e da despesa da outra. Uma eliminação que movesse o
  resultado estaria apagando um lado só.
- ⚠️ **O saldo não se elimina:** é posição de caixa; o dinheiro que andou entre
  as empresas já saiu de uma conta e entrou na outra.
- ⚠️ **Só elimina par cuja competência está no período** — a mesma janela da
  soma. Eliminar par de outro mês tiraria da receita o que ela nunca somou.
- Sem a fonte por organização (0020 pendente), a tela cai nos totais da RPC e
  DIZ que não eliminou.

### Defeito achado dirigindo a jornada

**Clicar no nome da contraparte na lista de títulos abria o modal de baixa por
cima da ficha** — o clique subia para a linha (`onClick={() => setBaixa(m)}`).
A pessoa pedia o contato e recebia "Confirmar pagamento". `stopPropagation` no
botão; a jornada confere que só a ficha abre.

---

## Provas

- `engine-audit` (bloco CAMP-B, 43 asserções) — defeitos plantados e vistos
  reprovar: edição sem trava de mês fechado (3 reprovações); vencimento do
  baixado mudando (2); descarte sem motivo aceito (2); valor lido pela regra
  americana (4); lista casando valor como texto contido (1); extrato ignorando o
  pago antecipado (1); eliminação fora do período (2); eliminação de um lado só
  (1); boleto pago voltando à fila (4); gatilho conferindo a data nova em vez da
  de origem (1).
- Banco local (`pkg_campb`, cópia de `base_quattro`): o UPDATE da edição em
  massa grava e gera UM evento `movements.alterar` por título; mês fechado
  recusa com a mensagem certa; o buraco medido ANTES da migration e fechado
  DEPOIS; estorno continua passando.
- `scripts/e2e/campfire-b.mjs` — as cinco funções dirigidas no build de
  demonstração.

## Fora do escopo / pendências

- A edição em massa de CENTRO e CATEGORIA em produção exige que o valor
  escolhido seja um UUID do banco (as listas vêm de `categories`/`cost_centers`,
  então é); projeto do cadastro local (id não-UUID) vai pelo vínculo local e
  grava `project_id` nulo — a mesma dupla morada já registrada do projeto.
- O formulário preenchido pela caixa casa o fornecedor por CNPJ e depois por
  nome; sem casamento, a faixa diz o nome que veio no documento e pede para
  escolher. Cadastrar o fornecedor a partir da caixa não foi feito.
- Entrada de contas por e-mail continua para a próxima rodada (CLAUDE.md).

---

## Revisão adversarial (01/10/2026, branch `r2/campb-rev`)

Seis defeitos achados e corrigidos; cada correção com guarda vista REPROVAR
com o defeito replantado.

### ⚠️ O CONSOLIDADO PERDIA O TÍTULO QUE VENCE NO PERÍODO E É PAGO DEPOIS (migration 20260930214500)

A tela de Consolidado passou a somar por VENCIMENTO sobre `org_movements` —
e `org_movements` recorta por `coalesce(paid_date, due_date)`. **Medido no banco
local:** o título que vence em 10/09 e foi pago em 02/10 não vinha no período
de setembro; o consolidado saía menor que a soma das empresas, com cara de
completo. O DRE multiempresas (competência) tinha o mesmo buraco desde a 0020.
E as duas RPCs são SECURITY DEFINER: a política restritiva da LIXEIRA não as
alcança, e o filtro de AMOSTRA também não — venda excluída e "Carregar amostra"
somavam no consolidado.

- `org_movements` devolve vencimento **OU** pagamento no período (o
  superconjunto que serve aos dois regimes) e as duas funções deixam de fora
  `excluido_em` e `is_sample`. Mesmo escopo, mesmas concessões: **não muda
  quem pode chamar o quê.**
- ⚠️ **Função DEFINER não herda filtro de política.** Todo filtro que a RLS faz
  por omissão (lixeira, amostra) tem de ser DITO dentro da função.
- Guarda de banco `scripts/campb-banco.sql` (CI, job de isolamento), com o
  recorte antigo replantado e exigindo que a asserção acuse.

### ⚠️ ELIMINAÇÃO PELA METADE NA BORDA DO PERÍODO

`montarPosicaoConsolidada` filtrava o par pela `competencia` — a data da
ENTRADA. Com a tolerância de 5 dias, uma fatura de 29/09 paga em 02/10 tinha a
receita eliminada em setembro e a "despesa" (que setembro nunca somou) também:
o resultado consolidado caía 900 sem nada ter acontecido. Agora o par só é
eliminado quando as DUAS pontas estão no período. Guarda no `engine-audit`
(borda + o mesmo par com as duas pontas dentro, para não passar sobre o vazio).

### ⚠️ UPDATE QUE NÃO ALTEROU NADA NÃO É SUCESSO

A edição em massa (produção) tratava "sem erro" como "alterado". Política
restritiva FILTRA num UPDATE — 200 com zero linhas (medido: UPDATE de título de
outra empresa como `authenticated` → 0 linhas, sem erro). O toast dizia
"1 título alterado" sobre nada. Agora `.select("id").maybeSingle()` e linha
nula vira falha NOMEADA.

### Os outros três

- **Extrato cobrava o que foi pago:** "pago" exigia `paid_date`; liquidado sem
  data ficava em aberto para sempre. Agora é o `liquidado` canônico, datado no
  vencimento quando não há data de pagamento.
- **Nota sem vencimento nascia vencendo hoje:** o formulário caía no padrão
  (hoje) quando a caixa não mandava vencimento — o contrário do que o doc
  prometia. Agora abre vazio e a validação pede.
- **A decisão da caixa não dizia QUEM:** `quem` era sempre nulo. Agora é a
  conta logada (e-mail); em demonstração, "você (demonstração)". A tela mostra.

### O grep da migration saiu

A asserção `campb: o gatilho confere a data de ORIGEM` lia o TEXTO da
migration — passava com a trava aplicada ou não. Saiu (corolário da coluna
gerada no CLAUDE.md); a prova da trava é `scripts/campb-banco.sql`, e o
`engine-audit` só cobra que ela continua no CI.

### Pendências declaradas da revisão

- O DRE multiempresas (`montarConsolidado`, ONDA 13) ainda elimina pares sem
  olhar o período das duas pontas — a mesma borda, em outra tela. Não é deste
  pacote e mexer na cascata consolidada pede a guarda dela.
- Estorno: o original estornado só ganha `estornado_em` (a `situacao` não
  muda), e `RiskMovement` não transporta esse campo — o extrato do contato (e
  toda tela) ainda mostra o original como título vivo ao lado do estorno de
  sinal oposto. Pré-existente.
- A decisão da caixa (descarte/conversão) mora em `org_state`: duas pessoas
  convertendo o mesmo documento ao mesmo tempo criam duas contas. Tabela
  própria com índice único pela chave do documento é a saída.
