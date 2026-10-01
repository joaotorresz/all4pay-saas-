# CAMP-A — fechamento com dono, aging de contas a pagar, previsão do mês em três camadas

Branch `r2/campa` (a partir de `a1fd216`). Migration `20260930200000_fechamento_responsavel.sql`
(arquivo só — quem aplica é o CI no merge). Decisões no estilo do CLAUDE.md, para o
orquestrador consolidar.

---

### ⚠️ O CHECKLIST DE FECHAMENTO TEM DONO, PRAZO E REVISOR — e UMA morada (`close_tasks`)

**A tarefa de fechamento morava em DOIS lugares.** `close_tasks` (0010) existia no
banco e a tela gravava o mesmo fato no navegador (`a4p_close_tasks`), unindo as duas
camadas na leitura (`{ ...liveTasks, ...local }`). A união nunca deixa um `true`
voltar a `false`: desmarcar num computador e reabrir no outro mostrava "feito" para
sempre. E o escritor live (`saveCloseTaskLive`) engolia o erro (`catch → reportar`).
Era a regra geral "duas fontes para um fato" com o escritor que engole erro por cima.

- **A morada é o BANCO** (`lib/fechamento-tarefas`). O navegador fica só para a
  demonstração (formato v2; o formato antigo é IGNORADO, não convertido — converter
  inventaria quem fez). `lib/close` voltou a cuidar só das travas, e há guarda
  (`campa checklist: lib/close não guarda mais tarefa`).
- **A regra mora no BANCO** (gatilho INVOKER `close_tasks_maquina`):
  pendente → concluída (`review`) → revisada (`done`), com reabrir e desfazer.
  `core/close/checklist` é a CÓPIA para a tela explicar antes do clique (e para a
  demonstração, que não tem banco). Quem autoriza em produção é o gatilho, e a
  mensagem dele sobe inteira, com a dica.
- ⚠️ **Quem concluiu não revisa a própria tarefa — quando existe OUTRO membro com a
  ação `fechar` em `role_permissions`.** Sem outro, a autorrevisão é PERMITIDA e
  CARIMBADA (`autorrevisao` + motivo) — a decisão R1 do dono, a mesma da Central.
  "Habilitado" sai da MATRIZ, nunca do quadro de membros: um lançador na empresa não
  torna a autorrevisão proibida (guarda dedicada).
- ⚠️ **Os carimbos não se editam.** `concluida_por`/`revisada_por`/`autorrevisao` só
  mudam com a transição que os produz; um `update` que tente escrevê-los tem os
  valores antigos devolvidos. Sem isso, gravar o nome de um colega em
  `revisada_por` faria a segregação existir só no papel.
- ⚠️ **Pendente → revisada direto é recusado** (pularia a pergunta "quem fez").
- **Mês travado congela o checklist** (`A4P-FECHAMENTO-MES-TRAVADO`).
- ⚠️ **O mês trava com tudo revisado OU com MOTIVO escrito (20+ caracteres)**, o
  mesmo piso da revisão administrativa. Proibir sem saída faria alguém marcar
  "revisado" só para travar, e aí o checklist mente. **O gatilho mora no PERÍODO**
  (`accounting_periods_trava`), não só na função — a tela antiga gravava
  `accounting_periods` direto, e uma regra só em `fechar_periodo` seria contornada
  pelo caminho que o próprio produto usava. `fechar_periodo` passou a gravar o
  motivo em `accounting_periods.trava_motivo` (mesma assinatura, mesma permissão).
- ⚠️ **As tarefas-padrão nascem de um MODELO em código** (`MODELO_PADRAO`: conciliar
  bancos · provisões com estorno · revisar DRE e variação · conferir impostos ·
  exportar ao contador), geradas mês a mês e **idempotentes** (índice único
  `(org_id, mes, chave)` + `upsert … ignoreDuplicates`: dois computadores abrindo o
  mês não criam a tarefa duas vezes). **Responsável e revisor são HERDADOS do mesmo
  item do mês anterior** — é assim que a atribuição "se repete todo mês" sem uma
  tabela de modelos por organização, que exigiria seed + gatilho (5ª regra) para
  um default que não muda por empresa. Nenhum default por organização nasce aqui.
