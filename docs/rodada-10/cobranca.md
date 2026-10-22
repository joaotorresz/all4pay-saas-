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
| 5 | A régua manda o link | próxima |
| 6 | Baixa automática pelo webhook de liquidação | depende da resposta da Pinbank |
| 7 | Piloto com uma empresa, desligado por padrão | depois da 6 |

## O que existe (etapas 2 e 3)

- **Duas chaves, como a maquininha.** A PLATAFORMA cadastra o código da conta
  Pinbank no vínculo (`/admin`); a EMPRESA liga a cobrança
  (`pinbank_cobranca_configurar`, papel de administrar). Sem o código, ligar
  é recusado com a frase.
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
