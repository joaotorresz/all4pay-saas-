## ⚠️ QUATTRO AI E CENTRAL DE AJUDA — a IA responde o número da TELA (30/09/2026)

**A pergunta desta área não é "a IA calcula certo?", é "a pessoa, com a IA de
um lado e a tela do outro, lê o MESMO número?".** Dirigida como um dono de
empresa (saldo, receita, despesa, resultado, a receber/a pagar, o que vence na
semana, maior cliente, gastos, margem, runway, "posso gastar 20 mil?") e cada
resposta conferida contra a tela que responde a mesma pergunta, ela divergia
em nove lugares. Nenhuma divergência era erro de aritmética: era a IA com uma
regra PRÓPRIA onde a tela já tinha uma canônica.

| Pergunta | A IA dizia | A tela dizia | Causa |
| --- | --- | --- | --- |
| saldo / runway / burn / saúde | "cobre cerca de **0 meses**" | "— não há queima" | o quant copiava o `.valor` (0) de um runway **ausente** |
| margem do mês | **39%** (caixa) | **56,4%** (DRE) | margem de caixa com o nome de margem |
| lucro do mês | R$ 278.810 (caixa) | R$ 391.829 (DRE) | "lucro" caía no bloco de resultado de caixa |
| origem do EBITDA | "**0 lançamentos**" | — | a linha "=" do DRE não tem movimento próprio |
| posso gastar 20 mil? | reserva de **R$ 1.011.982** | reserva de R$ 245.836 | burn zero ⇒ a IA INVENTAVA um burn de 15% do saldo |
| o que vence esta semana | domingo a sábado | segunda a domingo | duas definições de semana (perdia o vencimento de domingo) |
| clientes pagam em dia? | "0 dia(s) **no do** vencimento" | — | frase montada com média zero |
| chance de ruptura | "em **90** dias" | 60 dias (risk-engine) | rótulo do motor errado |
| onde economizar | "Fornecedor **subiu R$ 179 mil**" | — | sem mês anterior, a categoria inteira lida como aumento |

⚠️ **A AUSÊNCIA atravessa o derivado — agora também no quant.** `IndicadoresFinanceiros.runwayMeses`
virou `number | null` com `runwayMotivo` (o código canônico). O quant lia
`runwayMesesCanonico(input).valor` sem perguntar `indisponivel`, e o zero de
"não sei" virou "runway curto" em cinco lugares: a tela Quant ("Runway 0m"), a
Decisão ("Risco de liquidez 100%"), o pilar de runway do score (Financial Score
75 → 90 depois do conserto), o Investor Update e o planejador de contratações
("Runway 0 → 33,3 meses": contratar parecia AUMENTAR o fôlego). A regra de ouro
da ONDA 4 vale para todo consumidor: `sem_queima` pontua como folga máxima,
`caixa_negativo` como risco máximo, `sem_base` como neutro — e **nenhum deles
vira número**. `rotuloRunway`/`fraseRunway`/`saudeDoRunway` (`core/quant/score`)
e `FORMA_CURTA` (`core/indicadores`) são a única forma de dizer isso.