- O prazo é um dia do MÊS SEGUINTE (o fechamento acontece depois do mês); dezembro
  vira janeiro, dia além do fim vira o último dia. **Atrasada = passou do prazo sem
  REVISÃO**; "vence hoje" ainda está no prazo. Atrasada aparece com um **ponto de
  alerta** ao lado do título (nunca cor de número).
- As tarefas manuais antigas de `montarFechamento` (conciliar, variação, aprovar)
  SAÍRAM de lá e viraram o checklist — duas listas de "o que falta para fechar"
  divergiriam no primeiro mês. O que ficou em `montarFechamento` são as
  **verificações automáticas** (não travam o mês).
- `lockedPeriodsLive` deixou de filtrar por entidade do razão: quem trava é
  `fechar_periodo`, que grava o período da ORGANIZAÇÃO, e é por organização que
  `periodo_fechado` decide. Com o filtro, a trava feita pela porta certa não
  aparecia na tela.

**Prova da migration** (Postgres 16 local, `pkg_campa`): aplica sem erro, reaplica
sem erro (idempotente), 16 casos positivos e negativos com a MENSAGEM conferida
(autorrevisão carimbada · segregação recusada · outro membro revisa · transição
proibida · nascer revisada · membro inexistente · carimbo preservado · índice único ·
mês no 1º dia · papel sem `fechar` · trava sem motivo · motivo curto · trava com
motivo · mês travado congela · tudo revisado trava sem motivo · outra empresa não vê),
e a segregação PLANTADA fora reprova com `NÃO REPROVOU … A4P-FECHAMENTO-SEGREGACAO`.

⚠️ **Muda quem pode chamar o quê:** nenhuma função SECURITY DEFINER nova. Os dois
gatilhos são INVOKER. Mas o comportamento muda para quem já chamava:
(1) `update close_tasks` com a máquina — transição fora da máquina e revisão por papel
sem `fechar` passam a ser RECUSADAS; (2) travar `accounting_periods` (por
`fechar_periodo` ou `update` direto) com tarefa do checklist aberta passa a exigir
motivo de 20+. Linhas antigas de `close_tasks` (sem `mes`) não passam pela máquina,
e meses sem nenhuma tarefa gerada travam como antes.

### ⚠️ AGING DE CONTAS A PAGAR — POSIÇÃO, com o rótulo dizendo isso (`core/contas-pagar/aging`)

- **Carteira inteira, sem recorte de período** — um boleto vencido em maio continua
  devido em agosto. A tela escreve "carteira inteira" ao lado do título, porque os
  cards de cima são do PERÍODO e o vencido dali pareceria discordar do card
  "Contas atrasadas" (POSIÇÃO × FLUXO).
- **As faixas de atraso são IMPORTADAS do contas a receber** (`faixaDoAtraso`), não
  reescritas — duas definições de "até 30" divergiriam na primeira correção de borda.
  A vencer: até 7 · 8–15 · 16–30 · **mais de 30** (a última existe para a soma das
  linhas fechar com a carteira).
- ⚠️ **"Vence hoje" é A VENCER** (`atraso > 0`, nunca `>= 0`) — guarda plantada.
- Por fornecedor (o mesmo `contraparteDe` das recorrentes) e por categoria; acima de
  10 linhas o resto vira UMA linha "Demais (N)", nunca some (a soma tem de fechar).
- **O chrome é compartilhado:** `FaixasDeIdade` foi EXTRAÍDA do "Idade do atraso" do
  contas a receber para `components/titulos/kit.tsx` e as duas telas usam a mesma.

