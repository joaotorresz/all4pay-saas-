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
- Ponta a ponta contra o banco local, com eventos assinados de verdade: venda
  3x, reentrega, assinatura adulterada (401), fora da janela (401), sem vínculo
  (quarentena), cancelamento, aprovada atrasada (ignorada), débito — e, pela
  tela, ativar a maquininha lançou as duas vendas que esperavam.

## Para ligar em produção (ordem)

1. Aplicar `20261005120000_pinbank_maquininha.sql` (o job `migrar` no merge).
2. Pedir ao suporte da Pinbank o cadastro do webhook: URL
   `https://<app>/api/pinbank/webhook`, eventos `Compra.*`.
3. Salvar a resposta de `GET https://pinbank.com.br/webhook/signing-key` em
   `PINBANK_WEBHOOK_JWKS` (recomendado pela própria Pinbank; sem ela a rota
   busca a chave e guarda por uma hora).
4. `PINBANK_WEBHOOK=ligado`.
5. No `/admin`, vincular cada estabelecimento (o código aparece na quarentena
   assim que a primeira venda chega); a empresa ativa em Integrações.

## Pendências declaradas

- **Conferência pelo extrato (`ExtratoPos`)**: a API exige OAuth2 + criptografia
  AES-128-CBC e credenciais (`UserName`, `KeyValue`, `RequestOrigin`,
  `CodigoCanal`) que ainda não temos. Ela traz a data real do repasse e a taxa
  cobrada; com ela, os títulos estimados passam a ser os conferidos. O campo
  `codigo_cliente` do vínculo já existe para isso.
- **"Tarifas de adquirência" cai no Resultado Financeiro do DRE**, não em
  Despesas Variáveis: o padrão `adquiren` não casa com "adquir**ê**ncia". Vale
  para a maquininha que já existia. Consertar move o EBITDA de quem já usa POS —
  é decisão à parte.
- **Mudança de quem pode chamar o quê** (rota pública desligada, RPCs só da
  chave de serviço, RPCs da plataforma, RPC da empresa que administra): o dono
  decide o merge.
