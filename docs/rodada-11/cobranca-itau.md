# Cobrança pela conta do Itaú

**Decisão do dono (30/10/2026):** a empresa que tem conta no Itaú emite o
boleto com Pix pelo próprio Itaú, com **integração direta** e não por
agregador. Isso muda a decisão de 27/10 em `cobranca-bancos.md`, que mandava
os outros bancos para um agregador, mas só para o Itaú. Bradesco, BB e
Santander seguem como estavam.

O desenho é o do Inter. Mudam o contrato neutro (`core/cobranca-banco`), a
reserva, o cofre e a máquina de situações (emitida · processando · incerta ·
falhou). O Itaú ganha o leitor puro e a porta de rede dele.

## Etapas

| # | O quê | Situação |
| --- | --- | --- |
| 1 | **Base para vários bancos**: `itau` cabe na conexão e na cobrança (migration `20261030120000`), uma conta recebe por vez (o conectar recusa o segundo banco), a conexão e a credencial deixam de ser fixas no Inter, e o Itaú é RECUSADO pelo servidor até emitir (`BANCOS_QUE_EMITEM`) | PR #324 |
| 2 | `core/cobranca-banco/itau`: montar o pedido (boleto com Pix / bolecode) e ler a resposta, puro, com guarda `npm run itau-cobranca` e defeitos plantados | PR #324 (23 casos, 9 defeitos) |
| 3 | `lib/cobranca-banco/itau-saida.ts` + `itau-api.ts`: porta única de rede (OAuth2 client_credentials com certificado mTLS, só os caminhos de cobrança), declarada no `engine-audit` | |
| 4 | Conectar o Itaú em Integrações (escolha do banco no card) e emitir no modal da baixa; `itau` entra em `BANCOS_QUE_EMITEM` | |
| 5 | Aviso do Itaú → consulta → baixa | |
| 6 | Piloto com uma empresa, sob o interruptor `COBRANCA_BANCO` | |

## Regras desta etapa

- ⚠️ **Uma conta recebe por vez.** A reserva já recusava cobrar com duas
  contas vivas. Agora a recusa vem antes, no conectar: com o Inter vivo, ligar
  o Itaú pede para desconectar o Inter primeiro. Se ela ficasse na reserva, a
  empresa só descobriria no primeiro título.
- ⚠️ **Banco que não emite não guarda credencial.** A rota recusa o Itaú
  ANTES do teste no banco e antes do cofre. Sem isso, a credencial ficaria
  guardada sem nada que a soubesse usar.
- ⚠️ **A credencial de um banco nunca vai a outro.** `configDaConexao`
  recusa toda conexão que não for do Inter, e recusa antes de decifrar. Sem
  essa recusa, a senha do Itaú seria mandada ao Inter.
- O banco de dados confere o provedor pelo nome ("banco desconhecido"), e não
  só pelo CHECK, porque o conectar pode ser chamado por quem administra.

## Regras da etapa 2

- ⚠️ **A emissão do Itaú é síncrona.** Uma resposta 2xx já traz a linha e o
  Pix. A 2xx sem eles, ou com outro nosso número, é `incerta` (no Inter seria
  `processando`), e só a consulta resolve.
- ⚠️ **O nosso número (8 dígitos) é da empresa.** O core recebe o número de
  quem reserva e recusa o que não tiver 8 dígitos. Quem dá o número sem
  repetir é a reserva da etapa 4.
- ⚠️ **O valor vai em centavos, como texto de 17 dígitos.** Em reais, o banco
  cobraria cem vezes menos.
- ⚠️ **A consulta só aceita UM título com o nosso número.** Dois títulos, ou
  um de outro número, dão `incerta`.
- ⚠️ **Os nomes dos campos são os da documentação pública do Itaú** e serão
  conferidos no sandbox na etapa 3, antes de qualquer chamada de verdade.

## O que o cliente vai precisar (etapa 4)

As credenciais de cobrança do Itaú são pedidas pelo portal de desenvolvedor
do Itaú ou pelo gerente: Client ID, Client Secret e o certificado digital da
integração, além da agência, da conta com o dígito, da carteira de cobrança
(ex.: 109) e da chave Pix da conta. O formulário é o mesmo do Inter, e o segredo é cifrado do mesmo
jeito.