### ⚠️ PREVISÃO DO MÊS EM TRÊS CAMADAS — nada contado duas vezes (`core/previsao-mes`)

- **Realizado** (fato) = entradas/saídas canônicas em regime de caixa do dia 1º até
  hoje. **Agendado** (projeção) = `projetadoNaJanela` até o fim do mês, que inclui o
  vencido não pago — e o vencido de antes do mês é DITO à parte na tela.
  **Estimado** (estimativa) = regras de recorrência sem título no mês
  (`projetarRecorrentes`, só as ocorrências `projetado`) + compromissos que se
  repetem (`montarPainelRecorrentes`, fixos e variáveis, agora também do lado da
  ENTRADA, com o filtro `ehContaAReceber`) e ainda não apareceram no mês.
- ⚠️ **A regra que dá valor ao número:** o estimado só existe onde NÃO há título.
  Regra → casamento por (regra, MÊS) pela chave `rec:<regra>:<data>` (título em
  outro dia do mês também suprime). Padrão → qualquer lançamento do compromisso no
  mês suprime; e o compromisso cujos títulos vêm de uma REGRA fica com a regra —
  senão o aluguel entraria pela regra E pelo padrão. Três guardas, cada uma provada
  plantando o defeito correspondente.
- O histórico do padrão é a janela que TERMINA no mês anterior: o mês corrente ainda
  está acontecendo, e deixá-lo entrar faria "não apareceu ainda" pesar contra.
- **A tela marca as camadas com DUAS marcas** (opacidade E contorno tracejado), e a
  procedência de cada camada carrega a `natureza` (`MarcaProcedencia`). Resultado em
  tinta com o sinal escrito; entradas em `ink`, saídas em `areia`.
- `previsao-mes` foi DECLARADO consumidor da projeção em `scripts/consistencia.mts`
  (a guarda `projecao: só quem está declarado consome` o acusou, como devia).
- **Mora no `/fluxo-caixa`, logo abaixo do resumo executivo.** ⚠️ **NÃO foi para a
  Visão geral:** a Home já tem o herói de saldo, o calendário e o resumo do período;
  um quarto número de "resultado" ali competiria com o do período sem a explicação
  das camadas, e a pergunta "como fecha o mês?" é do fluxo de caixa.

---

## Guardas

- `engine-audit`, bloco `/* ── CAMP-A ── */`: 45 asserções (uma delas por arquivo de tela) com valores fechados sobre
  fixture. Provadas plantando sete defeitos (regra realizada voltando como estimada ·
  padrão duplicando a regra · padrão já lançado no mês · "vence hoje" como atraso ·
  borda dos 7 dias · segregação desligada · geração não idempotente) — cada um
  reprova nomeado; restaurado, verde.
- `scripts/e2e/campfire-a.mjs`: atribui responsável/revisor/prazo vencido (atrasada),
  conclui, confere que o titular não revisa a própria tarefa e a contadora revisa,
  trava com motivo (fachada recusada), confere o congelamento e a persistência; cria
  uma conta a pagar em aberto e confere que a carteira do aging e a faixa "8 a 15"
  sobem exatamente o valor, e que a camada AGENDADA da previsão sobe exatamente o
  valor.

## O que ficou de fora

- Notificar o responsável quando a tarefa atrasa (e-mail/WhatsApp) — o ponto de
  alerta está na tela; o envio fica para quem fizer a régua de automações.
- Editar o MODELO de tarefas por organização (acrescentar uma sexta tarefa fixa):
  hoje o modelo é o do código; uma tarefa extra por organização exigiria a tabela de
  modelos com seed + gatilho.
- A previsão não estima **entrada** a partir de regra cadastrada: `recurrences` hoje
  só gera saídas (as regras do lado da receita, contratos, vivem em
  `lib/recorrencias` no navegador). O lado da entrada é estimado pelos padrões.
