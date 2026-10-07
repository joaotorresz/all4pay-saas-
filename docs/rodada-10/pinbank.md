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
  `ExtratoPos`, traz). Até a conferência pelo extrato, o repasse é estimado
  pelos prazos e taxas do vínculo. Taxa em branco = venda sem o custo, com
  aviso — nunca uma taxa inventada.
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
   - **O ambiente de teste envia webhook, e com qual chave?** O host
     `dev.pinbank.com.br` não publica `/webhook/signing-key` (404). Se o teste
     assinar com outra chave, toda entrega de teste volta 401.
3. Salvar a resposta de `GET https://pinbank.com.br/webhook/signing-key` em
   `PINBANK_WEBHOOK_JWKS` (recomendado pela própria Pinbank; sem ela a rota
   busca a chave — pela saída fixa — e guarda por uma hora). ⚠️ Com a JWKS
   fixa, uma ROTAÇÃO de chave ainda busca a nova; se a busca falhar, o webhook
   responde 503 (a Pinbank reenvia), nunca o 401 que perderia a venda — e JSON
   ilegível na variável também é 503, não "nenhuma chave".
4. `PINBANK_WEBHOOK=ligado`.
5. No `/admin`, vincular cada estabelecimento (o código aparece na quarentena
   assim que a primeira venda chega); a empresa ativa em Integrações.

## Pendências declaradas

- **Conferência pelo extrato (`ExtratoPos`)**: a API exige OAuth2 + criptografia
  AES-128-CBC e credenciais (`UserName`, `KeyValue`, `RequestOrigin`,
  `CodigoCanal`) que ainda não temos — e os 2 IPs fixos liberados pela
  Pinbank (a saída fixa já existe; o cliente da API deve chamá-la por
  `requisicaoPinbank`, que nunca repete um pedido que já saiu). Ela traz a data real do repasse e a taxa
  cobrada; com ela, os títulos estimados passam a ser os conferidos. O campo
  `codigo_cliente` do vínculo já existe para isso.
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
