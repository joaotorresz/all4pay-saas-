# Pacote AUT — automações úteis de e-mail e WhatsApp, por empresa (30/09/2026)

Branch `r2/aut`. Migration `20260930190000_automacoes.sql` (só ARQUIVO — quem
aplica é o CI no merge, depois do dono). Texto pronto para entrar no
`CLAUDE.md` como seção própria.

## ⚠️ AUTOMAÇÕES — o que o Quattro manda sozinho, para quem e por qual canal

Cinco automações por empresa, todas **DESLIGADAS** por padrão, configuradas na
aba **Configurações › Automações** (`/configuracoes?aba=automacoes`) — aba, não
item novo de menu: "o que o sistema me manda e para quem" é configuração da
empresa (uma pergunta, uma tela).

| Automação | Para quem | Quando |
| --- | --- | --- |
| Resumo do caixa do dia | titulares/admins | todo dia útil |
| Resumo da semana | titulares/admins | 1º dia útil da semana |
| Lembrete de contas a pagar | titulares/admins | dia útil; na sexta, a semana seguinte |
| Alerta de caixa | titulares/admins | quando a faixa muda (7/15/30 dias ou saldo mínimo) |
| Aviso de fechamento do mês | titulares/admins | 3º e 8º dia útil, se o mês anterior não foi travado |
| Régua de cobrança automática | os CLIENTES | no dia em que o título chega à etapa (opt-in explícito) |

- **`src/core/automacoes`** (`automacoes/1.0.0`, puro): por automação →
  mensagens (destino, canal, assunto, texto, HTML, chave). Não soma nada por
  conta própria: saldo e previstos vêm de `core/indicadores`, contas a pagar de
  `montarPainelContasPagar`, ruptura de `calcularLiquidezProjetada` +
  `ponteRupturaRunway`, fechamento de `montarFechamento` +
  `coberturaCompetencia`, régua de `montarRegua`, encargo de `calcularMora`,
  PIX de `core/pix`. A PRÉVIA da tela é a mesma função que o runner chama.
- ⚠️ **O dia é o de Brasília** (`hojeEm`, `America/Sao_Paulo` explícito): o
  cron roda às 12h UTC, e um servidor em UTC entre 21h e meia-noite estaria no
  dia seguinte.

### ⚠️ A TRAVA DO REENVIO É O BANCO, E A ORDEM É GRAVA → ENVIA → CONCLUI

`automacao_envios` tem índice ÚNICO `(org_id, tipo, chave, canal)`. `despachar`
**reserva a linha ANTES de chamar o provedor**; `ja_existe` pula. Se o registro
viesse depois do envio, um runner morto entre os dois (timeout, deploy) deixaria
a mensagem enviada sem registro — e a próxima execução mandaria de novo. Gravando
antes, o pior caso é uma linha `pendente` sem envio: um aviso a menos, nunca em
dobro. Sem registro disponível, **nada** sai. `?dryRun=1` responde quantas
sairiam e para quem (mascarado) sem gravar nem enviar — a prova de carga da 7ª
regra.

- **Chaves:** régua = `cliente:<parte>:<dia>` (UMA mensagem por cliente por dia,
  com todos os títulos) + `titulo:<mov>:<etapa>` para cada título; automações da
  empresa = `<base>:<hash do destino>` (dois admins recebem o mesmo resumo; o
  endereço não entra na chave). Retomável só `falhou`/`simulado`.
- ⚠️ **O mesmo registro para as TRÊS portas de cobrança** — a régua automática,
  o botão de envio da régua manual e o copiloto. Antes eram duas moradas
  (`a4p_regua_envios` no navegador, e nada no caso do copiloto): o cliente podia
  ser cobrado pelas duas no mesmo dia sem uma saber da outra. A rota
  `/api/cobranca/whatsapp` passou a gravar pelo `despachar` (com sessão; RLS
  recorta a empresa). `a4p_regua_envios` foi MIGRADO como `manual` e CONGELADO.

### ⚠️ SIMULADO NUNCA É "AVISADO"

Status: `pendente · enviado · simulado · falhou · manual`. Conta como avisado
**só** `enviado` (o provedor aceitou) e `manual` (uma PESSOA declarou o
contato). Sem credencial, o envio vira `simulado` e a régua continua propondo o
aviso — é esse registro que se mostra antes de um protesto. O registro antigo da
régua entrou como `manual`: ele não distinguia provedor de pessoa, e a palavra
de alguém é o que ele era.

### ⚠️ O QUE CADA MENSAGEM NÃO FAZ

