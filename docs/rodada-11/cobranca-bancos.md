# Cobrança por boleto e Pix pela conta bancária do cliente (27/10/2026)

Pedido do dono: a empresa configura a conta dela (Bradesco, Itaú, Inter…) e
emite boleto e Pix pelo sistema; o cliente paga e o dinheiro cai direto na
conta da empresa.

**Decisão do dono (27/10/2026): Inter direto + agregador.** O Inter primeiro
(API gratuita, cadastro pelo próprio cliente no Internet Banking); Bradesco,
Itaú, BB e Santander por um agregador (TecnoSpeed PlugBoleto, Kobana ou Cobre
Fácil — a escolher, com preço atualizado), em vez de quatro integrações.

## Como funciona em qualquer banco

A empresa precisa, no banco DELA: convênio de cobrança (boleto), chave Pix e
uma integração de API — Client ID, Client Secret e um certificado digital
(mTLS). O banco avisa o pagamento por webhook, e é isso que dá a baixa sozinha.

## As etapas

| # | Etapa | Estado |
| --- | --- | --- |
| 1 | Contrato neutro de cobrança (`core/cobranca-banco`) | feito (PR #282) |
| 2 | Inter: boleto com Pix, consulta, busca, cancelamento, leitura do webhook | feito (PR #282) |
| 3 | "Conectar meu banco": credencial por EMPRESA, cifrada, + reserva genérica | **feito neste PR** (migration `20261028120000`) |
| 4 | Agregador para os outros bancos | depende da escolha do dono |
| 5 | Régua por e-mail com o link | depois da 3 |
| 6 | Webhook do Inter → consulta → baixa | depois da 3 |
| 7 | Piloto com uma empresa, desligado por padrão | depois da 6 |

## O que existe (etapas 1 e 2)

- **`core/cobranca-banco`** — o pedido neutro (tipo, nosso número, valor,
  vencimento, pagador) e o resultado neutro, comuns à Pinbank, ao Inter e ao
  agregador. ⚠️ As quatro respostas e o que cada uma deixa fazer:
  `emitida` (mostrar), `processando` (o banco tem o id; consultar, nunca
  pedir outra), `incerta` (pode existir; procurar pelo nosso número),
  `falhou` (recusa clara; pode tentar de novo).
- **`core/cobranca-banco/inter`** — a API de Cobrança v3: o boleto sai COM o
  Pix numa chamada só. ⚠️ A emissão é assíncrona: o POST devolve só o código,
  e a linha digitável e o Pix aparecem na consulta. ⚠️ O aviso do webhook não
  é prova de pagamento (o Inter não assina o corpo): só os CÓDIGOS são lidos,
  e a situação vem de uma consulta com a nossa credencial.
  `MARCADO_RECEBIDO` (baixado à mão no app do banco) volta como paga
  `marcadaManualmente` — o dinheiro pode não ter passado pela cobrança.
- **A porta única do Inter** (`lib/cobranca-banco/inter-saida.ts`): mTLS por
  `node:https`, só as bases de `BASES_INTER` e só os caminhos de
  `CAMINHOS_INTER` (cobrança e token; nada de Pix de saída, pagamento ou
  extrato), e nunca repete. É a SEGUNDA porta de rede declarada do app (a
  outra é a da Pinbank) — guarda `saida-fixa:`/`inter:` do `engine-audit`.
- **O cliente** (`lib/cobranca-banco/inter-api.ts`): token com escopo SÓ de
  cobrança, guardado até 60 s antes de vencer; 401 renova e repete uma vez;
  falha do token é `falhou` (o pedido de dinheiro nem saiu); queda depois do
  envio é `incerta`.
- **O teste do administrador** `GET /api/admin/inter-teste`
  (`acao=token|emitir|consultar|achar`), com a credencial das variáveis
  `INTER_*`. `emitir` (R$ 2,50) só no sandbox.

## Como testar (dono)

1. No Internet Banking do Inter PJ: Soluções para sua empresa › Nova
   integração, marcar SÓ "Boleto com Pix" (leitura e escrita), baixar o
   `.crt` e o `.key`.
2. Na Vercel (Production): `INTER_AMBIENTE=sandbox` (ou `producao`),
   `INTER_CLIENT_ID`, `INTER_CLIENT_SECRET`, `INTER_CERTIFICADO` e
   `INTER_CHAVE_PRIVADA` (o conteúdo do arquivo, ou ele em base64).
3. Logado como administrador: `/api/admin/inter-teste` → `ok: true`; no
   sandbox, `?acao=emitir` e depois `?acao=consultar&codigo=<o código>`.

Guarda: `npm run inter-cobranca` (no `npm test`): 49 verificações, com 8
defeitos plantados no core que têm de derrubar o caso que os nomeia.

⚠️ Muda quem pode chamar o quê (uma chamada nova, com credencial, a um
banco): o merge espera o OK do dono.

## Etapa 3 — "Conectar meu banco"

- **A conexão é da EMPRESA** (`cobranca_banco_conexoes`): ambiente, Client
  ID, conta, validade do certificado e quem conectou. Uma viva por empresa.
  Só quem ADMINISTRA conecta e desconecta (`cobranca_banco_conectar`/
  `_desconectar`); a rota pergunta antes de testar no Inter, para não
  emprestar o servidor a quem só lança.
- ⚠️ **O segredo** (Client Secret, `.crt`, `.key`) é testado no Inter, cifrado
  no servidor (AES-256-GCM, `lib/cobranca-banco/cofre.ts`, chave-mestra em
  `COBRANCA_CHAVE_MESTRA`, dado adicional = o id da conexão) e guardado em
  `cobranca_banco_segredos`: sem `org_id` (nunca é copiado para a trilha),
  sem política, só a chave de serviço lê (`cobranca_banco_credencial`).
  Nenhuma resposta o devolve, nenhum log o leva. Trocar a chave-mestra
  obriga a conectar de novo.
- **A reserva genérica** (`cobranca_banco_reservar`, como a pessoa, papel de
  lançar): valor, vencimento e pagador saem do título; uma cobrança viva por
  título, contando a da Pinbank; `processando` e `incerta` devolvem
  "pendente" e a rota CONFERE no banco (pelo id ou pelo nosso número, que é o
  começo do id da cobrança), nunca pede outra. O resultado só a chave de
  serviço grava (`cobranca_banco_registrar`), com as transições permitidas.
  Título alterado leva a cobrança viva a `a_cancelar`.
- **Tela:** cartão "Banco Inter · cobrança" em Integrações (conectar com os
  arquivos, ver validade, desconectar; aviso 30 dias antes de o certificado
  vencer) e, no modal da baixa de um título a receber, "Gerar boleto com Pix"
  com a linha digitável e o Pix copia e cola (ou "Conferir no banco").
- **Nasce DESLIGADA:** `COBRANCA_BANCO=ligado` + `COBRANCA_CHAVE_MESTRA`
  (`openssl rand -base64 32`) em Production. Sem as duas, a tela explica e
  nada fala com o banco. As variáveis `INTER_*` ficam só para o teste do
  administrador.
- **Guardas:** `scripts/cobranca-banco.sql` no CI (10 casos, 15 defeitos
  plantados) e `npm run cobranca-banco-conexao` no `npm test` (cofre, reserva,
  logs sem segredo; 7 defeitos plantados).
- ⚠️ A baixa segue MANUAL até a etapa 6 (webhook → consulta → baixa).
