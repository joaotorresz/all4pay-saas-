# Contabilidade e relatórios — rodada de 30/09 (branch `r3/contabil`)

Decisões que merecem subir ao CLAUDE.md. Cada uma tem guarda no `engine-audit`
(bloco `CONTABILIDADE E RELATÓRIOS`) e/ou jornada em `scripts/e2e/contabil-*.mjs`,
provadas plantando o defeito de volta.

## ⚠️ O número rotulado "razão" tem de ser o do RAZÃO

O cartão "Caixa do razão × extrato" mostrava "Somando todos os lançamentos" =
liquidados + PREVISTOS — o `derivado` de `reconciliarSaldo`, que descreve o que o
razão fazia ANTES de parar de postar previsto. Medido na demonstração: o cartão
dizia R$ 3.160.408,53 e a linha 1.1.01 do balancete, logo abaixo, R$ 3.108.835,26
(a diferença era o total dos títulos em aberto, apresentado como parcela de uma
diferença da qual ele não faz parte). Um lançamento manual no caixa mudava o
balancete e não mudava o cartão.

`core/ledger/conciliacao.conciliarCaixaDoRazao`: caixa do razão = saldo da 1.1.01;
`extrato − razão = abertura + liquidados sem data − lançamentos próprios no caixa
+ resíduo`. O resíduo só mede algo com abertura verificada; sem ela continua
"NÃO CONFERIDO" (A4P-073). Os títulos em aberto ficam como INFORMATIVO, fora da
soma. As parcelas de `reconciliarSaldo` ganharam `id` — casar o rótulo em
português para achá-las seria a quarta vez desse defeito.

## ⚠️ A regra do razão vale nos DOIS caminhos

`validarPostagem` (balanceado · conta do plano · data · mês não travado) roda em
`postarLancamento` ANTES do ramo da demonstração. Antes, só o gatilho do banco
recusava: na demo o rascunho da IA com D ≠ C entrava no balancete.

## ⚠️ Escritor de razão que engole erro (produção)

`postarLiveLote` fazia `continue` nas três recusas possíveis (cabeçalho, linhas,
postagem) e `postarLancamento` devolvia `void`: a tela anunciava "Lançamento
postado." sobre o que o banco recusou. Agora o lote devolve `{postadas,
jaExistiam, falhas}` com a mensagem do banco e a postagem individual LANÇA.

- **`period_id` vai junto.** O gatilho `check_period_open` só olha
  `new.period_id`, e NENHUM lançamento o preenchia — medido em produção
  (01/10/2026): 0 de 354 `journal_entries` com período. "Travar o mês" no
  Fechamento não impedia postagem nenhuma no razão. A trava existia; a chave
  nunca chegava à fechadura.
- **Rascunho recusado libera a chave.** Vai para a lixeira com a
  `external_key` marcada (`…#recusado:<id>`); sem isso o índice único
  `(org_id, external_key)` tornava impossível tentar de novo depois de consertado
  o motivo.
- ⚠️ **Não provado contra um banco**: o caminho live foi revisado e tipado, não
  executado (não há Supabase neste ambiente e a trava proíbe escrita em
  produção). A guarda é por leitura de código.

## ⚠️ Open Finance → razão: duas portas para o mesmo dinheiro

A sincronização do Pluggy já cria um MOVIMENTO por transação
(`bank_transactions.movement_id`), e o razão projeta todo movimento liquidado.
"Importar Open Finance" no Razão postava a mesma transação de novo como
`pluggy:<id>` — o caixa dobrava. Medido: 52 de 52 transações já têm movimento.
Agora só a transação SEM movimento entra direto, e só vira "processada"
(`raw_events`) a que de fato entrou — antes a recusada era marcada e nunca mais
tentada. As 17 entradas `pluggy:` que existem em produção não casam com as
transações atuais (medido) — ficam como estão; decidir se saem é do dono.

## ⚠️ Estorno contábil tinha função e não tinha tela

`estornar_lancamento_contabil` (ONDA 3) existia e nenhuma tela a chamava. O
Razão ganhou "Estornar" nos lançamentos PRÓPRIOS (motivo obrigatório, data de
hoje, recusa estorno duplo); a projeção de um movimento (`mov:`) não se estorna
aqui — corrige-se o movimento.

## ⚠️ DFC: as duas posições não têm o mesmo "Total"

