# A maquininha da Pinbank no ERP (05/10/2026)

Pedido do dono: *"qualquer venda e transação que ocorrer em uma maquininha
vinculada a um cliente nosso reflita no sistema do ERP"*. Fonte: o manual de
APIs da Pinbank (`pbdocprod.apidog.io` / `doc.pinbank.com.br`), seções de
Webhooks e de Compra.

## O que entra, e por onde

A Pinbank avisa por **webhook** (`POST`, assinatura Ed25519, entrega "pelo
menos uma vez" e fora de ordem). A integração consome os dez eventos `Compra.*`
(cartão e Pix da maquininha): pendente, realizada, negada, cancelada, desfeita,
reembolsada, e os quatro de Pix.

```
Pinbank ──POST──▶ /api/pinbank/webhook
                   1. interruptor (PINBANK_WEBHOOK=ligado)
                   2. assinatura Ed25519 sobre o corpo BRUTO (kid → chave)
                   3. envelope (EventId UUID, Webhook-Id = EventId)
                   4. GUARDA o evento sem dado sensível (pinbank_eventos)
                   5. contexto → plano puro → pinbank_aplicar (uma transação)
```

| Evento | O que acontece no ERP |
| --- | --- |
| Venda aprovada | documento em `sales_docs` + por parcela a receita bruta a receber e a taxa a pagar, na data do repasse |
| Pendente, negada sem venda, Pix expirado | só registra o estado |
| Cancelada / desfeita | cancela os títulos que ainda não se moveram; o que já caiu na conta vira **estorno** (saída, dedução do DRE) |
| Reembolsada (parcial) | estorno só da diferença, e só o que ainda não foi estornado |
| Aprovada **atrasada** depois de cancelada | nada — o ciclo só anda para a frente |

## As decisões, com o motivo

- **O vínculo tem duas chaves.** A plataforma liga o estabelecimento à empresa
  (`/admin`); a empresa ATIVA em Integrações (conta do repasse e taxas). Se a
  empresa pudesse se vincular sozinha, bastaria digitar o número da loja vizinha
  para receber as vendas dela. Um estabelecimento vivo pertence a UMA empresa
  (índice único global).
- **A venda da Pinbank é a mesma venda da maquininha** (`core/vendas/pos`):
  mesmas categorias, mesma forma (bruto a receber + taxa a pagar por parcela, na
  mesma data). O documento é traduzido por `core/vendas/documento`, o tradutor
  da tela — duas portas para a mesma venda com regras diferentes divergiriam.
- **A data e a taxa são do contrato, não da Pinbank.** O webhook não traz a
  data futura de pagamento nem a taxa cobrada (só o extrato consolidado,
  `ExtratoPos`, traz). O repasse é estimado pelos prazos e taxas do vínculo,
  e continua estimado: a conferência com o extrato (13/10/2026,
  `docs/rodada-10/conferencia.md`) só LÊ e compara — nenhum título muda por
  ela. Levar a data e a taxa do extrato aos títulos é a próxima fase (D5 de
  `conferencia.md`). Taxa em branco = venda sem o custo, com aviso — nunca uma
  taxa inventada.
- **A TARIFA FIXA e a ANTECIPAÇÃO também são do contrato** (14/10/2026,
  medidas no extrato de PRODUÇÃO). Três vendas de R$ 9,99 numa maquininha com
  o repasse antecipado mostraram duas cobranças que o vínculo não sabia
  guardar: uma tarifa FIXA de R$ 1,00 por venda, tirada ANTES da taxa da forma
  (que é cobrada sobre o que sobra, R$ 8,99), e a antecipação do repasse no
  crédito, a 1,55% ao mês pela regra do simulador de taxas
  (`fracaoDeAntecipacao`, agora em `core/vendas/pos`: 1x = um mês; n ≥ 2 =
  juro composto por dia × 15 × (n + 1) dias). A Pinbank depositou R$ 8,91 no
  débito (0,88%), R$ 8,69 no crédito à vista (1,81% + 1,55%) e R$ 8,56 no 2x
  (2,46% + 2,31%), repartidos em R$ 4,28 + R$ 4,28 — e o sistema lançava R$
  9,90, R$ 9,81 e R$ 9,74. Agora:
  - o vínculo guarda `tarifa_fixa` (em REAIS, até R$ 100, em centavos — a
    única chave do `taxas` que não é fração) e `antecipacao_mes` (fração ao
    mês, de 0 a 10%: o "15,5" digitado no lugar de "1,55" levaria 137% da
    venda), e o banco recusa a faixa errada, a chave que o contrato não tem e
    a taxa em texto (migration `20261015120000`, guarda `scripts/pinbank.sql`,
    caso 5c, com 9 defeitos plantados);
  - o planejador (`custosDaVenda`, UMA conta para o lançamento e para a
    conferência) lança, por parcela, além da receita e da taxa, o título da
    tarifa (`:f`, dividida pelas parcelas, na categoria da taxa) e o da
    antecipação (`:a`, só com o repasse antecipado e só no crédito, em
    "Antecipação de recebíveis"), todos na data do repasse — o caixa fecha no
    que a Pinbank deposita. Antecipado sem a antecipação cadastrada: a venda
    entra sem esse custo e o evento AVISA;
  - **o que a revisão adversarial achou** (antes do merge, tudo consertado e
    com guarda): a tarifa só nas formas de CARTÃO, as medidas (débito,
    crédito à vista e parcelado) — Pix, voucher e a forma não identificada
    entram sem ela, e o evento avisa; a antecipação nunca passa do que sobra
    da venda depois da taxa (o líquido para em zero, e o evento avisa); com a
    taxa da forma em branco e a tarifa cadastrada, o aviso diz que a venda
    entrou SÓ com a tarifa; e o CUSTO se reparte por `dividirCusto`
    (`core/vendas/pos`) — a divisão de `dividir` quando a última parte fica
    de pé (a que bateu, parcela a parcela, com o 2x da Pinbank: R$ 0,21 de
    antecipação → 0,11 + 0,10) e centavos inteiros com o resto na ÚLTIMA
    quando ela sairia negativa (R$ 1,00 de tarifa em 18x lançava 17 × R$ 0,06
    = R$ 1,02, e a 18ª parcela ficava sem título). A venda da maquininha
    PRÓPRIA (`titulosDaVendaPos`) segue repartindo a taxa por `dividir`: a
    mesma classe, anterior a esta etapa, tarefa separada (muda títulos já
    lançados e pede a prova de carga);
  - **no DRE, a tarifa fica com o MDR (Despesas Variáveis, acima do EBITDA) e
    a antecipação DE RECEBÍVEL vai ao Resultado Financeiro** (decisão do
    dono): é custo de dinheiro, não de vender. A regra é UMA
    (`ehAntecipacaoDeRecebiveis`, em `core/indicadores/classificacao`) para os
    dois classificadores e exige o CONTEXTO do recebível (recebível, cartão,
    adquirente, maquininha, crédito, repasse, taxa, custo, juros, deságio):
    "antecipação" sozinha também é o adiantamento de salário, a fornecedor,
    de cliente, de lucros e o IRPJ mensal, e a primeira versão os levava
    todos ao Resultado Financeiro (achado da revisão). O tributo nunca casa,
    nem com o contexto ("ICMS antecipação" e "custo de antecipação do ICMS"
    seguem imposto), "despesa antecipada" não é recebível, e o que a regra
    não pega segue a linha que já tinha. Medido antes: nenhum lançamento de
    produção dizia "antecipação";
  - a tela de Integrações tem "Tarifa fixa por venda" (campo de moeda) e
    "Antecipação (% ao mês)", de 0 a 10%, com o aviso quando o repasse é
    antecipado e a antecipação está em branco.
  Provado ponta a ponta no Supabase local: as três vendas, assinadas como a
  Pinbank as assina, viraram títulos com o líquido de R$ 8,91, R$ 8,69 e R$
  8,56, e o DRE da empresa fechou com EBITDA de R$ 26,51 e resultado de R$
  26,16 (a soma do depositado). Guardas: o bloco `pinbank (real)` do
  `engine-audit` (os três casos com os valores literais, e 13 defeitos
  plantados acusados pelo nome; mais 8 dos achados da revisão — a divisão
  de volta a `dividir` e sempre no piso, a tarifa em toda forma, a
  antecipação sem o teto e sem o limite do que sobra, o aviso antigo e a
  regra do recebível sem o contexto e sem a recusa do tributo —, todos
  acusados).
- **A competência não se parcela**: toda parcela leva a data da venda.
- **Nenhum evento se perde.** Sem vínculo → quarentena da plataforma; vínculo
  não ativado → espera; assinatura vencida → `bloqueado` (o bloqueio suave para
  o dinheiro, não apaga a venda). Tudo entra pelo **Reprocessar**, e ativar a
  maquininha reprocessa sozinho.
- **Dado sensível não entra**: BIN, PAN, assinatura eletrônica, responsável do
  sub-estabelecimento e documento da subcredenciadora saem na rota, e o banco
  recusa o payload que os traga.
- **O código de resposta é contrato**: 401/400 não são reenviados pela Pinbank;
  503 é. Evento guardado responde 200 mesmo quando parou num motivo nomeado.

## Guardas

- `engine-audit`, bloco `pinbank:` — envelope, sensível, centavos, forma, ciclo,
  valores e datas da agenda (incluindo 31/12 → 28/02), as duas chaves,
  cancelamento × estorno, reembolso parcial incremental, o documento, o estorno
  como dedução do DRE, a assinatura Ed25519 (rotação, adulteração, janela) e a
  ordem das portas da rota. Provado plantando oito defeitos.
- `scripts/pinbank.sql` (CI, job de isolamento) — 12 casos da fechadura no
  banco: só a plataforma vincula, um estabelecimento por empresa, quarentena,
  segunda chave, leitor não ativa, taxa em percentual recusada, venda com
  origem/espécie/autor/NSU/chave e trilha, reentrega, versão velha recusada,
  cancelamento pela máquina de estados, chave de outro NSU, dado sensível,
  assinatura vencida, isolamento. Provado plantando oito defeitos.
- `engine-audit`, bloco `saida-fixa:` e `npm run saida-pinbank` — a porta
  única para a Pinbank (07/10/2026, `docs/rodada-10/saida-fixa.md`).
- Ponta a ponta contra o banco local, com eventos assinados de verdade: venda
  3x, reentrega, assinatura adulterada (401), fora da janela (401), sem vínculo
  (quarentena), cancelamento, aprovada atrasada (ignorada), débito — e, pela
  tela, ativar a maquininha lançou as duas vendas que esperavam.

## Para ligar em produção (ordem)

1. ~~Aplicar `20261005120000_pinbank_maquininha.sql`~~ — **aplicada em
   06/10/2026** pelo job `migrar` do merge do PR #172 (110 de 110); o retrato
   de produção a registra desde o PR #173.
2. Pedir ao suporte da Pinbank o cadastro do webhook: URL
   **`https://app.quattro.finance/api/pinbank/webhook`** (o domínio oficial,
   `docs/rodada-10/dominio.md`), eventos `Compra.*`, integração com o nome
   Quattro. Duas perguntas em aberto com o dev da Pinbank:
   - ~~**"Os dois IPs"**~~ — **decidido em 07/10/2026**: são os IPs de onde
     NÓS chamamos a Pinbank (o dev confirmou "produção, IPs fixos"; na ENTRADA,
     o webhook, quem garante a origem é a assinatura Ed25519, e a Vercel não
     tem IP fixo de entrada). O dono escolheu **dois servidores próprios na AWS**
     (Lightsail São Paulo, US$ 5/mês cada) em vez do Static IPs da Vercel
     (US$ 100/mês, só no Pro) — detalhe, passo a passo e provas em
     `docs/rodada-10/saida-fixa.md`. Toda chamada à Pinbank passa pela porta
     única `src/lib/pinbank/saida.ts`.
   - ~~**O ambiente de teste envia webhook?**~~ — **respondido em 08/10/2026:
     não envia.** A primeira prova do webhook é uma venda real, de valor baixo,
     em produção, assim que a Pinbank confirmar os `Compra.*` ativos (pedidos
     em 08/10: os 10 eventos v1, configuração global do canal, sem token
     próprio).
3. Salvar a resposta de `GET https://pinbank.com.br/webhook/signing-key` em
   `PINBANK_WEBHOOK_JWKS` (recomendado pela própria Pinbank; sem ela a rota
   busca a chave — pela saída fixa — e guarda por uma hora). ⚠️ Com a JWKS
   fixa, uma ROTAÇÃO de chave ainda busca a nova; se a busca falhar, o webhook
   responde 503 (a Pinbank reenvia), nunca o 401 que perderia a venda — e JSON
   ilegível na variável também é 503, não "nenhuma chave". Sem a JWKS fixa,
   busca que falha com o cache vencido usa a chave já conhecida (até 24 h), e a
   chave pública — só ela — volta ao caminho direto se os dois servidores da
   saída fixa estiverem fora.
4. `PINBANK_WEBHOOK=ligado`.
5. No `/admin`, vincular cada estabelecimento (o código aparece na quarentena
   assim que a primeira venda chega); a empresa ativa em Integrações.

## Pendências declaradas

- **Conferência pelo extrato (`ExtratoPos`)** — **situação em 13/10/2026: a
  conferência SÓ DE LEITURA existe e está DESLIGADA.** Detalhe, portões,
  status e decisões em aberto (D1–D12) em `docs/rodada-10/conferencia.md`.
  - **O que existe:** o botão "Conferir com o extrato" no cartão da
    maquininha (só quem administra a empresa) chama
    `POST /api/pinbank/conferencia`, que casa cada parcela do ExtratoPos com o
    título `pinbank:<nsu>:<k>:r` e compara a data do repasse, o bruto da
    parcela, o cancelamento e — num eixo à parte, sem mudar o status — o MDR
    do extrato (percentual) com a taxa cadastrada no vínculo. Nada é gravado.
  - **Desligada por dois interruptores**: `PINBANK_CONFERENCIA=ligado` E
    `PINBANK_API_AMBIENTE=producao`. A credencial de produção (BaaS, canal
    1919) passou a ter o ExtratoPos em 14/10/2026 (e-mail da Pinbank "Sua
    credencial foi atualizada"); enquanto a Vercel usar a de dev (canal 47),
    o botão responde "modo de teste" — o esperado.
  - **Condições para ligar** (D2 de `conferencia.md`): conferir uma venda REAL
    de produção contra o ExtratoPos da credencial de produção; o limite
    DURÁVEL de chamadas por empresa no servidor (D4 — hoje a espera de 60 s é
    por instância); e o EC visível e auditado no `/admin` (D10). As duas
    últimas pedem migration.
  - **Medido em produção em 14/10/2026** (D7 e D8 de `conferencia.md`): o
    `nsu` do webhook é o `NsuOperacao` do extrato e o EC é o `CodigoCliente`
    (as vendas de teste chegaram pelos dois lados com o mesmo número); o
    líquido é o que a Pinbank DEPOSITA e o `ValorTaxaMes` é a antecipação ao
    mês — os dois viraram eixos da conferência; o bruto da parcela e o split
    vieram SEM a tarifa fixa e seguem só exibidos.
  - **Próxima fase:** levar a data e a taxa do extrato aos títulos (D5) — em
    PR próprio, com migration, só título em aberto, com motivo e trilha.
  - Histórico: a Pinbank emitiu a credencial de produção ("ALL4 PAY - BaaS",
    canal 1919) SEM o `ExtratoPos` (o `ExtratoEncrypted` liberado é o extrato
    da CONTA DIGITAL) e o liberou primeiro em dev; com o nosso ok, em
    produção.
  - `src/lib/pinbank/api.ts`: token OAuth2 (`/api/token`, form, com cache e
    renovação UMA vez quando o token do cache é recusado), pedido cifrado
    (`src/lib/pinbank/cifra.ts`: AES-128-CBC, chave = `KeyValue`, IV zero,
    PKCS#7, base64 — conferida contra vetores do `openssl`), cabeçalhos
    `Authorization`/`UserName`/`RequestOrigin`, tudo pela saída fixa.
    ⚠️ **O que se cifra é o pedido INTEIRO, `{"Data":{…}}`** (ver 13/10 abaixo).
    ⚠️ **Só LEITURA** (`METODOS_LEITURA`): a credencial emitida também paga,
    transfere e faz Pix — teto ZERO desses métodos no código (`extrato-pos:`).
  - `src/core/pinbank/extrato-pos.ts`: o filtro (até 31 dias, dia inteiro em
    `-03:00`), o pedido e a leitura da resposta por LISTA DE PERMITIDOS — CPF/
    CNPJ, comprador, cartão, sub-loja e agente nunca passam, nem um campo novo.
  - Teste: `GET /api/admin/pinbank-extrato?cliente=<CodigoCliente>&de=…&ate=…`
    `[&ambiente=dev|producao] [&canal=…]` (só o administrador da plataforma,
    mesmo portão da prova da saída fixa). `ambiente` e `canal` valem só para a
    chamada — testar a mesma credencial nos dois ambientes era trocar variável
    e refazer o deploy a cada rodada, e um deploy esquecido fez o teste de
    13/10 rodar em produção achando que era dev. A resposta traz
    `identificacao` (ambiente, canal e os 4 últimos da API Key), para se saber
    QUAL credencial respondeu.
    Variáveis em `.env.example` (`PINBANK_API_*`, `PINBANK_CODIGO_CANAL`).
  - Guardas: `npm run pinbank-api` (comportamento contra uma Pinbank local:
    46 casos, 36 defeitos plantados — o envelope da cifra, prazo e chave do cache do token, eco da
    senha cruzando o corte, extrato maior que o teto, chave de tamanho errado
    chegando à rota) e o bloco `extrato-pos:` do `engine-audit` (só CAMINHOS
    exatos de leitura — o valor do mapa, não o nome —, nenhum `…Encrypted` nem
    `requisicaoPinbank` fora do cliente, e a rota só diz `ok` com a lista de
    parcelas recebida: zero parcelas sem a lista é recusa, não "sem vendas").
  - **08/10/2026:** o ExtratoPos entrou na credencial "All4Pay / ERP
    Integration Produção" às 14:23 — o mesmo minuto do "Teste liberado em dev"
    da Pinbank. ⚠️ **"Mesma senha da anterior" estava ERRADO** (medido em
    13/10, comparando os e-mails sem exibir valores): são DUAS credenciais, com
    API Key e senha diferentes — "ALL4 PAY - BaaS" (Canal 1919, com os 2 IPs,
    SEM ExtratoPos) e "ERP Integration Produção" (Canal 47, sem IPs listados,
    COM ExtratoPos; a senha só apareceu em 13/10). Os testes de 08 a 13/10
    rodaram com o par da BaaS: o token de produção deu 200 e o dev recusou —
    nada disso disse coisa alguma sobre a credencial que tem o ExtratoPos.
    Se ela é de dev, de produção ou das duas, decide o teste com os dois
    links (`ambiente=dev` e `ambiente=producao`).
  - **13/10/2026, medido pelos dois links:** a "ERP Integration Produção" é a
    credencial de **DEV**, apesar do nome — token aceito em
    `dev.pinbank.com.br` e recusado ("Autorização negada") em produção. A BaaS
    é a de produção e ainda não tem o ExtratoPos (a Pinbank libera depois do
    nosso ok no dev).
  - **13/10/2026, resposta da Pinbank:** o **`RequestOrigin` é sempre `5`**
    (`PINBANK_API_ORIGEM=5`, nos dois ambientes), e o dev tem vendas de teste
    a partir de **2016** (Canal 47, EC 3510/3505) — teste com um mês de 2016.
  - **13/10/2026, "Erro de Sistema." — era o NOSSO pedido, não a Pinbank
    (PROVADO pelo A/B, ver o item seguinte).** Liberada a permissão (o código 4 "Autorização negada" sumiu), o
    ExtratoPos no dev passou a responder ABERTO `ResultCode 2 "Erro de
    Sistema."`, igual para jan/2016 e para o período do exemplo da própria doc
    (30–31/07/2025). Era a primeira vez que o servidor lia o CORPO: o
    cabeçalho e a permissão são conferidos antes dele. A doc mostra
    `{"Data":{…}}` ao lado de `{"Data":{"Json":"…"}}` e não diz o que se
    cifra; nós cifrávamos só o CONTEÚDO do `Data`. Os clientes públicos da
    Pinbank — `italoiz/pinbank-cli` e o plugin de Insomnia (Node),
    `umobi/pinkbank-php-client` (que chama o próprio ExtratoPosEncrypted) e o
    módulo Odoo da KMEE — cifram o pedido INTEIRO, e todos leem a resposta
    aberta como envelope (`Data` dentro) — a nossa leitura já fazia isso. Sem o
    `Data` no texto aberto, o provável é o servidor .NET desserializar um
    pedido com `Data` nulo e quebrar sem nomear campo. Corrigido: o padrão
    passou a ser `{"Data":{…}}`; a prova é o padrão trazer a lista (ou um erro
    que nomeie campo) e `&envelope=interno` repetir o "Erro de Sistema.". ⚠️ **A guarda NÃO pegava porque copiava o nosso engano**: a
    "Pinbank" de teste abria a cifra e lia o conteúdo solto. Agora ela exige o
    envelope e responde "Erro de Sistema." sem ele, como a real.
    Para não depender de um deploy por hipótese, o link de teste ganhou
    `&envelope=interno` (o jeito antigo, para a comparação A/B), `&datas=utc`
    (o mesmo instante, na notação do exemplo da doc), `&token=novo` (ignora o
    token guardado: o token é a única chamada que prova a SENHA atual, e a
    Pinbank avisou "credencial atualizada") e `&terminal=vazio`
    (`IdTerminalPos: ""`, como o cliente PHP). A resposta diz como o pedido
    saiu (`pedido`).
  - **13/10/2026, o A/B em produção (dev da Pinbank, canal 47, EC 3510,
    30–31/07/2025):** com o envelope e token NOVO (a senha atual vale) →
    `ResultCode 0 "Sucesso."`, resposta CIFRADA aberta com a nossa chave, **18
    parcelas**, todas com `DataFuturaPagamento` (débito D+1, crédito à vista
    ~D+30) e taxa. Com `&envelope=interno` → "Erro de Sistema." de novo. A
    única diferença entre os dois é o envelope: a causa está provada, e o
    ExtratoPos funciona de ponta a ponta pela saída fixa.
  - ⚠️ **O `ValorTaxaAdm` É O MDR, EM PERCENTUAL — respondido pela Pinbank
    em 13/10/2026**: "Taxa ADM seria o MDR, são todas em percentual. Aqueles
    são valores para fins de testes." Os **2,65 em todas as 18 vendas** do dev
    (R$ 9 a R$ 300, débito e crédito) são, portanto, 2,65% de teste. O núcleo
    o lê em PONTOS-BASE inteiros (`mdrBp`: 2,65% = 265; negativo ou acima de
    100% vira ausente) — antes o lia como reais (265 centavos por parcela) e o
    resumo SOMAVA percentuais; agora o resumo lista os MDR distintos
    (`mdrDistintosBp`). O `ValorTaxaMes` também é percentual (`taxaMesBp`): é a
    ANTECIPAÇÃO ao mês (medido em produção em 14/10/2026 — zero no débito,
    1,55% no crédito antecipado). A conferência compara o MDR com a taxa cadastrada
    no vínculo (`docs/rodada-10/conferencia.md`); a taxa do extrato NÃO
    substitui a do contrato no título. No mesmo extrato, `ValorBrutoParcela` e
    `ValorSplit` vieram com 75% do `ValorBruto` e o `ValorLiquidoRepasse` com
    ~48,7% da parcela — valores de teste, também pela resposta da Pinbank; o
    sentido deles em produção segue em aberto. Conferir de novo com venda
    real, em produção, antes de ligar a conferência.
  - ⚠️ **O `RequestOrigin` é OPCIONAL no código por ora**: a doc o marca como
    obrigatório e não diz o valor, e a credencial chegou sem ele. Sem
    `PINBANK_API_ORIGEM` o cabeçalho NÃO vai (nem vazio); o token não o usa,
    então o teste ainda prova credencial, senha e IPs; e uma recusa do método
    diz que é ele o primeiro suspeito. Se a Pinbank o exigir, é só preencher a
    variável — sem mudar código.
  - Em aberto com a Pinbank: a liberação do ExtratoPos na credencial de
    produção (BaaS, canal 1919), agora que o teste no dev passou (o
    `ValorTaxaAdm` foi respondido em 13/10: MDR em percentual); se o `nsu`
    do webhook é o `NsuOperacao` do extrato; a ativação dos
    webhooks `Compra.*`, e a credencial SÓ DE CONSULTA com senha nova (as duas
    senhas passaram por chat). A conferência das vendas (data e taxa reais
    contra as estimadas) já existe, só de leitura e desligada — ligá-la segue
    as condições do D2 em `docs/rodada-10/conferencia.md`.
- ~~"Tarifas de adquirência" cai no Resultado Financeiro do DRE~~ —
  **resolvido em 06/10/2026**: a taxa da maquininha (MDR) é Despesa Variável,
  acima do EBITDA, pela regra única `ehTaxaAdquirencia`
  (`core/indicadores/classificacao`), usada pelos dois classificadores do
  resultado, pelo DFC (saída operacional) e pela sugestão do razão. O EBITDA de
  quem vende no cartão cai pelo valor do MDR; o resultado líquido não muda.
  Medido em produção: uma empresa só tinha a taxa (10 lançamentos, R$ 39,40) e
  ela já estava declarada em Despesas Variáveis — no DRE dela nada muda; no
  comparativo, no orçamento e no razão, R$ 39,40 saem do financeiro para o
  operacional. Guarda: bloco `adquirência:` do `engine-audit`, provada
  plantando sete defeitos (os três últimos vieram da revisão adversarial:
  entrada de receita citando MDR virando estorno, o sinal do estorno no
  orçamento e um "MDR" solto no extrato furando as regras de folha e imposto).
- **A taxa da maquininha que chega pelo EXTRATO** (06/10/2026). O DRE já punha
  "Tarifas de adquirência" na despesa variável, mas a importação nunca gravava
  essa categoria: "TARIFA ADQUIRENCIA CIELO" casava "tarifa" nos dois
  classificadores (a prévia em `core/ingestao` e o que grava em `core/fdip`) e
  entrava como tarifa do banco. Agora QUEM DECIDE é a prévia, com a regra do
  extrato (`ehLancamentoDeTaxaAdquirencia`: "tarifa"/"taxa" + adquirência ou
  MDR), só no lugar do que iria para "Tarifas bancárias" ou para o genérico; a
  gravação SEGUE a prévia — uma decisão, não duas (a primeira versão tinha
  duas, e a revisão adversarial mostrou a prévia dizendo receita e a gravação
  gravando a taxa). "MDR" sozinho não basta no extrato: é sigla de empresa e
  aparece no crédito da venda. Folha, imposto e juros que citam "MDR" ficam
  onde estavam. Na ENTRADA, só a devolução nomeada ("ESTORNO TARIFA MDR") vira
  a taxa; o crédito da adquirente é venda.
  - **A prévia também mostra o que o dono já decidiu.** A correção memorizada e
    a regra vencem a classificação na gravação; a prévia não as via (a chave que
    a tela montava nunca casava com a que a prévia procura — 0 de 157 linhas).
    Agora a categoria confirmada viaja POR LINHA (`linhasParaPrevia`, a mesma
    função para a tela e para a guarda).
  - **Portas fechadas, todas pela mesma regra:** a correção de qualidade
    (contraparte suspeita — e o nome do REPASSE que cita a taxa, "LIQUIDO
    VENDAS TAXA MDR", não é suspeito; a correção em lote para a taxa só
    reescreve as SAÍDAS da contraparte, senão as vendas dela saíam da Receita
    Bruta); o cadastro de contraparte ("CIELO TARIFA MDR" não vira cliente, e o
    acento de "Tarifa de manutenção" deixou de decidir); a consulta de CNPJ (o
    repasse com o CNPJ da Cielo virava tarifa — antes desta mudança); a regra
    sugerida a partir de uma correção (propunha "contém 'tarifa'" e "contém
    'mdr'"); a MEMÓRIA da correção e da IA (a chave era a contraparte sem a
    marca: corrigir "TARIFA CIELO" ensinava "tarifa" → taxa a toda tarifa
    bancária; agora, quando a contraparte não identifica ninguém, a chave é o
    descritivo inteiro, `chaveDaMemoria`, e a memória da taxa não vale numa
    entrada sem devolução nomeada); e o vocabulário da IA e das telas.
  - Guarda: bloco `adq-extrato:` do `engine-audit` (com os casos das duas
    revisões adversariais e o teto ZERO de cópia do padrão, com as exceções
    declaradas por trecho) + a linha 16 da matriz, provadas plantando os
    defeitos de volta.
  - ⚠️ **"MDR REDE" sem "tarifa"/"taxa" fica no genérico** (despesa
    operacional, abaixo de 0.9: a IA e a revisão ainda podem corrigi-lo).
    Conservador de propósito — uma sigla de empresa virando taxa com certeza
    alta é pior que uma taxa esperando revisão. Duas consequências DECLARADAS:
    ela continua virando o cadastro "Mdr", como antes desta mudança ("MDR" é
    sigla de empresa, e recusar o cadastro recusaria "MDR Engenharia"); e, com
    o CNPJ da adquirente na linha, a consulta de CNPJ a leva para "Tarifas
    bancárias" (a tabela de CNAE não tem a taxa da maquininha).
  - ⚠️ **Não é retroativo**: o que já foi importado como "Tarifas bancárias"
    fica assim (Rodada 7: nada de declarar em massa). No primeiro mês, a análise
    de variação mostra a troca de linha como uma categoria "nova".
  - ⚠️ **Domínio**: a categoria nova precisa de código contábil no plano de
    contas; sem ele, a linha vai para as pendências do TXT (visível, não some).
  - **Pendente — decisão do dono: Open Finance.** A Pluggy não tem categoria de
    adquirência; só a DESCRIÇÃO diz que é MDR, e a Rodada 7 decidiu que
    "traduzir não é classificar". Ler a descrição ali é exceção a essa regra, e
    as Edge Functions precisam ser republicadas — fica para o dono decidir.
- **Mudança de quem pode chamar o quê** (rota pública desligada, RPCs só da
  chave de serviço, RPCs da plataforma, RPC da empresa que administra): o dono
  decide o merge.
