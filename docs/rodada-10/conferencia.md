# Conferência extrato × sistema da maquininha Pinbank (13/10/2026)

Combinado com o dono: uma conferência **só de leitura** entre o extrato
consolidado da Pinbank (`ExtratoPos`) e os títulos que o webhook `Compra.*`
lançou — para UMA empresa, UM estabelecimento (EC) e UM período de até 31
dias. Nada do dinheiro é gravado: nem título, nem evento, nem vínculo. O único
registro é o carimbo da última conferência da EMPRESA (o limite durável, D4 —
tabela `pinbank_conferencia_limite`, com trilha), feito logo antes da Pinbank.

```
Integrações → cartão da maquininha → "Conferir com o extrato"
  POST /api/pinbank/conferencia { vinculoId, de, ate }
    1. sem banco (demonstração)            → 404
    2. sem sessão                          → 401
    3. pedido mal formado (31 dias)        → 400
    4. o vínculo é da empresa ABERTA?      → 404 (lido COMO A PESSOA, pela política)
    5. tem_permissao('administrar', org)   → 403
    6. PINBANK_CONFERENCIA=ligado E PINBANK_API_AMBIENTE=producao → 503
    7. vínculo ativo e com o código do extrato (EC) → 409
    8. títulos da janela (semAmostra + teto + org_id do vínculo) → 422 se passar do teto
    9. a ESPERA por empresa (60 s, no BANCO: pinbank_conferencia_reservar, que
       confere de novo o vínculo vivo, ativo e com EC) → 429 com os segundos que
       faltam (a frase E o número, que o botão espera); sem a resposta do banco
       → 503 limite_indisponivel
   10. consultarExtratoPos(filtro) pela saída fixa → 502 se falhar
   11. sem a LISTA, com erro ou com ResultCode ≠ 0 → 502 (nunca "zero vendas")
   12. pelo NSU (org_id do vínculo), cada lado com o SEU teto (2.000 NSUs da
       janela, 2.000 do extrato — nunca o da união) → 422 se passar:
       a. avisos e transações (só a plataforma grava) das NSUs dos dois lados;
       b. só então os títulos — das NSUs da janela e das NSUs do extrato com
          aviso desta empresa NO DIA DA VENDA
   13. motor puro → relatorioParaEmpresa → relatório (200); sem NENHUMA venda
       em comum ATESTADA pelo aviso da Pinbank no dia da venda, só as
       contagens de cada lado
```

Cada chamada à Pinbank (passos 10–11) deixa UM registro no log do servidor:
`[pinbank·conferencia]` no sucesso, `[falha·pinbank]` na falha, sempre com
`user`, `org`, `vinculo`, `ec`, `de`, `ate` e, quando houve resposta, `linhas`
(a QUANTIDADE) e `codigo` (o ResultCode). Nenhum valor, nenhum dado pessoal.
É o que responde "quem viu" — se um EC errado expuser um extrato, ou se a
credencial da plataforma for usada demais.

## O que se compara, e o que não

| Compara | Não compara (fica "aguardando definição") |
| --- | --- |
| a data do repasse (por DIA, cortando a hora) | o bruto da parcela da Pinbank (`ValorBrutoParcela`) |
| o valor bruto da parcela | o split e o líquido do repasse |
| o cancelamento (extrato × título × transação) | o `ValorTaxaMes` (percentual, sentido não dito) |
| a TAXA (MDR, `ValorTaxaAdm`) × a cadastrada no vínculo — eixo SEPARADO do status | a taxa em REAIS (nenhum valor é derivado do percentual) |