- **Empresa sem lançamentos não recebe nada** (`sem_dados`): um resumo agora só
  teria zeros. E soma vazia vira FRASE ("nada vence hoje", "nenhum"), nunca
  `R$0,00` (ONDA 4).
- **"Vence hoje" é A VENCER** no lembrete (a regra do painel de contas a pagar);
  o bloco "Já venceram" soma só o atraso de verdade. Agrupado por DATA ("o que
  sai no dia 20"). Avisa quando o saldo da conta de onde sai não cobre.
- **O alerta é CONDICIONAL e sem percentual** ("No ritmo agendado, o caixa
  ficaria negativo em…"). O 97% é o teto da fórmula (A4P-032), não uma medida.
  Reenvia só quando a FAIXA muda (hoje · 3 · 7 · 15 · 30) — dentro de 7 dias, a
  mesma faixa não repete. A projeção pondera o recebível pelo risco; o valor
  nominal vai ao lado, senão a pessoa confere na tela e acha outro número.
- **A régua nunca manda o D+60** (protesto/negativação tem efeito jurídico; o
  calendário não decide isso), nunca manda sem opt-in (ligar pede confirmação
  explícita na tela), respeita PAUSA por cliente/título (acordo, contestação) e
  não cobra quem já foi cobrado hoje por outra porta. Toda mensagem identifica o
  CREDOR (razão social + CNPJ, `identificacaoDoCredor`) e diz "Se já pagou,
  desconsidere esta mensagem." Multa e juros começam em ZERO e só entram quando
  configurados (teto 2% + 1% a.m.), calculados por `calcularMora`.
- ⚠️ **Valor sempre por `formatBRL`.** O template antigo da régua mandava
  `String(1234.5)` como variável — o cliente lia "1234.5".

### ⚠️ UM TEMPLATE POR TOM (WhatsApp)

O template único de cobrança saiu. Cada finalidade tem o seu (lembrete · atraso ·
formal · resumo · lembrete de contas · alerta · fechamento), lido de variável de
ambiente opcional — sem template configurado vai a mensagem livre (só funciona
dentro da janela de 24h). Variáveis da cobrança: 1 cliente · 2 credor · 3 valor
(formatado) · 4 vencimento · 5 dias. **O código só LÊ essas variáveis; nenhuma
foi criada.**

### ⚠️ QUEM RECEBE VEM DO MEMBRO, NÃO DA CONFIGURAÇÃO

O destinatário das automações da empresa é um `userId`; o e-mail sai de
`organization_members` + `auth.users` (titular/admin ATUAL) a cada execução.
Quem saiu da empresa para de receber na execução seguinte — a configuração não
guarda endereço de ninguém. O telefone de WhatsApp é o que a própria pessoa
informou para receber.

### ⚠️ O RUNNER — `/api/financial-os/run` reescrito

A versão anterior lia com o cliente do NAVEGADOR, sem sessão: rodava como
`anon` e morria em "permission denied" antes da primeira regra — é por isso que
o CLAUDE.md registrava "sem rastro diário". E, se rodasse, mandaria o alerta de
qualquer empresa para o número GLOBAL do dono da plataforma. Agora: CRON_SECRET
pela regra única (`recusaDeCron`), chave de serviço (503 dito, nunca "0
mensagens"), contexto por `automacao_contexto(p_org)` (SECURITY DEFINER,
executável **só** por `service_role`, recortado por empresa, sem amostra, teto de
5.000 linhas com aviso), um evento `executar_automacoes` por empresa na trilha
(inclusive quando nada saiu — "rodou e não havia o que avisar" ≠ "não rodou").

⚠️ **O motor de regras (`financial_rules` → `rule_executions`) saiu do cron.**
Ele nunca executou em produção (a causa acima); a tela `/automacoes` continua
simulando as regras. Religá-lo por servidor é trabalho próprio, não efeito
colateral deste pacote.

### ⚠️ UM MAPEADOR SÓ: linhas do banco → `RiskInput` (`lib/risco-linhas`)

Três caminhos leem `movements` (a tela, a consolidação e o runner). Eram duas
cópias do mapeamento e a terceira ia nascer — e o resumo que o dono recebe por
e-mail discordaria da Visão geral que ele abre em seguida. `linhasParaRiskInput`
aceita o embed do PostgREST e o texto achatado da RPC. ⚠️ `situacao` NÃO é
transportada, de propósito e igual a antes: ligá-la muda o que a Central lê, e
mudança de comportamento não entra escondida num refactor.

### ⚠️ PADRÃO POR SEED **E** POR GATILHO (a 5ª regra)

`automacoes_padrao()` é a fonte única dos padrões, lida pelo seed (empresas de
hoje) e pelo gatilho `organizations_automacoes` (empresas de amanhã). Espelho no
núcleo (`configPadrao`) para a demonstração.

### P0 corrigidos no caminho

- "Simular confirmação" do envio de NFs ao contador **só na demonstração** — em
  produção ele marcava como verificado um endereço que ninguém confirmou.
- **"Automações" saiu de `BENEFICIOS_PRO`**: elas valem para todo plano, e o
  trial não é Pro — anunciar como Pro prometia algo que não era trancado.
- Copiloto: a cobrança começava com "Quattro · Olá!" (o nome do SOFTWARE, não o
  do credor) e não gravava no registro. Agora identifica o credor e grava.

## Guardas (todas provadas plantando o defeito)

- **`engine-audit`, bloco `/* ── AUT ── */`**: reexecutar não reenvia (1 envio,
  1 linha) · a ORDEM reservar → enviar → concluir · sem registro nada sai ·
  dryRun não grava · falha retomável, enviado não · simulado não vira avisado
  (régua e alerta) · empresa vazia sem mensagem nas cinco · "nada vence hoje",
  nunca `R$0,00` · fim de semana · régua desligada, D+60, uma por cliente,
  canal do cadastro, pausa, já cobrado hoje · credor + CNPJ + "desconsidere" ·
  variável de valor por `formatBRL` (e o template da régua manual) · mora por
  `calcularMora` · PIX · lembrete por data, vence hoje ≠ atrasado, sexta, feriado
  · alerta condicional sem %, faixa · fechamento 3º dia útil, mês travado · ex-
  membro não recebe · destino mascarado · o mapeador único · o runner.
  **15 defeitos plantados, 15 reprovados** (o 12º — "vence hoje vira atraso" —
  passou na primeira versão; a asserção foi apertada e passou a reprovar).
- **`consistencia`, bloco `/* ── AUT ── */`**: nenhum texto de tela (JSX ou
  literal, comentários fora) nem `motivo`/`erro` das rotas e do núcleo das
  automações nomeia variável de ambiente de provedor. A varredura se prova antes
  de varrer (acha em JSX, literal e template; não acusa comentário). Plantado
  na tela e na rota de teste: reprova nomeando o arquivo.
- **`scripts/automacoes.sql`** (job de banco do CI, arreio copiado de
  `assinatura-bloqueio.sql`): 9 casos — empresa nova com 6 desligadas pelo
  gatilho · titular liga · leitor não liga · lançador registra, leitor não ·
  outra empresa inalcançável · índice único nomeado · ninguém apaga · status
  fora da lista · contexto só da chave de serviço, sem amostra e sem a outra
  empresa. **8 defeitos plantados no banco, 8 reprovados pelo motivo certo.**
- **`scripts/e2e/automacoes.mjs`**: liga o resumo e o lembrete na tela, confere
  que a gravação ficou, que a prévia do resumo traz o saldo da Visão geral, que
  cada conta do lembrete existe com o mesmo valor em Títulos a pagar, e que o
  teste fica registrado como SIMULADO. Plantados "saldo +1000 na prévia" e
  "teste gravado como enviado": 4 verificações reprovaram.

## O que NÃO foi feito, e por quê

- **Horário por empresa**: não há seletor. O cron da Vercel é UM, diário, às 12h
  UTC (9h de Brasília) — a tela diz isso. Horário por empresa exige agendamento
  por empresa (pg_cron ou vagas de cron), decisão de infraestrutura do dono.
- **Confirmação de ENTREGA** (callback de status da Twilio/Resend): "enviado"
  significa que o provedor ACEITOU; a entrega não é conferida.
- **Consentimento do cliente para WhatsApp** (opt-in por contato, LGPD/Meta): a
  régua usa o telefone do cadastro. Uma coluna de consentimento por contato é
  decisão de produto/jurídica.
- **Quem pode forjar "enviado"**: a política de escrita de `automacao_envios`
  recorta empresa e papel (lançar/baixar/administrar), não o STATUS — um
  usuário com esse papel, pela API, consegue gravar `enviado`. Fechar isso é
  uma função `SECURITY DEFINER` para o registro manual + revogar UPDATE do
  status; ficou fora para não mudar mais autorização do que o pacote pede.
- **"Permitir notificações por e-mail"** em Dados da empresa segue sem efeito
  (controle de outra tela, não tocado).
- O motor de regras (`financial_rules`) não roda mais no cron (ver acima).