⚠️ **A IA não tem regra própria para número que já tem tela.** Margem e lucro
leem `cascataDRE` (competência, a mesma do relatório); runway e burn leem o
canônico de 90 dias (o do Fluxo de caixa); "posso gastar?" passa pelo
`simularAquisicao` sobre `situacaoDe` (reserva = `RESERVA_IDEAL` × despesa
média, a da tela "Posso comprar?"); a semana é `periodoSemana` (a dos painéis);
a faixa de saúde é `classificar` (a da tela Quant). Quando a IA fala de caixa ao
lado de competência, ela DIZ qual é qual ("pelo caixa — o que efetivamente
entrou e saiu — sobraram…"), porque os dois estão certos e a pessoa precisa
saber por que não batem.

⚠️ **Frase de origem de linha "=" soma as linhas que a formam** (`origemDaCascata`).
A procedência de EBITDA/resultado vem vazia por construção (sai de fórmula), e
"0 lançamentos" embaixo de R$ 391 mil é a origem mentindo.

### Central de Ajuda

- ⚠️ **O detector de segredos pega o formato que se COLA, não só o que se
  formata.** CPF sem pontuação ("meu cpf é 52998224725"), CPF seguido de um
  valor e cartão com espaços colado junto da validade passavam inteiros. O
  bloco numérico agora tokeniza, agrupa por corrida separada por espaço e testa
  janelas da mais longa para a mais curta (linha digitável → CNPJ → CPF →
  cartão com Luhn e agrupamento de cartão). Os casos negativos (valor, NF, data,
  11 dígitos com DV inválido) continuam limpos — não gritar lobo segue sendo a
  regra que decide se o detector presta.
- ⚠️ **Chamado e conversa de ajuda passam pelo `store-org`.** Estavam em
  `CHAVES_ORG` e eram gravados direto no `localStorage`: em produção a
  `SincronizacaoOrg` subia a chave UMA vez e depois hidratava do servidor a cada
  tela — o chamado aberto depois da primeira sessão nunca subia e era apagado na
  navegação seguinte. A conversa virou mapa `usuário → mensagens` (como o
  histórico da IA), para o "Nova conversa" de um colega não apagar a sua.
- ⚠️ **A tela não promete o que não existe.** Ela dizia que o chamado "chega ao
  suporte" e que "alguém do suporte olha o caso". Não há canal nenhum: o
  chamado fica no estado da empresa. O texto agora diz onde ele fica e que o
  envio ao suporte não está ligado.

### O chat

- **O botão Enviar era lime-less**: `bg-ink` com a seta em `on-lime` — os dois
  tokens valem `#3B4332` e a seta era invisível. Primário = lime + verde-base.
- **"Copiado" só quando copiou**: a escrita na área de transferência não era
  aguardada; permissão negada ou `navigator.clipboard` ausente e o rótulo mentia
  do mesmo jeito. Agora a falha aparece ("Não copiou — selecione o texto").
- **O feedback entra na conversa salva e não conta duas vezes** (era estado de
  tela: sumia ao retomar e somava outro voto ao clicar de novo).
- **A conversa do painel flutuante entra no MESMO histórico da página.** O
  painel é remontado a cada tela; seguir o "Abrir tela ↗" da própria resposta
  apagava a conversa.
- **O rodapé do histórico diz a verdade do ambiente** (em produção a conversa
  acompanha a pessoa entre máquinas; a frase dizia o contrário) e a lista OUVE a
  hidratação (nascia vazia numa máquina nova).
- **`logAcaoIA` não engole a recusa do banco**: o cliente do Supabase devolve
  `error` em vez de lançar, e o `try/catch` sozinho deixava a trilha `ai_actions`
  vazia sem ninguém saber. Continua best-effort, com dono (`reportar`).

### Guardas

- `engine-audit`, bloco **IA E AJUDA**: fixture de uma empresa que GERA caixa e
  tem receita do mês ainda a receber (é o caso que separa margem de caixa, 50%,
  de margem do DRE, 64%), com vencimentos no domingo da semana e no domingo
  anterior. **22 defeitos plantados, 22 reprovados**, cada um nomeado.
- `consistencia`: a asserção "quant == canônico" era tautológica sobre a
  fixture; agora prova que a AUSÊNCIA se propaga (quant `null` + mesmo código).
- Jornadas `ia-numeros`, `ia-historico`, `ajuda-central` — a IA contra Home,
  Fluxo de caixa, painéis de contas a pagar/receber (semana), DRE (célula do
  mês) e a ficha do contato; e depois de CRIAR uma conta a pagar que vence no
  domingo, a IA e o painel sobem o mesmo R$ 4.321,77.

### O que ficou declarado, não feito

- **~35 chaves de `CHAVES_ORG` ainda são gravadas por fora do `store-org`**
  (comprovantes, fechamento, regras, dashboards, compras, vendas locais, NFS-e,
  receita reconhecida, cronogramas, razão, tags, administração, contabilidade,
  aprendizado do FDIP, memória da IA…). Em produção, cada uma é o mesmo defeito
  do chamado: some na primeira hidratação depois da primeira sessão. O
  conserto é mecânico, arquivo a arquivo; vários são reservados de outras áreas.
- **`a4p_ia_memory` tem duas moradas** (`CHAVES_ORG` e a tabela `ai_learning`).
- **O histórico da IA por usuário mora numa linha só de `org_state`**: todo
  membro lê o mapa inteiro (RLS é por empresa) e duas pessoas escrevendo ao
  mesmo tempo perdem atualização. Precisa de tabela própria (`ia_conversas`,
  RLS por `user_id`) — migration, decisão do dono.
- **O chamado não chega a ninguém.** Falta a tabela `chamados` + RPC para o
  `/admin` da plataforma ler — migration e produto.
- **A aba Risco ainda mostra "Runway (base) 24+ meses / 999 dias"** (o teto do
  risk-engine como número) e os cenários do Fluxo de caixa saturam em 33,3
  meses — telas reservadas de outra área.

### Revisão adversarial (01/10/2026)

As correções acima conferem (plantados de volta: runway do quant, margem por
caixa e semana dom–sáb reprovam no `engine-audit`; as jornadas afirmam sobre
valores e passam no build de demonstração). A revisão achou o que ficou para trás:

- ⚠️ **"A receber" na IA era toda entrada pendente.** Empréstimo a creditar,
  rendimento, resgate e transferência entre contas próprias entravam no total a
  receber, nos vencimentos da semana e na lista de devedores ("Sem cliente
  (R$ 7.000)" cobrado por uma transferência da empresa para ela mesma). O painel
  de Contas a receber já usava `ehContaAReceber`; a IA passou a usar a MESMA
  regra. Jornada `ia-carteira`: lançar um rendimento a creditar de R$ 777,77 não
  move o painel — e movia a IA.
- ⚠️ **"Quanto faturei?" somava empréstimo e transferência; "quanto gastei?",
  a perna de saída da transferência.** Medido: "Principal origem: Empréstimo
  bancário", e o maior cliente com "30% da receita" quando era 100%. Receita é
  `foraDaBaseTributavel` (a regra da base do imposto e de Contas a receber);
  gasto exclui `ehTransferenciaEntreContas` (a do DRE). O que fica de fora é
  DITO na resposta, não some — e "quanto entrou?" continua sendo pergunta de
  CAIXA (o "Entradas" canônico), citando quanto daquilo é receita. Jornada
  `ia-receita`: uma transferência de R$ 1.234,56 não move gasto nem
  faturamento, e move o "entrou" pelo valor exato.
- "Chance de ruptura em 90 dias" sobrava no copiloto de fallback e no insight
  de pressão de caixa — o número é do motor de risco, de 60 dias.

**Fica para decisão:** uma "Nova conta a receber" lançada na categoria
"Juros e rendimentos" (ou qualquer uma que `foraDaBaseTributavel` casa) some do
painel de Contas a receber, que a exclui por regra. A IA agora concorda com o
painel; se a pessoa deve ver esse título no painel é decisão de produto
(`core/contas-receber`), não da IA.

### Rodada 3 (reservados) — 01/10/2026

**O que mudou** (cada item com guarda provada plantando o defeito de volta):

- ⚠️ **As chaves de negócio por fora do `store-org`: MEDIDO, não eram ~35.**
  As levas anteriores já tinham passado quase todas pelo `store-org`; a
  varredura antiga dizia "teto ZERO" mas era CEGA para três formas — chave via
  `CHAVES_ORG.x`, via constante IMPORTADA de outro módulo, e a LEITURA crua
  (`getItem`/`localStorage[k]`). A guarda `CAD-2` agora RESOLVE a chave de cada
  chamada crua (literal, constante local, importada, `CHAVES_ORG`, parâmetro de
  helper) e reprova escrita/remoção de chave de negócio e leitura de chave VIVA.
  O que ela achou: `lib/iuli-cadastros` lia `a4p_projetos`/`a4p_centros_custo`
  cru — chaves cuja morada é `projects`/`cost_centers` desde 20260930180000.
  Viraram `CHAVES_CONGELADAS` (o rastro só é lido pela oferta "Trazer para o
  cadastro" e pela queda da demonstração; `migrarParaServidor` não o sobe mais
  para `org_state`). Ler cru o rastro CONGELADO é permitido; escrevê-lo, não.
  Provada: descongelar `a4p_projetos` reprova nomeando `iuli-cadastros
  [getItem a4p_projetos]`; e as quatro formas cegas têm caso negativo próprio.
- **Feedback da IA:** trocar de "útil" para "ruim" DESFAZ o voto anterior
  (`aplicarVoto`, local) e também na tabela `ai_learning` (update da linha da
  org antes do incremento — a RPC só soma, e a hidratação funde pelo MAIOR, então
  sem isso o voto desfeito voltaria). A recusa do banco deixou de ser engolida
  (`reportar`, degradado). Guarda `ia: trocar o feedback…` ({up:1,down:1}
  plantado → reprova).
- **Painel flutuante retoma a conversa** ao remontar em outra tela
  (`conversaParaRetomar`): a que ele tinha aberta, ou a mais recente; depois de
  "Nova conversa" não ressuscita a anterior. Guarda com os três casos.
- **`pct`/`pctDeInteiro` escrevem o negativo com `−` (U+2212)** e sem "−0,0%"
  quando o arredondamento chega a zero. O dinheiro negativo (`-R$1.000,00`)
  NÃO mudou — é âncora do contrato de resultado. Âncoras literais no bloco de
  formato da `consistencia` (hífen plantado → reprova; zero com sinal →
  reprova). A regra "negativo" de `REGRAS_DE_FORMATO` dizia "na cor de
  negativo" — contradizia a decisão de 30/09 (número sem cor por sinal); agora
  diz "na tinta do texto".
- **Título lançado à mão em "a receber" é recebível** (`naoEhRecebivel` em
  `core/contas-receber`): a exclusão deixou de olhar só o NOME da categoria.
  Entrada em categoria financeira (juros, empréstimo, resgate, rendimento) só
  sai quando NÃO foi lançada como título (`origem` fora de manual/venda/
  contrato/recorrência — extrato, importação, Open Finance, OCR, ou nula no
  acervo importado). Transferência entre contas próprias sai SEMPRE, mesmo
  manual (o formulário de transferência grava `origem: "manual"`). Como a IA,
  as automações e a régua usam `ehContaAReceber`, todos mudam juntos. Guarda
  `creceber:` com fixture dos dois lados + o negativo de que a regra só-pelo-nome
  responderia diferente.

**O que ficou (decisão do dono):**

- A base do imposto (`receitaTributavel`) e o faturamento da IA continuam
  excluindo pela CATEGORIA, independente da origem — juros recebidos de cliente
  são receita financeira, não faturamento, e isso está certo ali. Só o
  recebível mudou.
- `a4p_ia_memory` continua com duas moradas (`org_state` + `ai_learning`);
  desfazer o voto no banco é ler-e-gravar, não atômico — uma RPC
  `ai_learning_feedback` com "desfazer" exigiria migration.
- O painel retoma a conversa só pela memória do módulo + histórico; numa
  máquina nova, antes da hidratação chegar, ele abre vazio (não ouve a
  hidratação — a página `/quattro-ai` ouve).
- As jornadas de navegador (`npm run jornadas`) não foram rodadas nesta rodada;
  o `npm test` inteiro está verde.

#### Revisão adversarial da Rodada 3 — 01/10/2026 (`r4/ia-rev`)

Cada correção da rodada foi atacada; três não aguentaram inteiras.

- ⚠️ **A guarda `CAD-2` ainda tinha dois pontos cegos.** (1) O APELIDO do
  armazenamento: `const ls = window.localStorage; ls.setItem(K, …)` passava,
  porque a varredura só casava a palavra `localStorage` — o plantio
  `ls.getItem("a4p_contratos")` só reprovou por ACIDENTE (o literal plantado
  "contaminou" o helper `load(key)` do mesmo arquivo). (2) O COLCHETE era lido
  sempre como leitura: `localStorage[K] = x` gravava chave CONGELADA sem
  reprovar, porque ler rastro congelado é permitido. Agora o apelido entra no
  padrão, `[K] =` é escrita e `delete localStorage[K]` é remoção. Guarda
  `CAD-2: [negativo] … APELIDO … COLCHETE`; provada plantando
  `ls.setItem(VENDAS_PLANT, …)` num arquivo sem outra chave — reprova nomeando
  `setItem a4p_vendas_docs` (a versão anterior passava).
- ⚠️ **Resgate de aplicação lançado à mão virava recebível.** A exceção do
  "título manual" valia para toda categoria de `foraDaBaseTributavel`, e
  resgate/aplicação são dinheiro da PRÓPRIA empresa mudando de bolso, como a
  transferência — sem devedor do outro lado; entrariam no painel de cobrança,
  na concentração por cliente e na régua. `ehDinheiroDaPropriaEmpresa` os põe
  fora sempre (juros e empréstimo seguem com a exceção). Guarda
  `creceber: resgate de aplicação … fora mesmo lançado à mão`; provada tirando
  a regra (reprovam duas asserções, com o total 10.940 em vez de 3.940).
- **O painel flutuante agora ouve a hidratação** (`inscreverConversas`), em vez
  de ler o histórico só ao montar — a pendência "abre vazio numa máquina nova"
  da rodada saiu. Só retoma com o painel OCIOSO (sem conversa aberta, sem
  pergunta em curso, nada digitado): a hidratação não troca a conversa debaixo
  de quem está falando. Guarda `ia: o painel OUVE a hidratação…`; provada
  tirando a inscrição e tirando a condição de ociosidade.

**Conferido e mantido:** o voto que desfaz (a RLS de `ai_learning` concede
`update` a `authenticated` e recorta pela empresa ativa — o update direto não
muda quem pode chamar o quê); o `−` no percentual (nenhum consumidor compara a
string com hífen); o congelamento de `a4p_projetos`/`a4p_centros_custo` (a
hidratação continua trazendo o rastro do servidor ao navegador, então a oferta
"Trazer para o cadastro" segue alcançando o que foi gravado noutra máquina).

**Fica para o dono:** se o painel deve abrir na conversa mais recente na
PRIMEIRA abertura da sessão (hoje sim) ou começar em branco com as sugestões;
`origem: "recorrencia"` está no conjunto de títulos mas o banco
(`movements_origem_valida`) não aceita esse valor — inofensivo, e a recorrência
grava `contrato`. O painel não foi dirigido no navegador nesta revisão.