- O Total do **Saldo Inicial** era o do ÚLTIMO mês (a regra "saldo não se soma,
  vale a última posição" foi aplicada às duas linhas). O inicial do período é o
  do PRIMEIRO mês; só assim inicial + fluxo = final fecha na coluna Total.
- **Recorte por conta parte do saldo da conta** (`montarDFC(…, saldoHojeDoRecorte)`).
  Partia do saldo da empresa: a soma dos "saldos finais" das quatro contas da
  demonstração dava R$ 8.995.402 contra R$ 2.248.850,50 de saldo real.
- **Transferência entre contas virou linha do DFC** (`transferencias_entre_contas`,
  `+/-`, dentro do fluxo líquido). No DRE ela continua fora; no caixa de UMA conta
  ela é dinheiro que entrou ou saiu, e sem a linha o DFC da conta não fechava. Na
  visão de todas as contas as pernas se anulam.
- **Projeto/centro não tem saldo**: as duas linhas de saldo saem, e a tela diz por quê.
- `saldoInicialDoPeriodo` usa as convenções canônicas (`liquidado`, `dataDe`, `assinado`).

## ⚠️ Multiempresas

- O DFC consolidado saía com **saldo R$ 0,00** (ninguém passava o saldo inicial).
  Agora é a soma do inicial de cada empresa; quando a janela termina no passado
  ele SAI (a fonte por organização só traz a janela, e reconstruir exigiria o que
  veio depois).
- O **drill-down do consolidado abria "Nenhuma transação"**: os ids são
  prefixados por empresa e a gaveta procurava na empresa aberta. `RelatorioConsolidado.unido`
  é a fonte; `GavetaTransacoes` aceita `fonte`.
- O seletor "Apenas contas ativas × Todas" **não filtrava nada** — saiu.
- O texto dizia "Sem eliminações intercompany (v1)" enquanto o motor eliminava.
  A lista das eliminações agora aparece.
- A linha declarada de cada categoria não chegava ao consolidado.

## ⚠️ Cartão e tabela da MESMA tela com filtros diferentes

Os cartões executivos do DRE recebiam só o intervalo; a tabela recebia conta,
projeto, centro e a linha declarada. Com filtro de conta, "Lucro líquido"
(R$ 3.160.408,53) ≠ Resultado Líquido da tabela (R$ 1.251.038,35). O comentário
do código dizia "divergir deixou de ser possível" — era verdade para a FÓRMULA,
não para a ENTRADA.

## ⚠️ Margem EBITDA tem uma definição só

O relatório de fechamento dividia o EBITDA pela receita BRUTA; o cartão do DRE,
pela LÍQUIDA. Mesmo rótulo, 40,3% × 51,1% para setembro na demonstração. Ficou a
líquida (a da cascata). O fechamento também passou a receber a linha declarada.

## Variação e Domínio

- A variação é `atual − anterior` e só o lado atual tinha lançamentos para
  abrir: a categoria que SUMIU tinha delta e nenhum botão. `Motivo.movimentosAnterior`.
- Domínio: liquidado sem conta ia ao arquivo de TODAS as contas
  (`movimentosDaContaNoMes`, agora em `core/contabilidade`); a categoria do plano
  casava por chave exata ("Venda" × "venda" → pendência com código cadastrado).
  O aviso do código da conta bancária afirmava que ele ia no arquivo — não vai,
  é informado na tela de importação do Domínio.

---

# Revisão adversarial (branch `r3/contabil-rev`)

Cada correção do caçador foi reprovada plantando o defeito de volta (P1–P19 no
relatório). Duas guardas não reprovavam — e passaram a reprovar com o bloco
`CONTABILIDADE (revisão)` do `engine-audit`: o contrato do estorno (motivo,
duplicidade, projeção de movimento) e a trava do mês na postagem.

## ⚠️ Idempotência que volta calada mente na tela

`postarLancamento` com `externalKey` voltava sem fazer nada quando a chave já
existia, e devolvia `void`: Cronogramas anunciava "Lançado no razão" depois de
uma parcela ter mudado, e o razão ficava com o valor ANTIGO. Pior: mesmo
estornado o original, a chave continuava ocupada e o valor certo nunca mais
entrava. `core/ledger/idempotencia.decidirPostagem`, nos dois caminhos:

- mesmo total → `"ja_existia"` (a tela diz que já estava lá);
- outro total → RECUSA, com o valor que está no razão e o caminho (estornar);
- anteriores todos estornados → posta com a chave versionada (`chave#v2`).

Jornada `contabil-cronogramas.mjs` prova os quatro passos sobre o balancete
(provada reprovando com o retorno calado plantado no build: 5 verificações).

## ⚠️ Provisão: duas portas, uma sem estorno

`AccrualsSection` (Cronogramas → Provisões sugeridas) postava a provisão no DIA
1º, SEM o estorno, e com chave própria (`accrual:`) diferente da do Fechamento
(`prov:`). Quando a conta real chegava, a despesa contava duas vezes — o
defeito que `provisaoComEstorno` existe para impedir —, e a mesma categoria
podia ser provisionada uma vez em cada tela. Agora as duas portas montam o par
pela mesma função e com as mesmas chaves. ⚠️ Provado por guarda de código; não
dirigido no navegador (a demonstração não sugere provisão para o mês corrente).

## Produção: duas recusas do banco que sumiam

- `travarPeriodoLive` descartava o erro do `update/insert` — a trava local
  marcava o mês e o banco continuava aceitando postagem. Agora LANÇA. ⚠️ O
  chamador (`components/fechamento/FechamentoView.tsx:68,71`) ainda faz
  `.catch(() => {})`: está na área reservada do fechamento — ver relatório.
- `periodoIdLive` lia `data.id` sobre `null` quando o banco recusava abrir o
  período: a tela mostrava "Cannot read properties of null". Agora a mensagem
  do banco sobe.

---

# Rodada 3 (reservados) — branch `r4/contabil`

Defeitos achados em arquivos que os caçadores não podiam editar. Guardas no
bloco `CONTABILIDADE · RODADA 3` do `engine-audit`, cada uma provada plantando
o defeito de volta (7 plantios, 7 reprovações nomeando a asserção).

- **Envio de NFs ao contador** (`EnvioNFsView`): "Simular confirmação" já só
  aparecia na demonstração; o resto da tela continuava prometendo em produção
  — "próximo envio 01/11 às 21h", "enviamos um link de confirmação", "aguardando
  clicar no link". **Não há executor** (nenhum cron, rota ou e-mail). Agora a
  promessa só existe no ramo `ENVIO_SIMULADO` (= `isDemo`); fora dele a tela diz
  "Envio automático não ligado", o botão vira "Cadastrar e-mail", e o que existe
  hoje ficou visível: **"Baixar relação do mês"** (XLSX com as notas de entrada e
  de saída do mês — os XMLs vêm do emissor e da SEFAZ, o sistema não os retém).
  Os destinatários já gravavam por `store-org` (`a4p_contador_destinatarios` em
  `CHAVES_ORG`); a guarda agora proíbe `localStorage` cru no store.
- **DRE multiempresas da demonstração** (`lib/consolidado.demoInputsPorOrg`): a
  empresa atual entra com o MESMO `RiskInput` da tela (`getRiscoInput`) como
  "Empresa atual"; as outras duas seguem sintéticas. A taxa intercompany da
  demonstração passou a ser Holding → Filial: na empresa atual um lançamento a
  mais faria a coluna dela divergir do DRE ao lado.
- **Provisão no Fechamento**: `postarLancamento` devolvia `"ja_existia"` e a tela
  anunciava "lançada". A frase agora sai de `mensagemDaProvisao` (`core/close`),
  usada pelas DUAS portas (Fechamento e Cronogramas → Provisões sugeridas), com o
  retorno da provisão E do estorno — a de Cronogramas também ignorava o do
  estorno e dizia "nada foi lançado" quando só o estorno entrava.
- **`dreProjetado`** multiplicava as margens (EBITDA e líquida, ambas "÷ receita
  líquida") pela receita BRUTA. Agora multiplica pela líquida, com a proporção
  líquida ÷ bruta tirada da MESMA cascata nos mesmos meses da base (o
  classificador local não reconhece "Simples Nacional" como dedução — usá-lo
  seria a segunda classificação do mesmo fato). `DREProjecao` ganhou
  `receitaLiquida`. Sem tela hoje.

**Decisão pendente do dono:** o EXECUTOR do envio ao contador — montar o pacote
de XMLs (exige reter o XML: certificado A1 para a entrada, emissor para a saída)
e enviá-lo por e-mail (Resend, via o motor de automações, com registro de envio
idempotente como o de `automacao_envios`), mais o link de confirmação do double
opt-in. Até lá a tela não promete nada disso.

## Revisão adversarial da rodada 3 — branch `r4/contabil-rev`

Quatro furos nas correções acima, cada um com guarda no mesmo bloco do
`engine-audit`, provada plantando o defeito (5 plantios, 5 reprovações
nomeando a asserção):

- **A provisão entrava e o estorno não, calado.** As duas portas postavam as
  metades em chamadas separadas; se a do estorno caía (rede, recusa, conflito),
  a tela dizia só "Falha: …" — com a provisão JÁ no razão, sem estorno, contando
  a despesa duas vezes. Agora as duas portas chamam o MESMO gesto,
  `postarProvisaoComEstorno` (`core/close`, quem posta entra por parâmetro), que
  nomeia o estorno que não entrou e diz que lançar de novo é seguro.
- **`dreProjetado` ainda misturava duas classificações.** A correção aplicava
  "líquida ÷ bruta da cascata" à receita do agregador local, que soma TODA
  entrada: um empréstimo recebido entrava na base das margens (medido: EBITDA
  900 em vez de 450). As duas bases (bruta e líquida) saem agora da cascata;
  o agregador só escolhe os meses.
- **Destinatário "Verificado" em produção.** O "Simular confirmação" chegou a
  existir em produção antes da rodada, então pode haver e-mail gravado como
  verificado sem clique do contador. Fora da demonstração nenhum aparece
  "Verificado": a linha diz "Cadastrado em … — a confirmação por e-mail ainda
  não está ligada".
- **A guarda do consolidado injetava o input à mão** e não via a chamada real;
  passou a exigir que `getRiscoInputPorOrg` entregue `getRiscoInput()` na
  demonstração.

Dirigido no build de demonstração (porta 3183): o DRE multiempresas e o
`/consolidado` mostram "Empresa atual" e as eliminações (Holding → Filial); o
Envio de NFs mostra "Baixar relação do mês". A provisão não pôde ser dirigida —
o seed atual não sugere nenhuma; ficou provada por valor na guarda.

**Continua pendente do dono:** o executor do envio ao contador (acima) e se a
projeção do DRE volta a ter tela. O achado lateral do `classificarDespesa` que
não reconhece "Simples Nacional" segue fora do escopo.