- **A taxa é o MDR em percentual, e é comparada à parte** (desde a versão
  1.1.0 do motor; 1.2.0 com a segunda revisão; 1.3.0 com a terceira; 1.4.0 com a quarta; 1.5.0 com a quinta). A Pinbank respondeu em 13/10/2026: "Taxa ADM seria o MDR, são todas
  em percentual. Aqueles são valores para fins de testes." O `ValorTaxaAdm` é
  lido em PONTOS-BASE inteiros (2,65% = 265) e comparado, parcela a parcela,
  com a taxa que a empresa cadastrou no vínculo para o tipo da venda — a mesma
  escolha por forma do planejador (`taxaDaForma`), convertida de fração para
  pontos-base. O tipo sai do `TipoCompra` com cautela: `DEBITO` → débito,
  `A VISTA` → crédito à vista, `PARCEL…` → parcelado **só com mais de uma
  parcela** — em 1x é crédito à vista, a mesma escolha de `formaDaTransacao`
  (o planejador lança a taxa de crédito à vista nessa venda; comparar com a de
  parcelado acusaria uma diferença onde o extrato e o sistema concordam); sem o
  número de parcelas, e o resto (voucher, Pix, um nome novo), é **tipo
  desconhecido** e não se compara.
  Resultados: **igual** (MENOS de 1 ponto-base de diferença contra a taxa
  contratada EXATA, sem arredondar — ver abaixo) · **diferente**
  (DIVERGÊNCIA) · **sem contrato** (a empresa não cadastrou — não é
  divergência) · **sem MDR no extrato** · **tipo desconhecido** · **sem
  conclusão** (nenhum NSU em comum: sem saber se o extrato é desta maquininha
  — um EC trocado dá exatamente isso —, a taxa também não é afirmada) ·
  **outra maquininha** (quinta revisão: o estabelecimento tem OUTRA
  maquininha viva da empresa, cada uma com as SUAS taxas, e nenhum aviso diz
  que esta venda veio desta — comparar com a taxa desta acusaria a venda da
  irmã de "taxa diferente" e esconderia a taxa errada cadastrada na irmã) ·
  **venda cancelada** (a linha traz a data de cancelamento: não há taxa a
  conferir — o MDR zerado na linha cancelada é convenção plausível da
  adquirente, e compará-lo acusaria toda venda cancelada; o cobrado e o
  cadastrado ficam no detalhe, a diferença não) · **estorno parcial** (a
  linha traz a data de cancelamento e o sistema registrou um estorno PARCIAL:
  a venda segue valendo pelo resto, então "venda cancelada" ao lado de
  "estorno parcial" se contradiria; o MDR dessa linha pode vir zerado, e a
  taxa não é comparada — com o nome próprio, "Venda com estorno parcial: taxa
  não comparada", e fora da vista de divergências).
- ⚠️ **A tolerância é ESTRITA e contra o contrato EXATO** (terceira revisão,
  13/10/2026). Antes, a taxa contratada era arredondada a pontos-base inteiros
  e a diferença ATÉ 1 ponto-base contava como igual — e isso escondia
  exatamente 0,01 ponto percentual cobrado a mais num contrato de duas casas,
  que é o que a tela de cadastro recolhe (1,99% contratado e 2,00% no extrato
  saía "igual"). Agora a comparação usa os pontos-base EXATOS do contrato
  (`pontosBaseExatosDaFracao`, com o corte da dízima: 0,0163 × 10000 dá
  162,99999999999997, que numa comparação estrita passaria por "menos de 1
  ponto-base" de 162) e é igual só com MENOS de 1 ponto-base: 1,99% × 2,00% é
  diferente; 1,995% (contrato com mais casas que o extrato) × 1,99% ou 2,00% é
  igual. O inteiro arredondado (`contratoBp`) fica só para EXIBIR, e a
  DIFERENÇA (`diferencaBp`) só sai quando a taxa é **diferente** (quarta
  revisão): contra um contrato de mais casas — só pela RPC direta; o
  formulário arredonda a duas —, a igual mostrava "cadastrada 2,00%", "taxa
  igual" e "diferença −0,01 ponto percentual" juntos. Na diferente, a
  diferença contra o arredondado nunca é zero e fecha com os dois números
  exibidos.
- **A taxa cobrada SEM o título dela no sistema** (`taxa_sem_titulo_no_sistema`):
  a linha viva cobrou MDR, a taxa daquele tipo está cadastrada (a comparação é
  conclusiva — igual ou diferente), a REGRA DO SISTEMA lançaria uma taxa
  positiva nesta parcela e o sistema não tem título de taxa vivo nela. A regra
  é a do planejador (`agendaDaTransacao`): o total da venda × a taxa da forma,
  ao centavo, dividido pelas parcelas por `dividir` — R$ 0,30 a 1,63%
  arredonda para zero e não tem título a lançar; R$ 10 em 12x a 3,10% deixa a
  12ª parte negativa (o planejador grava 11 títulos de taxa e nenhum na 12ª).
  Nenhum real sai do percentual do extrato: a conta é a do contrato. É dinheiro que falta no resultado (o EBITDA sai maior do que é — a
  venda entrou quando a taxa estava em branco, por exemplo). Não muda o
  status; vai à vista de divergências e à frase ("O sistema não lançou a taxa
  desta parcela."). Sem taxa cadastrada NÃO acusa: "taxa não cadastrada" já
  diz por que não há título, e venda sem custo é estado declarado.
- **Cada título de taxa soma UMA vez** no resumo ("Taxa lançada pelo
  sistema"): dois títulos de receita da mesma parcela (a chave repetida)
  apontam para o MESMO título de taxa, e o resumo conta pelos ids
  (`taxaTituloIds`), não por item.
- ⚠️ **A taxa NÃO muda o status da parcela, e a vista de divergências olha os
  dois.** Uma parcela com a data e o bruto certos e a taxa errada continua
  "conferida" no status e entra na vista de divergências por
  `itemComDivergencia` — uma leitura não esconde a outra. O resumo traz
  `resumo.taxa.porResultado` (contagem por resultado) e
  `resumo.itensComDivergencia` (status divergente OU taxa diferente OU taxa
  sem título OU total da venda diferente, cada item uma vez). A frase do item ganha "Taxa: o extrato cobrou X% e a taxa
  cadastrada para <tipo> é Y%." só quando diverge.
- **O bruto da parcela é ESTIMADO pela regra do sistema**: o bruto da venda do
  extrato passa por `dividir` (`core/vendas/pos`), a mesma divisão que o
  planejador usou ao lançar. A `ValorBrutoParcela` da Pinbank (75% do bruto na
  loja de teste) não tem sentido confirmado.
- **Repasse em fim de semana ou feriado** que a Pinbank paga no dia útil
  seguinte é **conferido** (`casada_dia_util`), não divergência. O plano estima
  D+30 corridos e não posterga (decisão D9 abaixo); sem esta regra, metade dos
  créditos seria "data diferente". Calendário NACIONAL apenas: feriado municipal
  aparece como "data diferente" de +1.

## Os status (exclusivos — o resumo particiona a lista)

| Grupo | Status |
| --- | --- |
| Conferidas | conferida · conferida no dia útil seguinte · cancelada nos dois |
| Divergências | data diferente · valor diferente · data e valor diferentes · cancelada só no extrato · cancelada só no sistema · só no extrato · só no sistema |
| Sem conclusão | par provável · sem conclusão · linha ilegível · repetida no extrato |

**O que NÃO é afirmado** (vira "sem conclusão"), e por quê:

- **Nenhum NSU em comum** entre os dois lados → a numeração pode não ser a
  mesma (pergunta em aberto com a Pinbank: o `nsu` do webhook é o `NsuOperacao`
  do extrato?). Tudo fica sem conclusão; só roda o **par provável** — pelo NSU
  da loja (`NsuOperacaoLoja`) ou pelo código de autorização no mesmo dia e com
  o mesmo valor — que é a evidência para responder a pergunta. O código de
  autorização nunca sai no relatório.
- **Venda do primeiro ou do último dia** só no sistema: pode ter caído no dia
  vizinho do outro lado. A exceção: se a venda (o NSU) está no extrato e falta
  só a parcela, isso é afirmado mesmo na borda.
- **Venda de hoje ou de ontem**: pode ainda não constar no extrato.
- **Venda por Pix**: não se sabe se o extrato da maquininha traz Pix.
- **Estorno parcial**: o valor bruto não é comparado.
- **Cancelada no sistema e ausente do extrato**: venda cancelada pode sumir dele.
- **Extrato com venda de fora do período pedido**: a ausência não é afirmada.
- **Empresa com mais de uma maquininha** e venda sem aviso que diga de qual.
- **Venda de uma maquininha EXCLUÍDA** (trocada): o aviso aponta para um
  vínculo que não está mais vivo, e ele pode ter tido o mesmo EC. Vale haja uma
  maquininha viva ou várias — o motor recebe a LISTA dos vínculos vivos, não a
  contagem. Aviso de outro vínculo VIVO continua fora ("outra maquininha").
  Motivo PRÓPRIO (`maquininha_excluida`): "O aviso desta venda veio de uma
  maquininha que não está mais vinculada à empresa; ela pode ter tido outro
  código no extrato." — a frase de "mais de uma maquininha e nenhum aviso"
  seria falsa nas duas metades (a empresa pode ter uma só, e o aviso DIZ de
  onde veio).
- **Extrato sem nenhuma parcela legível deste EC** (vazio, só de outro
  estabelecimento, ou só linhas sem número/parcela) com vendas no sistema: estado `extrato_vazio`, e as vendas do
  período ficam sem conclusão — é a resposta mais ambígua da Pinbank (EC
  errado, credencial sem o método, recusa sem lista). Antes, todas viravam "só
  no sistema"; uma linha a mais de outra venda invertia o veredito.
- **Cancelada no extrato e sem título**: a venda desfeita na maquininha não
  gera título, e isso é o certo. Com a transação Cancelada/Desfeita/Negada (ou
  reembolsada inteira) ou todos os títulos cancelados → **cancelada nos dois**;
  sem registro no sistema → sem conclusão. Nunca "só no extrato" — somaria em
  "Bruto estimado no extrato" um dinheiro que não existiu.
- **Parcela ausente do extrato numa venda que está nele**: afirmada, MENOS
  quando o extrato traz uma linha ilegível que pode ser ela, quando o extrato
  traz a venda CANCELADA noutra parcela, ou quando a venda está cancelada no
  sistema (o extrato pode trazê-la pela metade).
- **A Pinbank cancelou a venda numa parcela que o extrato traz** e as outras
  não aparecem: com a venda cancelada também no sistema, as parcelas ausentes
  são **cancelada nos dois** (a venda está cancelada dos dois lados); com a
  venda viva no sistema, **sem conclusão** ("A Pinbank cancelou esta venda (em
  outra parcela do extrato); esta parcela não aparece — confira o cancelamento
  no sistema.") — a divergência já é afirmada na parcela que o extrato traz
  ("cancelada só no extrato"). Antes, R$ 200 de venda cancelada somavam em "Só
  no sistema" e mandavam cobrar da Pinbank um dinheiro que ela não deve.
- **Viva no extrato e desfeita no sistema** (transação Cancelada, Desfeita,
  Negada ou Reembolsada por inteiro, ou todo título cancelado) e sem título da
  parcela → **cancelada só no sistema** ("Desfeita no sistema antes de virar
  título; no extrato da Pinbank a venda continua valendo." quando nenhum título
  nasceu). Antes era "só no extrato · o aviso chegou e foi processado sem
  lançar a venda", que manda depurar o webhook em vez de conferir se o
  desfazimento chegou à Pinbank.
- **Linha ilegível SEM o número da venda**: pode ser qualquer venda daquele
  dia. Nenhum título com competência no mesmo dia **ou no vizinho** (quinta
  revisão: o dia da venda pode diferir em 1 entre os dois lados — o aviso é
  aceito a até 1 dia, e o dia diferente é sinal, não ausência; a venda perto
  da meia-noite perdia a proteção) é dado como ausente — nem a venda inteira,
  nem a parcela que falta de uma venda daquele dia.
- **Linha SEM o código do estabelecimento** (quinta revisão — achado da
  varredura aleatória, ~1.600 falsos "só no sistema"): ela sai da conferência
  e os valores dela nunca entram num item (pode ser de outra loja), mas o
  dinheiro pode estar nela. Ela PROTEGE como a linha ilegível: com o número,
  o título daquela venda; sem o número, os do mesmo dia ou do vizinho — motivo
  próprio, `linha_sem_estabelecimento` ("O extrato traz uma linha sem o código
  do estabelecimento que pode ser esta venda; a ausência não é afirmada."). Com
  outro número, não protege: a venda sem linha nenhuma segue "só no sistema".
- **Estorno parcial lançado e a linha com data de cancelamento**: sem
  conclusão por estorno parcial — "cancelada só no extrato" diria que o aviso
  não chegou, e ele chegou.
- **Estorno CANCELADO não conta**: o estorno total ou parcial com o título
  cancelado não cancela a venda nem tira o valor da comparação.
- **A mesma venda dividida em números de parcelas DIFERENTES nos dois lados**
  (terceira revisão — o falso positivo mais caro): 1x de R$ 300 no extrato e
  3x de R$ 100 no sistema afirmavam R$ 200 "só no sistema", e 12x no extrato
  contra 10x no sistema afirmavam R$ 166,70 "só no extrato" — dinheiro que
  está nas parcelas do outro lado. Causa plausível: o parcelado do emissor
  pago num repasse só, ou a antecipação numa linha só. Agora a parcela SEM PAR
  de uma venda que está nos dois lados com números de parcelas diferentes (o
  número do extrato é o das linhas legíveis, quando concordam; se discordam,
  também não se sabe) fica **sem conclusão** (`parcelas_diferentes_no_extrato`:
  "O extrato divide esta venda em N parcelas e o sistema em M; o valor desta
  parcela pode estar nas parcelas do outro lado — a ausência não é afirmada.").
  Nas parcelas que têm par, a divergência é afirmada QUANDO os valores delas
  diferem (valor diferente, com o sinal "parcelas diferentes") — e pode não
  diferir. E o **total bruto da venda** é comparado sempre que cada lado o diz
  sem dúvida (no extrato, o bruto da venda único, nenhuma linha ilegível e as
  linhas concordando no número de parcelas; no sistema, nenhum estorno parcial
  e cada parcela que ele TEM com um título só, vivo e legível): os sinais
  `total_da_venda_igual` / `total_da_venda_diferente`.
  ⚠️ **O TOTAL DIFERENTE É DIVERGÊNCIA** (quarta revisão, 13/10/2026 — achado
  da revisão de dinheiro). O número de parcelas do sistema é DEDUZIDO da maior
  chave dos títulos, então o título da ÚLTIMA parcela que some (excluído, ou
  nunca lançado) faz a venda parecer "dividida em menos" no sistema: 3x de
  R$ 300 no extrato e só a p1 e a p2 de R$ 100 no sistema davam p1 e p2
  conferidas (batem uma a uma), a p3 sem conclusão — e os R$ 100 que faltam
  em divergência NENHUMA, nem em frase nenhuma (só nas "Observações" de uma
  linha conferida aberta à mão). O mesmo com 2x de R$ 200 no extrato e 3x de
  R$ 100 no sistema (R$ 100 que a Pinbank não vai pagar). E o título do MEIO
  que some era afirmado: o mesmo dinheiro aparecia ou não conforme QUAL
  parcela faltava. Agora: o total diferente leva TODAS as parcelas da venda à
  vista de divergências (`itemComDivergencia`), e a frase das parcelas e do
  total vai em TODA situação em que o sinal está — inclusive "conferida" e
  "sem conclusão" ("… mesmo valor bruto nos dois lados. O extrato e o sistema
  dividem a venda em números de parcelas diferentes. O total bruto da venda
  também é diferente nos dois lados."). ⚠️ **A parcela que falta no sistema
  conta ZERO, não anula a comparação**: exigir a numeração inteira de 1 a M
  deixava a lacuna (só a p2 de uma venda de 3x) sem total e, de novo, sem
  divergência. A parcela SEM PAR continua **sem conclusão** — nunca "só no
  extrato" nem "só no sistema" —, mesmo com o total diferente: o atalho
  ("com o total diferente, afirmar a ausência do lado que tem mais") volta a
  somar em "Só no …" um valor que pode estar nas parcelas do outro lado, e há
  defeito plantado contra ele. A venda REDIVIDIDA com o MESMO total (2x de
  R$ 300 × 3x de R$ 100) diverge só nas parcelas com par, pelo valor; a sem
  par, de total igual, NÃO vai à vista. ⚠️ **Resíduo declarado**: total igual
  e TODA parcela com par igual não chega à vista — só acontece com uma lacuna
  num dos lados e o total coincidindo ao centavo (o título perdido com a venda
  também lançada com outro total), ou com o extrato sem as linhas de número
  baixo da própria venda. A frase da parcela sem par usa o número de parcelas
  da VENDA no extrato — com as linhas discordando (uma diz 2x, outra 3x), "as
  linhas do extrato desta venda não concordam no número de parcelas", nunca
  "o extrato divide em 3 e o sistema em 3" (o `n` de uma linha só).
  Com o MESMO número de parcelas, a parcela que falta continua afirmada —
  mesmo no último dia do período. ⚠️ **E a parcela que falta NOS DOIS lados**
  (quinta revisão — o título perdido E a linha ausente, a p1 ou a do meio):
  as parcelas com par conferem e o dinheiro dela sumia de tudo, enquanto a
  ÚLTIMA ausente nos dois derrubava o número do sistema e aparecia. Agora,
  com o mesmo número de parcelas, uma parcela de 1 a N sem título E sem linha
  legível e o total diferente dão o sinal `total_da_venda_diferente` às que
  conferem — elas vão à vista de divergências com a frase "Uma parcela desta
  venda não está nem no extrato nem no sistema, e o total bruto da venda é
  diferente nos dois lados." Só com a lacuna nos dois: a parcela de valor
  diferente ou a só no sistema já são a divergência, e o total não é
  espalhado às outras (há defeito plantado contra isso).

**O ausente é ausente:** item só do extrato tem `sistema: null`; a soma do
resumo é `null` quando nenhum item tem aquele lado. Linhas de outro
estabelecimento saem da conferência inteiras — nem o NSU nem o valor aparecem,
só a contagem.

## Os portões da rota (`core/pinbank/conferencia-portoes`)

- **O teto das leituras não acusa o lote CHEIO.** `pinbank_transacoes` é única
  por (empresa, NSU): um lote de 100 NSUs em que toda venda chegou devolve
  exatamente 100 linhas, e o `>=` antigo respondia "vendas demais" a toda loja
  com cerca de 100 vendas no período. Agora cada leitura pede UMA linha a mais
  que o teto (`pedirAte`) e só acusa volume quando ela veio, ou quando o
  servidor conta mais do que entregou (`passouDoTeto`). Vale para a janela, os
  títulos e os avisos pelo NSU, as transações e as maquininhas. Truncar
  continua proibido.
- **O servidor pode cortar ANTES do teto.** O PostgREST entrega no máximo
  `max_rows` linhas (1.000 no padrão do Supabase) por mais que o `.limit`
  peça. A janela, os títulos e os avisos pelo NSU pedem `count: "exact"` e
  passam a contagem a `passouDoTeto`: o servidor que contou mais do que
  entregou é volume alto. Medido no Supabase de mentira: 100 vendas em 12x
  (2.400 títulos) cortadas em 1.000 eram uma conferência "ok" sobre o pedaço —
  sumiam ao acaso os estornos de data posterior e as vendas de competência
  fora da margem. (Ver D2/D4: com `max_rows` de 1.000, a JANELA já recusa
  qualquer período com mais de 1.000 títulos.)
- **A recusa com a lista vazia não é "período sem vendas".** A rota exige
  `extratoServeParaConferir` (`lib/pinbank/api.ts`): sem erro, com a lista E
  com ResultCode 0 (ou nenhum, na lista solta). A Pinbank recusa com o código
  de fora (4, "Autorização negada"; 2, "Erro de Sistema.") e pode mandar o
  `Data` cifrado com `[]` — a leitura junta os dois, e sem olhar o código toda
  venda do sistema ficaria sem par. É a credencial sem o ExtratoPos liberado,
  o caso mais provável hoje.
- **Sem NENHUMA venda em comum ATESTADA, só as contagens de cada lado**
  (`relatorioParaEmpresa` → `RelatorioSoContagens`). O EC é digitado pela
  plataforma; um dígito trocado é o extrato de OUTRA loja.
  - ⚠️ **A prova é o AVISO, não o título.** O título (`movements`) a empresa
    também grava — qualquer membro com `lancar`, com a chave
    `pinbank:<nsu>:<k>:r` que quiser; nada no banco recusa essa chave fora de
    `pinbank_inserir_titulo`. Medido na segunda revisão: um título forjado com
    o NSU de uma linha do extrato errado entrava "em comum" e abria o extrato
    alheio INTEIRO. O aviso (`pinbank_eventos`) só a plataforma grava (só
    `service_role` executa `pinbank_registrar_evento`), com a maquininha de
    onde a venda veio: `resumo.nsusEmComumAtestados` conta só o NSU em comum
    que tem o aviso de uma maquininha DESTE estabelecimento **no dia da venda
    da linha do extrato** (`avisoNoDiaDaVenda`: o `ocorrido_em` fatiado a até 1
    dia do dia da venda — a folga cobre a venda das 21h às 24h de São Paulo,
    que já é o dia seguinte em UTC). Uma basta para abrir os detalhes. Em
    produção, toda venda que o webhook lançou tem o aviso do dia dela — a venda
    real abre; o título forjado, não.
  - ⚠️ **O dia é a metade que estreita o resíduo** (terceira revisão). Antes,
    qualquer aviso daquela NSU contava, de qualquer data e situação: medido,
    um aviso de 2023 (negado, com erro) e um título forjado cancelado abriam o
    extrato alheio inteiro — dia da venda, bruto e bandeira das três linhas.
    Agora é preciso a MESMA NSU no MESMO dia. A situação do aviso continua não
    contando (negado ou com erro também atesta): ela fala do processamento no
    sistema, e o que se prova aqui é a ORIGEM — que esta maquininha produziu
    esse número nesse dia.
  - ⚠️ **E as contagens não cruzam os lados.** Quantas parcelas "conferem",
    têm "valor diferente" ou "taxa igual" dependia do que a empresa grava (o
    valor e a data do título forjado, a taxa cadastrada): variar um e ler a
    contagem era um oráculo sobre a linha alheia. A resposta só com contagens
    não tem `estado`, `resumo` nem `itens`: só `contagens` (`resumo.lados` do
    motor — `extrato: { linhas, vendas }`, todas as linhas deste EC e as
    vendas com número; `sistema: { parcelas, vendas, centavos }`, as parcelas
    VÁLIDAS do período, as vendas delas e a soma),
    o que ficou fora da conferência e os avisos de UM lado só
    (`AVISOS_SEM_CRUZAMENTO`; o de "numeração não confirmada" sai, porque some
    com um título forjado). A guarda prova que a resposta é IDÊNTICA com o NSU
    do forjado dentro ou fora do extrato, com o valor dele (fora a soma do
    próprio sistema) e com a taxa cadastrada — enquanto o motor responde
    diferente em cada par.
  - ⚠️ **E A IDENTIDADE VALE PARA AS LEITURAS ANTES DO PORTÃO, inclusive o
    422** (terceira revisão). A leitura pelo NSU roda antes do portão e pode
    responder `volume_alto`; antes, ela lia os títulos (que a empresa grava)
    de TODA NSU do extrato e conferia o teto sobre a UNIÃO das NSUs dos dois
    lados. Medido no servidor de mentira com o `max_rows` padrão: 1.001
    títulos forjados de fora da janela com a NSU X davam 422 com X no extrato
    alheio e 200 sem ele; com `max_rows` maior, 1.998 NSUs forjadas na janela
    davam 200 ou 422 conforme coincidissem com o extrato — um bit por chamada
    sobre a loja de um EC errado. Agora: um teto POR LADO (nunca o da união);
    PRIMEIRO os avisos e as transações (só a plataforma grava) das NSUs dos
    dois lados; DEPOIS os títulos só das NSUs da janela e das NSUs do extrato
    que têm aviso desta empresa no dia da venda (`nsusDoExtratoComAviso`, a
    mesma regra do DIA do atestado — mas de QUALQUER maquininha da empresa,
    não só deste estabelecimento: a venda real de uma maquininha trocada
    também tem os títulos lidos). Nenhuma leitura cujo tamanho dependa do
    extrato alheio E do que a empresa grava. A guarda roda a COMPOSIÇÃO da
    rota (janela → NSUs → leitura → motor → portão — um espelho, não a rota
    importada; o `engine-audit` fixa no texto da rota exatamente essas
    chamadas: `lerDetalhesPorNsu(s, v.org_id, nsusParaDetalhar(janela.dados,
    extrato.resposta.linhas, ec))` e `titulos: [...janela.dados,
    ...detalhes.dados.titulos]`) com o `max_rows` padrão e com 5.001, e exige
    o MESMO resultado com a NSU forjada dentro ou fora do extrato.
  - A tela recebe `detalhes: { visiveis: false, codigo: "sem_venda_em_comum",
    frase }`, com a frase "Nenhuma venda do extrato tem o mesmo número (NSU),
    no mesmo dia, de uma venda que chegou a esta maquininha pelo aviso da
    Pinbank. Se o código do estabelecimento (EC) estiver certo, os detalhes
    aparecem quando houver no período uma venda que chegou pelo aviso da
    Pinbank; se não estiver, fale com o suporte da Quattro." — as DUAS causas
    e o que fazer: a causa legítima mais comum é nenhuma venda ter chegado pelo
    aviso (o aviso desligado, a maquininha nova), e conferir um EC certo nunca
    abriria os detalhes. Com a **maquininha trocada** (as vendas do extrato
    chegaram, no dia delas, pelo aviso de uma maquininha que não está mais
    viva — `resumo.nsusDoExtratoDeMaquininhaExcluida`), o código é
    `maquininha_excluida` e a frase diz que o período é provavelmente anterior
    à troca e que a Quattro confirma o EC da maquininha antiga. O sinal é de
    um lado só — as linhas do extrato contra os avisos, que só a plataforma
    grava; nenhum título entra, e nada que a empresa grave o muda.
    ⚠️ A condição é
    a falta de venda em comum atestada, não o estado "chave não confirmada":
    com o sistema SEM venda no período, o motor devolve "conferido" e todas as
    linhas do extrato errado como "só no extrato" — é exatamente o EC errado.
  - ⚠️ Custo conhecido: com a numeração diferente dos dois lados (D8), a
    resposta nunca abre, e a contagem de pares prováveis (que cruza os lados)
    também não sai — a evidência para D8 vem da rota de teste da plataforma.
- **A espera por EMPRESA é do BANCO** (D4, 14/10/2026 — migration
  `20261014120000_pinbank_conferencia_limite`). Logo antes da chamada à
  Pinbank, a rota pede `pinbank_conferencia_reservar(p_vinculo)` (SECURITY
  DEFINER): a empresa sai do VÍNCULO VIVO lido no banco (nunca do pedido), a
  função exige `tem_permissao('administrar', <empresa do vínculo>)` — a mesma
  `ACAO_CONFERENCIA` da rota — e confere E carimba numa instrução só (`insert …
  on conflict (org_id) do update … where ultima_em <= now() - 60 s`): duas
  chamadas ao mesmo tempo, só uma passa (medido com duas sessões no Supabase
  local: a segunda recebe `restante_ms` 59.470). Devolve `{ ok: true }` ou
  `{ ok: false, restante_ms }` (1 ms … 60 s) → 429 com os segundos que faltam.
  ⚠️ O teto de 60 s não é enfeite: `now()` é o INÍCIO da transação, e a sessão
  que abriu ANTES da que carimbou (e pediu depois) vê o carimbo à frente do
  próprio relógio — medido com duas sessões abertas a 0,3 s uma da outra: sem
  o teto ela recebe 60.293 ms; com ele, 60.000.
  A recusa NÃO carimba (quem insiste não empurra o prazo); a chamada que falha
  depois CONTA (ela já saiu com a credencial da plataforma). A tabela
  `pinbank_conferencia_limite` (uma linha por empresa: `ultima_em`, `por`,
  `vinculo_id`) não tem política nem concessão a anon, authenticated ou
  service_role, e tem o gatilho de trilha: cada reserva que passa vira um
  evento em `audit_log` com quem e quando — e a maquininha na primeira reserva
  da empresa e sempre que ela muda (a trilha guarda só o que MUDOU: medido, a
  reserva repetida da mesma maquininha traz só o novo `ultima_em`, e a
  maquininha é a do evento anterior). ⚠️ **O evento prova a RESERVA, não a
  chamada à Pinbank:** quem administra a empresa pode chamar a função direto
  pelo PostgREST (reserva sem Pinbank nenhuma), e a política de `audit_log`
  deixa QUALQUER membro da empresa — até o leitor — inserir um evento com o
  `usuario` que quiser (medido; anterior a esta rodada, fechar é decisão à
  parte). O rastro de quem CHAMOU a Pinbank com a credencial da plataforma é o
  registro por chamada no log do SERVIDOR (a rota), que a empresa não escreve.
  ⚠️ **As pré-condições da rota, de novo no banco:** a função só reserva o
  vínculo VIVO, ATIVO e COM o EC (`> 0`) — a rota recusa os dois últimos com
  409 antes de reservar, mas sem eles na função uma chamada direta carimbaria
  a espera da empresa com uma maquininha que nunca chega à Pinbank (e a
  maquininha desativada entre a leitura da rota e a reserva passaria).
  ⚠️ **FALHA FECHADA**
  (`lerReservaConferencia`): só `ok === true` libera; erro da RPC (a função
  ausente — o código no ar antes da migration —, a recusa por papel, a rede) ou
  resposta que não se entende → **503 `limite_indisponivel`**, com a frase "a
  Pinbank não foi consultada" e um registro `[falha·pinbank]` no log, e a
  Pinbank NÃO é chamada. O `Map` por instância SAIU (uma autoridade só);
  `ESPERA_CONFERENCIA_MS` e `fraseDeEspera` ficam (o `engine-audit` prova que o
  número da migration bate com `ESPERA_CONFERENCIA_MS`). ⚠️ **O 429 leva o
  NÚMERO** (`restanteMs`, além da frase) e o botão espera ESSE tempo
  (`esperaDoBotao`, entre 1 ms e 60 s; os 60 s inteiros em todo outro
  resultado): com a espera no banco, o 429 chega sempre que outra aba, outra
  pessoa ou outra instância da empresa conferiu há pouco, e esperando sempre
  60 s a tela mostrava "Espere 23 segundos" ao lado de "Conferir de novo em
  60 s" — e o botão seguia desligado depois que o banco já aceitaria.
- **A empresa do vínculo em toda leitura.** As cinco leituras depois do
  vínculo levam `.eq("org_id", orgId)` com o `org_id` DO VÍNCULO. A política
  olha a empresa aberta no instante de cada consulta; trocar de empresa em
  outra aba durante a conferência (a Pinbank sozinha leva até 25 s) casaria o
  extrato da empresa A com os títulos da B, sob a permissão conferida só na A.

## A tela (`components/administracao/PinbankConferencia.tsx`)

A tela não soma nada: desenha o resumo e a lista que o motor devolveu. O que
ela decide é COMO dizer cada estado — e cada um é diferente, nunca zeros:

- **Indisponível** (503: desligada, modo de teste, sem configuração) → o
  motivo no lugar do relatório, e o botão fica desligado na sessão. O 503
  **`limite_indisponivel`** (o banco não confirmou a espera — a função ausente
  antes da migration, ou um erro) é diferente: sai como recusa com a frase
  ("a Pinbank não foi consultada") e o botão NÃO fica desligado na sessão.
- **Recusas com frase da rota** (400, 403, 404, 409, 422, 429, 500, 502) → a
  frase, com "Nada foi alterado." quando ela ainda não diz. O **429** traz os
  segundos que faltam — e o número, que o botão espera (o mesmo que a frase
  diz); o **`extrato_recusado`** diz que a Pinbank recusou ou
  respondeu sem a lista.
- **Falha SEM a frase da rota** (o 504 da plataforma quando a função passa de
  60 s, uma página de erro no caminho, ou o tempo de espera da tela — 75 s —
  acabando) → `falhaDaConferenciaSemCorpo` (`core/pinbank/conferencia`): 5xx e
  tempo esgotado viram "A conferência demorou demais ou falhou. Nada foi
  alterado. Tente de novo em alguns minutos, ou com um período menor."; o
  resto, a frase genérica. O número do status fica só no CÓDIGO
  (`http_504`) — "A conferência respondeu 504" não diz a quem opera o que
  fazer.
- **Vazio** (nada dos dois lados) → uma frase, sem tabela.
- ⚠️ **"Numeração não confirmada" e "extrato sem vendas desta maquininha"
  NÃO chegam à empresa como estado do relatório inteiro.** O relatório inteiro
  só sai com uma venda em comum atestada (ou com nada dos dois lados), e isso
  exclui os dois: eles chegam como **"Só as quantidades"** (o aviso de
  "extrato sem vendas" vai junto, porque é de um lado só). Medido sobre as
  4.096 combinações de 4 NSUs: todo relatório inteiro é "conferido". Por isso
  a tela não tem mais selo para esses estados (nem o "par provável" ao lado
  dele, nem o selo "Taxa sem conclusão" aparece na prática) — um texto num
  ramo morto daria a confiança falsa que as regras de guarda condenam. A
  explicação da numeração e do código do estabelecimento mora no bloco que a
  empresa vê, e diz "numeração", nunca "chave": numa tela de pagamentos,
  "chave" lê como chave Pix ou senha.
- **Só as quantidades** (`soContagens`, nenhuma venda em comum atestada) → o
  bloco `SoContagens`, que a tela desenha ANTES de qualquer situação: o selo
  "Só as quantidades" com o "i" (`InfoHint`: o porquê, e o que cada lado
  conta — no extrato, TODAS as linhas com o código do estabelecimento,
  inclusive as de fora do período e as ilegíveis, e quantas vendas com número
  elas têm; no sistema, as parcelas VÁLIDAS lançadas com a venda no período —
  sem as canceladas nem as vendas desfeitas —, quantas vendas e a soma do
  bruto), a frase da rota, a explicação da numeração das vendas e do código do
  estabelecimento (EC), "N linha(s) do extrato · N venda(s) com número" e "N
  parcela(s) válida(s) lançada(s) · N venda(s) · R$ X" (substantivos
  DIFERENTES de cada lado: o mesmo "parcela(s)" lado a lado convidaria à
  comparação que o motor recusa), o que ficou fora e os avisos de um lado só.
  Nenhuma linha, situação, soma do extrato ou taxa — a resposta nem os traz.
- **O lado do sistema conta só o que vale** (`resumo.lados.sistema`): antes,
  somava todo título de receita do período, inclusive o cancelado e o da
  venda com estorno total — a tela dizia "R$ 350,00 no sistema" de uma loja
  com R$ 50 de venda viva. Agora: parcelas vivas de vendas que o sistema não
  desfez.
- **O resumo por situação** tem o "i" (`InfoHint`) com o cálculo do motor: par
  por NSU + parcela; data por dia, com o dia útil seguinte aceito; bruto
  estimado = bruto da venda ÷ parcelas pela mesma divisão do sistema (a
  diferença de centavos na última); taxa contra a cadastrada para o tipo, com
  tolerância lida de `TOLERANCIA_TAXA_BP`. A coluna se chama "Bruto ESTIMADO
  no extrato": o número não é um que a Pinbank manda.
- **O motivo no lugar do valor ausente é o verdadeiro**: "ausente do extrato"
  / "ausente do sistema" (o lado não existe), "não informado pela Pinbank" (o
  lado existe e o valor não veio), "linha ilegível", "diferente entre as
  parcelas" (bruto inconsistente na linha "sem conclusão"); no resumo,
  "nenhuma parcela com valor deste lado" — verdadeiro também para a linha
  ilegível, que tem o lado do extrato sem o bruto estimado.
- **A taxa (MDR)** aparece em PERCENTUAL com DUAS casas (`pctDeInteiro(bp/100,
  2)`), nunca em R$. É a exceção à regra de uma casa, e de propósito: a taxa
  contratada tem duas casas e o motor acusa 0,01 ponto percentual a mais
  (1,99% contratado × 2,00% no extrato é "taxa diferente") — com uma casa, os
  dois sairiam "2,0%" ao lado de "taxa diferente". A tela diz "uma diferença
  MENOR que 0,01 ponto percentual conta como igual" e "sem arredondar a
  cadastrada". A diferença sai em pontos percentuais com o sinal escrito; nada
  colorido pelo sinal. O resumo lista quantas parcelas por resultado
  (`resumo.taxa.porResultado`).
- **Números de parcelas diferentes**: o detalhe da linha mostra quantas
  parcelas cada lado tem e o bruto da VENDA de cada lado; a parcela só do
  sistema é "3/3" (do sistema), nunca "3/1" do extrato.
- **A aba de divergências é a VISTA do motor** (`itemComDivergencia`, contagem
  `resumo.itensComDivergencia`): status divergente OU taxa diferente (ou
  cobrada sem o título dela) OU o total bruto da venda diferente nos dois
  lados. A parcela conferida com a taxa errada, ou de uma venda cujo total não
  bate, aparece nela E em "Conferidas", e a tela diz isso.
- **Só as quantidades, por causa**: a legenda abaixo da frase diz "o código
  do estabelecimento (EC) pode ser o de outra loja" SÓ na falta de venda em
  comum (`sem_venda_em_comum`); na maquininha trocada (`maquininha_excluida`)
  a frase diz que o código provavelmente está certo, e a legenda diz que o
  aviso da maquininha antiga não serve de prova enquanto o código dela não
  for confirmado — a mesma caixa não se desdiz.
- **O relatório remonta a cada conferência** (`key={consultadoEm}`): a aba, a
  página e as linhas abertas são do relatório anterior.
- **A espera do botão é a do servidor** (`ESPERA_CONFERENCIA_MS`, 60 s): o
  botão não oferece o que a rota recusaria. (Antes eram 30 s na tela e 60 s no
  servidor.)

## Defeito achado no caminho: o filtro de amostra era um proxy no servidor

`src/lib/supabase/consulta.ts` é `"use client"`. Num route handler, todo export
dele vira referência de cliente — medido no build, em
`.next/server/app/api/recorrencias/run/route.js`:
`createProxy(…/consulta.ts#semAmostra)`. No servidor, `semAmostra()` LANÇA e
`TETO_LINHAS` é uma função. Typecheck, lint e as varreduras de texto passam
assim mesmo.

A implementação foi para `src/lib/supabase/filtros.ts` (sem diretiva);
`consulta.ts` só reexporta com nome. A rota nova importa de `filtros.ts`.
Guardas: `amostra:` em `npm run consistencia` (filtros.ts sem `"use client"`,
uma implementação só, o reexport) e `conferencia-pinbank:` no `engine-audit`
(nenhum import `"use client"` na rota, na leitura e no motor).

⚠️ **NÃO foi consertado aqui**: `/api/recorrencias/run`, `/api/financial-os/run`
e `app/central/acoes.ts` continuam importando de `consulta.ts` (e de
`lib/erros.ts`, também `"use client"`). Trocar o import LIGA esses caminhos em
produção — o materializador cria ~R$ 87 mil de títulos — e isso exige a prova
de carga da sétima regra antes. Tarefa separada.

## Guardas

- `npm run pinbank-conferencia` — o motor sobre fixtures escritas à mão (a
  amostra real do dev, uma loja inteira com cada situação, a numeração não
  confirmada, extrato vazio, só de outro EC ou só ilegível, período incerto, duas
  maquininhas, vazio, títulos lidos duas vezes, cancelada sem título, venda
  cancelada pela metade, linha ilegível da mesma venda, estorno parcial com
  cancelamento, maquininha trocada, estorno cancelado e a TAXA por tipo, e a
  falha sem a frase da rota; e, da segunda revisão, a venda cancelada no
  extrato numa parcela só, o título de taxa repetido, a desfeita no sistema e
  viva no extrato, a linha ilegível sem número, a taxa da venda cancelada, o
  parcelado em 1x, a taxa cobrada sem o título dela, o aviso que atesta a
  venda em comum e os dois lados contados sem cruzar; e, da terceira revisão,
  a venda dividida em números de parcelas diferentes — 1x × 3x, 12x × 10x e a
  1022 da loja inteira —, a parcela que falta com o MESMO número de parcelas
  afirmada na borda, a tolerância estrita contra o contrato exato, o estorno
  parcial com taxa cadastrada, a taxa que a regra do sistema nem lançaria, o
  lado do sistema só com as parcelas válidas, o aviso que só atesta no dia da
  venda e a maquininha trocada; e, da quarta revisão, o TOTAL da venda
  diferente com números de parcelas diferentes — o título da última parcela
  que some, o total lançado diferente, a venda redividida com o mesmo total
  (que NÃO vai à vista pela parcela sem par) e a lacuna na numeração do
  sistema —, as linhas do extrato que discordam no número de parcelas, a
  diferença da taxa só na diferente e a regra do DIA de
  `nsusDoExtratoComAviso` provada no próprio motor), com as âncoras literais
  e **97 defeitos plantados** no motor, cada um derrubando o caso que o nomeia
  — inclusive os que restauram, um a um, os comportamentos antigos que as
  cinco revisões de 13–14/10 acharam, o ATALHO tentador (com o total diferente,
  afirmar a parcela sem par como "só no …"), e o número do status de volta na
  frase da tela. E os portões
  da rota e a leitura do banco (sobre um Supabase de mentira com o
  `max_rows` PADRÃO de 1.000 — como o do Supabase —, com DUAS empresas e os
  mesmos NSUs; o cliente sem `max_rows` só aparece pelo nome, para provar a
  lógica do teto acima de 1.000): o lote cheio que não é estouro, os tetos que
  acusam o estouro de verdade (1.000 títulos passam e 1.001 não no padrão;
  5.000 e 5.001 sem `max_rows`), o servidor que corta abaixo do teto (2.400
  títulos e 1.500 avisos cortados em 1.000), o teto POR LADO das NSUs, a
  leitura da espera que o BANCO decide (falha fechada), a espera do botão
  (no 429, o número do banco; em todo o resto, os 60 s), só as contagens de cada lado sem venda em comum
  ATESTADA (o título forjado não abre; a resposta não muda com o que a
  empresa grava), a maquininha trocada com a frase própria, a empresa do
  vínculo em toda leitura, o título da NSU do extrato lido só com o aviso do
  dia da venda e a COMPOSIÇÃO da rota sem oráculo antes do portão (um
  espelho; o `engine-audit` fixa no texto da rota as mesmas chamadas) —
  **mais 36 defeitos plantados**. Ao todo: 106 casos, 133 defeitos plantados.
- `scripts/pinbank-limite-ec.sql` (job `isolamento` do CI; arreio copiado de
  `pinbank.sql`, savepoint por caso com o MESMO EC e os mesmos
  estabelecimentos, tudo em ROLLBACK) — a FECHADURA no banco. **O limite
  (12 casos):** a empresa reserva (a linha com quem, quando e a maquininha, e
  o evento na trilha — também o da reserva REPETIDA); antes de 60 s recusa
  com o que falta SEM carimbar; o carimbo à frente do relógio da transação
  (a sessão que abriu antes da que carimbou) recusa com no máximo 60 s, nunca
  mais; OUTRO administrador da mesma empresa também espera (por empresa, não
  por pessoa — e o carimbo continua de quem chamou); exatamente 60 s passa e
  59,999 s não; a empresa B não espera pela A; o leitor, o titular de outra
  empresa, a maquininha desvinculada (inclusive com o `ativo` religado à mão),
  a INATIVA, a SEM o EC e a sessão sem usuário não reservam; anon e a chave
  de serviço nem executam a função; ninguém do cliente lê nem escreve a
  tabela. **O EC (10 casos):** o painel e o rastro (vincular e desvincular)
  com o EC; o EC vivo em OUTRA empresa recusado pela RPC com a FRASE nomeada,
  por INSERT e UPDATE diretos e ao reativar o excluído; o desvinculado que
  NÃO volta (à mão e pela lixeira do lançador); a mesma empresa com duas
  maquininhas no mesmo EC permitida; o EC liberado ao desvincular; EC zero ou
  negativo recusado; o gatilho nas colunas certas, a trava pela CHAVE do EC
  e ANTES de conferir (no texto e DE FATO, em `pg_locks`) e a RESTRIÇÃO DE
  EXCLUSÃO que trava sozinha (com o gatilho desligado, o EC de A não entra em
  B: 23P01); e a lixeira da empresa que não alcança o vínculo (o lançador
  não o exclui; a lixeira não o lista e continua listando o resto; o titular
  não o apaga de vez; e ele SAI junto com a empresa que já não existe). E
  **27 defeitos plantados dentro do arquivo**, lendo a mensagem: a recusa que
  carimba, a espera que nunca recusa, a recusa sem o teto de 60 s, a espera
  por PESSOA (nos dois jeitos: o `where` e o retorno antecipado), a RPC sem o
  portão, a que aceita o excluído, o inativo ou o sem EC; o gatilho que não
  olha outra empresa (a restrição recusa, mas sem a frase) e, sem a
  restrição, o EC vivo em DUAS empresas; o gatilho e a restrição que recusam
  as irmãs; o gatilho e a restrição em que o excluído prende o EC; o EC ≤ 0
  aceito; a trava depois de conferir, pela linha, pela empresa e EC, e no
  texto mas num ramo que nunca roda (só `pg_locks` o pega); a restrição
  tirada; a reativação aceita; a exclusão por qualquer um; a lixeira que lista
  o vínculo; o apagar por qualquer um; o apagar recusado até junto com a
  empresa; e o desvincular sem a marca. Provada também de fora (14/10): sem o
  gatilho do ciclo reprova no E4 ("não foi recusado pelo ciclo da
  plataforma"), sem a restrição no E8, e a RPC antiga (sem `ativo` e sem EC)
  no L7b — cada uma com a frase do caso.
- **A corrida de duas sessões** (medição, fora do CI): o mesmo EC gravado ao
  mesmo tempo em duas empresas — em READ COMMITTED a segunda recebe a FRASE
  (a trava pelo EC a faz esperar e conferir depois); em REPEATABLE READ a
  RESTRIÇÃO recusa (23P01); em SERIALIZABLE, 40001. Sem a restrição, em
  REPEATABLE READ as DUAS empresas ficavam com o EC (o gatilho confere com o
  retrato da transação, tirado antes de esperar a trava) — é por isso que a
  trava é a restrição, e o gatilho só diz o motivo.
- **A varredura aleatória** (quarta e quinta revisões, fora do `npm test`, uma
  medição — não uma guarda): ~220 mil cenários de 1 a 6 vendas, o lado do
  sistema montado pelo PLANEJADOR real, a leitura real sobre um PostgREST de
  mentira e cada invariante conferida contra a verdade do gerador, nunca
  contra o raciocínio do motor (provada derrubando 6 defeitos plantados). Foi
  ela que achou o total escondido, a linha sem código e o dia vizinho. O que
  ela ainda acha depois da quinta revisão cai TODO nos resíduos declarados: o
  NSU diferente nos dois lados (D8 — o par provável é a evidência), as linhas
  do extrato que discordam no número de parcelas, e a venda redividida em que
  o número deduzido coincide.
- `npm run audit`, bloco `conferencia-pinbank:` — a ordem dos portões, o EC só
  do vínculo, a chamada sem opção de teste, sucesso só com a lista e o código
  de sucesso (`extratoServeParaConferir`), a espera por empresa antes da
  Pinbank, o relatório pela restrição de contagens, o `org_id` do vínculo em
  toda leitura, um registro por chamada sem valor, a resposta
  sem vazamento (o número da espera só no 429), a credencial intocada, a
  espera pedida ao BANCO pelo vínculo depois da janela e antes da Pinbank,
  com 429 (frase E número) e a falha fechada (503) e nenhum mapa por
  instância, o número e a ação da migration do limite iguais a
  `ESPERA_CONFERENCIA_MS` e `ACAO_CONFERENCIA`, a reserva só do vínculo vivo,
  ativo e com EC, o texto que diz que o evento prova a RESERVA (não a
  chamada), o botão que espera o número do 429, a última definição do painel
  com o EC, o rastro do vínculo com o EC, o gatilho do EC (outra empresa, a
  trava pela chave do EC ANTES de conferir — ordem e chave numa regex só —,
  colunas, recusa nomeada), a restrição de exclusão com a `btree_gist` fora de
  `public`, o ciclo do vínculo (reativar nunca, excluir só com a marca do
  desvincular, apagar só sem a empresa), a lixeira que não o lista, o acervo
  que recusa pela classe e pela contagem (nunca o EC nem a empresa) e nunca
  apaga, e o `/admin` com o EC (três estados: o número, "—" e "não informado
  pelo servidor") e a frase do banco, `PINBANK_CONFERENCIA` lida só em
  `lib/pinbank/api.ts`, nenhuma escrita, os filtros de leitura, nenhum módulo
  `"use client"`, a permissão na empresa do vínculo, a tela, e o EC obrigatório
  no vínculo da plataforma, e as regras da tela das revisões de 13/10 (o
  relatório que remonta, "Bruto estimado no extrato", o "i" com o cálculo do
  motor, o motivo verdadeiro no lugar do valor, "numeração das vendas" e o
  código do estabelecimento — nunca "chave" — no bloco só de contagens (o que
  a empresa vê), o "i" desse bloco com o que cada lado conta, as duas frases
  de só as quantidades com o número no mesmo dia e o caminho do suporte, a
  aba de divergências pela vista do motor, nenhuma linha sem venda em comum,
  a espera igual à do servidor, o status HTTP fora da frase e o tempo de
  espera da chamada; e o bloco só de contagens desenhado antes de qualquer
  situação, com a legenda por causa — "outra loja" só sem venda em comum,
  nunca ao lado da maquininha trocada). E a rota é a COMPOSIÇÃO que a guarda
  de comportamento espelha: `lerDetalhesPorNsu(s, v.org_id,
  nsusParaDetalhar(janela.dados, extrato.resposta.linhas, ec))` depois da
  janela e `titulos: [...janela.dados, ...detalhes.dados.titulos]` no motor
  (sem isto, a rota podia se afastar do espelho com a guarda verde). Os dois braços do filtro de leitura (`semAmostra` E o `.limit`
  de cada leitura de `movements`). Cada asserção com o defeito plantado ao
  lado.
- `npm run consistencia`, bloco `amostra:` — `filtros.ts` sem `"use client"`,
  uma implementação só (cada um dos três braços — `semAmostra`, `comTeto`,
  `TETO_LINHAS =` — plantado de volta em `consulta.ts` é acusado) e o
  reexport com nome (sem ele, ou trocado por `export *`, é acusado).
- `npm run pinbank-api` — o código de autorização e o NSU da loja passam pela
  lista de permitidos; os dados pessoais continuam fora; o `ValorTaxaAdm` é
  lido como PERCENTUAL em pontos-base (lê-lo como reais de novo reprova) e o
  resumo nunca soma taxa. E a recusa com a lista vazia (ResultCode 4 com o
  `Data` cifrado `[]`, pelo servidor de mentira) não serve para conferir.

## Decisões (do dono) — como estão em 14/10/2026

Respondidas: **D6** (pela Pinbank) e, em parte, **D7**. **D4** e **D10**
implementadas no código em 14/10/2026 (valem com as migrations aplicadas — o
merge aplica). Abertas: as demais. O interruptor fica DESLIGADO enquanto D2
não for cumprido.

- **D1 — o nível de permissão. EM ABERTO.** `administrar` (padrão; o mesmo de
  configurar e reprocessar) × `fechar`, que daria a conferência também ao
  fechador e ao **contador externo** — um terceiro disparando chamadas com a
  credencial da plataforma. Fixado em `ACAO_CONFERENCIA`, com guarda.
- **D2 — quem liga e quando. EM ABERTO, com as condições escritas.** Os dois
  interruptores (`PINBANK_CONFERENCIA=ligado` E `PINBANK_API_AMBIENTE=producao`).
  Em 14/10/2026 a Pinbank liberou o ExtratoPos também na credencial de
  produção (BaaS, canal 1919 — e-mail "Sua credencial foi atualizada", com o
  `ExtratoPosEncrypted` na lista); até a Vercel apontar para ela, o botão
  segue recusando com "modo de teste". Condições para ligar: (a) uma venda
  REAL de produção conferida contra o ExtratoPos da BaaS — **EM ABERTO** (as
  primeiras vendas reais chegaram pelo webhook no mesmo dia, ainda na
  quarentena); (b) o limite durável no servidor (D4) e (c) o EC visível,
  auditado e único entre empresas no `/admin` (D10) — **IMPLEMENTADOS no
  código em 14/10/2026** (migrations `20261014120000` e `20261014120100`),
  valendo quando estiverem aplicadas em produção (ver a nota do `migrar`
  abaixo); (d) o `max_rows` do PostgREST de produção conferido — **EM
  ABERTO**: com o padrão de 1.000 (o PADRÃO do servidor de mentira da guarda,
  desde a terceira revisão), a janela recusa ("vendas demais") qualquer
  período com mais de 1.000 títulos, cerca de 42 vendas em 12x, muito abaixo
  do teto de 5.000; se for menor que 5.001, as leituras passam a paginar com
  `.range()` em passos de `max_rows` até o teto (código, sem migration) em vez
  de recusar.
  - ⚠️ **O MERGE APLICA AS MIGRATIONS EM PRODUÇÃO** (medido em 14/10/2026). O
    job `migrar` do `ci.yml` roda em todo push ao `main` (depois do `verify`)
    com o segredo `SUPABASE_DB_URL_MIGRACAO` — que EXISTE: no merge do PR #183
    o log diz "Applying migration 20261009120000_enterprise_libera_pro.sql…
    Finished supabase db push", e no do #190 "arquivos: 111 · aplicadas: 111".
    Então "o dono aplica depois do merge" é o próprio merge: o OK do PR é o OK
    das duas migrations.
  - ⚠️ **O que a recusa da D10 faz, de verdade.** A D10 se RECUSA se produção
    já tiver EC vivo repetido entre empresas ou EC vivo que não é positivo. O
    `supabase db push` aplica uma migration por vez: a D4 fica aplicada, a D10
    não — e, como o `push` para na primeira que falha, **a cada push ao `main`
    ele tenta a D10 de novo e NENHUMA migration seguinte é aplicada** até
    alguém resolver o conflito (o A4P-086 de volta: código publicado sem o
    esquema). A recusa diz a CLASSE e QUANTOS, nunca o EC nem a empresa: o
    log do Actions é PÚBLICO (o repositório é público). O mesmo vale se o
    papel de migração não puder criar a extensão `btree_gist` (a migration
    falha nomeada; no Supabase ela é liberada ao `postgres`, como no local).
  - ⚠️ **Conferir o acervo ANTES do merge — no SQL Editor do Supabase, não no
    `/admin`.** Antes da D10 o `/admin` não mostra o EC em lugar nenhum (é
    ela que o põe no painel; só o cartão de Integrações de cada empresa o
    mostra). As duas consultas da recusa, só de leitura:

    ```sql
    -- EC vivo em mais de uma empresa (tem de voltar vazio)
    select v.codigo_cliente, count(distinct v.org_id) as empresas,
           string_agg(distinct o.name || ' (' || v.org_id || ')', '; ') as quais,
           string_agg(v.id::text || ' · estab ' || coalesce(v.estabelecimento_id::text, v.chave_gateway), '; ') as vinculos
      from public.pinbank_vinculos v join public.organizations o on o.id = v.org_id
     where v.excluido_em is null and v.codigo_cliente is not null
     group by v.codigo_cliente
    having count(distinct v.org_id) > 1;

    -- EC vivo que não é positivo (tem de voltar vazio)
    select v.id, o.name as empresa, v.estabelecimento_id, v.codigo_cliente
      from public.pinbank_vinculos v join public.organizations o on o.id = v.org_id
     where v.excluido_em is null and v.codigo_cliente is not null and v.codigo_cliente <= 0;
    ```

    Com linha em qualquer uma: desvincular no `/admin` o vínculo errado (com
    motivo) ANTES do merge.
  - ⚠️ **O `migrar` só espera o `verify`.** O job `isolamento` — onde rodam a
    guarda `pinbank-limite-ec.sql` e as outras de banco — é portão do PR,
    não da aplicação no `main`: a prova das migrations é o CI verde do PR.
  - ⚠️ **A janela do deploy.** A Vercel publica o código em paralelo (sem
    `needs:`): entre o deploy e o `migrar`, a rota responde 503
    `limite_indisponivel` se alguém conferir (com o interruptor desligado,
    ninguém chega lá), e o `/admin` mostra "EC não informado pelo servidor"
    — nunca "EC —", que diria "não cadastrado" de um vínculo que TEM EC.
- **D3 — o OK do merge. EM ABERTO.** Caminho novo, alcançável pela empresa,
  que chama a Pinbank com a credencial da plataforma: muda quem pode chamar o
  quê. O PR espera o OK do dono.
- **D4 — limite de chamadas. IMPLEMENTADO no código (14/10/2026), vale
  quando a migration `20261014120000_pinbank_conferencia_limite` estiver em
  produção (o merge a aplica).** A espera de 60 s por empresa mora no BANCO:
  `pinbank_conferencia_reservar(p_vinculo)` confere e carimba numa instrução,
  pela empresa do vínculo vivo, ATIVO e COM o EC (as pré-condições da rota, de
  novo no banco), exigindo `administrar` nela; a recusa não carimba; a rota
  falha FECHADA (503 `limite_indisponivel`) sem a resposta do banco; o 429
  leva o número e o botão espera ESSE tempo. O mapa por instância saiu. ⚠️ O
  evento da trilha prova a RESERVA, não a chamada à Pinbank (a função direta
  também reserva, e membros da empresa inserem na trilha): o rastro da
  chamada é o log do servidor. Provado em `begin … rollback` (executa,
  reaplica, a guarda `pinbank-limite-ec.sql` verde, os defeitos plantados
  derrubam o caso certo) e com duas sessões ao mesmo tempo (só uma passa). E o
  volume: a leitura não trunca calada nem quando o servidor corta abaixo do
  teto (`count: "exact"` na janela, nos títulos e nos avisos pelo NSU) — mas o
  `max_rows` de produção decide até onde a conferência vai sem pedir período
  menor (D2 (d)). ⚠️ Resíduo declarado: a espera é por EMPRESA, não por
  credencial — N empresas diferentes chamam N vezes por minuto (o teto global
  da credencial da plataforma, se a Pinbank tiver um, é outra decisão).
- **D5 — um "aplicar" futuro. EM ABERTO — é a próxima fase.** Atualizar
  `due_date` (e a taxa) dos títulos `previsto`/`confirmado` pelo extrato? Se
  sim: só título em aberto, nunca baixado/conciliado, com motivo e trilha, por
  UMA RPC, em PR próprio com migration. Inclui decidir se o título de taxa
  passa a ser recalculado pelo MDR do extrato (D6b).
- **D6 — o sentido da taxa: RESPONDIDO pela Pinbank em 13/10/2026.** "Taxa ADM
  seria o MDR, são todas em percentual. Aqueles são valores para fins de
  testes." Entrou na versão 1.1.0 do motor como eixo SEPARADO do status (data
  errada e taxa errada aparecem as duas), lido em pontos-base inteiros, e a
  tela o mostra em percentual com duas casas. Fica em aberto: (a) o contrato
  tem UMA taxa por forma, e o MDR real pode variar por bandeira ou por número
  de parcelas — hoje a diferença aparece como divergência contra o que foi
  cadastrado; (b) recalcular o título de taxa pelo MDR do extrato é escrita —
  entra com o D5; (c) voucher e Pix no extrato seguem "tipo desconhecido" até
  se ver como a Pinbank os escreve; (d) **o contrato que MUDOU depois da
  venda**: a comparação é contra a taxa cadastrada HOJE no vínculo, não contra
  a que valia quando a venda foi lançada. Se o sistema lançou 1,99%, o extrato
  cobrou 1,99% e o cadastro passou depois a 2,65%, a parcela sai "taxa
  diferente" embora o extrato e o sistema concordem; no inverso, a taxa em
  branco na hora da venda e cadastrada depois sai "igual" — este caso a
  segunda revisão passou a acusar pelo sinal `taxa_sem_titulo_no_sistema` (o
  título de taxa que falta). Comparar com o que valia na data pede o contrato
  VERSIONADO (vigência por taxa) — migration, em aberto; (e) **a última parte
  negativa de `dividir`** (`core/vendas/pos`, anterior a esta etapa): com o
  total pequeno diante das parcelas (taxa total < 0,005 × n × (n − 1) — em
  12x, menos de R$ 0,66 de taxa, vendas de até ~R$ 21 a 3,1%), a última parte
  sai negativa, e o planejador grava títulos de taxa que somam MAIS que o
  contratado (R$ 10 em 12x a 3,10%: 11 × R$ 0,03 = R$ 0,33 para R$ 0,31) e
  nenhum na última parcela. A conferência já não acusa a parcela sem título
  (a regra do sistema não lançaria taxa nela); consertar a divisão é tarefa
  separada — muda o valor de títulos lançados e pede a prova de carga.
- **D7 — bruto da parcela, split e líquido. RESPONDIDO EM PARTE.** A Pinbank
  disse que os do dev (bruto da parcela e split a 75% do bruto, líquido a
  ~48,7% da parcela) são valores de TESTE — então nada se conclui deles. O
  sentido em produção segue em aberto: nenhum dos três é comparado, e a tela
  os mostra como "aguardando definição", nunca em R$.
- **D8 — a equivalência do NSU. EM ABERTO (pergunta feita à Pinbank).** O
  `nsu` do webhook é o `NsuOperacao` do extrato? Se forem diferentes, a chave
  do casamento muda. Enquanto nenhum NSU for comum aos dois lados, o motor não
  afirma nada ("numeração não confirmada"), a rota devolve só as quantidades
  e o par provável (pelo NSU da loja ou pelo código de autorização no mesmo
  dia e valor) é a evidência para responder.
- **D9 — o repasse estimado. EM ABERTO.** O `plano.ts` deveria postergar a
  estimativa para o dia útil? Tiraria o "conferida no dia útil seguinte"
  sistemático, mas move o fluxo de caixa dos títulos novos.
- **D10 — EC de outra empresa. A CORREÇÃO DURÁVEL ESTÁ IMPLEMENTADA no código
  (14/10/2026), vale quando a migration `20261014120100_pinbank_ec_auditado`
  estiver em produção (o merge a aplica).** Até ela, não há unicidade de
  `codigo_cliente` entre empresas: um erro de digitação no `/admin` deixaria
  uma empresa ler o extrato de outra — de outro cliente da Quattro ou de
  qualquer lojista da Pinbank no mesmo canal (a credencial lê todo EC do
  canal). **Mitigação desta rodada, só código:** sem nenhuma venda em comum
  ATESTADA pelo aviso da Pinbank, a resposta leva só as contagens de cada lado
  (`relatorioParaEmpresa` → `RelatorioSoContagens`) — sem situação, soma do
  extrato, taxa ou aviso que cruze os lados —, a tela não desenha nenhuma
  linha, e cada chamada deixa o rastro com o EC no log. A segunda revisão
  fechou os dois furos da primeira mitigação: (1) o portão contava o título,
  que a empresa grava — um título forjado com o NSU alheio abria o extrato
  inteiro; agora conta o aviso, que só a plataforma grava; (2) as contagens
  por situação e por resultado de taxa respondiam ao que a empresa grava (o
  valor do título forjado, a taxa cadastrada) — eram um oráculo; agora não
  saem. A terceira revisão fechou mais dois: (3) o atestado aceitava o aviso
  de QUALQUER data (anos de avisos, inclusive negados) — agora a prova é a
  NSU e o DIA DA VENDA; (4) as leituras antes do portão eram um oráculo pelo
  422 (o teto da UNIÃO das NSUs e os títulos lidos por toda NSU do extrato) —
  agora cada lado tem o seu teto e os títulos de NSU do extrato só são lidos
  com o aviso desta empresa no dia da venda, e a guarda prova a composição da
  rota (que o `engine-audit` fixa no texto dela). ⚠️ Resíduo conhecido: a
  contagem de linhas e vendas do extrato do EC pedido continua saindo (é o
  que diz à empresa que o EC pode estar errado), e uma venda real desta
  empresa com a MESMA NSU no MESMO dia de uma venda de outra loja abriria os
  detalhes (e, só nessa coincidência, a leitura dos títulos daquela NSU) — só
  se a numeração da Pinbank se repetir entre lojas no mesmo dia (pergunta
  junto com D8). Do mesmo tamanho, do lado da leitura: ela aceita o aviso de
  QUALQUER maquininha da empresa (também a trocada) e lê os títulos pela
  coluna `nsu` — então o 422, `outraMaquininha` e `lados.sistema` só mudam
  com o extrato alheio quando uma NSU dele é igual a uma NSU da própria
  empresa NO MESMO DIA, a mesma coincidência. **A correção durável (migration `20261014120100`):** (a)
  `admin_pinbank_painel` devolve o `codigo_cliente` (mesma assinatura, mesmo
  portão) e o `/admin` o mostra ao lado de cada vínculo — em TRÊS estados: o
  número, "EC —" (o painel disse que não há) e "EC não informado pelo
  servidor" (o painel antigo, sem o campo — "—" ali afirmaria a ausência de
  um EC que existe); (b) `admin_pinbank_vincular` grava o `codigo_cliente` no
  `admin_audit`, e `admin_pinbank_desvincular` também (o rastro diz qual EC
  saiu); (c) o banco RECUSA o EC vivo repetido ENTRE EMPRESAS por uma
  **RESTRIÇÃO DE EXCLUSÃO** (`pinbank_vinculos_ec_uma_empresa_excl`: `exclude
  using gist (codigo_cliente with =, org_id with <>) where (excluido_em is
  null and codigo_cliente is not null)`, com a `btree_gist` no esquema
  `extensions`) — para QUALQUER escritor e em QUALQUER nível de isolamento. O
  gatilho `pinbank_vinculos_ec_uma_empresa` (BEFORE INSERT OR UPDATE OF
  `codigo_cliente`, `org_id`, `excluido_em`) fica para DIZER o motivo: a frase
  "A4P-PINBANK: o código do estabelecimento no extrato (EC) N já está
  vinculado a outra empresa." (`unique_violation`, com a dica do que fazer),
  que chega ao `/admin` inteira, e o EC que não é positivo (`check_violation`);
  em READ COMMITTED (o das RPCs) a trava `pg_advisory_xact_lock` pela chave do
  EC, ANTES de conferir, faz a segunda gravação esperar a primeira e receber a
  frase. ⚠️ A trava do gatilho SOZINHA não bastava (achado da revisão,
  medido com duas sessões): em REPEATABLE READ o gatilho confere com o retrato
  da transação, tirado antes de esperar a trava, e as DUAS empresas ficavam
  com o EC; com a restrição, a segunda é recusada (23P01; em SERIALIZABLE,
  40001). A MESMA empresa com várias maquininhas no mesmo EC continua
  permitida (as irmãs da conferência); o vínculo excluído não conta
  (desvincular libera o EC). (d) **O CICLO DO VÍNCULO É DA PLATAFORMA**
  (gatilho `pinbank_vinculos_ciclo_da_plataforma`, BEFORE UPDATE OF
  `excluido_em` OR DELETE, para qualquer escritor). Achado da revisão: a
  lixeira genérica (`restaurar_logico`, `excluir_logico`, `lixeira_expurgar`,
  que alcançam toda tabela com `excluido_em`) deixava a EMPRESA — com o papel
  de LANÇADOR — desfazer o desvínculo da plataforma: o vínculo voltava vivo
  com o EC dentro, a reserva da conferência voltava a aceitá-lo, o webhook
  voltava a lançar as vendas daquela loja na empresa, e o `admin_audit` não
  dizia nada; e deixava o lançador tirar a maquininha e o titular apagá-la de
  vez, sem o rastro da plataforma. Agora: REATIVAR nunca (religar é vincular
  de novo, linha nova, com rastro); EXCLUIR só dentro de
  `admin_pinbank_desvincular`, que liga a marca `a4p.pinbank_desvincular`
  (local à transação, com o id do vínculo) só durante o UPDATE dela; APAGAR
  só junto com a empresa (quando ela já não existe — a cascata); e
  `lixeira_listar` não lista o vínculo (ele aparecia para todo membro, até o
  leitor, com o e-mail do administrador da plataforma e o motivo dele, ao
  lado de um "Restaurar" que agora seria recusado). A migration CONFERE o
  acervo antes e se RECUSA pela classe e pela contagem — nunca escreve o EC
  nem a empresa (o log do CI é público); as consultas que nomeiam o conflito
  estão na nota do `migrar`, em D2 — e não apaga nada. ⚠️ **Fora de escopo,
  declarado:** não há RPC de EDIÇÃO do EC — corrigir um EC errado continua
  sendo desvincular (com motivo, auditado) e vincular de novo. O resíduo de
  cima (a contagem do extrato do EC pedido e a coincidência de NSU no mesmo
  dia) continua: a unicidade impede o EC de OUTRA EMPRESA da Quattro, não o EC
  de um lojista da Pinbank que não é cliente (só a plataforma, ao digitar,
  confere isso com a Pinbank).
- **D11 — as regras de borda. EM ABERTO.** Aceitar "borda", "recente
  (hoje/ontem)", Pix sem conclusão e o calendário só nacional (feriado
  municipal aparece como "data diferente" de +1).
- **D12 — a maquininha trocada, de vez. EM ABERTO.** Hoje a venda de um
  vínculo excluído fica sem conclusão porque a leitura não vê o EC do vínculo
  excluído (a política esconde `excluido_em`). Separar "excluído com o MESMO
  EC" (é desta conferência) de "excluído com OUTRO EC" (é de fora) pede ler o
  `codigo_cliente` dos vínculos excluídos da empresa — uma função de leitura
  nova, em migration própria. ⚠️ **Efeito na tela, até lá:** um período
  ANTERIOR à troca só tem avisos da maquininha antiga, que não atestam (ela
  não é deste estabelecimento vivo) — a empresa vê **só as quantidades**. Para
  o suporte não ir conferir um EC que está certo, a resposta leva o código
  `maquininha_excluida` e a frase própria ("Vendas deste extrato chegaram, no
  dia delas, pelo aviso de uma maquininha que não está mais vinculada à
  empresa: o período é provavelmente anterior à troca de maquininha…"). O
  sinal é de um lado só (linhas do extrato × avisos), sem oráculo. Aceitar
  esses avisos como atestado abriria o extrato de qualquer loja cujo EC a
  maquininha antiga tivesse — não se faz sem ler o EC dela (esta decisão).

## Fora desta etapa

Atualizar títulos pelo extrato · derivar a taxa em reais do percentual ·
comparar bruto da parcela, split ou líquido · RPC de edição do EC (corrigir é
desvincular e vincular de novo) · limite por CREDENCIAL (o de 14/10 é por
empresa) · histórico de conferências · teste ponta a ponta da rota contra o
Supabase local e a Pinbank de mentira · tirar o INSERT de `authenticated` em
`audit_log` (hoje qualquer membro da empresa insere um evento com o `usuario`
que quiser — anterior a esta rodada, decisão à parte e com guarda; por isso o
evento da reserva prova a reserva, e o rastro da chamada à Pinbank é o log do
servidor).
