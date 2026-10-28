# Cobrança por Pix e boleto pela conta Pinbank (19/10/2026)

O pedido do dono: cobrar o título a receber por Pix e boleto emitidos pela
conta Pinbank da empresa; a régua manda o link, e o pagamento dá baixa
sozinho no título.

## As sete etapas

| # | Etapa | Estado |
| --- | --- | --- |
| 1 | Alinhar com a Pinbank (perguntas abaixo) | com o dono |
| 2 | Vincular a conta BaaS à empresa | **feito neste PR** |
| 3 | Gerar a cobrança a partir do título a receber | **feito neste PR** |
| 4 | Página pública de pagamento (o link) | **MVP neste PR** |
| 5 | A régua manda o link | primeira metade feita (28/10): o link que JÁ existe vai na mensagem; gerar a cobrança sozinha espera o dono |
| 6 | Baixa automática pelo webhook de liquidação | depende da resposta da Pinbank |
| 7 | Piloto com uma empresa, desligado por padrão | depois da 6 |

## O que existe (etapas 2 e 3)

- **Duas chaves, como a maquininha.** A PLATAFORMA cadastra o código da conta
  Pinbank no vínculo (`/admin`); a EMPRESA liga a cobrança
  (`pinbank_cobranca_configurar`, papel de administrar). Sem o código, ligar
  é recusado com a frase.
- **Onde a empresa liga:** Administração › Integrações › Maquininha Pinbank,
  no cartão do vínculo, a chave "Cobrar títulos a receber por Pix e boleto"
  (só para quem administra; desabilitada com a frase enquanto a maquininha
  não está ativa ou a plataforma não cadastrou o código).
- **Reserva antes da rede.** `pinbank_cobranca_reservar` (como a pessoa, papel
  de lançar) confere o título (da empresa aberta, a receber, em aberto, não é
  amostra nem transferência, valor > 0), escolhe a conta e grava a linha
  `reservada` com NSU próprio. O índice único impede duas cobranças vivas do
  mesmo tipo no mesmo título; o segundo clique devolve a emitida.
- **Só o servidor grava o resultado** (`pinbank_cobranca_registrar`, execute só
  para `service_role`), e só a partir de `reservada`.
- ⚠️ **Resultado incerto TRAVA o título.** 5xx, pedido enviado sem resposta ou
  resposta ilegível viram `incerta`: a Pinbank pode ter criado a cobrança, e
  gerar outra arrisca o cliente pagar duas vezes. Recusa nomeada (4xx, erro de
  validação) vira `falhou` e libera nova tentativa. O 401 com o token do cache
  é repetido UMA vez com token novo (o pedido não chegou a criar nada).
- ⚠️ **Título alterado depois de cobrado** (valor, vencimento, pagador,
  excluído, baixado) leva a cobrança a `a_cancelar`: o Pix/boleto antigo
  cobraria o valor velho. Cancelar na Pinbank é a etapa seguinte; até lá a
  tela diz e bloqueia nova cobrança.
- **Cadastro do pagador** conferido antes de sair: Pix pede nome e CPF/CNPJ
  válidos; boleto pede também o endereço completo.
- **Portões da rota** (`/api/pinbank/cobranca`): sem banco → sessão → pedido
  → `PINBANK_COBRANCA=ligado` e credencial de produção → chave de serviço →
  reserva → cadastro → só então a Pinbank → registro. Um registro no log por
  chamada, sem valor nem dado do pagador.
- **A tela:** no modal da baixa de um título a receber, "Gerar Pix" e "Gerar
  boleto", com o copia-e-cola e a linha digitável para copiar. Some inteiro
  quando a cobrança não está liberada ou a empresa não a ligou.
- ⚠️ **Muda quem pode chamar o quê:** é o primeiro caminho em que a empresa
  faz a Pinbank CRIAR algo. Só cobrança para RECEBER; nenhum caminho de
  `CashOut`. O merge espera o OK do dono.

Guardas: `scripts/pinbank-cobranca.sql` no CI (9 casos, 10 defeitos
plantados lendo a mensagem) e o bloco `cobranca-pinbank:` do `engine-audit`
(caminhos permitidos só no cliente, ordem da rota, reserva como a pessoa,
registro só pela rota, interruptor numa casa só).

## O MVP do checkout (etapa 4, 22/10/2026)

Pedido do dono: um produto de teste só com Pix e boleto, para mostrar à
Pinbank e pedir a liberação do cartão.

- **"Criar link"** no mesmo bloco da cobrança, depois de ao menos um Pix ou
  boleto EMITIDO. Copia `https://<app>/pagar?t=<token>`; o segundo clique
  copia o mesmo link (um vivo por título).
- **A página `/pagar`** é pública (sem login): nome da empresa, valor,
  vencimento, o QR do Pix com o copia-e-cola e a linha do boleto, cada um com
  botão de copiar. Título recebido mostra "Pagamento recebido"; título mudado
  ou cancelado mostra "indisponível" e esconde o Pix velho.
- ⚠️ **O token é o único segredo** (64 hexadecimais, 244 bits). A leitura é
  `pinbank_checkout_ler`, que só a chave de serviço executa, e só depois do
  interruptor `PINBANK_COBRANCA`. Ela devolve o mínimo: nada do cadastro do
  pagador, da conta ou de outro título.
- ⚠️ **A baixa ainda é manual.** Quando o dinheiro cai na conta Pinbank, a
  empresa dá a baixa no título; a baixa automática é a etapa 6 (webhook).
- O QR passou a ir até a versão 20: o Pix copia-e-cola passa dos 211 bytes
  que a versão 10 comportava.

Como testar: aplicar as duas migrations, ligar `PINBANK_COBRANCA=ligado` com a
credencial de produção, vincular a conta de UMA empresa no `/admin`, ligar a
cobrança na empresa, gerar o Pix e o boleto de um título e mandar o link.

Guardas: `scripts/pinbank-checkout.sql` no CI (8 casos, 9 defeitos plantados)
e o bloco `checkout-pinbank:` do `engine-audit`.

## A régua manda o link (etapa 5, primeira metade, 28/10/2026)

- O executor da régua (`/api/financial-os/run`) pergunta ao banco, pela chave
  de serviço, o link `/pagar` vivo dos títulos que vai cobrar HOJE
  (`regua_links_de_pagamento`, migration `20261028160000`): só link de título
  a receber em aberto com cobrança EMITIDA — a mesma regra do leitor público.
  Leitura só com `cobrancaPinbankLiberada()` (`lib/regua-links.ts`).
- Um título: "Pague por Pix ou boleto: <link>" no texto e o botão "Pagar
  agora" no e-mail. Vários: uma linha por título, sem botão único.
- ⚠️ O WhatsApp por TEMPLATE aprovado não leva o link (as variáveis são
  fixas); o texto livre leva. Um template novo com a variável do link é tarefa
  do remetente (etapa 2 do plano).
- ⚠️ Título SEM cobrança emitida segue sem link. Emitir a cobrança sozinha no
  primeiro envio chama a Pinbank pelo cron e cria dinheiro a receber: espera
  o OK do dono.
- Guardas: casos R1–R4 e d10–d13 em `scripts/pinbank-checkout.sql`; bloco
  `aut-link:` do `engine-audit`.

## O e-mail e a página no modelo Asaas (28/10/2026)

- **Remetente** (`core/automacoes/remetente`): `"<Empresa>" <cobrancas+<8 hex
  da empresa>@COBRANCA_EMAIL_DOMINIO>`, com `reply_to` no e-mail da empresa
  (quem responde fala com quem cobra). O nome é saneado (sem `<>"@,;:` nem
  controle, até 60 letras). Sem `COBRANCA_EMAIL_DOMINIO` (ou inválido), sai
  pelo `ALERTS_EMAIL_FROM` de sempre. ⚠️ O domínio precisa estar VERIFICADO no
  Resend antes de ligar a variável — senão todo envio é recusado.
- **E-mail** (`montarHtmlCobranca`): cabeçalho com o nome, razão e CNPJ da
  empresa; "Não registramos o pagamento da sua cobrança" no vencido; valor,
  vencimento, "Pagar agora"; aviso de 3 dias úteis do boleto; rodapé com os
  dados do cadastro e "enviado em nome de X pela plataforma Quattro". Só cores
  da paleta. O texto (WhatsApp) não muda.
- **Página `/pagar`** (`components/checkout/FaturaView`): cartão da empresa,
  "Dados da fatura" com a situação (`core/cobranca/fatura`), valor, vencimento,
  cliente e descrição, depois Pix e boleto. ⚠️ Sem juros e multa: o valor do
  Pix e do boleto emitidos é fixo, e mostrar um total corrigido que o QR não
  cobra seria mentir.
- ⚠️ **O link passou a mostrar MAIS dado** (migration `20261029140000`): o
  cadastro da empresa por LISTA DE PERMITIDOS (fantasia, razão, CNPJ/CPF,
  e-mail, telefone, endereço; cada um até 120 letras — logo, faturamento,
  regime e dados do representante nunca) e o NOME do pagador, só com o título
  em aberto. Documento, e-mail e endereço do pagador nunca. Guarda: casos 4 e 7
  e os defeitos d9b/d9c de `scripts/pinbank-checkout.sql`; bloco 4c do
  `engine-audit`.

## Perguntas para a Pinbank (etapa 1)

1. Os métodos `Pix/SolicitarDynamicQrCode` e `CashIn/GerarBoleto` seguem o
   mesmo envelope cifrado (`…Encrypted`) do `ExtratoPos`, na credencial BaaS
   (canal 1919)?
2. O `CodigoCliente` da conta BaaS é o mesmo código do estabelecimento (EC) da
   maquininha, ou é outro número por empresa?
3. Qual o formato da data de vencimento do boleto (`AAAA-MM-DD`,
   `DD/MM/AAAA`, com hora)? E o que `SegundosExpiracao` significa no Pix
   dinâmico com vencimento?
4. Qual o webhook de liquidação (Pix recebido e `Boleto.Liquidacao`): payload,
   assinatura (a mesma Ed25519 do `Compra.*`?) e o campo que devolve o nosso
   `IdentificadorCliente`/NSU de origem.
5. Existe método para CANCELAR um Pix dinâmico e baixar um boleto emitido?
6. Tarifa por cobrança emitida e por liquidação, e prazo de crédito na conta.

## Pendências

- Aplicar as migrations `20261020120000_pinbank_cobranca` e
  `20261022120000_pinbank_checkout` (o job `migrar` faz no merge).
- Ligar `PINBANK_COBRANCA=ligado` só depois das respostas 1 a 3 e de um teste
  com uma empresa.
